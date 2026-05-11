/// <reference types="vitest" />
import { defineConfig, loadEnv, type ConfigEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig(({ mode }: ConfigEnv) => {
  // loadEnv with prefix='' reads ALL keys from .env / .env.local (not just VITE_*).
  // This lets vite.config.ts pick up CLIENT_PORT and VITE_API_URL from .env.local
  // so each worktree only needs to set those two values — no manual config edits.
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env['VITE_API_URL'] ?? 'http://localhost:4000';
  const clientPort = parseInt(env['CLIENT_PORT'] ?? '5173', 10);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: clientPort,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': {
          target: apiUrl,
          ws: true,
        },
      },
    },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            // Heavy 2D canvas stack — only used inside session route
            konva: ['konva', 'react-konva'],
            // Three.js + Cannon-es transitive via dice-box (~300 KB gzip)
            dice: ['@3d-dice/dice-box-threejs'],
            // i18n bundles all translation namespaces; isolate so first paint
            // can stream the main chunk without waiting on it.
            i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
            // Redux Toolkit is on the critical path but ships large; isolating
            // gives the browser a separate cacheable chunk.
            redux: ['@reduxjs/toolkit', 'react-redux'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
