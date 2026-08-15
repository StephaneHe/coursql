import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev server proxies /api to the local API (port 3000). In production the API serves the
// built client directly, so no proxy is needed.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
        },
    },
    build: {
        outDir: 'dist',
    },
});
