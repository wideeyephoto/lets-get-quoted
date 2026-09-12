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
    // --- Code coverage ---
    // Generates reports even when tests fail so you can still inspect gaps.
    // Run `npm run test:coverage` for a full report, or pass `--coverage` to
    // any `vitest run` invocation. Reports land in coverage/.
    coverage: {
      provider: 'v8',
      enabled: false,          // off by default; `--coverage` or the npm script turns it on
      reportOnFailure: true,   // emit reports even when tests fail
      reportsDirectory: './coverage',
      reporter: [
        'text-summary',        // quick console overview after the run
        ['lcov', {}],          // lcov.info + HTML viewer for CI and local browsing
        ['json-summary', {}],  // machine-readable summary for dashboards / scripts
      ],
      // Measure server-side logic and API route handlers. React components
      // and hooks are excluded from this config because the main suite uses
      // a node environment; component tests that use react-test-renderer or
      // a jsdom/happy-dom environment (see https://v2.vitest.dev/guide/environment)
      // can be added to a separate config with its own coverage scope.
      // `src/app/**/*.ts` rather than only `src/app/api/**` so that server
      // actions are measured. They are the product's mutation surface — 117
      // modules that authenticate the caller, write to the database and move
      // money, invoked straight from browser forms — and while they sat outside
      // this list a module no test imported was indistinguishable from a module
      // that did not exist. Widening it moved the reported figure down, because
      // it added a large denominator that was never being counted, not because
      // anything stopped being tested. See docs/untested-code-audit-2026-09-12.md.
      //
      // The glob takes .ts only: pages and components are .tsx and still have
      // no number here, since this suite runs in a node environment. Covering
      // them needs a second config with a DOM environment.
      include: [
        'src/lib/**/*.ts',
        'src/app/**/*.ts',
        'src/middleware.ts',
      ],
      exclude: [
        'src/lib/**/index.ts',         // barrel re-exports
        'src/lib/site-content.ts',     // 146KB generated content catalog
        'src/lib/trades.ts',           // 222KB generated trade definitions
        '**/*.d.ts',                   // type declarations
        '**/*.test.*',                 // tests themselves
      ],
      // No thresholds initially — establish a baseline first, then set floors
      // to prevent regressions. Uncomment and tune after reviewing the
      // corrected report:
      // thresholds: {
      //   lines: 50,
      //   functions: 50,
      //   branches: 50,
      //   statements: 50,
      // },
    },
  },
});
