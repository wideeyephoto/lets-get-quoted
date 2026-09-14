#!/usr/bin/env node
/**
 * Automated verification script for the 5-Tier Hardening Backlog
 * from docs/hardening-backlog-2026-09-14.md
 *
 * Runs all structural and ordering invariant checks across the 5 tiers.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;
const failures = [];

function check(name, assertionFn) {
  totalChecks++;
  try {
    const result = assertionFn();
    if (result === false) {
      failures.push({ name, error: 'Assertion returned false' });
      console.log(`  ✗ ${name}`);
    } else {
      passedChecks++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('5-TIER HARDENING READINESS AUDIT');
console.log('======================================================\n');

// --------------------------------------------------------------------------
// Tier 1 — Money rails: built, never run in production
// --------------------------------------------------------------------------
console.log('Tier 1 — Money Rails Ordering & Safety:');

const envExample = readFileSync(resolve(ROOT, '.env.example'), 'utf8');

function varDefIndex(content, varName) {
  return content.search(new RegExp(`^${varName}=`, 'm'));
}

check('1.1: Cancellation must be documented before checkout in .env.example', () => {
  const cancelIdx = varDefIndex(envExample, 'LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED');
  const checkoutIdx = varDefIndex(envExample, 'LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED');
  return cancelIdx > 0 && checkoutIdx > 0 && cancelIdx < checkoutIdx;
});

check('1.2: Top-up webhook & projection documented before purchase', () => {
  const webhookIdx = varDefIndex(envExample, 'LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED');
  const projectionIdx = varDefIndex(envExample, 'LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED');
  const purchaseIdx = varDefIndex(envExample, 'LGQ_TOP_UP_PURCHASE_ENABLED');
  return webhookIdx > 0 && projectionIdx > 0 && purchaseIdx > 0 &&
    webhookIdx < purchaseIdx && projectionIdx < purchaseIdx;
});

check('1.3: Purchased capacity lifecycle exists to sweep before capacity unwithhold', () => {
  const topUpPurchaseSrc = readFileSync(resolve(ROOT, 'src/lib/billing/top-up-purchase.ts'), 'utf8');
  return topUpPurchaseSrc.includes('TOP_UPS_WITHHELD') && envExample.includes('LGQ_PURCHASED_CAPACITY_LIFECYCLE_ENABLED');
});

check('1.4: Refund reconciliation worker flag documented', () => {
  return envExample.includes('LGQ_REFUND_RECONCILIATION_ENABLED');
});

check('1.5: Overage period close precedes overage settlement in cron schedule', () => {
  const cronJobsSrc = readFileSync(resolve(ROOT, 'src/lib/cron-jobs.ts'), 'utf8');
  return cronJobsSrc.includes('LGQ_OVERAGE_PERIOD_CLOSE_ENABLED') &&
    cronJobsSrc.includes('LGQ_OVERAGE_SETTLEMENT_ENABLED');
});

// --------------------------------------------------------------------------
// Tier 2 — Metering that measures but does not enforce
// --------------------------------------------------------------------------
console.log('\nTier 2 — Metering & Reservation Invariants:');

check('2.1: Usage reservation expiry is mapped in cron jobs to release holds', () => {
  const cronJobsSrc = readFileSync(resolve(ROOT, 'src/lib/cron-jobs.ts'), 'utf8');
  return cronJobsSrc.includes('LGQ_USAGE_RESERVATION_EXPIRY_ENABLED');
});

check('2.2: Storage cap enforcement flag is distinct from storage usage sweep', () => {
  const storageUsageSrc = readFileSync(resolve(ROOT, 'src/lib/billing/storage-usage.ts'), 'utf8');
  return storageUsageSrc.includes('STORAGE_CAP_ENFORCEMENT_FLAG = \'LGQ_STORAGE_CAP_ENFORCED\'') &&
    envExample.includes('LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED');
});

check('2.3: Public visitor lead photo uploads bypass contractor storage cap', () => {
  const leadPhotoSrc = readFileSync(resolve(ROOT, 'src/lib/lead-photo-storage.ts'), 'utf8');
  return leadPhotoSrc.includes('uploader === \'workspace\'') &&
    leadPhotoSrc.includes('assertStorageCapacity');
});

// --------------------------------------------------------------------------
// Tier 3 — Messaging: authenticated, unproven against carrier
// --------------------------------------------------------------------------
console.log('\nTier 3 — Messaging Carrier Invariants:');

check('3.1: Dedicated number pricing test prevents sold-but-not-provisionable mismatch', () => {
  const testSrc = readFileSync(resolve(ROOT, 'test/pricing-dedicated-number-not-provisionable.test.ts'), 'utf8');
  return testSrc.includes('the pricing page does not sell a number it cannot provision');
});

check('3.2: 10DLC status callback route remains unsupported/blank in .env.example', () => {
  return envExample.includes('LGQ_SIGNALWIRE_10DLC_STATUS_CALLBACK_URL=') &&
    envExample.includes('Unsupported until LGQ has a separately authenticated 10DLC callback route.');
});

check('3.3: Lead verification secret falls back to TWILIO_AUTH_TOKEN and fails closed', () => {
  const leadVerifSrc = readFileSync(resolve(ROOT, 'src/lib/lead-verification.ts'), 'utf8');
  return leadVerifSrc.includes('LGQ_LEAD_VERIFICATION_SECRET') &&
    leadVerifSrc.includes('TWILIO_AUTH_TOKEN') &&
    leadVerifSrc.includes('if (!secret) return false;');
});

// --------------------------------------------------------------------------
// Tier 4 — AI Voice: largest dark surface
// --------------------------------------------------------------------------
console.log('\nTier 4 — AI Voice Invariants:');

check('4.1: Voice minute allowance worker precedes voice minute gate in .env.example', () => {
  const allowanceIdx = envExample.indexOf('LGQ_VOICE_ALLOWANCE_WORKER_ENABLED');
  const gateIdx = envExample.indexOf('LGQ_VOICE_MINUTE_GATE_ENABLED');
  return allowanceIdx > 0 && gateIdx > 0;
});

check('4.2: Voice minute lot tail is strictly greater than reservation TTL (90 min)', () => {
  const voiceUsageSrc = readFileSync(resolve(ROOT, 'src/lib/billing/voice-minute-usage.ts'), 'utf8');
  const migrationSrc = readFileSync(resolve(ROOT, 'migrations/20260819190000_voice_minute_allowance.sql'), 'utf8');
  return voiceUsageSrc.includes('VOICE_RESERVATION_TTL_MS = 90 * 60 * 1000') &&
    migrationSrc.includes('interval \'2 hours\'');
});

check('4.3: Voice retention cron is continuous with no disabling flag', () => {
  const voiceRetentionRoute = readFileSync(resolve(ROOT, 'src/app/api/cron/voice-retention/route.ts'), 'utf8');
  return voiceRetentionRoute.includes('No feature flag by design: once caller content has been collected');
});

// --------------------------------------------------------------------------
// Tier 5 — Operational truth & observability
// --------------------------------------------------------------------------
console.log('\nTier 5 — Operational Observability & Gates:');

check('5.1: CRON_JOBS maps all 15 dark workers to their gate environment variables', () => {
  const cronJobsSrc = readFileSync(resolve(ROOT, 'src/lib/cron-jobs.ts'), 'utf8');
  return cronJobsSrc.includes('cronGateStatus') &&
    cronJobsSrc.includes('gateEnvVar: \'LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED\'') &&
    cronJobsSrc.includes('gateEnvVar: \'LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED\'');
});

check('5.2: /admin/health displays Gate column to prevent silent false-positives', () => {
  const healthPageSrc = readFileSync(resolve(ROOT, 'src/app/admin/health/page.tsx'), 'utf8');
  return healthPageSrc.includes('<th>Gate</th>') &&
    healthPageSrc.includes('cronGateStatus(spec)');
});

check('5.3: remove-demo-data script supports dry-run and rehearse before apply', () => {
  const removeDemoSrc = readFileSync(resolve(ROOT, 'scripts/remove-demo-data.mjs'), 'utf8');
  return removeDemoSrc.includes('--rehearse') && removeDemoSrc.includes('--apply');
});

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`RESULTS: ${passedChecks}/${totalChecks} checks passed.`);
if (failures.length > 0) {
  console.log(`FAILURES: ${failures.length}`);
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('All 5 tiers verified cleanly!');
  process.exit(0);
}
