import { randomUUID } from 'node:crypto';
import type {
  OperatorAuditLogEntry,
  OperatorHitlActionRequest,
  OperatorCategory,
  OperatorActionSeverity,
} from './types';

// In-memory runtime stores for audit trails and HITL queues
// (Can be backed by Supabase `ai_operator_logs` / `ai_operator_action_requests` tables)
var auditLogsStore: OperatorAuditLogEntry[] = [];
var hitlActionStore: Map<string, OperatorHitlActionRequest> = new Map();

/**
 * Strict action safety classifications
 */
export const SAFE_AUTO_REMEDIATION_ACTION_TYPES = new Set([
  'trigger_contractor_lifecycle_nudge',
  'send_onboarding_reminder',
  'system_health_probe',
  'triage_support_case',
  'generate_executive_briefing',
  'run_revops_scan',
  'refresh_dashboard_metrics',
  'log_operator_audit',
]);

export const REQUIRES_APPROVAL_ACTION_TYPES = new Set([
  'issue_subscription_refund',
  'trigger_dunning_escalation',
  'extend_contractor_trial',
  'modify_account_tier',
  'suspend_account_access',
  'reassign_sms_number',
  'waive_platform_fee',
  'force_payout_settlement',
  'replay_failed_webhook',
  'execute_database_mutation',
]);

/**
 * Checks whether an operational action is safe for autonomous zero-touch execution
 */
export function isActionSafeForAutoRemediation(actionType: string): boolean {
  if (REQUIRES_APPROVAL_ACTION_TYPES.has(actionType)) {
    return false;
  }
  return SAFE_AUTO_REMEDIATION_ACTION_TYPES.has(actionType);
}

/**
 * Validates whether an action execution is permitted according to HITL safety policy
 */
export function validateActionExecutionSafety(
  actionType: string,
  options?: { isFounderApproved?: boolean; payload?: Record<string, unknown> },
): { allowed: boolean; reason?: string; requiresHitl: boolean } {
  if (REQUIRES_APPROVAL_ACTION_TYPES.has(actionType)) {
    if (!options?.isFounderApproved) {
      return {
        allowed: false,
        requiresHitl: true,
        reason: `Action "${actionType}" is a high-impact operation requiring explicit founder HITL approval.`,
      };
    }
  }

  // Check if financial payload exceeds threshold
  if (options?.payload && typeof options.payload.amountDollars === 'number') {
    if (options.payload.amountDollars > 500 && !options.isFounderApproved) {
      return {
        allowed: false,
        requiresHitl: true,
        reason: `Financial action exceeding $500 threshold requires founder approval.`,
      };
    }
  }

  return { allowed: true, requiresHitl: false };
}

/**
 * Checks if a HITL action has expired based on expiresAt timestamp
 */
export function isHitlActionExpired(action: OperatorHitlActionRequest, now = new Date()): boolean {
  if (!action.expiresAt) return false;
  return new Date(action.expiresAt).getTime() <= now.getTime();
}

/**
 * Records an autonomous operator action in the audit trail
 */
