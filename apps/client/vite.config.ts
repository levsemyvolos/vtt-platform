/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
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
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
