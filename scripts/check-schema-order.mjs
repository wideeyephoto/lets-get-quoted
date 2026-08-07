// Does schema.sql actually run top-to-bottom on an empty database?
//
// Every FK target must be created before it is referenced. Production cannot
// tell you whether that holds: it was built up migration by migration, each one
// applied to a database that already had the tables it depended on. schema.sql's
// ordering is therefore only exercised the first time someone creates a NEW
// environment from it — which, until a staging database existed, was never.
//
// It did not hold. Two columns added by later migrations had been written
// inline into table definitions that appear earlier in the file:
// time_entries.cost_id -> costs, and payments.recurring_plan_id ->
// recurring_plans. Both now declare their constraint after the target exists.
//
// Cheap, offline, and no database required — run it after editing schema.sql:
//
//   node scripts/check-schema-order.mjs
//
// It does NOT catch everything a real deploy does (a policy referencing a
// function defined further down was the other failure, and that needs Postgres
// to find). scripts/staging-setup.mjs is the definitive check; this one is the
// one you can run in a second.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lines = (await readFile(resolve(ROOT, 'schema.sql'), 'utf8')).split(/\r?\n/);

const createdAt = new Map();
lines.forEach((line, i) => {
  const m = line.match(/^\s*create table (?:if not exists )?([a-z_][a-z0-9_]*)/i);
  if (m && !createdAt.has(m[1])) createdAt.set(m[1], i + 1);
});

let currentTable = null;
const problems = [];
lines.forEach((line, i) => {
  const create = line.match(/^\s*create table (?:if not exists )?([a-z_][a-z0-9_]*)/i);
  if (create) currentTable = create[1];
  const alter = line.match(/^\s*alter table ([a-z_][a-z0-9_]*)/i);
  if (alter) currentTable = alter[1];

  for (const m of line.matchAll(/references\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const target = m[1];
    if (target.startsWith('auth.') || target === 'users') continue;
    const targetLine = createdAt.get(target);
    if (targetLine === undefined) {
      problems.push({ line: i + 1, from: currentTable, target, why: 'never created in this file' });
    } else if (targetLine > i + 1) {
      problems.push({ line: i + 1, from: currentTable, target, why: `created later, at line ${targetLine}` });
    }
  }
});

if (problems.length === 0) {
  console.log('No forward references. Every FK target is created before it is used.');
} else {
  console.log(`${problems.length} forward reference(s):\n`);
  for (const p of problems) {
    console.log(`  line ${String(p.line).padStart(4)}  ${String(p.from).padEnd(24)} -> ${p.target.padEnd(22)} ${p.why}`);
  }
}
