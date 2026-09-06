// Read-only inventory. Uses GET requests; never sends SMS or buys/assigns numbers.
import { readFileSync } from 'node:fs';
import { parseEnvEntries } from './verify-signalwire-activation.mjs';

const envPath = process.argv.find(arg => arg.startsWith('--env-file='))?.slice(11);
if (envPath) {
  for (const { key, value, readable } of parseEnvEntries(readFileSync(envPath, 'utf8'))) {
    if (readable && !process.env[key]) process.env[key] = value;
  }
}
const space = (process.env.SIGNALWIRE_SPACE_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (!/^[a-z0-9-]+\.signalwire\.com$/i.test(space)
    || !process.env.SIGNALWIRE_PROJECT_ID || !process.env.SIGNALWIRE_API_TOKEN) {
  throw new Error('A SignalWire hostname, project ID and API token are required.');
}
const origin = `https://${space}`;
const auth = Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64');
async function get(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Refusing cross-origin provider pagination');
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Provider GET ${url.pathname}: HTTP ${response.status}`);
  return response.json();
}
async function list(path) {
  const rows = []; const seen = new Set();
  while (path) {
    if (seen.has(path) || seen.size >= 50) throw new Error('Provider pagination did not finish');
    seen.add(path);
    const page = await get(path);
    if (!Array.isArray(page.data)) throw new Error('Unexpected provider list response');
    rows.push(...page.data);
    path = page.links?.next || null;
  }
  return rows;
}
const [numbers, brands] = await Promise.all([
  list('/api/relay/rest/phone_numbers'), list('/api/relay/rest/registry/beta/brands'),
]);
const campaigns = [];
for (const brand of brands) {
  for (const campaign of await list(`/api/relay/rest/registry/beta/brands/${brand.id}/campaigns`)) {
    const assignments = await list(`/api/relay/rest/registry/beta/campaigns/${campaign.id}/numbers`);
    campaigns.push({ id: campaign.id, name: campaign.name, state: campaign.state,
      description: campaign.description, useCases: campaign.sub_use_cases,
      brandState: brand.state, useCase: campaign.sms_use_case, callbackConfigured: Boolean(campaign.status_callback_url),
      assignments: assignments.map(a => ({ id: a.id, number: a.phone_number?.number || a.number,
        providerNumberId: a.phone_number?.id, state: a.state })) });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), numbers: numbers.map(n => ({
  id: n.id, number: n.number, name: n.name, capabilities: n.capabilities,
  messageHandler: n.message_handler, messageRequestUrl: n.message_request_url,
  messageRequestMethod: n.message_request_method,
})), campaigns }, null, 2));
