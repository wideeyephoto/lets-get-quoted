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
  isFinancialMutation?: boolean;
  requiredRole?: 'founder' | 'admin' | 'staff';
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
  dunningTotalAmountCents: number;
  pausedPayoutsCount: number;
  notOnboardedCount: number;
  casesNearSlaCount: number;
}

export interface KpiStatTile {
  id: string;
  label: string;
  value: string | number;
  subValue?: string;
  status: 'healthy' | 'warning' | 'critical' | 'neutral';
  deepLink?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'operator';
  text: string;
  timestamp: string;
  toolCalls?: string[];
  hitlActionCreated?: boolean;
}

export interface WebhookReplayResult {
  success: boolean;
  replayedCount: number;
  resolvedCount: number;
  errors: string[];
  remediationSummary: string;
}

export interface EmailDeliverabilityTriageResult {
  totalBounced: number;
  details: Array<{
    id: string;
    recipient: string;
    bounceType: string;
    accountId?: string;
    accountName?: string;
    timestamp: string;
    recommendation: string;
  }>;
}

export interface SmsCarrierHealthResult {
  carrierDeliverabilityPct: number;
  activeHotlines: number;
  tenDlcStatus: 'approved' | 'in_review' | 'attention_needed';
  flaggedIssues: string[];
}

export interface CronLatenessResult {
  healthy: boolean;
  delayedJobs: Array<{
    name: string;
    lastRun: string;
    delayMinutes: number;
    severity: 'warning' | 'critical';
  }>;
}

export interface UpgradeCandidate {
  accountId: string;
  accountName: string;
  currentPlan: string;
  suggestedPlan: string;
  monthlyQuoteCount: number;
  reason: string;
  estimatedAnnualLift: number;
}

export interface DisputeEvidencePacket {
  disputeId: string;
  accountId: string;
  amount: number;
  homeownerName?: string;
  timeline: Array<{ timestamp: string; event: string; details: string }>;
  defenseSummary: string;
  readyForSubmission: boolean;
}

export interface OpsTrendSnapshot {
  date: string;
  mrrEstimated: number;
  totalActiveContractors: number;
  stripeConnectedContractors: number;
  smsDeliverabilityPct: number;
  unresolvedWebhooksCount: number;
  incidentCount: number;
}

export interface ExecutiveBriefing {
  generatedAt: string;
  period: string;
  headline: string;
  kpiTiles?: KpiStatTile[];
  revenue: {
    mrrEstimated: number;
    activeSubscriptions: number;
    paidPlanCounts: {
      solo: number;
      growth: number;
      scale: number;
    };
    dunningCount: number;
    dunningTotalAmountCents: number;
    pendingPayouts: number;
  };
  operations: {
    smsDeliverabilityPct: number;
    queueHealth: 'healthy' | 'degraded' | 'critical';
    cronStatus: 'ok' | 'issues_detected';
    cronTroubledCount: number;
    unresolvedWebhooksCount: number;
    activeIncidentsCount: number;
  };
  contractors: {
    totalActive: number;
    onboardedInPeriod: number;
    atRiskChurn: number;
    unactivatedCount: number;
  };
  escalations: {
    openDisputesCount: number;
    casesNearSlaCount: number;
    casesWithoutSlaCount: number;
    pendingHitlApprovalsCount: number;
  };
  actionsTaken: string[];
  pendingApprovals: OperatorHitlActionRequest[];
  markdownSummary: string;
}

export interface OnboardingBlockerDetail {
  code: 'stripe_connect_missing' | 'sms_hotline_missing' | 'first_quote_missing' | string;
  title: string;
  description: string;
  remediationSteps: string[];
  severity: 'high' | 'medium' | 'low';
}

export interface ContractorBlockerAnalysis {
  accountId: string;
  accountName: string;
  isStripeConnected: boolean;
  hasSmsSenderNumber: boolean;
  quotesCount: number;
  jobsCount: number;
  status: 'fully_activated' | 'partially_blocked' | 'critically_blocked';
  blockers: string[];
  blockerDetails: OnboardingBlockerDetail[];
  recommendedAction: string;
  automatedNudgeSent: boolean;
  suggestedNudgeCampaign?: 'onboarding_welcome' | 'stripe_connect_reminder' | 'phone_setup_help' | 'first_quote_reminder';
}

export interface SupportCaseTriageResult {
  caseId: string;
  subject: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  identifiedTopic:
    | 'stripe_payouts'
    | 'stripe_connect_onboarding'
    | 'sms_phone'
    | 'quote_creation'
    | 'crew_scheduling'
    | 'website_domain'
    | 'billing'
    | 'features'
    | 'bug'
    | 'general';
  suggestedCustomerReply: string;
  suggestedInternalAction: string;
  requiresFounderReview: boolean;
  onboardingDiagnosis?: ContractorBlockerAnalysis;
}

export interface OperatorExecutionContext {
  supabase: SupabaseClient;
  adminUserId?: string;
  source: 'cron' | 'founder_cli' | 'admin_dashboard' | 'telegram' | 'webhook';
  staff?: {
    role: any;
    active: boolean;
    id?: string;
    email?: string;
    display_name?: string | null;
  };
  isFounderApproved?: boolean;
}

export interface OperatorToolResult {
  data: unknown;
  auditEntry?: Partial<OperatorAuditLogEntry>;
  hitlAction?: OperatorHitlActionRequest;
}

