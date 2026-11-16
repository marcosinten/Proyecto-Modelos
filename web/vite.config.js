import { defineConfig } from 'vite';
export default defineConfig({
  server: { allowedHosts: ['localhost', '127.0.0.1'], proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, headers: { origin: 'http://127.0.0.1:5173', ...(process.env.API_KEY ? {'X-API-Key':process.env.API_KEY} : {}) } } } },
  build: { chunkSizeWarningLimit: 1200 }
});
