// One-time helper: pushes local env vars to Vercel production without ever
// printing secret values to stdout. Reads .env.local directly and drives the
// Vercel CLI's interactive prompts via stdin.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const SKIP_KEYS = new Set([
  'DATABASE_URL', // local migration script only, not needed at runtime
  'VERCEL_OIDC_TOKEN', // managed by Vercel itself
  'NEXT_PUBLIC_ROOT_DOMAIN', // already added manually
]);

// Production overrides — do not push the local dev values for these.
const OVERRIDES = {
  NEXT_PUBLIC_APP_URL: process.env.PROD_APP_URL || 'https://lets-get-quoted.vercel.app',
};

async function parseEnvFile(path) {
  const contents = await readFile(path, 'utf8');
  const entries = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!value || SKIP_KEYS.has(key)) continue;
    entries.push([key, OVERRIDES[key] ?? value]);
  }
  return entries;
}

function addEnvVar(key, value) {
  if (value.includes('"')) {
    return Promise.resolve({ ok: false, errorText: 'Value contains a double quote; refusing to build shell command.' });
  }

  const isPublic = key.startsWith('NEXT_PUBLIC_');
  const command = [
    'npx.cmd vercel@56.2.0 env add', key, 'production',
    '--value', `"${value}"`,
    '--yes', '--force',
    isPublic ? '--no-sensitive' : '--sensitive',
  ].join(' ');

  return new Promise((resolve) => {
    const child = spawn(command, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, errorText }));
  });
}

async function main() {
  const entries = await parseEnvFile('.env.local');
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1];
  const filtered = only ? entries.filter(([key]) => key === only) : entries;
  const results = [];
  for (const [key, value] of filtered) {
    const { ok, errorText } = await addEnvVar(key, value);
    results.push({ key, ok });
    console.log(`${ok ? '✓' : '✗'} ${key}`);
    if (!ok && process.argv.includes('--debug')) console.error(`  ${errorText.split('\n').slice(0, 3).join(' ')}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`Failed: ${failed.map((r) => r.key).join(', ')}`);
    process.exit(1);
  }
}

main();
