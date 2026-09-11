// READ-ONLY audit of live Stripe Tax Registrations and product tax codes.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const contents = process.env.STRIPE_SECRET_KEY ? '' : await readFile(resolve(root, '.env.live.local'), 'utf8').catch(() => '');
const secretKey = process.env.STRIPE_SECRET_KEY || contents.split(/\r?\n/)
  .map((l) => l.trim())
  .find((l) => l.startsWith('STRIPE_SECRET_KEY='))
  ?.slice('STRIPE_SECRET_KEY='.length)
  .replace(/^['"]|['"]$/g, '');

if (!secretKey) throw new Error('No STRIPE_SECRET_KEY found in environment or .env.live.local.');
if (!/^(rk|sk)_live_/.test(secretKey)) {
  throw new Error('Refusing: this read-only audit requires a live key.');
}

const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

console.log('--- Tax Registrations ---');
const registrations = await stripe.tax.registrations.list({ limit: 100 });
for (const reg of registrations.data) {
  console.log(`[${reg.status}] ${reg.country} ${reg.state} - active_from: ${new Date(reg.active_from * 1000).toISOString()}`);
}
if (registrations.data.length === 0) {
  console.log('NO TAX REGISTRATIONS FOUND.');
}

console.log('\n--- Tax Settings ---');
const settings = await stripe.tax.settings.retrieve();
console.log(`Head office: ${settings.head_office?.address?.city}, ${settings.head_office?.address?.state}, ${settings.head_office?.address?.country}`);

console.log('\n--- Product Tax Codes ---');
const products = await stripe.products.list({ active: true, limit: 100 });
for (const p of products.data) {
  console.log(`Product: ${p.name.padEnd(30)} Tax Code: ${p.tax_code ?? 'MISSING'}`);
}
