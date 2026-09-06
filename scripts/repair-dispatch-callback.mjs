// Reuse the already configured platform registry receiver; never print its token.
import { readFileSync } from 'node:fs';
import { parseEnvEntries } from './verify-signalwire-activation.mjs';
const envPath = process.argv.find(a => a.startsWith('--env-file='))?.slice(11);
if (!envPath) throw new Error('Pass --env-file with server-side SignalWire credentials');
for (const { key, value, readable } of parseEnvEntries(readFileSync(envPath, 'utf8'))) {
  if (readable && !process.env[key]) process.env[key] = value;
}
const space = (process.env.SIGNALWIRE_SPACE_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (!/^[a-z0-9-]+\.signalwire\.com$/i.test(space)) throw new Error('Invalid SignalWire hostname');
const auth = Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64');
const dispatchId = '19e7c875-3611-4b40-8429-7dae3b5e6553';
const supportId = '638bad76-629d-4321-90e2-6fe533c09091';
async function request(id, body) {
  const response = await fetch(`https://${space}/api/relay/rest/registry/beta/campaigns/${id}`, {
    method: body ? 'PUT' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Campaign request returned HTTP ${response.status}`);
  return response.json();
}
const [support, dispatch] = await Promise.all([request(supportId), request(dispatchId)]);
const callback = support.status_callback_url;
if (typeof callback !== 'string' || !/^https:\/\/app\.letsgetquoted\.com\/api\/signalwire\/10dlc\/[A-Za-z0-9_-]{32,128}$/.test(callback)) {
  throw new Error('Existing callback is not the expected production receiver');
}
if (dispatch.state !== 'active') throw new Error('Dispatch campaign is not active');
if (dispatch.status_callback_url && dispatch.status_callback_url !== callback) throw new Error('Dispatch already has a different callback; inspect first');
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ campaign: dispatchId, state: dispatch.state, callbackConfigured: Boolean(dispatch.status_callback_url), readyToSetExistingProductionReceiver: true }));
} else {
  if (!dispatch.status_callback_url) await request(dispatchId, { status_callback_url: callback });
  const verified = await request(dispatchId);
  if (verified.status_callback_url !== callback || verified.state !== dispatch.state) {
    throw new Error('Provider did not preserve the requested callback and active state');
  }
  console.log(JSON.stringify({ campaign: dispatchId, state: verified.state, callbackVerified: true }));
}
