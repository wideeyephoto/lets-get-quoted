// Native Node only, shared with the dependency-free external watchdog.
// This rail is restricted to the configured on-call recipient. It never uses a
// customer delivery task, bills a tenant, or retries an ambiguous submission.
export async function sendMonitorFailureSms({ env = process.env, fetcher = fetch, now = new Date(), drill = false } = {}) {
  const recipient = env.ONCALL_PRIMARY_PHONE;
  const sender = env.OPERATIONAL_SMS_FROM_NUMBER;
  const space = new URL(env.SIGNALWIRE_SPACE_URL?.startsWith('https://') ? env.SIGNALWIRE_SPACE_URL : `https://${env.SIGNALWIRE_SPACE_URL}`);
  if (!/^\+[1-9]\d{7,14}$/.test(recipient || '') || !/^\+[1-9]\d{7,14}$/.test(sender || '')
      || !space.hostname.endsWith('.signalwire.com') || space.username || space.password
      || !env.SIGNALWIRE_PROJECT_ID || !env.SIGNALWIRE_API_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('operational_sms_configuration_invalid');
  }
  const database = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const project = database.hostname.split('.')[0];
  const pageKey = `lgq-monitor-${project}-${drill ? 'drill' : 'failure'}-${now.toISOString().slice(0, 13)}`;
  const body = `LGQ Ops ${drill ? 'DRILL: ' : ''}monitoring or email delivery failed. Check https://app.letsgetquoted.com/admin/health and the operational alert queue. Restore delivery; do not replay payments or customer messages.`;
  const dbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const rowUrl = `${database.origin}/rest/v1/operational_sms_pages?page_key=eq.${encodeURIComponent(pageKey)}`;
  const request = (url, init = {}) => fetcher(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const patch = async value => {
    const r = await request(rowUrl, { method: 'PATCH', headers: dbHeaders, body: JSON.stringify({ ...value, updated_at: new Date().toISOString() }) });
    if (!r.ok) throw new Error('operational_sms_evidence_write_failed');
  };
  const inserted = await request(`${database.origin}/rest/v1/operational_sms_pages`, {
    method: 'POST', headers: { ...dbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({ page_key: pageKey, recipient, sender, body }),
  });
  let row;
  if (inserted.ok) {
    [row] = await inserted.json();
  } else if (inserted.status === 409 && (await inserted.json()).code === '23505') {
    const existing = await request(rowUrl, { headers: dbHeaders });
    if (!existing.ok) throw new Error('operational_sms_evidence_read_failed');
    [row] = await existing.json();
    if (!row || row.recipient !== recipient || row.sender !== sender || row.body !== body) throw new Error('operational_sms_identity_conflict');
    if (!row.provider_id) throw new Error('operational_sms_submission_requires_review');
  } else {
    throw new Error('operational_sms_claim_failed');
  }
  // Preserve confirmed delivery if a provider read later regresses or is unavailable.
  if (row.state === 'delivered' && row.delivered_at && row.provider_id) {
    return { providerId: row.provider_id, status: 'delivered', pageKey, repeated: true };
  }
  const providerBase = `${space.origin}/api/laml/2010-04-01/Accounts/${encodeURIComponent(env.SIGNALWIRE_PROJECT_ID)}/Messages`;
  const providerHeaders = { Authorization: `Basic ${Buffer.from(`${env.SIGNALWIRE_PROJECT_ID}:${env.SIGNALWIRE_API_TOKEN}`).toString('base64')}` };
  if (inserted.ok) {
    // Do not retry POST, even on a timeout or loss of the response/evidence write.
    try {
      const sent = await request(`${providerBase}.json`, {
        method: 'POST', headers: { ...providerHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: recipient, From: sender, Body: body }).toString(),
      });
      if (!sent.ok) throw new Error(`signalwire_http_${sent.status}`);
      const message = await sent.json();
      if (!message.sid) throw new Error('signalwire_missing_message_id');
      row = { ...row, provider_id: message.sid };
      await patch({ state: 'accepted', provider_id: message.sid, provider_status: message.status, accepted_at: new Date().toISOString() });
    } catch {
      await patch({ state: 'manual_review', error_code: 'submission_outcome_requires_review' });
      throw new Error('operational_sms_submission_requires_review');
    }
  }
  const result = await request(`${providerBase}/${encodeURIComponent(row.provider_id)}.json`, { headers: providerHeaders });
  if (!result.ok) throw new Error('operational_sms_status_unavailable');
  const message = await result.json();
  if (message.sid !== row.provider_id || message.to !== recipient || message.from !== sender || message.account_sid !== env.SIGNALWIRE_PROJECT_ID) {
    throw new Error('operational_sms_provider_identity_mismatch');
  }
  const terminalFailure = ['failed', 'undelivered', 'canceled'].includes(message.status);
  const delivered = message.status === 'delivered';
  await patch({ state: delivered ? 'delivered' : terminalFailure ? 'manual_review' : 'accepted',
    provider_status: message.status, error_code: terminalFailure ? String(message.error_code || 'provider_failed') : null,
    ...(delivered ? { delivered_at: row.delivered_at || new Date().toISOString() } : {}) });
  if (terminalFailure) throw new Error('operational_sms_delivery_failed');
  return { providerId: row.provider_id, status: delivered ? 'delivered' : 'accepted', pageKey, repeated: !inserted.ok };
}
