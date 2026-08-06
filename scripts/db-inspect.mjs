// READ-ONLY introspection of one table in the database in DATABASE_URL.
//
//   node scripts/db-inspect.mjs accounts
//   node scripts/db-inspect.mjs accounts lead_lost_after_days
//
// Exists so that "did the migration do what it said" has an answer you can read
// rather than infer. Every query below is a catalogue read; the table name is
// bound as a parameter, never interpolated, so this cannot be talked into
// touching anything.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(__dirname, '..', fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const at = trimmed.indexOf('=');
        if (at === -1) continue;
        const key = trimmed.slice(0, at).trim();
        const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // Ignore missing files and continue to the next candidate.
    }
  }
}

const table = process.argv[2];
const column = process.argv[3] ?? null;
if (!table) {
  console.error('Usage: node scripts/db-inspect.mjs <table> [column]');
  process.exit(1);
}

await loadEnvFile();
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const show = async (label, sql, params) => {
  const { rows } = await client.query(sql, params);
  console.log(`\n=== ${label} ===`);
  if (!rows.length) console.log('(none)');
  else console.table(rows);
};

try {
  await show(
    column ? `column ${table}.${column}` : `columns of ${table}`,
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
        and ($2::text is null or column_name = $2)
      order by ordinal_position`,
    [table, column],
  );

  await show(
    `check constraints on ${table}`,
    `select con.conname, pg_get_constraintdef(con.oid) as definition, con.convalidated
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public' and rel.relname = $1 and con.contype = 'c'
      order by con.conname`,
    [table],
  );

  await show(
    `row-level security on ${table}`,
    `select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
       from pg_class rel
       join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public' and rel.relname = $1`,
    [table],
  );

  if (column) {
    // What the column actually holds. Counted rather than listed: this is a
    // tenant table and the point is the distribution, not whose row is whose.
    //
    // A table name cannot be a bind parameter, so it is the one thing that has
    // to be interpolated — and it is only ever interpolated as the identifier
    // POSTGRES ITSELF quoted, looked up by parameter just above. A name that
    // matches no table never reaches a query at all. The column stays a real
    // parameter by going through to_jsonb rather than into the select list.
    const { rows: [found] } = await client.query(
      `select quote_ident(rel.relname) as ident
         from pg_class rel
         join pg_namespace ns on ns.oid = rel.relnamespace
        where ns.nspname = 'public' and rel.relname = $1 and rel.relkind = 'r'`,
      [table],
    );

    if (!found) {
      console.log(`\n=== values in ${table}.${column} ===\n(no such table)`);
    } else {
      await show(
        `values in ${table}.${column}`,
        `select to_jsonb(t) ->> $1 as value, count(*)::int as rows
           from public.${found.ident} t
          group by 1 order by 2 desc, 1 limit 20`,
        [column],
      );
    }
  }
} finally {
  await client.end();
}
