/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientPort = Number(env['CLIENT_PORT'] ?? 5173);
  const apiTarget = env['VITE_API_URL'] ?? 'http://localhost:4000';

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
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': {
          target: apiTarget,
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
