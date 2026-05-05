/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: Number(process.env['VITE_PORT'] ?? 5173),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env['VITE_SERVER_PORT'] ?? 4000}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: `http://localhost:${process.env['VITE_SERVER_PORT'] ?? 4000}`,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
