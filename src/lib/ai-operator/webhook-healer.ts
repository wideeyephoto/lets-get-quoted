import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnresolvedWebhookFailures, createAdminSignalDiagnostics } from '@/lib/admin-alerts';
import { recordOperatorAudit, createHitlAction } from './audit';

export interface WebhookHealReport {
  scannedAt: string;
  totalUnresolved: number;
  replayedCount: number;
  autoResolvedCount: number;
  escalatedToHitlCount: number;
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
    errors: [],
  };
  if (opts.dryRun) return report;
  for (const failure of unresolved) {
    createHitlAction({
      category: 'sre_platform',
      title: `Inspect Webhook Failure: ${failure.source} (${failure.event_type || 'event'})`,
      description: `Webhook ${failure.id} failed: "${failure.error_message || 'Unknown error'}". Verify provider identity and business effects before any source-specific recovery. No replay was attempted.`,
      actionType: 'sre.inspect_webhook_failure',
      payload: { failureId: failure.id, source: failure.source, error: failure.error_message },
      requiredRole: 'admin',
    });
    report.escalatedToHitlCount++;
  }
  if (report.escalatedToHitlCount > 0) {
    recordOperatorAudit({
      category: 'sre_platform',
      actionName: 'sre.webhook_failures_inspected',
      severity: 'safe_auto',
      toolName: 'runWebhookAutoHealer',
      inputPayload: { totalScanned: unresolved.length },
      outputResult: report,
      reasoningSummary: `Created ${report.escalatedToHitlCount} inspection actions. No webhooks replayed or resolved.`,
      status: 'success',
    });
  }
  return report;
}
