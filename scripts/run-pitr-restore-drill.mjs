#!/usr/bin/env node
/**
 * Disaster Recovery & PITR Restore Drill Validator
 *
 * Usage:
 *   SCRATCH_DATABASE_URL=... node scripts/run-pitr-restore-drill.mjs
 *   node scripts/run-pitr-restore-drill.mjs --target="postgres://..."
 *
 * Read-only relational checks, not a restore operation or sign-in/blob proof.
 */

import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertScratchTarget } from './lib/dr-target.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export async function verifyRestoredDatabase(connectionString) {
  const primary = await readFile(resolve(root, '.env.local'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const productionUrl = primary.split(/\r?\n/).find((line) => line.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  const target = assertScratchTarget(connectionString, productionUrl);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    options: '-c default_transaction_read_only=on',
  });

  await client.connect();
  const startTime = Date.now();

  try {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [],
      passed: true,
      durationMs: 0,
      target,
      scope: 'Core table presence, row counts, and two account foreign-key checks only',
      restorePerformed: false,
      fullRecoveryVerified: false,
    };

    // 1. Check core table presence
    const coreTables = [
      'accounts',
      'memberships',
      'staff',
      'jobs',
      'clients',
      'invoices',
      'payments',
      'estimate_offers',
      'extra_stop_requests',
      'email_suppression',
    ];

    const { rows: existingTables } = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
      [coreTables],
    );

    const foundTableNames = new Set(existingTables.map((r) => r.table_name));
    const missingTables = coreTables.filter((t) => !foundTableNames.has(t));

    if (missingTables.length > 0) {
      report.checks.push({
        name: 'core_tables_presence',
        status: 'failed',
        detail: `Missing tables: ${missingTables.join(', ')}`,
      });
      report.passed = false;
    } else {
      report.checks.push({
        name: 'core_tables_presence',
        status: 'passed',
        detail: `All ${coreTables.length} core tables present.`,
      });
    }

    // 2. Query row counts
    const tableCounts = {};
    for (const table of coreTables) {
      if (foundTableNames.has(table)) {
        const { rows } = await client.query(`select count(*)::int as count from public."${table}"`);
        tableCounts[table] = rows[0]?.count ?? 0;
      }
    }

    report.checks.push({
      name: 'table_row_counts',
      status: 'recorded',
      counts: tableCounts,
      detail: 'Counts require comparison with the source snapshot; a count alone does not prove recovery.',
    });

    // Do not query a missing relation and lose the useful failure report.
    if (missingTables.length > 0) {
      report.durationMs = Date.now() - startTime;
      return report;
    }

    // 3. Foreign key consistency check
    const { rows: orphanedJobs } = await client.query(
      `select count(*)::int as count from public.jobs j left join public.accounts a on j.account_id = a.id where a.id is null and j.account_id is not null`,
    );

    if (orphanedJobs[0]?.count > 0) {
      report.checks.push({
        name: 'job_account_fk_integrity',
        status: 'failed',
        detail: `Found ${orphanedJobs[0].count} orphaned job rows with invalid account_id.`,
      });
      report.passed = false;
    } else {
      report.checks.push({
        name: 'job_account_fk_integrity',
        status: 'passed',
        detail: 'Zero orphaned job records detected.',
      });
    }

    // 4. Invoices & Payments consistency check
    const { rows: orphanedPayments } = await client.query(
      `select count(*)::int as count from public.payments p left join public.accounts a on p.account_id = a.id where a.id is null and p.account_id is not null`,
    );

    if (orphanedPayments[0]?.count > 0) {
      report.checks.push({
        name: 'payment_account_fk_integrity',
        status: 'failed',
        detail: `Found ${orphanedPayments[0].count} orphaned payment rows.`,
      });
      report.passed = false;
    } else {
      report.checks.push({
        name: 'payment_account_fk_integrity',
        status: 'passed',
        detail: 'Zero orphaned payment records detected.',
      });
    }

    report.durationMs = Date.now() - startTime;
    return report;
  } finally {
    await client.end();
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const targetArg = process.argv.find((a) => a.startsWith('--target='));
  const targetUrl = targetArg ? targetArg.slice('--target='.length) : process.env.SCRATCH_DATABASE_URL;

  if (!targetUrl) {
    console.error('ERROR: Set SCRATCH_DATABASE_URL or pass --target=postgres://...; DATABASE_URL is never a fallback.');
    process.exit(1);
  }

  console.log('Running Disaster Recovery & PITR Restore Verification...');
  verifyRestoredDatabase(targetUrl)
    .then((report) => {
      console.log('\n--- PITR RESTORE VERIFICATION REPORT ---');
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) {
        console.error('\nDRILL FAILED: Relational consistency checks failed.');
        process.exit(1);
      }
      console.log(`\nRELATIONAL CHECKS PASSED in ${report.durationMs}ms. Restore, count parity, RLS, sign-in, and Storage recovery are not certified by this report.`);
    })
    .catch((err) => {
      console.error('Fatal DRILL execution error:', err);
      process.exit(1);
    });
}
