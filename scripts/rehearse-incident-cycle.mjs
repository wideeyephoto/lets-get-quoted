// Database/API rehearsal only. G5 also requires the deployed status page and
// authenticated operator actions/audit trail to be exercised separately.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fields = 'id,title,description,kind,severity,published,resolved_at,resolution_summary';

async function checked(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message} (${error.code || 'request failed'})`);
  assert.notEqual(data, null, `${label}: no response data`);
  return data;
}

export async function rehearseIncidentCycle({ adminClient, anonClient, log = console.log }) {
  // A missing column/grant must fail before any fixture is written. An API
  // error must never count as proof that RLS successfully hid a draft.
  await checked('Admin schema preflight', adminClient.from('platform_incidents').select(fields).limit(0));
  await checked('Anonymous schema preflight', anonClient.from('platform_incidents').select(fields).limit(0));

  const id = randomUUID();
  const marker = `incident-rehearsal:${id}`;
  const fixture = {
    id,
    title: `[REHEARSAL] Incident cycle ${id}`,
    description: 'Scheduled test of incident publishing. No customer outage.',
    kind: 'incident',
    severity: 'warning',
    owner: 'rehearsal@example.invalid',
    created_by: marker,
    published: false,
  };
  const readAnon = () => anonClient.from('platform_incidents').select(fields).eq('id', id);
  const update = (patch) => adminClient.from('platform_incidents').update(patch).eq('id', id).eq('created_by', marker).select(fields).single();
  const expectAnon = async (label, expected) => {
    const rows = await checked(label, readAnon());
    assert.equal(rows.length, 1, `${label}: expected exactly one visible fixture`);
    assert.equal(rows[0].id, id, `${label}: unexpected incident`);
    for (const [key, value] of Object.entries(expected)) assert.equal(rows[0][key], value, `${label}: incorrect ${key}`);
  };
  let failure;
  try {
    log(`Creating draft fixture ${id}`);
    const drafted = await checked('Create draft', adminClient.from('platform_incidents').insert(fixture).select(fields).single());
    assert.equal(drafted.id, id, 'Draft insert returned the wrong incident');
    assert.equal(drafted.published, false, 'Draft was published unexpectedly');
    assert.equal(drafted.resolved_at, null, 'Draft is already resolved');
    assert.deepEqual(await checked('Read draft anonymously', readAnon()), [], 'Anonymous client could read the draft');
    log('PASS: draft hidden from anonymous reads');

    const published = await checked('Publish incident', update({ published: true }));
    assert.equal(published.published, true, 'Publish did not persist');
    await expectAnon('Read published incident', { published: true, description: fixture.description, resolved_at: null });
    log('PASS: published incident visible anonymously');

    const description = 'Rehearsal update: publishing verified; checking recovery. No customer outage.';
    const updated = await checked('Update incident', update({ description }));
    assert.equal(updated.description, description, 'Update did not persist');
    await expectAnon('Read incident update', { description, published: true, resolved_at: null });
    log('PASS: incident update visible anonymously');

    const resolution_summary = 'Rehearsal completed. No customer outage occurred.';
    const resolved = await checked('Resolve incident', update({ resolved_at: new Date().toISOString(), resolution_summary }));
    assert.ok(resolved.resolved_at && Number.isFinite(Date.parse(resolved.resolved_at)), 'Resolution timestamp did not persist');
    assert.equal(resolved.resolution_summary, resolution_summary, 'Resolution summary did not persist');
    await expectAnon('Read resolution', { resolved_at: resolved.resolved_at, resolution_summary, published: true });
    log('PASS: resolution visible anonymously');
  } catch (error) {
    failure = error;
  } finally {
    // Both the generated ID and its unique owner marker scope cleanup. This
    // also handles an insert that committed before its response was lost.
    try {
      await checked('Delete rehearsal fixture', adminClient.from('platform_incidents').delete().eq('id', id).eq('created_by', marker).select('id'));
      const remaining = await checked('Verify cleanup as admin', adminClient.from('platform_incidents').select('id').eq('id', id).eq('created_by', marker));
      assert.deepEqual(remaining, [], `Cleanup left fixture ${id}`);
      assert.deepEqual(await checked('Verify cleanup anonymously', readAnon()), [], `Anonymous reads still include fixture ${id}`);
      log(`PASS: fixture ${id} removed; cleanup verified`);
    } catch (cleanupError) {
      failure = failure
        ? new AggregateError([failure, cleanupError], `Rehearsal failed and cleanup failed for fixture ${id}`)
        : cleanupError;
    }
  }
  if (failure) throw failure;
  log('PASS: database/API incident cycle. Deployed page and operator audit trail remain separate G5 checks.');
  return { id };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args, options: { 'env-file': { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: npm run rehearse:incident-cycle -- [--env-file .env.staging.local]');
    console.log('Creates, briefly publishes, updates, resolves, and deletes a labeled test incident in the selected database.');
    console.log('An explicit env file supplies all credentials; otherwise use process env with .env.live.local as fallback.');
    console.log('Database/API evidence only; does not verify /status, operator authorization, or admin_actions.');
    return;
  }
  const envPath = resolve(root, values['env-file'] || '.env.live.local');
  const contents = await readFile(envPath, 'utf8').catch((error) => {
    if (!values['env-file'] && error.code === 'ENOENT') return '';
    throw error;
  });
  const fileEnv = parseEnv(contents);
  // Do not mix inherited production credentials with an explicitly selected staging file.
  const config = values['env-file'] ? fileEnv : { ...fileEnv, ...env };
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((name) => !config[name]?.trim());
  assert.equal(missing.length, 0, `Missing Supabase credentials: ${missing.join(', ')}. Supply --env-file or process environment.`);
  const url = config.NEXT_PUBLIC_SUPABASE_URL.trim();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  };
  console.log(`Incident database/API rehearsal target: ${new URL(url).origin}`);
  await rehearseIncidentCycle({
    adminClient: createClient(url, config.SUPABASE_SERVICE_ROLE_KEY.trim(), options),
    anonClient: createClient(url, config.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim(), options),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`  ${cause.message}`);
    process.exitCode = 1;
  });
}
