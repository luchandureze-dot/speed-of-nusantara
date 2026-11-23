import { initializeApp } from 'firebase/app';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_AUDIO_QUERY = "(mimeType contains 'audio/' or mimeType = 'application/ogg') and trashed = false";

const DEFAULT_DRIVE_TRACK = {
    id: '1XEW2zfoLdc6-NBFze3iDuodspoxxbD5m',
    name: 'Initial D (Soundtrack).mp3',
    size: '148242861',
    directUrl: '/api/drive-audio/1XEW2zfoLdc6-NBFze3iDuodspoxxbD5m',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Strict in-memory token cache (never stored in localStorage/sessionStorage).
let isSigningIn = false;
let cachedAccessToken = null;
let currentUser = null;
let needsAuth = true;

let allTracks = [];
let filteredTracks = [];
let activeTrackIndex = -1;
let activeSourceMode = 'none'; // 'default' | 'drive' | 'none'
let isLoadingTracks = false;
let isLoadingAudio = false;
let isRepeatOne = false;
let musicVolume = 0.65;
let isGlobalAudioMuted = false;
let currentObjectUrl = null;
let streamAbortController = null;
let isSeeking = false;
let wasPausedByGame = false;

const musicAudio = new Audio();
musicAudio.preload = 'auto';
musicAudio.volume = musicVolume;

const els = {};

function cacheElements() {
    els.toggleBtn = document.getElementById('music-toggle');
    els.drawer = document.getElementById('music-drawer');
    els.closeBtn = document.getElementById('music-close');
    els.userRow = document.getElementById('music-user-row');
    els.userLabel = document.getElementById('music-user-label');
    els.signOutBtn = document.getElementById('music-signout');
    els.authBox = document.getElementById('music-auth-box');
    els.googleSignInBtn = document.getElementById('google-signin-btn');
    els.authStatus = document.getElementById('music-auth-status');
    els.playerBox = document.getElementById('music-player-box');
    els.libraryBox = document.getElementById('music-library-box');
    els.currentTitle = document.getElementById('music-current-title');
    els.currentMeta = document.getElementById('music-current-meta');
    els.timeText = document.getElementById('music-time');
    els.seekSlider = document.getElementById('music-seek');
    els.prevBtn = document.getElementById('music-prev');
    els.playPauseBtn = document.getElementById('music-play-pause');
    els.nextBtn = document.getElementById('music-next');
    els.repeatBtn = document.getElementById('music-repeat');
    els.volumeSlider = document.getElementById('music-volume');
    els.searchInput = document.getElementById('music-search');
    els.refreshBtn = document.getElementById('music-refresh');
    els.trackList = document.getElementById('music-track-list');
    els.listStatus = document.getElementById('music-list-status');
}

function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatFileSize(bytesStr) {
    const bytes = Number(bytesStr);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function applyAudioMuteAndVolume() {
    musicAudio.muted = isGlobalAudioMuted;
    musicAudio.volume = musicVolume;
}

function syncToggleIndicator() {
    if (!els.toggleBtn) return;
    const isPlaying = !musicAudio.paused && !musicAudio.ended && Boolean(musicAudio.src) && musicAudio.readyState >= 2;
    els.toggleBtn.classList.toggle('is-playing', isPlaying);
    els.toggleBtn.classList.toggle('is-loading', isLoadingAudio || (!musicAudio.paused && musicAudio.readyState < 2));
}

function syncTransportUi() {
    if (els.playPauseBtn) {
        const isPlaying = !musicAudio.paused && !musicAudio.ended && Boolean(musicAudio.src);
        els.playPauseBtn.innerText = isPlaying ? '❚❚' : '▶';
        els.playPauseBtn.setAttribute('aria-label', isPlaying ? 'Jeda musik' : 'Putar musik');
        els.playPauseBtn.disabled = false;
    }
    if (els.prevBtn) {
        els.prevBtn.disabled = filteredTracks.length === 0 && activeSourceMode !== 'default';
    }
    if (els.nextBtn) {
        els.nextBtn.disabled = filteredTracks.length === 0 && activeSourceMode !== 'default';
    }
    if (els.repeatBtn) {
        els.repeatBtn.setAttribute('aria-pressed', String(isRepeatOne));
        els.repeatBtn.classList.toggle('is-active', isRepeatOne);
    }
    syncToggleIndicator();
}

function syncTimeUi() {
    if (!els.timeText || !els.seekSlider) return;
    const dur = Number.isFinite(musicAudio.duration) ? musicAudio.duration : 0;
    const cur = Number.isFinite(musicAudio.currentTime) ? musicAudio.currentTime : 0;
    els.timeText.innerText = `${formatClock(cur)} / ${dur > 0 ? formatClock(dur) : '--:--'}`;
    if (!isSeeking) {
        els.seekSlider.value = dur > 0 ? String(Math.round((cur / dur) * 1000)) : '0';
        els.seekSlider.disabled = dur <= 0;
    }
}

function setAuthStatus(message = '', isError = false) {
    if (!els.authStatus) return;
    els.authStatus.innerText = message;
    els.authStatus.hidden = !message;
    els.authStatus.classList.toggle('is-error', isError);
}

function setListStatus(message = '', isError = false) {
    if (!els.listStatus) return;
    els.listStatus.innerText = message;
    els.listStatus.hidden = !message;
    els.listStatus.classList.toggle('is-error', isError);
}

function renderAuthState() {
    const authenticated = !needsAuth && Boolean(cachedAccessToken);
    if (els.authBox) els.authBox.hidden = authenticated;
    if (els.libraryBox) els.libraryBox.hidden = !authenticated;
    if (els.userRow) els.userRow.hidden = !authenticated;
    if (els.userLabel) {
        els.userLabel.innerText = authenticated
            ? (currentUser?.email || currentUser?.displayName || 'Google Drive Terhubung')
            : '';
    }
    if (els.googleSignInBtn) {
        els.googleSignInBtn.disabled = isSigningIn;
    }
    syncTransportUi();
}

function applyTrackFilter() {
    const query = (els.searchInput?.value || '').trim().toLowerCase();
    const activeId = activeTrackIndex >= 0 && allTracks[activeTrackIndex] ? allTracks[activeTrackIndex].id : null;
    filteredTracks = query
        ? allTracks.filter((file) => (file.name || '').toLowerCase().includes(query))
        : [...allTracks];
    renderTrackList(activeId);
    syncTransportUi();
}

function renderTrackList(activeId = null) {
    if (!els.trackList) return;
    const currentActiveId = activeId ?? (activeTrackIndex >= 0 && allTracks[activeTrackIndex] ? allTracks[activeTrackIndex].id : null);
    els.trackList.innerHTML = '';

    if (isLoadingTracks) {
        setListStatus('Memuat daftar musik dari Google Drive...');
        return;
    }

    if (allTracks.length === 0) {
        setListStatus('Tidak ada file audio ditemukan di Google Drive kamu.');
        return;
    }

    if (filteredTracks.length === 0) {
        setListStatus('Tidak ada lagu yang cocok dengan pencarian.');
        return;
    }

    setListStatus('');
    const fragment = document.createDocumentFragment();
    filteredTracks.forEach((file) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'music-track-item';
        const isCurrent = activeSourceMode === 'drive' && file.id === currentActiveId;
        if (isCurrent) item.classList.add('is-active');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'music-track-name';
        nameSpan.innerText = file.name || 'Tanpa Judul';

        const metaSpan = document.createElement('span');
        metaSpan.className = 'music-track-size';
        metaSpan.innerText = isCurrent && isLoadingAudio
            ? 'Memuat...'
            : (formatFileSize(file.size) || 'Audio');

        item.appendChild(nameSpan);
        item.appendChild(metaSpan);
        item.addEventListener('click', () => {
            item.blur();
            const fullIdx = allTracks.findIndex((t) => t.id === file.id);
            if (fullIdx >= 0) {
                playTrackByIndex(fullIdx);
            }
        });
        fragment.appendChild(item);
    });
    els.trackList.appendChild(fragment);
}

function stopAndClearAudio() {
    if (streamAbortController) {
        streamAbortController.abort();
        streamAbortController = null;
    }
    musicAudio.pause();
    musicAudio.removeAttribute('src');
    musicAudio.removeAttribute('crossorigin');
    musicAudio.load();
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
    isLoadingAudio = false;
    activeTrackIndex = -1;
    activeSourceMode = 'none';
    wasPausedByGame = false;
    if (els.currentTitle) els.currentTitle.innerText = DEFAULT_DRIVE_TRACK.name;
    if (els.currentMeta) els.currentMeta.innerText = 'Soundtrack Bawaan · Google Drive';
    syncTimeUi();
    syncTransportUi();
}

async function playDefaultSoundtrack(forceRestart = false) {
    if (activeSourceMode === 'drive' && !forceRestart) return;

    if (activeSourceMode === 'default' && musicAudio.src && !forceRestart) {
        if (musicAudio.paused) {
            try {
                await musicAudio.play();
            } catch (error) {
                console.warn('Gagal melanjutkan soundtrack bawaan:', error);
            }
        }
        return;
    }

    if (streamAbortController) {
        streamAbortController.abort();
        streamAbortController = null;
    }
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }

    activeTrackIndex = -1;
    activeSourceMode = 'default';
    isLoadingAudio = true;

    if (els.currentTitle) els.currentTitle.innerText = DEFAULT_DRIVE_TRACK.name;
    if (els.currentMeta) els.currentMeta.innerText = 'Mengalirkan soundtrack dari Google Drive...';
    syncTransportUi();

    musicAudio.removeAttribute('crossorigin');
    musicAudio.src = DEFAULT_DRIVE_TRACK.directUrl;
    applyAudioMuteAndVolume();

    const onReadyToPlay = () => {
        if (activeSourceMode !== 'default') return;
        isLoadingAudio = false;
        if (els.currentMeta) els.currentMeta.innerText = 'Soundtrack Bawaan · Google Drive';
        syncTransportUi();
    };
    musicAudio.addEventListener('playing', onReadyToPlay, { once: true });
    musicAudio.addEventListener('canplay', onReadyToPlay, { once: true });

    try {
        await musicAudio.play();
        isLoadingAudio = false;
        if (els.currentMeta) els.currentMeta.innerText = 'Soundtrack Bawaan · Google Drive';
        syncTransportUi();
    } catch (error) {
        isLoadingAudio = false;
        console.warn('Gagal memutar soundtrack Google Drive:', error);
        if (error && error.name === 'NotAllowedError') {
            const resumeOnGesture = () => {
                if (activeSourceMode === 'default' && musicAudio.paused) {
                    musicAudio.play().catch(() => {});
                }
            };
            document.addEventListener('pointerdown', resumeOnGesture, { once: true });
            document.addEventListener('keydown', resumeOnGesture, { once: true });
        }
        if (els.currentMeta) {
            els.currentMeta.innerText = 'Tekan ▶ untuk memutar soundtrack.';
        }
        syncTransportUi();
    }
}

