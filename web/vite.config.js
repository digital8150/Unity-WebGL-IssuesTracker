import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        timeout: 30 * 60 * 1000,
        proxyTimeout: 30 * 60 * 1000,
      },
      '/builds': 'http://localhost:4000',
      '/content': 'http://localhost:4000',
      '/blog-images': 'http://localhost:4000',
      '/thumbnails': 'http://localhost:4000',
    },
  },
});
