import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');

const parsed = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  parsed[key] = val;
}

if (!parsed.META_WEBHOOK_VERIFY_TOKEN) {
  const generatedToken = crypto.randomBytes(24).toString('hex');
  parsed.META_WEBHOOK_VERIFY_TOKEN = generatedToken;
  appendFileSync(envPath, `\nMETA_WEBHOOK_VERIFY_TOKEN=${generatedToken}\n`);
  console.log(`Generated and saved META_WEBHOOK_VERIFY_TOKEN to .env.local: ${generatedToken}`);
}

const varsToPush = [
  { key: 'META_ACCESS_TOKEN', val: parsed.META_ACCESS_TOKEN },
  { key: 'META_AD_ACCOUNT_ID', val: parsed.META_AD_ACCOUNT_ID },
  { key: 'META_PAGE_ID', val: parsed.META_PAGE_ID },
  { key: 'META_WEBHOOK_VERIFY_TOKEN', val: parsed.META_WEBHOOK_VERIFY_TOKEN },
  { key: 'FEATURE_MANAGED_ADS_CHECKOUT_ENABLED', val: 'true' },
];

for (const { key, val } of varsToPush) {
  if (!val) {
    console.warn(`Skipping ${key}: value is empty or undefined.`);
    continue;
  }
  console.log(`Pushing ${key} to Vercel (production, preview)...`);
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'npx.cmd' : 'npx';
    const output = execFileSync(
      cmd,
      ['vercel', 'env', 'add', key, 'production,preview', '--value', val, '--force', '--yes'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );
    console.log(`  Successfully added ${key}`);
  } catch (err) {
    console.error(`  Error pushing ${key}:`, err.stderr || err.message);
  }
}

console.log('\nAll environment variables pushed successfully!');
