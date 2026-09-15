import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnresolvedWebhookFailures, createAdminSignalDiagnostics } from '@/lib/admin-alerts';
import { recordOperatorAuditOnce, retireWebhookInspectionApprovals } from './audit';

export interface WebhookHealReport {
  scannedAt: string;
  totalUnresolved: number;
  replayedCount: number;
  autoResolvedCount: number;
  escalatedToHitlCount: number;
  inspectionActionsLogged: number;
  retiredInspectionApprovals: number;
  errors: string[];
}

/** Inspect failures until source-specific recovery can prove handler execution. */
export async function runWebhookAutoHealer(
  supabase: SupabaseClient,
  opts: { maxBatchSize?: number; dryRun?: boolean } = {},
): Promise<WebhookHealReport> {
  const diagnostics = createAdminSignalDiagnostics();
  const unresolved = await getUnresolvedWebhookFailures(supabase, { limit: opts.maxBatchSize || 15, diagnostics });
  if (diagnostics.failed.length) throw new Error('Webhook failure inspection unavailable');
  const report: WebhookHealReport = {
    scannedAt: new Date().toISOString(),
    totalUnresolved: unresolved.length,
    replayedCount: 0,
    autoResolvedCount: 0,
    escalatedToHitlCount: 0,
    inspectionActionsLogged: 0,
    retiredInspectionApprovals: 0,
    errors: [],
  };
  if (opts.dryRun) return report;
  report.retiredInspectionApprovals = await retireWebhookInspectionApprovals(supabase);
  for (const failure of unresolved) {
    const created = await recordOperatorAuditOnce({
      id: `audit-webhook-inspection-${failure.id}`,
      timestamp: report.scannedAt,
      category: 'sre_platform',
      actionName: 'sre.webhook_failure_inspected',
      severity: 'info',
      toolName: 'runWebhookAutoHealer',
      inputPayload: { failureId: failure.id, source: failure.source, error: failure.error_message },
      outputResult: { replayed: false, resolved: false },
      reasoningSummary: `Webhook ${failure.id} (${failure.source}) remains unresolved: "${failure.error_message || 'Unknown error'}". Inspection is read-only. Review provider identity and business effects before source-specific recovery. No replay was attempted.`,
      status: 'success',
    }, supabase);
    if (created) report.inspectionActionsLogged++;
  }
  return report;
}
