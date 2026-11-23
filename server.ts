import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DRIVE_FILE_ID_REGEX = /^[a-zA-Z0-9_-]{10,120}$/;

function buildDriveDirectUrl(fileId: string, extraParams: Record<string, string> = {}): string {
    const params = new URLSearchParams({
        id: fileId,
        export: 'download',
        confirm: 't',
        ...extraParams,
    });
    return `https://drive.usercontent.google.com/download?${params.toString()}`;
}

function extractDriveConfirmUrl(html: string, fallbackFileId: string): string | null {
    const actionMatch = html.match(/<form[^>]*id=["']download-form["'][^>]*action=["']([^"']+)["']/i);
    if (!actionMatch) return null;

    const params = new URLSearchParams();
    const inputMatches = html.matchAll(/<input[^>]*type=["']hidden["'][^>]*>/gi);
    for (const match of inputMatches) {
        const tag = match[0];
        const nameMatch = tag.match(/name=["']([^"']+)["']/i);
        const valueMatch = tag.match(/value=["']([^"']*)["']/i);
        if (nameMatch) {
            params.set(nameMatch[1], valueMatch ? valueMatch[1] : '');
        }
    }
    if (!params.has('id')) params.set('id', fallbackFileId);
    if (!params.has('export')) params.set('export', 'download');
    if (!params.has('confirm')) params.set('confirm', 't');

    return `${actionMatch[1]}?${params.toString()}`;
}

const MAX_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB per chunk (well below 32 MB proxy limit)

function buildCappedRangeHeader(rawRange: string | undefined): string {
    if (rawRange) {
        const match = rawRange.match(/^bytes=(\d+)-(\d*)$/i);
        if (match) {
            const start = Number(match[1]);
            const requestedEnd = match[2] ? Number(match[2]) : null;
            if (Number.isFinite(start) && start >= 0) {
                const maxEnd = start + MAX_CHUNK_BYTES - 1;
                const end = requestedEnd !== null && Number.isFinite(requestedEnd) && requestedEnd >= start
                    ? Math.min(requestedEnd, maxEnd)
                    : maxEnd;
                return `bytes=${start}-${end}`;
            }
        }
    }
    return `bytes=0-${MAX_CHUNK_BYTES - 1}`;
}

async function fetchDriveAudioStream(
    fileId: string,
    rangeHeader: string,
    signal: AbortSignal
): Promise<globalThis.Response> {
    const headers: Record<string, string> = {
        Range: rangeHeader,
    };

    let upstream = await fetch(buildDriveDirectUrl(fileId), {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal,
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (upstream.ok && contentType.includes('text/html')) {
        const html = await upstream.text();
        const confirmUrl = extractDriveConfirmUrl(html, fileId);
        if (confirmUrl) {
            upstream = await fetch(confirmUrl, {
                method: 'GET',
                headers,
                redirect: 'follow',
                signal,
            });
        }
    }

    return upstream;
}

async function startServer() {
    const app = express();

    app.get('/api/drive-audio/:fileId', async (req: Request, res: Response) => {
        const rawId = req.params.fileId;
        const fileId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!fileId || !DRIVE_FILE_ID_REGEX.test(fileId)) {
            res.status(400).json({ error: 'ID file Google Drive tidak valid.' });
            return;
        }

        const controller = new AbortController();
        let finished = false;
        res.on('finish', () => {
            finished = true;
        });
        req.on('close', () => {
            if (!finished) {
                controller.abort();
            }
        });

        try {
            const rawRange = typeof req.headers.range === 'string' ? req.headers.range : undefined;
            const cappedRange = buildCappedRangeHeader(rawRange);
            const upstream = await fetchDriveAudioStream(fileId, cappedRange, controller.signal);
            const contentType = upstream.headers.get('content-type') || 'audio/mpeg';

            if (upstream.status === 416) {
                await upstream.body?.cancel().catch(() => {});
                const contentRange = upstream.headers.get('content-range');
                if (contentRange) res.setHeader('Content-Range', contentRange);
                res.status(416).end();
                return;
            }

            if (!upstream.ok || contentType.includes('text/html') || !upstream.body) {
                await upstream.body?.cancel().catch(() => {});
                res.status(upstream.ok ? 502 : upstream.status).json({
                    error: 'File audio Google Drive tidak dapat diakses secara publik.',
                });
                return;
            }

            res.status(upstream.status);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');

            const contentLength = upstream.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            const contentRange = upstream.headers.get('content-range');
            if (contentRange) res.setHeader('Content-Range', contentRange);

            if (req.method === 'HEAD') {
                await upstream.body.cancel().catch(() => {});
                res.end();
                return;
            }

            const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
            nodeStream.on('error', (err) => {
                if ((err as { name?: string }).name !== 'AbortError') {
                    console.error('Stream error saat mengirim audio Drive:', err);
                }
                if (!res.headersSent) {
                    res.status(502).end();
                } else {
                    res.end();
                }
            });
            nodeStream.pipe(res);
        } catch (error) {
            if ((error as { name?: string })?.name === 'AbortError') return;
            console.error('Gagal mengambil stream audio Google Drive:', error);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Gagal menghubungi Google Drive.' });
            }
        }
    });

    const isProduction =
        process.env.NODE_ENV === 'production' ||
        process.env.npm_lifecycle_event === 'start';

    if (isProduction && existsSync(resolve(__dirname, 'dist', 'index.html'))) {
        const distDir = resolve(__dirname, 'dist');
        app.use(express.static(distDir));
        app.get('*', (_req: Request, res: Response) => {
            res.sendFile(resolve(distDir, 'index.html'));
        });
    } else {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'mpa',
        });
        app.use(vite.middlewares);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Speed of Nusantara server listening on http://0.0.0.0:${PORT}`);
    });
}

startServer().catch((err) => {
    console.error('Gagal menjalankan server:', err);
    process.exit(1);
});
