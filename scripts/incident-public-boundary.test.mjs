import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

for (const existingPublication of [false, true]) {
test(`incident migration enforces public boundaries with existing publication=${existingPublication}`, async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../migrations/20260911150644_platform_incident_public_boundary.sql', import.meta.url), 'utf8');
  const asRole = async (role, action) => {
    await db.exec(`set role ${role}`);
    try { return await action(); } finally { await db.exec('reset role'); }
  };
  const denied = (sql) => assert.rejects(db.exec(sql), (error) => error.code === '42501');
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to anon, authenticated, service_role;');
    for (const name of ['2026-08-06-platform-incidents.sql', '2026-08-25-incident-lifecycle.sql']) {
      await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    if (existingPublication) {
      await db.exec(`
        alter table platform_incidents add column published boolean not null default false;
        create policy "Anon can read published incidents" on platform_incidents for select using (published = true);
      `);
    }
    // A pre-existing column grant must not survive the boundary migration.
    await db.exec('grant select (root_cause) on platform_incidents to anon, authenticated');
    await db.exec(migration);
    await db.exec(migration);
    await asRole('service_role', () => db.exec(`
      insert into platform_incidents(kind,title,created_by,root_cause) values ('incident','Older admin draft','operator','private notes');
      insert into platform_incidents(kind,title,description,created_by,published,root_cause)
        values ('incident','Public drill','No customer outage','operator',true,'private notes');
    `));
    for (const role of ['anon', 'authenticated']) {
      await asRole(role, async () => {
        assert.deepEqual((await db.query('select title from platform_incidents')).rows, [{ title: 'Public drill' }]);
        assert.equal((await db.query("select id from platform_incidents where title='Older admin draft'")).rows.length, 0);
        for (const column of ['owner', 'created_by', 'root_cause', 'external_url']) await denied(`select ${column} from platform_incidents`);
        await denied('select * from platform_incidents');
        await denied("update platform_incidents set title='forged' where title='Public drill'");
        await denied("insert into platform_incidents(kind,title,created_by) values ('incident','forged','attacker')");
        await denied("delete from platform_incidents where title='Public drill'");
        await denied('truncate platform_incidents');
      });
    }
    await asRole('service_role', async () => {
      assert.equal((await db.query('select * from platform_incidents')).rows.length, 2);
      const first = (await db.query("select published_at, updated_at from platform_incidents where title='Public drill'")).rows[0];
      assert.ok(first.published_at);
      await db.exec("update platform_incidents set description='Recovery update' where title='Public drill'");
      const updated = (await db.query("select published_at, updated_at from platform_incidents where title='Public drill'")).rows[0];
      assert.equal(String(updated.published_at), String(first.published_at));
      assert.ok(new Date(updated.updated_at) >= new Date(first.updated_at));
      await db.exec("update platform_incidents set resolved_at=now(),resolution_summary='Recovered' where title='Public drill'");
    });
    await asRole('anon', async () => {
      const row = (await db.query('select description,resolved_at,resolution_summary from platform_incidents')).rows[0];
      assert.equal(row.description, 'Recovery update');
      assert.equal(row.resolution_summary, 'Recovered');
      assert.ok(row.resolved_at);
    });
    await asRole('service_role', () => db.exec("update platform_incidents set published=false where title='Public drill'"));
    await asRole('anon', async () => assert.deepEqual((await db.query('select id from platform_incidents')).rows, []));
    await db.exec('alter table platform_incidents add column future_internal_note text');
    await asRole('anon', () => denied('select future_internal_note from platform_incidents'));
  } finally {
    await db.close();
  }
});
}
