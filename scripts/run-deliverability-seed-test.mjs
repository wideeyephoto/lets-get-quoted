#!/usr/bin/env node
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const families = ['MagicLink', 'Quote', 'InvoicePdf'];

function addresses(value) {
  const items = value.split(',').map(item => item.trim().toLowerCase());
  if (items.some(item => !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(item))) {
    throw new Error('Supply plain email addresses, without display names or empty entries.');
  }
  return items;
}
export function parseSeedArgs(args) {
  const recipients = [], allowed = [];
  let send = false, dryRun = false;
  for (const arg of args) {
    if (arg === '--send') send = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (/^--(target|gmail|outlook|yahoo|icloud)=/.test(arg)) recipients.push(...addresses(arg.slice(arg.indexOf('=') + 1)));
    else if (arg.startsWith('--allow=')) allowed.push(...addresses(arg.slice(8)));
    else throw new Error('Unknown argument. Use --target=email[,email] and optionally --send --allow=email[,email].');
  }
  const unique = [...new Set(recipients)];
  if (!unique.length || unique.length > 5) throw new Error('Supply between one and five explicit seed recipients.');
  if (send && dryRun) throw new Error('--send and --dry-run cannot be combined.');
  if (send && unique.some(email => !allowed.includes(email))) throw new Error('Every live recipient must also appear in --allow.');
  return { recipients: unique, send };
}

export async function loadSeedRuntime() {
  const bundle = await build({
    absWorkingDir: root,
    stdin: { contents: "export * from './scripts/deliverability-seed-templates.mjs'; export { preparePlatformTransactionalEmail } from './src/lib/platform-transactional-email';", resolveDir: root, loader: 'ts' },
    alias: { '@': join(root, 'src') }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const artifacts = join(root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const scratch = await mkdtemp(join(artifacts, 'seed-runtime-'));
  const moduleFile = join(scratch, 'runtime.cjs');
  try {
    await writeFile(moduleFile, bundle.outputFiles[0].text);
    return require(moduleFile);
  } finally {
    delete require.cache[moduleFile];
    await unlink(moduleFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(scratch);
  }
}

export async function runSeedTest(options, { env = process.env, load = loadSeedRuntime, fetcher = globalThis.fetch, clientFactory = createClient } = {}) {
  // Revalidate exported-call inputs before loading credentials or making requests.
  const validated = parseSeedArgs([`--target=${options.recipients.join(',')}`, ...(options.send ? ['--send', `--allow=${options.allowed?.join(',') ?? ''}`] : [])]);
  if (validated.send && (!env.RESEND_API_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('Live mode requires explicit process-environment provider and Supabase credentials. No .env files are loaded.');
  }
  const runtime = await load();
  const admin = validated.send ? clientFactory(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetcher(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) }) },
  }) : null;
  const results = [];
  let stopped = false;
  for (const email of validated.recipients) {
    for (const family of families) {
      const row = { email, family, status: 'not_attempted', providerId: null };
      results.push(row);
      if (stopped) continue;
      let submitted = false;
      try {
        const payload = await runtime[`render${family}Test`](email);
        if (!validated.send) { row.status = 'rendered'; continue; }
        const checked = await runtime.preparePlatformTransactionalEmail(admin, payload);
        const body = JSON.stringify({ ...checked, attachments: checked.attachments?.map(item => ({ ...item,
          content: Buffer.isBuffer(item.content) ? item.content.toString('base64') : item.content,
        })) });
        submitted = true;
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` }, body,
        });
        if (!response.ok) {
          row.status = response.status >= 500 || response.status === 408 ? 'uncertain' : 'rejected';
          stopped = true;
          continue;
        }
        const receipt = await response.json();
        if (typeof receipt?.id !== 'string' || !receipt.id.trim()) throw new Error('Missing acceptance');
        row.status = 'accepted'; row.providerId = receipt.id;
      } catch {
        row.status = submitted ? 'uncertain' : 'blocked_or_render_failed';
        stopped = true;
      }
    }
  }
  return { mode: validated.send ? 'live' : 'preview', ok: !stopped, results,
    receiverEvidence: 'NOT VERIFIED: inbox placement, SPF, DKIM, DMARC, replies and PDF layout require receiver inspection. Synthetic links do not authenticate or open real documents.',
    recovery: 'No automatic retries. Preserve accepted IDs; reconcile uncertain submissions before another run.' };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSeedArgs(args);
  const allowed = args.filter(arg => arg.startsWith('--allow=')).flatMap(arg => addresses(arg.slice(8)));
  const report = await runSeedTest({ ...options, allowed });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
