#!/usr/bin/env node
// Node 24 (the production runtime) strips this module's TypeScript types.
import { runMessagingCanary, runVoiceCanary } from '../src/lib/messaging-voice-canary.ts';

const input = {
  accountId: process.env.LGQ_TEST_ACCOUNT_ID || '',
  dedicatedNumber: process.env.SIGNALWIRE_FROM_NUMBER || '',
  recipientPhone: process.env.LGQ_TEST_RECIPIENT_PHONE || '',
  suppressOutbound: process.env.LGQ_DISABLE_OUTBOUND_SMS === undefined ? undefined
    : process.env.LGQ_DISABLE_OUTBOUND_SMS === '1',
  canaryAllowlist: process.env.LGQ_SMS_CANARY_ACCOUNT_IDS === undefined ? undefined
    : new Set(process.env.LGQ_SMS_CANARY_ACCOUNT_IDS.split(',').map(v => v.trim()).filter(Boolean)),
};
const reports = { messaging: runMessagingCanary(input), voice: runVoiceCanary(input) };
console.log(JSON.stringify({ verification: 'local inputs only', reports }, null, 2));
console.error('LIVE CARRIER TESTS NOT RUN. Use inspect-sms-provider.mjs for read-only inventory and docs/texting-release-readiness-2026-09-05.md for the handset test sequence.');
process.exitCode = Object.values(reports).some(r => r.overallStatus === 'failed') ? 1 : 2;
