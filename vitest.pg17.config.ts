import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Deliberately separate from the hermetic unit suite. `envDir: false` prevents
// Vite from loading .env files; the harness itself accepts only its dedicated
// disposable-database variables and refuses every unmarked target.
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    cache: false,
    environment: 'node',
    include: [
      'test-pg17/direct-checkout-late-success-operator-resolution-race.test.ts',
    ],
    exclude: ['test/**', 'test-staging/**'],
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 15_000,
  },
});
