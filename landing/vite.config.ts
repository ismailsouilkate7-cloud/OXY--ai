import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: false,
  },
  server: {
    port: 3000,
    proxy: {
      '/chat': 'http://localhost:3012',
      '/api': 'http://localhost:3012',
      '/auth.js': 'http://localhost:3012',
      '/firebase-config.js': 'http://localhost:3012',
    },
  },
});
