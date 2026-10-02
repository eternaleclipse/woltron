import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const API = process.env.WOLTRON_API ?? 'http://127.0.0.1:4321';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => {
          // keep SSE unbuffered through the proxy
          proxy.on('proxyRes', (res) => {
            if (String(res.headers['content-type'] ?? '').includes('text/event-stream')) {
              res.headers['cache-control'] = 'no-cache';
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
