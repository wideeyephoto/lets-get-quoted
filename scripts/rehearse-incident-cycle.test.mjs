import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { main, rehearseIncidentCycle } from './rehearse-incident-cycle.mjs';

// Fault-injection tests of the rehearsal runner using the real Supabase SDK.
// This transport models API responses; these are not evidence of hosted RLS.
function harness(...faults) {
  const unrelated = { id: 'unrelated', created_by: 'operator', published: true };
  const rows = new Map([[unrelated.id, unrelated]]);
  const requests = [];
  const logs = [];
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (stage) => reply({ code: 'INJECTED', message: `${stage} failed` }, 400);
  function client(role) {
    return createClient('http://localhost:54321', `test-${role}`, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/rest/v1/platform_incidents');
        const method = init.method || 'GET';
        const patch = init.body ? JSON.parse(init.body) : null;
        requests.push({ role, method, patch, query: url.searchParams.toString() });
        if (url.searchParams.get('limit') === '0') return faults.includes('schema') || (role === 'anon' && faults.includes('anon-schema')) ? fail('schema') : reply([]);
        const match = (row) => ['id', 'created_by'].every((key) => !url.searchParams.has(key) || url.searchParams.get(key) === `eq.${row[key]}`);
        const selected = [...rows.values()].filter(match);
        const singular = new Headers(init.headers).get('Accept')?.includes('vnd.pgrst.object');
        const respond = (data) => singular ? reply(data[0] ?? null) : reply(data);
        if (method === 'POST') {
          if (faults.includes('insert')) return fail('insert');
          if (!['info', 'warning', 'critical'].includes(patch.severity)) return fail('severity constraint');
          const row = { resolved_at: null, resolution_summary: null, ...patch };
          rows.set(row.id, row);
          if (faults.includes('insert-response-lost')) return fail('insert response');
          return respond([row]);
        }
        if (method === 'PATCH') {
          assert.equal(role, 'admin');
          assert.ok(url.searchParams.has('created_by'));
          const stage = 'published' in patch ? 'publish' : 'resolved_at' in patch ? 'resolve' : 'update';
          if (faults.includes(stage)) return fail(stage);
          if (faults.includes(`${stage}-zero-rows`)) return reply({ code: 'PGRST116', message: 'No row updated' }, 406);
          if (!faults.includes(`${stage}-noop`)) for (const row of selected) Object.assign(row, patch);
          return respond(selected);
        }
        if (method === 'DELETE') {
          assert.equal(role, 'admin');
          assert.ok(url.searchParams.has('id'));
          assert.ok(url.searchParams.has('created_by'));
          if (faults.includes('cleanup')) return fail('cleanup');
          if (!faults.includes('cleanup-noop')) for (const row of selected) rows.delete(row.id);
          return reply([]);
        }
        assert.equal(method, 'GET');
        if (role === 'anon') {
          if (selected.some((row) => !row.published) && faults.includes('draft-read')) return fail('draft read');
          const visible = selected.filter((row) => row.published || faults.includes('draft-exposed'));
          if (faults.includes('published-hidden')) return reply([]);
          if (faults.includes('stale-resolution')) return reply(visible.map((row) => ({ ...row, resolved_at: null })));
          return respond(visible);
        }
        return respond(selected);
      } },
    });
  }
  return {
    rows, requests, logs,
    run: () => rehearseIncidentCycle({ adminClient: client('admin'), anonClient: client('anon'), log: (line) => logs.push(line) }),
    assertClean: () => assert.deepEqual([...rows.values()], [unrelated]),
  };
}

test('complete database cycle checks visibility, content update, resolution, and scoped cleanup', async () => {
  const h = harness();
  const { id } = await h.run();
  assert.match(id, /^[0-9a-f-]{36}$/);
  h.assertClean();
  assert.equal(h.requests.filter((request) => request.method === 'PATCH').length, 3);
  assert.ok(h.logs.at(-1).startsWith('PASS: database/API incident cycle.'));
});

test('schema errors fail before creating or deleting anything', async () => {
  const h = harness('schema');
  await assert.rejects(h.run(), /Admin schema preflight: schema failed/);
  assert.ok(h.requests.every((request) => request.method === 'GET'));
  h.assertClean();
});

test('anonymous access errors fail before writing a fixture', async () => {
  const h = harness('anon-schema');
  await assert.rejects(h.run(), /Anonymous schema preflight: schema failed/);
  assert.ok(h.requests.every((request) => request.method === 'GET'));
  h.assertClean();
});

for (const [fault, message] of [
  ['insert', /Create draft: insert failed/],
  ['insert-response-lost', /Create draft: insert response failed/],
  ['draft-read', /Read draft anonymously: draft read failed/],
  ['draft-exposed', /Anonymous client could read the draft/],
  ['publish', /Publish incident: publish failed/],
  ['publish-zero-rows', /Publish incident: No row updated/],
  ['publish-noop', /Publish did not persist/],
  ['published-hidden', /expected exactly one visible fixture/],
  ['update', /Update incident: update failed/],
  ['update-noop', /Update did not persist/],
  ['resolve', /Resolve incident: resolve failed/],
  ['resolve-noop', /Resolution timestamp did not persist/],
  ['stale-resolution', /Read resolution: incorrect resolved_at/],
]) {
  test(`${fault} fails the rehearsal and still cleans up its fixture`, async () => {
    const h = harness(fault);
    await assert.rejects(h.run(), message);
    h.assertClean();
    assert.ok(!h.logs.some((line) => line.startsWith('PASS: database/API')));
  });
}

for (const [fault, message] of [['cleanup', /Delete rehearsal fixture: cleanup failed/], ['cleanup-noop', /Cleanup left fixture/]]) {
  test(`${fault} cannot produce a completed rehearsal`, async () => {
    const h = harness(fault);
    await assert.rejects(h.run(), message);
    assert.equal(h.rows.size, 2);
    assert.ok(!h.logs.some((line) => line.startsWith('PASS: database/API')));
  });
}

test('both the primary error and cleanup error survive', async () => {
  const h = harness('publish', 'cleanup');
  await assert.rejects(h.run(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /Publish incident: publish failed/);
    assert.match(error.errors[1].message, /Delete rehearsal fixture: cleanup failed/);
    return true;
  });
});

test('missing credentials make the CLI exit nonzero instead of skipping successfully', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./rehearse-incident-cycle.mjs', import.meta.url))], {
    encoding: 'utf8',
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Missing Supabase credentials/);
});

test('an explicit env file cannot silently borrow inherited credentials for another project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'incident-rehearsal-'));
  const path = join(directory, '.env.staging.local');
  try {
    await writeFile(path, 'NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"\n');
    await assert.rejects(main(['--env-file', path], {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:59999',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'wrong-project-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'wrong-project-admin',
    }), /Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
});
