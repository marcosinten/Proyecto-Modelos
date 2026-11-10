import { defineConfig } from 'vite';
export default defineConfig({
  server: { allowedHosts: true, proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, headers: { origin: 'http://127.0.0.1:5173' } } } },
  build: { chunkSizeWarningLimit: 1200 }
});
