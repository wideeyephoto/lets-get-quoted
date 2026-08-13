import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-unit CI suite. Tests live in test/ (outside src/), so `next build` and the
// app typecheck — whose tsconfig only includes src/ — never see them. The `@`
// alias mirrors tsconfig's paths so tests import lib code exactly as the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // A lib module that marks itself server-side was unimportable from a
      // test, because Vitest has no Next resolver for this specifier. It is a
      // build-time marker with no runtime behaviour, so standing it down here
      // costs nothing and lets those modules be covered at all.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Blocks the socket to every SMS provider host. See the file for why the
    // existing in-code gate is not enough on its own.
    setupFiles: ['./test/setup/no-provider-egress.ts'],
    // Dummy env so importing a lib module never trips a client constructor that
    // reads config at load time. Values are deterministic within a run (the
    // unsubscribe-token HMAC is keyed on SUPABASE_SERVICE_ROLE_KEY, so make/parse
    // must see the same secret).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-deterministic',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3010',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      RESEND_API_KEY: 're_test_dummy',
      // Deliberately NO sender (no TWILIO_FROM_NUMBER, no messaging service):
      // the config predicate needs one, so isSmsConfigured() is false and
      // nothing in the suite can send. test/sms-provider.test.ts pins that, so
      // adding a sender here to fix an unrelated test fails loudly instead of
      // quietly arming ~30 send functions.
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test-token',
    },
  },
});
