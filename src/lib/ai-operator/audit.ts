import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Permission } from '@/lib/staff';
import { createAdminClient } from '@/lib/auth';
import type {
  OperatorAuditLogEntry,
  OperatorHitlActionRequest,
  OperatorCategory,
  OperatorActionSeverity,
  HitlActionStatus,
} from './types';

// In-memory runtime stores for audit trails and HITL queues
// Backed by Supabase `ai_operator_logs` and `ai_operator_action_requests` tables
const auditLogsStore: OperatorAuditLogEntry[] = [];
const hitlActionStore: Map<string, OperatorHitlActionRequest> = new Map();

function getAdminClientSafe(provided?: SupabaseClient): SupabaseClient | null {
  if (provided) return provided;
  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return createAdminClient();
    }
  } catch {
    // safe fallback to in-memory store in unit tests or when unconfigured
  }
  return null;
}

/**
 * Returns the exact permission an operator action requires.
 * Prevents privilege escalation where an operator with ops.manage
 * could approve a refund, tier change, or suspension they lack authority for.
 */
export function permissionForHitlAction(actionType: string): Permission {
  switch (actionType) {
    case 'issue_subscription_refund':
      return 'money.refund';
    case 'modify_account_tier':
    case 'waive_platform_fee':
    case 'extend_contractor_trial':
      return 'money.plan';
    case 'suspend_account_access':
      return 'account.enforce';
    case 'force_payout_settlement':
    case 'trigger_dunning_escalation':
      return 'money.payouts';
    case 'trigger_contractor_lifecycle_nudge':
    case 'send_onboarding_reminder':
    case 'triage_support_case':
      return 'account.support';
    case 'replay_failed_webhook':
    case 'replay_failed_webhooks':
    case 'reassign_sms_number':
    case 'execute_database_mutation':
    default:
      return 'ops.manage';
  }
}

function mapDbToHitlAction(row: Record<string, unknown>): OperatorHitlActionRequest {
  return {
    id: String(row.id),
    category: row.category as OperatorCategory,
    title: String(row.title),
    description: String(row.description),
    actionType: String(row.action_type),
    payload: (row.payload as Record<string, unknown>) || {},
    status: row.status as HitlActionStatus,
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolutionReason: row.resolution_reason ? String(row.resolution_reason) : undefined,
    isFinancialMutation: Boolean(row.is_financial_mutation),
    requiredRole: (row.required_role as 'founder' | 'admin' | 'staff') || 'admin',
  };
}

function mapDbToAuditLog(row: Record<string, unknown>): OperatorAuditLogEntry {
  return {
    id: String(row.id),
    timestamp: String(row.timestamp),
    category: row.category as OperatorCategory,
    actionName: String(row.action_name),
    severity: row.severity as OperatorActionSeverity,
    toolName: row.tool_name ? String(row.tool_name) : undefined,
    inputPayload: row.input_payload,
    outputResult: row.output_result,
    reasoningSummary: String(row.reasoning_summary),
    accountId: row.account_id ? String(row.account_id) : undefined,
    status: row.status as 'success' | 'failure' | 'queued_hitl',
  };
}


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
  'replay_failed_webhooks',
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
  supabase?: SupabaseClient,
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

  const client = getAdminClientSafe(supabase);
  if (client) {
    try {
      const q = client.from('ai_operator_logs');
      if (typeof q?.insert === 'function') {
        q.insert({
          id: fullEntry.id,
          timestamp: fullEntry.timestamp,
          category: fullEntry.category,
          action_name: fullEntry.actionName,
          severity: fullEntry.severity,
          tool_name: fullEntry.toolName,
          input_payload: fullEntry.inputPayload,
          output_result: fullEntry.outputResult,
          reasoning_summary: fullEntry.reasoningSummary,
          account_id: fullEntry.accountId,
          status: fullEntry.status,
        }).then(
          () => {},
          (err: any) => console.warn('[ai-operator] audit persist error:', err?.message || err),
        );
      }
    } catch {
      // Mock client or unconfigured
    }
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
  supabase?: SupabaseClient,
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
    isFinancialMutation: params.isFinancialMutation,
    requiredRole: params.requiredRole,
  };

  hitlActionStore.set(id, request);

  const client = getAdminClientSafe(supabase);
  if (client) {
    try {
      const q = client.from('ai_operator_action_requests');
      if (typeof q?.insert === 'function') {
        q.insert({
          id: request.id,
          category: request.category,
          title: request.title,
          description: request.description,
          action_type: request.actionType,
          payload: request.payload,
          status: request.status,
          created_at: request.createdAt,
          expires_at: request.expiresAt,
          is_financial_mutation: Boolean(params.isFinancialMutation),
          required_role: params.requiredRole || 'admin',
        }).then(
          () => {},
          (err: any) => console.warn('[ai-operator] hitl persist error:', err?.message || err),
        );
      }
    } catch {
      // Mock client or unconfigured
    }
  }

  // Log in audit trail
  recordOperatorAudit({
    category: params.category,
    actionName: `HITL Action Queued: ${params.title}`,
    severity: 'requires_hitl_approval',
    reasoningSummary: params.description,
    inputPayload: params.payload,
    status: 'queued_hitl',
  }, client ?? undefined);

  return request;
}

