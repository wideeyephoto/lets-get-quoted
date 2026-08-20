import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
const txt = await readFile('C:/dev/operator-resolution-worktree/.env.local','utf8');
for (const line of txt.split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#'))continue;
  const i=t.indexOf('='); if(i===-1)continue;
  const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
  if(k && !process.env[k]) process.env[k]=v;
}
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
await c.query('set default_transaction_read_only = on');
const r = await c.query(`
  select job,
         count(*)::int as runs,
         max(started_at) as last_start,
         max(started_at) filter (where ok) as last_ok,
         count(*) filter (where ok is false)::int as failures
    from public.cron_runs
   group by job order by max(started_at) desc nulls last`);
console.log('job'.padEnd(36)+'runs  last_start                 last_ok                    fails');
for (const x of r.rows) console.log(x.job.padEnd(36)+String(x.runs).padEnd(6)+String(x.last_start).slice(0,24).padEnd(27)+String(x.last_ok).slice(0,24).padEnd(27)+x.failures);
const n = await c.query("select now() as now, count(*)::int as total from public.cron_runs");
console.log('\nnow = ' + n.rows[0].now + '   total rows = ' + n.rows[0].total);
await c.end();