function handleExpiredAuth(message = 'Sesi akses Google Drive berakhir. Silakan masuk kembali.') {
    cachedAccessToken = null;
    needsAuth = true;
    setAuthStatus(message, true);
    renderAuthState();
}

async function fetchDriveAudioFiles() {
    if (!cachedAccessToken) {
        needsAuth = true;
        renderAuthState();
        return;
    }

    isLoadingTracks = true;
    if (els.refreshBtn) els.refreshBtn.disabled = true;
    renderTrackList();

    try {
        const params = new URLSearchParams({
            q: DRIVE_AUDIO_QUERY,
            fields: 'files(id,name,mimeType,size)',
            orderBy: 'name',
            pageSize: '100',
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });
        const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${cachedAccessToken}`,
            },
        });

        if (response.status === 401 || response.status === 403) {
            handleExpiredAuth('Izin akses Google Drive perlu diperbarui. Silakan masuk kembali.');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        allTracks = Array.isArray(data.files) ? data.files : [];
        isLoadingTracks = false;
        applyTrackFilter();
    } catch (error) {
        console.error('Gagal mengambil daftar musik Google Drive:', error);
        isLoadingTracks = false;
        allTracks = [];
        filteredTracks = [];
        if (els.trackList) els.trackList.innerHTML = '';
        setListStatus('Gagal memuat file audio dari Google Drive. Coba tekan Muat Ulang.', true);
    } finally {
        isLoadingTracks = false;
        if (els.refreshBtn) els.refreshBtn.disabled = false;
    }
}

async function playTrackByIndex(index) {
    if (index < 0 || index >= allTracks.length) return;
    if (!cachedAccessToken) {
        handleExpiredAuth();
        return;
    }

    const file = allTracks[index];
    activeTrackIndex = index;
    activeSourceMode = 'drive';
    wasPausedByGame = false;

    if (streamAbortController) {
        streamAbortController.abort();
    }
    const controller = new AbortController();
    streamAbortController = controller;

    isLoadingAudio = true;
    if (els.currentTitle) els.currentTitle.innerText = file.name || 'Memuat lagu...';
    if (els.currentMeta) els.currentMeta.innerText = 'Mengalirkan audio dari Google Drive...';
    renderTrackList(file.id);
    syncTransportUi();

    try {
        const response = await fetch(
            `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
            {
                headers: {
                    Authorization: `Bearer ${cachedAccessToken}`,
                },
                signal: controller.signal,
            }
        );

        if (response.status === 401 || response.status === 403) {
            isLoadingAudio = false;
            handleExpiredAuth('Sesi akses Google Drive berakhir. Silakan masuk kembali.');
            return;
        }

        if (!response.ok) {
            throw new Error(`Gagal streaming (HTTP ${response.status})`);
        }

        const blob = await response.blob();
        if (controller.signal.aborted) return;

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
        }
        currentObjectUrl = URL.createObjectURL(blob);
        musicAudio.removeAttribute('crossorigin');
        musicAudio.src = currentObjectUrl;
        applyAudioMuteAndVolume();
        await musicAudio.play();

        isLoadingAudio = false;
        if (els.currentTitle) els.currentTitle.innerText = file.name || 'Tanpa Judul';
        if (els.currentMeta) {
            const sizeLabel = formatFileSize(file.size);
            els.currentMeta.innerText = sizeLabel ? `Google Drive · ${sizeLabel}` : 'Google Drive Audio';
        }
        renderTrackList(file.id);
        syncTransportUi();
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Gagal memutar lagu dari Google Drive:', error);
        isLoadingAudio = false;
        if (els.currentMeta) els.currentMeta.innerText = 'Gagal memutar file audio ini.';
        renderTrackList(file.id);
        syncTransportUi();
    }
}

