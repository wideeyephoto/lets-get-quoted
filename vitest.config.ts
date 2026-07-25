import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-unit CI suite. Tests live in test/ (outside src/), so `next build` and the
// app typecheck — whose tsconfig only includes src/ — never see them. The `@`
// alias mirrors tsconfig's paths so tests import lib code exactly as the app does.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
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
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test-token',
    },
  },
});
