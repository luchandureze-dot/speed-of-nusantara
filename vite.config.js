import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function copyStaticDirectories() {
  return {
    name: 'copy-static-directories',
    closeBundle() {
      const distDir = resolve(process.cwd(), 'dist');
      for (const dir of ['assets', 'js', 'tools']) {
        const src = resolve(process.cwd(), dir);
        const dest = resolve(distDir, dir);
        if (existsSync(src)) {
          cpSync(src, dest, { recursive: true });
        }
      }
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [react(), copyStaticDirectories()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
