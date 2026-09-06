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
      '/chat': 'http://localhost:3014',
      '/api': 'http://localhost:3014',
      '/auth.js': 'http://localhost:3014',
      '/firebase-config.js': 'http://localhost:3014',
    },
  },
});
