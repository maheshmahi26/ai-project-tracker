/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // `.env` lives at the monorepo root (two levels up from apps/web), so read it
  // from there to keep the API proxy target in sync with the backend PORT.
  const env = loadEnv(mode, resolve(process.cwd(), '../..'), '');
  const apiPort = env.PORT ?? '3000';
  const apiTarget = env.VITE_API_TARGET ?? `http://localhost:${apiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Proxy API calls to the NestJS backend during dev.
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
