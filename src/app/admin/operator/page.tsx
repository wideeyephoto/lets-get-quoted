import { requirePermission } from '@/lib/auth';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';
import { listPendingHitlActionsAsync, getOperatorAuditLogsAsync } from '@/lib/ai-operator/audit';
import OperatorCockpit from './OperatorCockpit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Operator Cockpit | Admin' };

export default async function AdminOperatorPage() {
  const auth = await requirePermission('ops.manage');
  // These must read Supabase, not the module-level memory stores: every request may
  // land on a cold lambda, and the in-memory copy is empty there. Reading memory here
  // rendered an always-empty approval queue no matter what was actually pending.
  const [briefing, pendingActions, auditLogs] = await Promise.all([
    generateExecutiveBriefing(auth.admin),
    listPendingHitlActionsAsync(new Date(), auth.admin),
    getOperatorAuditLogsAsync({ limit: 25 }, auth.admin),
  ]);

  return (
    <OperatorCockpit
      initialBriefing={briefing}
      initialPendingActions={pendingActions}
      initialAuditLogs={auditLogs}
    />
  );
}
