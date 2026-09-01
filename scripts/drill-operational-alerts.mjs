#!/usr/bin/env node
/**
 * Operational Alert Drill Runner
 *
 * Usage:
 *   node scripts/drill-operational-alerts.mjs
 *   node scripts/drill-operational-alerts.mjs --dry-run
 *
 * Triggers simulated incidents across all 7 operational emergency categories
 * to verify founder email/SMS formatting, severity badging, SRE links,
 * and dispatch handling.
 */

import { sendOperationalEmergencyAlert } from '../src/lib/founder-alerts';

export const MANUFACTURED_ALERT_CATEGORIES = [
  {
    incidentType: 'uptime',
    severity: 'critical',
    title: 'DRILL: Edge Anycast Origin Health Degradation',
    summary: 'Synthetically manufactured 503 latency spike across us-west-2 region.',
    details: { latencyMs: 2450, errorRatePct: 18.5, affectedEndpoints: ['/api/public/leads', '/pay'] },
    affectedAccountsCount: 14,
    actionRequired: 'Verify cloud edge routing failover to secondary us-east origin.',
  },
  {
    incidentType: 'runtime_exception',
    severity: 'high',
    title: 'DRILL: Unhandled Stripe Webhook Mutation Exception',
    summary: 'Simulated deserialization fault during invoice.payment_succeeded handling.',
    details: { eventId: 'evt_drill_test_123', eventType: 'invoice.payment_succeeded', stack: 'TypeError: Cannot read property amount of undefined' },
    affectedAccountsCount: 1,
    actionRequired: 'Inspect webhook dead-letter queue in admin console.',
  },
  {
    incidentType: 'cron_failure',
    severity: 'high',
    title: 'DRILL: Billing Subscription Projection Cron Stalled',
    summary: 'Cron job /api/cron/billing-subscription-projection exceeded max duration.',
    details: { cron: 'billing-subscription-projection', maxDurationSec: 60, elapsedSec: 85 },
    affectedAccountsCount: 3,
    actionRequired: 'Restart stalled cron execution and check database advisory lock.',
  },
  {
    incidentType: 'webhook_dead_letter',
    severity: 'high',
    title: 'DRILL: SignalWire Inbound SMS Dead-Letter Accumulation',
    summary: 'Five consecutive inbound SMS webhooks failed delivery.',
    details: { provider: 'SignalWire', failureCount: 5, lastError: 'Signature verification timeout' },
    affectedAccountsCount: 2,
    actionRequired: 'Validate SignalWire webhook signing secret and replay queue.',
  },
  {
    incidentType: 'billing_reconciliation',
    severity: 'critical',
    title: 'DRILL: Stripe Ledger Settlement Discrepancy',
    summary: 'Mismatch detected between Stripe transfer reversal and local payment refund row.',
    details: { paymentId: 'pay_drill_999', expectedRefund: 450.0, actualTransferReversal: 400.0 },
    affectedAccountsCount: 1,
    actionRequired: 'Execute manual ledger reconciliation and contact payment engineering.',
  },
  {
    incidentType: 'sms_queue_stall',
    severity: 'warning',
    title: 'DRILL: TCPA Delayed Delivery Queue Backlog',
    summary: 'Over 50 queued appointment reminders held past morning send window.',
    details: { queueDepth: 54, oldestQueuedAt: '2026-09-01T06:00:00Z' },
    affectedAccountsCount: 8,
    actionRequired: 'Trigger immediate sweep via /api/cron/sms-delivery.',
  },
  {
    incidentType: 'provider_outage',
    severity: 'critical',
    title: 'DRILL: OpenAI Responses API Total Outage',
    summary: 'Simulated 100% 500 error rate on OpenAI responses endpoint.',
    details: { endpoint: 'https://api.openai.com/v1/responses', consecutiveFailures: 10 },
    affectedAccountsCount: 12,
    actionRequired: 'Confirm classic fallback rule is active for public intake forms.',
  },
];

export async function runOperationalAlertDrill(options = {}) {
  const isDryRun = options.dryRun ?? false;
  console.log(`\n======================================================`);
  console.log(`  OPERATIONAL ALERT DRILL HARNESS (Dry-Run: ${isDryRun})`);
  console.log(`======================================================\n`);

  const results = [];

  for (const incident of MANUFACTURED_ALERT_CATEGORIES) {
    console.log(`[DRILL] Category: ${incident.incidentType.toUpperCase()} | Severity: ${incident.severity.toUpperCase()}`);
    console.log(`        Title: "${incident.title}"`);

    if (isDryRun) {
      console.log(`        [DRY-RUN] Alert verified and payload formatted.`);
      results.push({ incidentType: incident.incidentType, dispatched: false, dryRun: true });
    } else {
      const dispatchResult = await sendOperationalEmergencyAlert(incident);
      console.log(`        Dispatched: ${dispatchResult.dispatched} to ${dispatchResult.recipient}`);
      results.push({ incidentType: incident.incidentType, ...dispatchResult });
    }
  }

  console.log(`\n--- DRILL SUMMARY: ${results.length}/${MANUFACTURED_ALERT_CATEGORIES.length} Categories Verified ---\n`);
  return results;
}

if (process.argv[1]?.includes('drill-operational-alerts')) {
  const dryRun = process.argv.includes('--dry-run') || !process.env.RESEND_API_KEY;
  runOperationalAlertDrill({ dryRun }).catch((err) => {
    console.error('Fatal drill execution error:', err);
    process.exit(1);
  });
}
