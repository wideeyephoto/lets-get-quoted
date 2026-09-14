#!/usr/bin/env node
/**
 * Usage: node scripts/dry-run-contractor-lifecycle.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * process environment. Does not load .env files or enable a sending credential.
 * Recipient previews are private operational output; do not publish raw logs.
 */
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export function createReadOnlyFetch(supabaseUrl, upstream = globalThis.fetch) {
  const origin = new URL(supabaseUrl).origin;
  const tables = new Set(['accounts', 'account_events', 'jobs', 'email_suppression']);
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    const allowed = url.origin === origin && (
      (request.method === 'GET' && tables.has(table)) ||
      (request.method === 'POST' && url.pathname === '/rest/v1/rpc/owner_emails_for_accounts')
    );
    if (!allowed) throw new Error(`Dry-run blocked request: ${request.method} ${url.pathname}`);
    return upstream(new Request(request, { redirect: 'error' }));
  };
}

export async function loadDryRunSweep() {
  // Compile the actual sweep with TypeScript aliases, but make sends and
  // ambient admin/audit clients unavailable in this read-only runner.
  const bundle = await build({
    absWorkingDir: root,
    stdin: { contents: "export { runContractorLifecycleSweep } from '@/lib/contractor-lifecycle-emails';", resolveDir: root, loader: 'ts' },
    alias: { '@': join(root, 'src') },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{
      name: 'read-only-lifecycle',
      setup(builder) {
        builder.onResolve({ filter: /^(resend|@\/lib\/(auth|account-events))$/ }, args => ({ path: args.path, namespace: 'dry-run' }));
        builder.onLoad({ filter: /.*/, namespace: 'dry-run' }, args => ({
          contents: args.path === 'resend'
            ? "export class Resend { constructor() { throw new Error('Email provider disabled in dry-run'); } }"
            : args.path.endsWith('/auth')
              ? "export function createAdminClient() { throw new Error('Dry-run requires an explicit read-only client'); }"
              : "export function recordAccountEvent() { throw new Error('Audit writes disabled in dry-run'); }",
          loader: 'js',
        }));
      },
    }],
  });
  const artifacts = join(root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const scratch = await mkdtemp(join(artifacts, 'email-dry-run-'));
  const moduleFile = join(scratch, 'sweep.cjs');
  try {
    await writeFile(moduleFile, bundle.outputFiles[0].text);
    const { runContractorLifecycleSweep } = require(moduleFile);
    delete require.cache[require.resolve(moduleFile)];
    return runContractorLifecycleSweep;
  } finally {
    await unlink(moduleFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(scratch);
  }
}

export async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the intended environment. No requests made.');
  }
  const sweep = await loadDryRunSweep();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createReadOnlyFetch(supabaseUrl) },
  });
  const result = await sweep(admin, { dryRun: true });
  console.log(`Checked accounts: ${result.checked}\nPlanned sends: ${result.planned}\nSent: ${result.sent}\nSkipped: ${result.skipped}\nErrors: ${result.errors}`);
  for (const detail of result.details) {
    console.log(`[${detail.status.toUpperCase()}] Account: ${detail.accountId} | Step: ${detail.stepId} | ${detail.note || ''}`);
  }
  if (result.errors) throw new Error('Dry-run has errors; resolve them before sending.');
  console.log('Read-only dry-run completed. No messages sent.');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Dry-run failed.');
    process.exitCode = 1;
  });
}
