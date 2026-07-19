import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    // Integration specs spin up an in-memory MongoDB in their setup hooks. When
    // many files run in parallel these startups contend for CPU/IO, so the tight
    // Vitest defaults (10s hook / 5s test) flake. Give them headroom.
    hookTimeout: 30_000,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Cover the layers that hold business logic; exclude framework glue and
      // thin delegators. Controllers are intentionally excluded: the integration
      // harness exercises services + repositories directly (guards/pipes are
      // unit-tested separately), so HTTP wiring would only add vanity numbers.
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/worker.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts',
        'src/**/schemas/**',
        'src/**/strategies/**',
        'src/**/decorators/**',
        'src/**/*.types.ts',
        'src/config/**',
        'src/observability/**',
        'src/infra/**',
        'src/health/**',
        'src/scripts/**',
        'src/test/**',
        'src/**/*.spec.ts',
      ],
      // Floors set just under current coverage so the gate catches regressions
      // without being flaky. Business layers (services/repos/mappers) sit ~86%
      // statements / ~92% functions; branches are inherently lower.
      thresholds: {
        statements: 82,
        branches: 70,
        functions: 88,
        lines: 82,
      },
    },
  },
  plugins: [
    // Compile with SWC so NestJS decorators + metadata work in tests.
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
});
