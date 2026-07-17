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
      // Playwright specs live under e2e/ and must not be picked up by Vitest.
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'json-summary', 'lcov'],
        reportsDirectory: './coverage',
        // Front-end coverage targets the logic layers (API clients, query hooks,
        // stores, pure helpers, form/validation logic). Presentational rendering
        // and page composition are validated by the Playwright E2E journeys, so
        // gating them here would only chase vanity numbers.
        include: [
          'src/lib/api-client.ts',
          'src/stores/**/*.{ts,tsx}',
          'src/hooks/**/*.{ts,tsx}',
          'src/features/**/lib/**/*.{ts,tsx}',
          'src/features/projects/hooks/**/*.{ts,tsx}',
          'src/features/auth/api/**/*.{ts,tsx}',
        ],
        exclude: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'e2e/**'],
        // Floors just under current; the logic layer here is small and the
        // real UI journeys are covered by the Playwright E2E suite.
        thresholds: {
          statements: 58,
          branches: 75,
          functions: 55,
          lines: 58,
        },
      },
    },
  };
});
