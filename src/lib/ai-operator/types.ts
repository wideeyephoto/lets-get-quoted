import type { SupabaseClient } from '@supabase/supabase-js';

export type OperatorCategory =
  | 'sre_platform'
  | 'billing_revops'
  | 'customer_support'
  | 'growth_lifecycle'
  | 'executive';

export type OperatorActionSeverity =
  | 'info'
  | 'safe_auto'
  | 'requires_hitl_approval'
  | 'critical';

export type HitlActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired';

export interface OperatorHitlActionRequest {
  id: string;
  category: OperatorCategory;
  title: string;
  description: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: HitlActionStatus;
  createdAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionReason?: string;
}

export interface OperatorAuditLogEntry {
  id: string;
  timestamp: string;
  category: OperatorCategory;
  actionName: string;
  severity: OperatorActionSeverity;
  toolName?: string;
  inputPayload?: unknown;
  outputResult?: unknown;
  reasoningSummary: string;
  accountId?: string;
  status: 'success' | 'failure' | 'queued_hitl';
}

export interface OperatorHealthMetrics {
  smsQueueDepth: number;
  stuckSmsTasks: number;
  activePlatformIncidents: number;
  unresolvedWebhookFailures: number;
  cronTroubleCount: number;
  dunningPaymentsCount: number;
  pausedPayoutsCount: number;
  notOnboardedCount: number;
}

export interface ExecutiveBriefing {
  generatedAt: string;
  period: string;
  headline: string;
  revenue: {
    mrrEstimated: number;
    activeSubscriptions: number;
    dunningCount: number;
    pendingPayouts: number;
  };
  operations: {
    smsDeliverabilityPct: number;
    queueHealth: 'healthy' | 'degraded' | 'critical';
    cronStatus: 'ok' | 'issues_detected';
  };
  contractors: {
    totalActive: number;
    onboardedInPeriod: number;
    atRiskChurn: number;
  };
  actionsTaken: string[];
  pendingApprovals: OperatorHitlActionRequest[];
  markdownSummary: string;
}

export interface OperatorExecutionContext {
  supabase: SupabaseClient;
  adminUserId?: string;
  source: 'cron' | 'founder_cli' | 'admin_dashboard' | 'telegram' | 'webhook';
}

export interface OperatorToolResult {
  data: unknown;
  auditEntry?: Partial<OperatorAuditLogEntry>;
  hitlAction?: OperatorHitlActionRequest;
}
