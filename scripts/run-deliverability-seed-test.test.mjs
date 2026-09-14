import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSeedRuntime, parseSeedArgs, runSeedTest } from './run-deliverability-seed-test.mjs';

const runtime = await loadSeedRuntime();
const email = 'reviewer@example.com';
const options = { recipients: [email], allowed: [email], send: true };
const env = { RESEND_API_KEY: 'synthetic', NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
const fastRuntime = { ...runtime, ...Object.fromEntries(['MagicLink', 'Quote', 'InvoicePdf'].map(family => [`render${family}Test`, async to => ({
  from: 'seed@example.com', to, subject: 'Seed sample', html: '<p>Sample</p>', tags: [{ name: 'seed_test', value: 'true' }],
  attachments: family === 'InvoicePdf' ? [{ filename: 'test.pdf', content: Buffer.from('%PDF-fixture') }] : undefined,
})])) };
function fixture({ reason = null, lookupError = false, responses = [] } = {}) {
  const posts = [], reads = [];
  const fetcher = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.startsWith(env.NEXT_PUBLIC_SUPABASE_URL)) {
      assert.equal(request.method, 'GET');
      const url = new URL(request.url);
      assert.equal(url.pathname, '/rest/v1/platform_email_suppression');
      assert.equal(url.searchParams.get('email'), `eq.${email}`);
      reads.push(request);
      return lookupError ? Response.json({ message: 'offline' }, { status: 503 }) : Response.json(reason ? [{ email, reason }] : []);
    }
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    posts.push(await request.json());
    const result = responses[posts.length - 1];
    if (result instanceof Error) throw result;
    return result ?? Response.json({ id: `accepted-${posts.length}` });
  };
  return { posts, reads, deps: { env, fetcher, load: async () => fastRuntime } };
}

test('requires explicit bounded targets; normalizes and deduplicates; preview default', () => {
  assert.throws(() => parseSeedArgs([]));
  assert.deepEqual(parseSeedArgs(['--target=REVIEWER@example.com,reviewer@example.com']), { recipients: [email], send: false });
  for (const args of [['--target=x@example.com', '--send'], ['--target=x@example.com', '--unknown'],
    ['--target=x@example.com', '--send', '--dry-run'], ['--target=a@example.com,'], ['--target=A <a@example.com>'],
    ['--target=a@example.com\r\nBcc:b@example.com'], [`--target=${Array.from({ length: 6 }, (_, i) => `a${i}@example.com`).join(',')}`]]) {
    assert.throws(() => parseSeedArgs(args));
  }
});
test('preview renders actual three templates and PDF with zero network or client creation', async () => {
  const report = await runSeedTest({ recipients: [email], send: false }, { env: {},
    fetcher: () => { throw new Error('Unexpected network'); }, clientFactory: () => { throw new Error('Unexpected client'); } });
  assert.equal(report.ok, true); assert.equal(report.mode, 'preview');
  assert.ok(report.results.every(row => row.status === 'rendered' && row.providerId === null));
  const payload = await runtime.renderInvoicePdfTest(email);
  assert.equal(payload.attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.match(payload.html, /no payment is due/);
  assert.match((await runtime.renderMagicLinkTest(email)).html, /synthetic link cannot sign you in/);
  assert.match(report.receiverEvidence, /NOT VERIFIED/);
});
test('live mode refuses missing credentials and missing explicit allowlist before loading', async () => {
  const deps = { env: {}, load: () => { throw new Error('Loaded too soon'); } };
  await assert.rejects(runSeedTest(options, deps), /credentials/);
  await assert.rejects(runSeedTest({ ...options, allowed: [] }, deps));
});
test('CLI exits nonzero for missing targets and unapproved live requests', () => {
  for (const args of [[], ['--send', `--target=${email}`]]) {
    const child = spawnSync(process.execPath, ['scripts/run-deliverability-seed-test.mjs', ...args], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.doesNotMatch(child.stdout, /accepted/);
  }
});
for (const reason of ['hard_bounce', 'complaint', 'provider_suppressed', 'unknown']) {
  test(`shared policy blocks ${reason} with no provider submission`, async () => {
    const f = fixture({ reason }); const report = await runSeedTest(options, f.deps);
    assert.equal(report.ok, false); assert.equal(f.posts.length, 0);
    assert.deepEqual(report.results.map(row => row.status), ['blocked_or_render_failed', 'not_attempted', 'not_attempted']);
  });
}
for (const reason of [null, 'unsubscribe_link', 'one_click_unsubscribe']) {
  test(`final per-message check permits transactional sample after ${reason}`, async () => {
    const f = fixture({ reason }); const report = await runSeedTest(options, f.deps);
    assert.equal(report.ok, true); assert.equal(f.posts.length, 3); assert.equal(f.reads.length, 3);
    assert.ok(f.posts.every(body => body.tags.some(tag => tag.name === 'delivery_scope' && tag.value === 'platform_transactional')));
    assert.equal(f.posts[2].attachments[0].content, Buffer.from('%PDF-fixture').toString('base64'));
    assert.deepEqual(report.results.map(row => row.providerId), ['accepted-1', 'accepted-2', 'accepted-3']);
  });
}
test('lookup failure blocks all submissions', async () => {
  const f = fixture({ lookupError: true }); const report = await runSeedTest(options, f.deps);
  assert.equal(report.ok, false); assert.equal(f.posts.length, 0);
});
for (const [label, response, expected] of [
  ['rejection', Response.json({ message: 'blocked' }, { status: 429 }), 'rejected'],
  ['server failure', Response.json({}, { status: 503 }), 'uncertain'],
  ['HTTP timeout', Response.json({}, { status: 408 }), 'uncertain'],
  ['missing ID', Response.json({}), 'uncertain'], ['malformed receipt', new Response('bad'), 'uncertain'],
  ['timeout', new Error('timeout with secret payload'), 'uncertain'],
]) {
  test(`${label} preserves earlier acceptance, stops later attempts and never retries`, async () => {
    const f = fixture({ responses: [Response.json({ id: 'retained' }), response] });
    const report = await runSeedTest(options, f.deps);
    assert.equal(report.ok, false); assert.equal(f.posts.length, 2);
    assert.deepEqual(report.results.map(row => row.status), ['accepted', expected, 'not_attempted']);
    assert.equal(report.results[0].providerId, 'retained');
    assert.doesNotMatch(JSON.stringify(report), /secret payload|synthetic/);
  });
}
test('late block is rechecked between templates', async () => {
  const f = fixture(); let checks = 0;
  f.deps.load = async () => ({ ...fastRuntime, preparePlatformTransactionalEmail: async (...args) => {
    if (++checks === 2) throw new Error('New complaint');
    return runtime.preparePlatformTransactionalEmail(...args);
  } });
  const report = await runSeedTest(options, f.deps);
  assert.equal(f.posts.length, 1); assert.equal(report.results[0].providerId, 'accepted-1');
  assert.equal(report.results[1].status, 'blocked_or_render_failed');
});
