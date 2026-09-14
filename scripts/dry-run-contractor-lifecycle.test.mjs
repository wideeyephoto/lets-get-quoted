import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createReadOnlyFetch, loadDryRunSweep } from './dry-run-contractor-lifecycle.mjs';

const origin = 'https://dry-run-fixture.supabase.co';

test('read-only transport permits reviewed reads and rejects writes, foreign origins and arbitrary RPCs', async () => {
  const calls = [];
  const fetch = createReadOnlyFetch(origin, async request => {
    calls.push(request);
    return Response.json([]);
  });
  await fetch(`${origin}/rest/v1/accounts?select=id`);
  await fetch(`${origin}/rest/v1/rpc/owner_emails_for_accounts`, { method: 'POST', body: '{"ids":[]}' });
  await fetch(`${origin}/rest/v1/rpc/lifecycle_recipient_suppression`, { method: 'POST', body: '{"p_recipients":[]}' });
  for (const [url, method] of [
    [`${origin}/rest/v1/account_events`, 'POST'],
    [`${origin}/rest/v1/email_suppression`, 'PATCH'],
    [`${origin}/rest/v1/accounts`, 'DELETE'],
    [`${origin}/rest/v1/rpc/arbitrary_write`, 'POST'],
    ['https://api.resend.com/emails', 'POST'],
    ['https://elsewhere.example/rest/v1/accounts', 'GET'],
  ]) {
    await assert.rejects(fetch(url, { method }), /Dry-run blocked request/);
  }
  assert.equal(calls.length, 3);
  assert.ok(calls.every(request => request.redirect === 'error'));
});

test('compiled application sweep previews with real Supabase query construction and no provider or write capability', async () => {
  const saved = Object.fromEntries(['RESEND_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_APP_URL'].map(key => [key, process.env[key]]));
  process.env.RESEND_API_KEY = 'sending-must-still-be-disabled';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-fixture-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  try {
    const sweep = await loadDryRunSweep();
    const requests = [];
    const admin = createClient(origin, 'synthetic-fixture-secret', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createReadOnlyFetch(origin, async request => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === '/rest/v1/accounts') return Response.json([{
          id: 'workspace-one', business_name: 'Reliable Trades', connect_onboarded: false,
          created_at: new Date(Date.now() - 7 * 86400000).toISOString(), test_marker: null,
        }]);
        if (path === '/rest/v1/rpc/owner_emails_for_accounts') return Response.json([
          { account_id: 'workspace-one', email: 'morgan@reliabletrades.com' },
        ]);
        if (path === '/rest/v1/rpc/lifecycle_recipient_suppression') {
          const {p_recipients}=await request.json();
          return Response.json(p_recipients.map(pair=>({...pair,blocked:false})));
        }
        return Response.json([]);
      }) },
    });
    const preview = await sweep(admin, { dryRun: true });
    assert.equal(preview.checked, 1);
    assert.equal(preview.sent, 0);
    assert.equal(preview.planned, 1);
    assert.equal(preview.errors, 0);
    assert.equal(preview.details[0].stepId, 'welcome_day0');
    assert.equal(preview.details[0].status, 'planned');
    assert.match(preview.details[0].note, /morgan@reliabletrades.com/);
    assert.equal(requests.length, 6);
    // Even accidentally omitting the dryRun option cannot send from this runner.
    await assert.rejects(sweep(admin), /Email provider disabled in dry-run/);
    await assert.rejects(sweep(undefined, { dryRun: true }), /explicit read-only client/);
    assert.equal(requests.length, 6);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
