#!/usr/bin/env node
/**
 * Contractor Lifecycle Campaign Silent Dry-Run
 *
 * Usage:
 *   node scripts/dry-run-contractor-lifecycle.mjs
 *
 * Performs a silent, read-only dry-run of the contractor lifecycle email campaign,
 * inspecting active accounts created in the last 45 days, validating sequence ordering,
 * and reporting planned recipient sends without dispatching real emails.
 */

import { createClient } from '@supabase/supabase-js';
import { runContractorLifecycleSweep } from '../src/lib/contractor-lifecycle-emails';

async function main() {
  console.log('================================================================');
  console.log('  CONTRACTOR LIFECYCLE EMAIL CAMPAIGN — SILENT DRY-RUN');
  console.log('================================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let adminClient = undefined;
  if (supabaseUrl && serviceKey) {
    adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }

  const result = await runContractorLifecycleSweep(adminClient, { dryRun: true });

  console.log(`Checked Accounts: ${result.checked}`);
  console.log(`Planned Sends:    ${result.sent}`);
  console.log(`Skipped:          ${result.skipped}`);
  console.log(`Errors:           ${result.errors}`);

  if (result.details.length > 0) {
    console.log('\n--- PLANNED SENDS PREVIEW ---');
    for (const d of result.details) {
      console.log(`[${d.status.toUpperCase()}] Account: ${d.accountId} | Step: ${d.stepId} | Note: ${d.note || 'None'}`);
    }
  }

  console.log('\nDry-run completed successfully.');
}

if (process.argv[1]?.includes('dry-run-contractor-lifecycle')) {
  main().catch((err) => {
    console.error('Fatal error during dry run:', err);
    process.exit(1);
  });
}
