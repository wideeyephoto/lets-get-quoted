import { requireAdmin } from '@/lib/auth';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';
import { listPendingHitlActions, getOperatorAuditLogs } from '@/lib/ai-operator/audit';
import OperatorCockpit from './OperatorCockpit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Operator Cockpit | Admin' };

export default async function AdminOperatorPage() {
  const auth = await requireAdmin();
  const briefing = await generateExecutiveBriefing(auth.admin);
  const pendingActions = listPendingHitlActions();
  const auditLogs = getOperatorAuditLogs({ limit: 25 });

  return (
    <OperatorCockpit
      initialBriefing={briefing}
      initialPendingActions={pendingActions}
      initialAuditLogs={auditLogs}
    />
  );
}