export function recordOperatorAudit(
  entry: Omit<OperatorAuditLogEntry, 'id' | 'timestamp'> & {
    id?: string;
    timestamp?: string;
  },
): OperatorAuditLogEntry {
  const fullEntry: OperatorAuditLogEntry = {
    id: entry.id || `audit-${randomUUID()}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    category: entry.category,
    actionName: entry.actionName,
    severity: entry.severity,
    toolName: entry.toolName,
    inputPayload: entry.inputPayload,
    outputResult: entry.outputResult,
    reasoningSummary: entry.reasoningSummary,
    accountId: entry.accountId,
    status: entry.status,
  };

  auditLogsStore.unshift(fullEntry);
  if (auditLogsStore.length > 500) {
    auditLogsStore.pop();
  }

  return fullEntry;
}

/**
 * Returns recent operator audit logs, optionally filtered by category or status
 */
export function getOperatorAuditLogs(options?: {
  category?: OperatorCategory;
  severity?: OperatorActionSeverity;
  limit?: number;
}): OperatorAuditLogEntry[] {
  let logs = [...auditLogsStore];

  if (options?.category) {
    logs = logs.filter((l) => l.category === options.category);
  }
  if (options?.severity) {
    logs = logs.filter((l) => l.severity === options.severity);
  }

  return logs.slice(0, options?.limit ?? 50);
}

/**
 * Creates a Human-in-the-Loop (HITL) action request that requires founder confirmation
 */
export function createHitlAction(
  params: Omit<OperatorHitlActionRequest, 'id' | 'status' | 'createdAt'> & {
    id?: string;
    expiresInHours?: number;
  },
): OperatorHitlActionRequest {
  const id = params.id || `hitl-${randomUUID()}`;
  const now = new Date();
  const expiresAt = params.expiresInHours
    ? new Date(now.getTime() + params.expiresInHours * 3600 * 1000).toISOString()
    : undefined;

  const request: OperatorHitlActionRequest = {
    id,
    category: params.category,
    title: params.title,
    description: params.description,
    actionType: params.actionType,
    payload: params.payload,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt,
  };

  hitlActionStore.set(id, request);

  // Log in audit trail
  recordOperatorAudit({
    category: params.category,
    actionName: `HITL Action Queued: ${params.title}`,
    severity: 'requires_hitl_approval',
    reasoningSummary: params.description,
    inputPayload: params.payload,
    status: 'queued_hitl',
  });

  return request;
}

/**
 * Retrieves a HITL action by its ID
 */
export function getHitlActionById(actionId: string): OperatorHitlActionRequest | undefined {
  return hitlActionStore.get(actionId);
}

/**
 * Lists all pending HITL action requests, updating any expired items
 */
export function listPendingHitlActions(now = new Date()): OperatorHitlActionRequest[] {
  const actions = Array.from(hitlActionStore.values());
  
  // Sweep for expired pending items
  for (const action of actions) {
    if (action.status === 'pending' && isHitlActionExpired(action, now)) {
      action.status = 'expired';
      recordOperatorAudit({
        category: action.category,
        actionName: `HITL Action EXPIRED: ${action.title}`,
        severity: 'info',
        reasoningSummary: `Action ${action.id} expired past ${action.expiresAt}.`,
        status: 'failure',
      });
    }
  }

  return actions
    .filter((a) => a.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Resolves (approves or rejects) a pending HITL action
 */
export function resolveHitlAction(
  actionId: string,
  decision: 'approved' | 'rejected',
  resolver: string,
  reason?: string,
  now = new Date(),
): { success: boolean; action?: OperatorHitlActionRequest; error?: string } {
  const action = hitlActionStore.get(actionId);
  if (!action) {
    return { success: false, error: `Action request "${actionId}" not found.` };
  }

  if (action.status === 'pending' && isHitlActionExpired(action, now)) {
    action.status = 'expired';
    return {
      success: false,
      error: `Action "${actionId}" has expired and can no longer be resolved.`,
    };
  }

  if (action.status !== 'pending') {
    return {
      success: false,
      error: `Action "${actionId}" is already ${action.status}.`,
    };
  }

  action.status = decision;
  action.resolvedAt = now.toISOString();
  action.resolvedBy = resolver;
  action.resolutionReason = reason;

  recordOperatorAudit({
    category: action.category,
    actionName: `HITL Action ${decision.toUpperCase()}: ${action.title}`,
    severity: 'requires_hitl_approval',
    reasoningSummary: reason || `Action was ${decision} by ${resolver}.`,
    outputResult: { decision, resolvedBy: resolver },
    status: 'success',
  });

  return { success: true, action };
}

/**
 * Clears stores (used for testing resets)
 */
export function clearOperatorMemory(): void {
  auditLogsStore.length = 0;
  hitlActionStore.clear();
}

