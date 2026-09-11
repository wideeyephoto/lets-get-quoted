// What the public status page may and may not read.
//
// Boots a real PostgreSQL, creates platform_incidents from its own three
// migrations, applies the publishing migration, and then reads the table AS
// the anon and authenticated roles. Source assertions cannot establish any of
// this: whether `select *` leaks a post-mortem, and whether a browser role can
// still TRUNCATE an RLS-protected table, are properties of the catalog after
// the grants run, not of the text that granted them.
//
//   node scripts/verify-status-page-boundary.mjs
//
// initdb refuses to run as root, so on a container that runs as root this needs
// an unprivileged user with its own TMPDIR, e.g.
//   su <user> -c 'cd <repo> && TMPDIR=<their dir> node scripts/verify-status-page-boundary.mjs'
import assert from 'node:assert/strict';
import os from 'node:os';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = `${process.platform}-${process.arch}`;
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + ':' + process.env.PATH;
const { default: EmbeddedPostgres } = await import('embedded-postgres');

const source = (file) => readFileSync(join(root, 'migrations', file), 'utf8');
const BASE = '2026-08-06-platform-incidents.sql';
const LIFECYCLE = '2026-08-25-incident-lifecycle.sql';
const PUBLISHING = '20260911094000_platform_incidents_published.sql';

const port = await new Promise((done, fail) => {
  const s = createServer();
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); });
});
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-status-boundary-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: randomUUID(), port,
  persistent: true, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'],
});

let checks = 0;
const pass = (name) => { checks++; console.log(`PASS ${name}`); };

let db;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq');
  db = pg.getPgClient('lgq');
  await db.connect();

  // Supabase's roles, and its default privileges — the ALL-on-new-tables grant
  // is the whole reason the revoke in the migration has to be unconditional.
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
  await db.query(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  await db.query(`create extension if not exists pgcrypto;`);

  await db.query(source(BASE));
  await db.query(source(LIFECYCLE));

  // Before: the table is RLS-on with no policy and was believed unreachable.
  const before = await db.query(
    `select coalesce(bool_or(privilege_type = 'TRUNCATE'), false) as truncatable
       from information_schema.role_table_grants
      where table_name = 'platform_incidents' and grantee in ('anon','authenticated')`,
  );
  assert.equal(before.rows[0].truncatable, true, 'expected the pre-existing default grant to include TRUNCATE');
  pass('reproduced the pre-migration state: browser roles hold TRUNCATE on an RLS-protected table');

  // The migration under test. Its own post-conditions raise if it failed.
  await db.query(source(PUBLISHING));
  pass('publishing migration applied, post-conditions held');

  const internal = await db.query(`insert into platform_incidents (kind, title, description, severity, created_by, owner, root_cause, external_url, impact_summary)
    values ('incident','Internal write-up','Customer-facing description','critical','staff@letsgetquoted.com','ops@letsgetquoted.com','A secret post-mortem','https://internal.example/incident/1','Bookings failed')
    returning id`);
  const publicRow = await db.query(`insert into platform_incidents (kind, title, description, severity, created_by, owner, root_cause, published)
    values ('incident','Published outage','What customers are told','warning','staff@letsgetquoted.com','ops@letsgetquoted.com','Another secret post-mortem', true)
    returning id`);
  const draftId = internal.rows[0].id;
  const publishedId = publicRow.rows[0].id;

  // Each check runs in its own transaction and always rolls back. A refusal
  // aborts the transaction, so the role is reset by the rollback rather than by
  // a statement that would itself fail and mask the error being asserted on.
  const asRole = async (role, sql) => {
    await db.query('begin');
    let result = null;
    let error = null;
    try {
      await db.query(`set local role ${role}`);
      result = await db.query(sql);
    } catch (caught) {
      error = caught;
    }
    await db.query('rollback');
    return { result, error };
  };
  const refused = async (role, sql, why) => {
    const { error } = await asRole(role, sql);
    assert.ok(error, `${role} was allowed to: ${why}`);
    assert.match(error.message, /permission denied|denied for/i, `${role}/${why} failed for the wrong reason: ${error.message}`);
  };
  const allowed = async (role, sql, why) => {
    const { result, error } = await asRole(role, sql);
    assert.equal(error, null, `${role} could not ${why}: ${error?.message}`);
    return result;
  };

  for (const role of ['anon', 'authenticated']) {
    // The defect the rehearsal record flagged: a row policy alone publishes
    // every column of a published row.
    await refused(role, 'select * from platform_incidents', 'select * (would expose root_cause/owner/created_by/external_url)');
    for (const column of ['root_cause', 'owner', 'created_by', 'external_url', 'affected_services', 'created_at']) {
      await refused(role, `select ${column} from platform_incidents`, `read ${column}`);
    }
    pass(`${role} cannot read any internal incident column, including through select *`);

    await refused(role, 'truncate platform_incidents', 'TRUNCATE (not covered by RLS)');
    await refused(role, `update platform_incidents set published = true where id = '${draftId}'`, 'publish an incident itself');
    await refused(role, `delete from platform_incidents where id = '${publishedId}'`, 'delete an incident');
    await refused(role, `insert into platform_incidents (kind, title, created_by) values ('incident','Forged','attacker')`, 'insert an incident');
    pass(`${role} cannot write platform_incidents by any statement, TRUNCATE included`);

    const visible = await allowed(
      role,
      `select id, kind, title, description, severity, impact_summary, resolution_summary, started_at, resolved_at, published
         from platform_incidents order by started_at desc`,
      'read the columns /status renders',
    );
    assert.equal(visible.rows.length, 1, `${role} saw ${visible.rows.length} rows; expected only the published one`);
    assert.equal(visible.rows[0].id, publishedId, `${role} saw the wrong row`);
    assert.equal(visible.rows[0].title, 'Published outage');
    pass(`${role} reads the published row and only the published row`);
  }

  // Unpublishing retracts it, which is what the admin control's second click does.
  await db.query(`update platform_incidents set published = false where id = '${publishedId}'`);
  const afterRetract = await allowed('anon', 'select id from platform_incidents', 'read the table at all');
  assert.equal(afterRetract.rows.length, 0, 'unpublishing did not remove the row from anonymous reads');
  pass('unpublishing retracts the row from anonymous reads');

  // A column added later is not in the grant, so it cannot publish itself.
  await db.query(`alter table platform_incidents add column internal_note text`);
  await refused('anon', 'select internal_note from platform_incidents', 'read a column added after the grant');
  pass('a column added by a later migration is not readable — new columns fail closed');

  console.log(`\nOK — ${checks} checks passed against PostgreSQL ${(await db.query('show server_version')).rows[0].server_version}.`);
} finally {
  try { await db?.end(); } catch {}
  try { await pg.stop(); } catch {}
  rmSync(dataDir, { recursive: true, force: true });
}
