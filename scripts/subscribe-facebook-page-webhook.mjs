import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const pageId = parsed.META_PAGE_ID;
const pageToken = parsed.META_PAGE_ACCESS_TOKEN || parsed.META_ACCESS_TOKEN;
const version = parsed.META_GRAPH_API_VERSION || 'v22.0';

console.log(`Subscribing Facebook Page ${pageId} to 'leadgen' webhook events via Graph API (${version})...`);

async function subscribePage() {
  const url = `https://graph.facebook.com/${version}/${pageId}/subscribed_apps`;
  
  // Try subscribing
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscribed_fields: ['leadgen'],
      access_token: pageToken,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Failed to subscribe Page:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('Successfully subscribed Page to leadgen events! Response:', data);

  // Verify subscription
  console.log('Verifying active subscribed apps on Page...');
  const verifyRes = await fetch(`${url}?access_token=${encodeURIComponent(pageToken)}`);
  const verifyData = await verifyRes.json().catch(() => ({}));
  console.log('Active Subscriptions on Page:', JSON.stringify(verifyData, null, 2));
}

subscribePage().catch(err => {
  console.error('Subscription error:', err);
  process.exit(1);
});
