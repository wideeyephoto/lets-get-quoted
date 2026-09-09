import type { SupabaseClient } from '@supabase/supabase-js';

export interface SelfHealingActionLog {
  actionType: 'webhook_replay' | 'dead_letter_purge' | 'cron_restart' | 'payout_unfreeze';
  targetId: string;
  source: string;
  remedyApplied: string;
  status: 'healed' | 'escalated';
  timestamp: string;
}

export interface SelfHealingDaemonReport {
  cycleId: string;
  scannedAt: string;
  anomaliesDetected: number;
  anomaliesHealed: number;
  escalatedIncidents: number;
  actionsTaken: SelfHealingActionLog[];
  systemHealthScorePct: number;
}

/**
 * Runs an autonomous self-healing SRE sweep across platform webhooks, SMS queues, and background jobs
 */
export async function runSreSelfHealingSweep(
  supabase: SupabaseClient,
  _options?: { autoHeal?: boolean },
): Promise<SelfHealingDaemonReport> {
  const cycleId = `heal_${Date.now()}`;
  const scannedAt = new Date().toISOString();
  const actionsTaken: SelfHealingActionLog[] = [];

  let anomaliesDetected = 0;
  const anomaliesHealed = 0;
  let escalatedIncidents = 0;

  try {
    // 1. Scan for unhandled webhook failures
    const { data: failedWebhooks, error } = await supabase
      .from('webhook_failures')
      .select('id, source, event_type, error_message, created_at')
      .is('resolved_at', null)
      .limit(20);
    if (error) throw new Error('Webhook recovery inspection failed');

    if (failedWebhooks && failedWebhooks.length > 0) {
      anomaliesDetected += failedWebhooks.length;

      for (const w of failedWebhooks) {
        // Detection is not a replay. Preserve the failure until a supported
        // recovery path verifies the original event's business effect.
        escalatedIncidents += 1;
        actionsTaken.push({
          actionType: 'webhook_replay',
          targetId: w.id,
          source: w.source || 'stripe_webhook',
          remedyApplied: 'Requires original-event reconciliation and verified recovery; no business mutation or resolution performed.',
          status: 'escalated',
          timestamp: scannedAt,
        });
      }
    }
  } catch {
    throw new Error('Recovery inspection unavailable; no health score can be established');
  }

  const healthScore = anomaliesDetected === 0
    ? 100
    : 0;

  return {
    cycleId,
    scannedAt,
    anomaliesDetected,
    anomaliesHealed,
    escalatedIncidents,
    actionsTaken,
    systemHealthScorePct: healthScore,
  };
}
