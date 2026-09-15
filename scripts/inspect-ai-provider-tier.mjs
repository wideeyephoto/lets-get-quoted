// READ-ONLY script to print AI provider configuration for manual tier verification.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const contents = process.env.GOOGLE_API_KEY && process.env.OPENAI_API_KEY 
  ? '' 
  : await readFile(resolve(root, '.env.live.local'), 'utf8').catch(() => '');

function getEnv(key) {
  if (process.env[key]) return process.env[key];
  return contents.split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${key}=`))
    ?.slice(`${key}=`.length)
    .replace(/^['"]|['"]$/g, '');
}

const geminiKey = getEnv('GOOGLE_API_KEY') || getEnv('GEMINI_API_KEY');
const openaiKey = getEnv('OPENAI_API_KEY');

console.log('--- Google Gemini API ---');
if (geminiKey) {
  console.log('Key prefix: ' + geminiKey.slice(0, 10) + '...');
  console.log('ACTION REQUIRED: Verify in Google Cloud Console that the project tied to this key has an active Billing Account and is on the paid enterprise API tier.');
} else {
  console.log('No Gemini API key found in .env.live.local.');
}

console.log('\n--- OpenAI API ---');
if (openaiKey) {
  console.log('Key prefix: ' + openaiKey.slice(0, 10) + '...');
  const orgMatch = openaiKey.match(/-(org-[a-zA-Z0-9]+)/);
  if (orgMatch) {
    console.log(`Organization ID in key: ${orgMatch[1]}`);
  }
  console.log('ACTION REQUIRED: Verify in OpenAI Platform that this organization has an approved zero-data-retention agreement if required by privacy claims.');
} else {
  console.log('No OpenAI API key found in .env.live.local.');
}