function playStep(direction) {
    if (allTracks.length === 0) {
        if (activeSourceMode === 'default' || activeSourceMode === 'none') {
            musicAudio.currentTime = 0;
            playDefaultSoundtrack(true);
        }
        return;
    }
    const pool = filteredTracks.length > 0 ? filteredTracks : allTracks;
    const currentId = activeTrackIndex >= 0 && allTracks[activeTrackIndex] ? allTracks[activeTrackIndex].id : null;
    const currentPoolIdx = currentId ? pool.findIndex((t) => t.id === currentId) : -1;
    let nextPoolIdx = 0;
    if (currentPoolIdx >= 0) {
        nextPoolIdx = (currentPoolIdx + direction + pool.length) % pool.length;
    } else if (direction < 0) {
        nextPoolIdx = pool.length - 1;
    }
    const targetFile = pool[nextPoolIdx];
    const fullIdx = allTracks.findIndex((t) => t.id === targetFile.id);
    if (fullIdx >= 0) {
        playTrackByIndex(fullIdx);
    }
}

async function handleGoogleSignIn() {
    if (isSigningIn) return;
    isSigningIn = true;
    setAuthStatus('Membuka jendela masuk Google...');
    renderAuthState();

    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) {
            throw new Error('Token akses Google Drive tidak diterima.');
        }
        cachedAccessToken = credential.accessToken;
        currentUser = result.user;
        needsAuth = false;
        setAuthStatus('');
        renderAuthState();
        await fetchDriveAudioFiles();
    } catch (error) {
        console.error('Google Sign-In gagal:', error);
        cachedAccessToken = null;
        needsAuth = true;
        const msg = error?.code === 'auth/popup-closed-by-user'
            ? 'Login dibatalkan sebelum selesai.'
            : 'Gagal terhubung ke Google Drive. Coba lagi.';
        setAuthStatus(msg, true);
    } finally {
        isSigningIn = false;
        renderAuthState();
    }
}