/**
 * Retrieves a HITL action by its ID (synchronous from memory)
 */
export function getHitlActionById(actionId: string): OperatorHitlActionRequest | undefined {
  return hitlActionStore.get(actionId);
}

/**
 * Retrieves a HITL action by its ID, checking DB first then falling back to memory
 */
export async function getHitlActionByIdAsync(
  actionId: string,
  supabase?: SupabaseClient,
): Promise<OperatorHitlActionRequest | undefined> {
  const memory = hitlActionStore.get(actionId);
  const client = getAdminClientSafe(supabase);
  if (!client) return memory;

  try {
    const { data, error } = await client
      .from('ai_operator_action_requests')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();

    if (!error && data) {
      const parsed = mapDbToHitlAction(data as Record<string, unknown>);
      hitlActionStore.set(actionId, parsed);
      return parsed;
    }
  } catch {
    // fallback to memory
  }

  return memory;
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
 * Lists all pending HITL action requests from the database with in-memory fallback
 */
export async function listPendingHitlActionsAsync(
  now = new Date(),
  supabase?: SupabaseClient,
): Promise<OperatorHitlActionRequest[]> {
  const client = getAdminClientSafe(supabase);
  if (!client) return listPendingHitlActions(now);

  try {
    const { data, error } = await client
      .from('ai_operator_action_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const items: OperatorHitlActionRequest[] = [];
      for (const row of data) {
        const action = mapDbToHitlAction(row as Record<string, unknown>);
        if (isHitlActionExpired(action, now)) {
          action.status = 'expired';
          client
            .from('ai_operator_action_requests')
            .update({ status: 'expired' })
            .eq('id', action.id)
            .then(() => {}, () => {});
        } else {
          items.push(action);
        }
        hitlActionStore.set(action.id, action);
      }
      return items;
    }
  } catch {
    // fallback to memory
  }

  return listPendingHitlActions(now);
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
  supabase?: SupabaseClient,
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

  const client = getAdminClientSafe(supabase);
  if (client) {
    try {
      const q = client.from('ai_operator_action_requests');
      if (typeof q?.update === 'function') {
        q.update({
          status: decision,
          resolved_at: action.resolvedAt,
          resolved_by: action.resolvedBy,
          resolution_reason: action.resolutionReason,
        })
          .eq('id', actionId)
          .then(
            () => {},
            (err: any) => console.warn('[ai-operator] resolve persist error:', err?.message || err),
          );
      }
    } catch {
      // Mock client or unconfigured
    }
  }

  recordOperatorAudit(
    {
      category: action.category,
      actionName: `HITL Action ${decision.toUpperCase()}: ${action.title}`,
      severity: 'requires_hitl_approval',
      reasoningSummary: reason || `Action was ${decision} by ${resolver}.`,
      outputResult: { decision, resolvedBy: resolver },
      status: 'success',
    },
    client ?? undefined,
  );

  return { success: true, action };
}

/**
 * Clears stores (used for testing resets)
 */
export function clearOperatorMemory(): void {
  auditLogsStore.length = 0;
  hitlActionStore.clear();
}

