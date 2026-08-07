import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Integration suite for the admin console, run against a REAL staging database.
//
// Separate from vitest.config.ts on purpose, and for two reasons:
//
//   1. That config injects dummy Supabase credentials into every test so a lib
//      module can be imported without a client constructor tripping on missing
//      config. Those dummies are exactly what these tests must not get.
//   2. Its include is test/**/*.test.ts. These live in test-staging/, so `npm
//      test` never picks them up and CI stays hermetic and offline.
//
// Run: npx vitest run --config vitest.staging.config.ts
//
// Credentials come from .env.staging.local, which is gitignored and which
// scripts/staging-setup.mjs refuses to let point at production.

// Placeholders for the third-party clients that construct at MODULE LOAD and
// throw on a missing key — Resend is the strict one, and importing anything that
// reaches lib/email.ts pulls it in. Only used when .env.staging.local leaves the
// key blank, which is the normal case: this suite talks to Postgres and should
// not be able to send anything to anyone even by accident.
const PLACEHOLDERS: Record<string, string> = {
  RESEND_API_KEY: 're_staging_suite_placeholder',
  STRIPE_SECRET_KEY: 'sk_test_staging_suite_placeholder',
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'staging-suite-placeholder',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3010',
};

function stagingEnv(): Record<string, string> {
  const env: Record<string, string> = { ...PLACEHOLDERS };
  try {
    const contents = readFileSync(new URL('./.env.staging.local', import.meta.url), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      const key = trimmed.slice(0, at).trim();
      const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      // A blank value in the file must not clobber a placeholder — that is the
      // shape .env.staging.local ships in for every optional key.
      if (key && value) env[key] = value;
    }
  } catch {
    // The suite itself reports the missing file far more clearly than a config
    // crash would.
  }
  return env;
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test-staging/**/*.test.ts'],
    // Real network calls to a real Postgres, so the unit suite's timeout is
    // optimistic.
    testTimeout: 30_000,
    // Shared mutable database: these tests create and read rows, and running
    // files in parallel against one schema makes failures depend on scheduling.
    fileParallelism: false,
    env: stagingEnv(),
  },
});
