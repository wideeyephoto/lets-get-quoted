import { createAdminClient } from '@/lib/auth';

export type TenantAuditSource = 'web' | 'staff' | 'integration' | 'cron' | 'migration' | 'api';

export interface ActorSnapshot {
  userId?: string | null;
  role?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  authType?: string | null;
  impersonatedBy?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TenantAuditEvent {
  id: string;
  accountId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: ActorSnapshot;
  source: TenantAuditSource;
  requestId?: string | null;
  deleteOperationId?: string | null;
  reason?: string | null;
  changedFields: string[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  occurredAt: string;
}

export interface RecordAuditEventParams {
  accountId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor?: ActorSnapshot;
  source?: TenantAuditSource;
  requestId?: string | null;
  deleteOperationId?: string | null;
  reason?: string | null;
  changedFields?: string[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

export interface QueryAuditEventsParams {
  accountId: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  source?: TenantAuditSource;
  searchQuery?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

const SENSITIVE_KEY_PATTERN = /^(password|token|secret|cvv|card_number|cardnumber|ssn|ein|tin|authorization|bearer|api_key|apikey|cookie|pin|private_key)$/i;

/**
 * Sanitizes state objects to prevent sensitive secrets from entering audit logs.
 */
export function sanitizeAuditPayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > 2000) {
      return data.slice(0, 2000) + '... [TRUNCATED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditPayload(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditPayload(value);
    } else if (typeof value === 'string' && value.length > 2000) {
      sanitized[key] = value.slice(0, 2000) + '... [TRUNCATED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Computes changed field names and sanitized before/after state diff.
 */
export function computeAuditDiff(
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  explicitFields?: string[]
): {
  changedFields: string[];
  sanitizedBefore: Record<string, unknown> | null;
  sanitizedAfter: Record<string, unknown> | null;
} {
  const sanitizedBefore = before ? (sanitizeAuditPayload(before) as Record<string, unknown>) : null;
  const sanitizedAfter = after ? (sanitizeAuditPayload(after) as Record<string, unknown>) : null;

  if (explicitFields && explicitFields.length > 0) {
    return {
      changedFields: explicitFields,
      sanitizedBefore,
      sanitizedAfter,
    };
  }

  const fieldSet = new Set<string>();
  if (sanitizedBefore) {
    for (const key of Object.keys(sanitizedBefore)) {
      if (!sanitizedAfter || JSON.stringify(sanitizedBefore[key]) !== JSON.stringify(sanitizedAfter[key])) {
        fieldSet.add(key);
      }
    }
  }
  if (sanitizedAfter) {
    for (const key of Object.keys(sanitizedAfter)) {
      if (!sanitizedBefore || JSON.stringify(sanitizedBefore[key]) !== JSON.stringify(sanitizedAfter[key])) {
        fieldSet.add(key);
      }
    }
  }

  return {
    changedFields: Array.from(fieldSet),
    sanitizedBefore,
    sanitizedAfter,
  };
}

/**
 * Records an immutable tenant audit event via the atomic RPC.
 */
export async function recordTenantAuditEvent(params: RecordAuditEventParams): Promise<string> {
  const supabase = createAdminClient();
  const { changedFields, sanitizedBefore, sanitizedAfter } = computeAuditDiff(
    params.beforeState,
    params.afterState,
    params.changedFields
  );

  const { data, error } = await supabase.rpc('record_tenant_audit_event_atomic', {
    p_account_id: params.accountId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_actor: params.actor ?? {},
    p_source: params.source ?? 'web',
    p_request_id: params.requestId ?? null,
    p_delete_operation_id: params.deleteOperationId ?? null,
    p_reason: params.reason ?? null,
    p_changed_fields: changedFields,
    p_before_state: sanitizedBefore,
    p_after_state: sanitizedAfter,
  });

  if (error) {
    console.error('[tenant-audit] Failed to record audit event via RPC:', error);
    // Fallback: direct insert if RPC fails in non-migrated environment
    const { data: insertData, error: insertError } = await supabase
      .from('tenant_audit_events')
      .insert({
        account_id: params.accountId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        actor: params.actor ?? {},
        source: params.source ?? 'web',
        request_id: params.requestId ?? null,
        delete_operation_id: params.deleteOperationId ?? null,
        reason: params.reason ?? null,
        changed_fields: changedFields,
        before_state: sanitizedBefore,
        after_state: sanitizedAfter,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[tenant-audit] Fallback insert also failed:', insertError);
      throw new Error(`Failed to write tenant audit event: ${insertError.message}`);
    }
    return insertData.id;
  }

  return data as string;
}

/**
 * Queries tenant audit events for an account with filtering and pagination.
 */
export async function queryTenantAuditEvents(params: QueryAuditEventsParams): Promise<{
  events: TenantAuditEvent[];
  total: number;
  limit: number;
  offset: number;
}> {
  const supabase = createAdminClient();
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;

  let query = supabase
    .from('tenant_audit_events')
    .select('*', { count: 'exact' })
    .eq('account_id', params.accountId)
    .order('occurred_at', { ascending: false });

  if (params.entityType) {
    query = query.eq('entity_type', params.entityType);
  }
  if (params.entityId) {
    query = query.eq('entity_id', params.entityId);
  }
  if (params.action) {
    query = query.eq('action', params.action);
  }
  if (params.source) {
    query = query.eq('source', params.source);
  }
  if (params.fromDate) {
    query = query.gte('occurred_at', params.fromDate);
  }
  if (params.toDate) {
    query = query.lte('occurred_at', params.toDate);
  }
  if (params.searchQuery) {
    query = query.or(`action.ilike.%${params.searchQuery}%,entity_type.ilike.%${params.searchQuery}%,reason.ilike.%${params.searchQuery}%`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('[tenant-audit] Error querying audit events:', error);
    return { events: [], total: 0, limit, offset };
  }

  const events: TenantAuditEvent[] = (data || []).map((row: any) => ({
    id: row.id,
    accountId: row.account_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor || {},
    source: row.source,
    requestId: row.request_id,
    deleteOperationId: row.delete_operation_id,
    reason: row.reason,
    changedFields: row.changed_fields || [],
    beforeState: row.before_state,
    afterState: row.after_state,
    occurredAt: row.occurred_at,
  }));

  return {
    events,
    total: count ?? events.length,
    limit,
    offset,
  };
}
