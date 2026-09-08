import { cronRoute } from '@/lib/cron-runs';
import { runEmailSendingDomainReconcile } from '@/lib/email-sending-domain-reconciler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// No feature flag by design, matching voice-retention: the flag governs whether
// the dashboard offers the section, not whether already-verified domains still
// feed every outbound send. Switching the feature off must not strand a
// contractor on a sending domain nothing re-checks.
export const GET = cronRoute('email-domain-reconcile', runEmailSendingDomainReconcile);
