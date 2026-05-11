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
      // NOTE: manualChunks was tried for konva/dice/i18n/redux but caused
      // React-duplicate hook crashes (react-redux ended up in its own chunk
      // with a separate React copy). Vite's default chunking is correct here;
      // the bulk of the perf win already comes from lazy() routes in AppRouter.
    },
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
