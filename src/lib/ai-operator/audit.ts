import { randomUUID } from 'node:crypto';
import type {
  OperatorAuditLogEntry,
  OperatorHitlActionRequest,
  OperatorCategory,
  OperatorActionSeverity,
} from './types';

// In-memory runtime stores for audit trails and HITL queues
// (Can be backed by Supabase `ai_operator_logs` / `ai_operator_action_requests` tables)
const auditLogsStore: OperatorAuditLogEntry[] = [];
const hitlActionStore: Map<string, OperatorHitlActionRequest> = new Map();

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
 * Lists all pending HITL action requests
 */
export function listPendingHitlActions(): OperatorHitlActionRequest[] {
  return Array.from(hitlActionStore.values())
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
): { success: boolean; action?: OperatorHitlActionRequest; error?: string } {
  const action = hitlActionStore.get(actionId);
  if (!action) {
    return { success: false, error: `Action request "${actionId}" not found.` };
  }

  if (action.status !== 'pending') {
    return {
      success: false,
      error: `Action "${actionId}" is already ${action.status}.`,
    };
  }

  action.status = decision;
  action.resolvedAt = new Date().toISOString();
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