async function handleSignOut() {
    if (activeSourceMode === 'drive') {
        stopAndClearAudio();
    }
    allTracks = [];
    filteredTracks = [];
    if (els.trackList) els.trackList.innerHTML = '';
    if (els.searchInput) els.searchInput.value = '';
    cachedAccessToken = null;
    needsAuth = true;
    setAuthStatus('');
    try {
        await signOut(auth);
    } catch (error) {
        console.warn('Gagal keluar akun:', error);
    }
    renderAuthState();
}

function setDrawerOpen(open) {
    if (!els.drawer || !els.toggleBtn) return;
    els.drawer.hidden = !open;
    els.toggleBtn.setAttribute('aria-expanded', String(open));
    els.toggleBtn.classList.toggle('is-open', open);
}

function initMusicDrawerUi() {
    cacheElements();
    if (!els.drawer || !els.toggleBtn) return;

    const audioToggleBtn = document.getElementById('audio-toggle');
    isGlobalAudioMuted = audioToggleBtn?.getAttribute('aria-pressed') === 'true';
    applyAudioMuteAndVolume();

    // Prevent pointer/wheel events inside the drawer from bubbling to canvas camera controls.
    ['pointerdown', 'wheel'].forEach((evt) => {
        els.drawer.addEventListener(evt, (e) => e.stopPropagation());
    });

    els.toggleBtn.addEventListener('click', () => {
        setDrawerOpen(els.drawer.hidden);
        els.toggleBtn.blur();
    });

    if (els.closeBtn) {
        els.closeBtn.addEventListener('click', () => {
            setDrawerOpen(false);
            els.closeBtn.blur();
        });
    }

    if (els.googleSignInBtn) {
        els.googleSignInBtn.addEventListener('click', () => {
            els.googleSignInBtn.blur();
            handleGoogleSignIn();
        });
    }

    if (els.signOutBtn) {
        els.signOutBtn.addEventListener('click', () => {
            els.signOutBtn.blur();
            handleSignOut();
        });
    }

    if (els.refreshBtn) {
        els.refreshBtn.addEventListener('click', () => {
            els.refreshBtn.blur();
            fetchDriveAudioFiles();
        });
    }

    if (els.searchInput) {
        els.searchInput.addEventListener('input', applyTrackFilter);
    }

    if (els.playPauseBtn) {
        els.playPauseBtn.addEventListener('click', async () => {
            els.playPauseBtn.blur();
            wasPausedByGame = false;
            if (!musicAudio.src) {
                if (allTracks.length > 0) {
                    playStep(1);
                } else {
                    playDefaultSoundtrack(true);
                }
                return;
            }
            if (musicAudio.paused) {
                try {
                    await musicAudio.play();
                } catch (err) {
                    console.warn('Gagal melanjutkan musik:', err);
                }
            } else {
                musicAudio.pause();
            }
        });
    }

    if (els.prevBtn) {
        els.prevBtn.addEventListener('click', () => {
            els.prevBtn.blur();
            playStep(-1);
        });
    }

    if (els.nextBtn) {
        els.nextBtn.addEventListener('click', () => {
            els.nextBtn.blur();
            playStep(1);
        });
    }

    if (els.repeatBtn) {
        els.repeatBtn.addEventListener('click', () => {
            els.repeatBtn.blur();
            isRepeatOne = !isRepeatOne;
            syncTransportUi();
        });
    }

    if (els.volumeSlider) {
        els.volumeSlider.value = String(Math.round(musicVolume * 100));
        els.volumeSlider.addEventListener('input', () => {
            musicVolume = Math.max(0, Math.min(1, Number(els.volumeSlider.value) / 100));
            applyAudioMuteAndVolume();
        });
    }

    if (els.seekSlider) {
        els.seekSlider.addEventListener('pointerdown', () => {
            isSeeking = true;
        });
        els.seekSlider.addEventListener('input', () => {
            const dur = Number.isFinite(musicAudio.duration) ? musicAudio.duration : 0;
            if (dur > 0 && els.timeText) {
                const previewSec = (Number(els.seekSlider.value) / 1000) * dur;
                els.timeText.innerText = `${formatClock(previewSec)} / ${formatClock(dur)}`;
            }
        });
        els.seekSlider.addEventListener('change', () => {
            const dur = Number.isFinite(musicAudio.duration) ? musicAudio.duration : 0;
            if (dur > 0) {
                musicAudio.currentTime = (Number(els.seekSlider.value) / 1000) * dur;
            }
            isSeeking = false;
            els.seekSlider.blur();
        });
    }

    musicAudio.addEventListener('play', syncTransportUi);
    musicAudio.addEventListener('playing', () => {
        isLoadingAudio = false;
        syncTransportUi();
    });
    musicAudio.addEventListener('waiting', () => {
        isLoadingAudio = true;
        syncTransportUi();
    });
    musicAudio.addEventListener('pause', syncTransportUi);
    musicAudio.addEventListener('timeupdate', syncTimeUi);
    musicAudio.addEventListener('loadedmetadata', syncTimeUi);
    musicAudio.addEventListener('error', () => {
        isLoadingAudio = false;
        if (els.currentMeta) {
            els.currentMeta.innerText = 'Gagal memuat aliran audio. Tekan ▶ untuk mencoba lagi.';
        }
        syncTransportUi();
    });
    musicAudio.addEventListener('ended', () => {
        if (isRepeatOne || (activeSourceMode === 'default' && allTracks.length === 0)) {
            musicAudio.currentTime = 0;
            musicAudio.play().catch(() => {});
        } else {
            playStep(1);
        }
    });

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            if (cachedAccessToken) {
                needsAuth = false;
                renderAuthState();
            } else if (!isSigningIn) {
                cachedAccessToken = null;
                needsAuth = true;
                setAuthStatus('Klik tombol di bawah untuk memberi izin akses musik Google Drive.');
                renderAuthState();
            }
        } else {
            cachedAccessToken = null;
            needsAuth = true;
            renderAuthState();
        }
    });

    window.gameMusicPlayer = {
        syncMute(muted) {
            isGlobalAudioMuted = Boolean(muted);
            applyAudioMuteAndVolume();
        },
        closeDrawer() {
            setDrawerOpen(false);
        },
        playDefaultSoundtrack(forceRestart = false) {
            wasPausedByGame = false;
            return playDefaultSoundtrack(forceRestart);
        },
        pauseForGamePause() {
            if (!musicAudio.paused && !musicAudio.ended && Boolean(musicAudio.src)) {
                wasPausedByGame = true;
                musicAudio.pause();
            }
        },
        resumeFromGamePause() {
            if (!wasPausedByGame) return;
            wasPausedByGame = false;
            if (musicAudio.src && musicAudio.paused) {
                musicAudio.play().catch(() => {});
            }
        },
        clearGamePauseFlag() {
            wasPausedByGame = false;
        },
    };

    renderAuthState();
    if (window.__shouldStartDefaultMusic) {
        playDefaultSoundtrack();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicDrawerUi);
} else {
    initMusicDrawerUi();
}
