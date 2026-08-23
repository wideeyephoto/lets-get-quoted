import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Deliberately separate from the hermetic unit suite: this one talks to Stripe.
//
// `envDir: false` keeps Vite from loading .env files, so the preflight reads
// exactly the environment it was given and nothing it was not. Running it
// against Production means running it where the Production variables are --
// the six STRIPE_PRICE_* values are Sensitive in Vercel and cannot be read back
// out, so there is no way to pull them somewhere else and check them there.
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Same stand-in the unit suite uses: a build-time marker with no runtime
      // behaviour, which Vitest has no Next resolver for.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    cache: false,
    environment: 'node',
    include: ['test-preflight/*.preflight.ts'],
    exclude: ['test/**', 'test-pg17/**', 'test-staging/**'],
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
