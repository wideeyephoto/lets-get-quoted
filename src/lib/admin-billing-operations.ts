import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);
const CODE_SAMPLE_LIMIT = 200;
const UNRECOGNIZED_ERROR_CODE = 'unrecognized_error_code';
const DIRECT_SETTLEMENT_SUMMARY_RPC = 'admin_billing_direct_payment_settlement_summary';

const DIRECT_SETTLEMENT_ERROR_CODES = new Set([
  'dispatch_status_invalid',
  'feed_result_invalid',
  'phone_number_invalid',
  'sms_amount_invalid',
  'sms_delivery_unknown_after_lease_expiry',
  'sms_dispatch_shape_invalid',
  'sms_event_id_invalid',
  'sms_existing_nonterminal_outcome',
  'sms_payment_missing',
  'sms_payment_read_failed',
  'sms_payment_scope_changed',
  'sms_phone_invalid',
  'sms_provider_result_unknown',
  'sms_stage_invalid',
  'sms_stage_shape_invalid',
  'sms_stage_status_invalid',
  'worker_attempt_limit_reached',
  'worker_contract_error',
  'worker_database_error',
  'worker_internal_error',
  'worker_lease_expired_attempt_limit',
  'worker_transport_error',
  UNRECOGNIZED_ERROR_CODE,
]);

const QUICK_STOP_ERROR_CODES = new Set([
  'payment_amount_not_exact',
  'payment_scope_changed',
  'payment_snapshot_changed',
  'provider_refund_id_invalid',
  'provider_refund_not_accepted',
  'provider_request_rejected',
  'provider_response_invalid',
  'provider_result_unknown',
  'provider_scope_invalid',
  'provider_unavailable',
  'request_missing',
  'worker_attempt_limit_reached',
  'worker_contract_error',
  'worker_database_error',
  'worker_internal_error',
  'worker_transport_error',
]);

export type BillingOperationsAvailability = 'installed' | 'not_installed' | 'unavailable';

export type BillingOperationsMetric = {
  code: 'total' | 'unresolved' | 'applied' | 'completed' | 'indeterminate' | 'dead_letter' | 'evidence';
  label: string;
  count: number;
};

export type BillingOperationsFixedCode = {
  code: string;
  count: number;
};

export type BillingOperationsLedger = {
  id:
    | 'subscription_events'
    | 'connected_success_events'
    | 'connected_expiration_events'
    | 'subscription_checkout_operations'
    | 'direct_payment_operations'
    | 'direct_settlement_tasks'
    | 'quick_stop_late_refunds';
  label: string;
  description: string;
  availability: BillingOperationsAvailability;
  metrics: BillingOperationsMetric[];
  oldestOpenAt: string | null;
  fixedErrorCodesSupported: boolean;
  fixedErrorCodes: BillingOperationsFixedCode[];
  fixedErrorCodesTruncated: boolean;
};

export type AdminBillingOperationsReport = {
  ledgers: BillingOperationsLedger[];
};

type DbError = { code?: string | null } | null;
type CountResult = { count: number | null; error: DbError };
type RowsResult = { data: unknown[] | null; error: DbError };
type CountedRowsResult = RowsResult & { count: number | null };

type LedgerIdentity = Pick<BillingOperationsLedger, 'id' | 'label' | 'description'>;

type EventLedgerSpec = LedgerIdentity & {
  eventScope: 'platform_subscription' | 'connected_payment';
  eventTypes?: readonly (
    | 'checkout.session.completed'
    | 'checkout.session.async_payment_succeeded'
    | 'checkout.session.expired'
  )[];
  includeExpirationEvidence?: boolean;
};

type OperationLedgerSpec = LedgerIdentity & {
  table: 'billing_subscription_checkout_operations' | 'billing_payment_operations';
  unresolvedStates: readonly ('claimed' | 'submitted' | 'checkout_created' | 'indeterminate')[];
};

type TaskLedgerSpec = LedgerIdentity & {
  table: 'quick_stop_payment_tasks';
  fixedErrorCodes: ReadonlySet<string>;
};

const EVENT_SPECS: EventLedgerSpec[] = [
  {
    id: 'subscription_events',
    label: 'Subscription inbox / projection',
    description: 'Platform-subscription receipts and their durable projection state.',
    eventScope: 'platform_subscription',
  },
  {
    id: 'connected_success_events',
    label: 'Connected-payment success',
    description: 'Connected-account direct-charge Checkout success receipts and payment projection state.',
    eventScope: 'connected_payment',
    // Async success is accepted by the inbox even though the current v1
    // projector handles completed Sessions. Keeping it in this view makes an
    // unsupported-but-received success visible as unresolved instead of
    // silently dropping it from operations readiness.
    eventTypes: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'],
  },
  {
    id: 'connected_expiration_events',
    label: 'Connected-payment expiration',
    description: 'Expired Checkout receipts, projection state, and immutable expiration evidence.',
    eventScope: 'connected_payment',
    eventTypes: ['checkout.session.expired'],
    includeExpirationEvidence: true,
  },
];

const OPERATION_SPECS: OperationLedgerSpec[] = [
  {
    id: 'subscription_checkout_operations',
    label: 'Subscription Checkout operations',
    description: 'Durable base-plan Checkout creation attempts that may need provider reconciliation.',
    table: 'billing_subscription_checkout_operations',
    unresolvedStates: ['claimed', 'submitted', 'checkout_created', 'indeterminate'],
  },
  {
    id: 'direct_payment_operations',
    label: 'Direct-payment operations',
    description: 'Durable direct-charge provider operations, including indeterminate submissions.',
    table: 'billing_payment_operations',
    unresolvedStates: ['claimed', 'submitted', 'indeterminate'],
  },
];

const DIRECT_SETTLEMENT_SPEC: LedgerIdentity = {
  id: 'direct_settlement_tasks',
  label: 'Direct settlement',
  description: 'Post-payment feed and SMS settlement work for direct charges.',
};

const TASK_SPECS: TaskLedgerSpec[] = [
  {
    id: 'quick_stop_late_refunds',
    label: 'Quick Stop late refunds',
    description: 'Destination-charge refunds queued after a Quick Stop payment arrived too late.',
    table: 'quick_stop_payment_tasks',
    fixedErrorCodes: QUICK_STOP_ERROR_CODES,
  },
];

function emptyLedger(identity: LedgerIdentity, availability: BillingOperationsAvailability): BillingOperationsLedger {
  const { id, label, description } = identity;
  return {
    id,
    label,
    description,
    availability,
    metrics: [],
    oldestOpenAt: null,
    fixedErrorCodesSupported: false,
    fixedErrorCodes: [],
    fixedErrorCodesTruncated: false,
  };
}

function isMissingSchemaError(error: DbError): boolean {
  return Boolean(error?.code && MISSING_SCHEMA_CODES.has(error.code));
}

function validCount(value: number | null): value is number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFailure(
  identity: LedgerIdentity,
  errors: DbError[],
  invalidResult = false,
): BillingOperationsLedger | null {
  const presentErrors = errors.filter((error): error is Exclude<DbError, null> => Boolean(error));
  // A ledger is "not installed" only when every database failure is explained
  // by absent schema. A concurrent auth/timeout failure must not disappear
  // behind one missing-column response from another metric query.
  if (presentErrors.length > 0 && presentErrors.every(isMissingSchemaError)) {
    return emptyLedger(identity, 'not_installed');
  }
  if (presentErrors.length > 0 || invalidResult) {
    // Log only a bounded database code and the fixed internal ledger name. Raw
    // database messages can contain row values and never belong in this admin
    // summary or its server logs.
    const codes = [...new Set(errors.map((error) => error?.code).filter((code): code is string => Boolean(code)))].slice(0, 5);
    console.error('Admin billing operations read unavailable', { ledger: identity.id, codes });
    return emptyLedger(identity, 'unavailable');
  }
  return null;
}

function timestampFromFirstRow(result: RowsResult, field: string): string | null | undefined {
  if (!result.data?.length) return null;
  if (!isUnknownRecord(result.data[0])) return undefined;
  const value = result.data[0][field];
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function validOldest(count: number, timestamp: string | null | undefined): timestamp is string | null {
  if (timestamp === undefined) return false;
  return count === 0 ? timestamp === null : timestamp !== null;
}

export function summarizeBillingOperationsFixedCodes(
  rows: unknown[] | null,
  deadLetterCount: number,
  allowedCodes: ReadonlySet<string> = QUICK_STOP_ERROR_CODES,
): { codes: BillingOperationsFixedCode[]; truncated: boolean } {
  const counts = new Map<string, number>();
  let sampled = 0;
  for (const rawRow of rows ?? []) {
    sampled += 1;
    const rawCode = isUnknownRecord(rawRow) ? rawRow.last_error_code : undefined;
    const code = typeof rawCode === 'string' && allowedCodes.has(rawCode)
      ? rawCode
      : UNRECOGNIZED_ERROR_CODE;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return {
    codes: [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    truncated: deadLetterCount > sampled,
  };
}

function eventQuery(
  admin: SupabaseClient,
  columns: string,
  options: { count?: 'exact'; head?: boolean },
  spec: EventLedgerSpec,
) {
  let query = admin.from('billing_events').select(columns, options).eq('event_scope', spec.eventScope);
  if (spec.eventTypes?.length === 1) query = query.eq('event_type', spec.eventTypes[0]);
  if (spec.eventTypes && spec.eventTypes.length > 1) query = query.in('event_type', [...spec.eventTypes]);
  return query;
}

async function readEventLedger(admin: SupabaseClient, spec: EventLedgerSpec): Promise<BillingOperationsLedger> {
  // This is both the exact total and the schema probe. Selecting every field
  // used below prevents a partially applied projection migration from looking
  // installed merely because the original inbox table exists.
  const total = await eventQuery(
    admin,
    'event_scope, event_type, processing_status, next_attempt_at, received_at, projection_schema_version, projection_applied',
    { count: 'exact', head: true },
    spec,
  ) as CountResult;

  const probeFailure = readFailure(spec, [total.error], !validCount(total.count));
  if (probeFailure) return probeFailure;

  let evidenceTotal: CountResult | null = null;
  if (spec.includeExpirationEvidence) {
    evidenceTotal = await admin
      .from('stripe_connected_checkout_expirations')
      .select('recorded_at', { count: 'exact', head: true }) as CountResult;
    const evidenceFailure = readFailure(spec, [evidenceTotal.error], !validCount(evidenceTotal.count));
    if (evidenceFailure) return evidenceFailure;
  }

  const [unresolved, applied, deadLetter] = await Promise.all([
    // A limited data response can still ask PostgREST for the exact count. One
    // request therefore supplies both the backlog size and its oldest age.
    eventQuery(admin, 'received_at', { count: 'exact' }, spec)
      .in('processing_status', ['received', 'processing', 'failed'])
      .order('received_at', { ascending: true })
      .limit(1) as unknown as PromiseLike<CountedRowsResult>,
    eventQuery(admin, 'projection_applied', { count: 'exact', head: true }, spec)
      .eq('projection_applied', true) as unknown as PromiseLike<CountResult>,
    eventQuery(admin, 'processing_status, next_attempt_at', { count: 'exact', head: true }, spec)
      .eq('processing_status', 'failed')
      .is('next_attempt_at', null) as unknown as PromiseLike<CountResult>,
  ]);

  const errors = [unresolved.error, applied.error, deadLetter.error];
  const oldestOpenAt = timestampFromFirstRow(unresolved, 'received_at');
  const invalid = !validCount(unresolved.count)
    || !validCount(applied.count)
    || !validCount(deadLetter.count)
    || (validCount(unresolved.count) && !validOldest(unresolved.count, oldestOpenAt))
    || (validCount(unresolved.count) && unresolved.count > (total.count as number))
    || (validCount(applied.count) && applied.count > (total.count as number))
    || (validCount(deadLetter.count) && validCount(unresolved.count) && deadLetter.count > unresolved.count);
  const failure = readFailure(spec, errors, invalid);
  if (failure) return failure;

  const metrics: BillingOperationsMetric[] = [
    { code: 'total', label: 'Receipts', count: total.count as number },
    { code: 'unresolved', label: 'Unresolved', count: unresolved.count as number },
    { code: 'applied', label: 'Applied', count: applied.count as number },
    { code: 'dead_letter', label: 'Terminal failures', count: deadLetter.count as number },
  ];
  if (evidenceTotal) {
    metrics.push({ code: 'evidence', label: 'Expiration evidence', count: evidenceTotal.count as number });
  }

  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    availability: 'installed',
    metrics,
    oldestOpenAt: oldestOpenAt ?? null,
    fixedErrorCodesSupported: false,
    fixedErrorCodes: [],
    fixedErrorCodesTruncated: false,
  };
}

async function readOperationLedger(admin: SupabaseClient, spec: OperationLedgerSpec): Promise<BillingOperationsLedger> {
  const total = await admin
    .from(spec.table)
    .select('state, updated_at', { count: 'exact', head: true }) as CountResult;
  const probeFailure = readFailure(spec, [total.error], !validCount(total.count));
  if (probeFailure) return probeFailure;

  const [unresolved, indeterminate] = await Promise.all([
    admin.from(spec.table).select('updated_at', { count: 'exact' })
      .in('state', [...spec.unresolvedStates])
      .order('updated_at', { ascending: true })
      .limit(1) as unknown as PromiseLike<CountedRowsResult>,
    admin.from(spec.table).select('state', { count: 'exact', head: true })
      .eq('state', 'indeterminate') as unknown as PromiseLike<CountResult>,
  ]);

  const oldestOpenAt = timestampFromFirstRow(unresolved, 'updated_at');
  const invalid = !validCount(unresolved.count)
    || !validCount(indeterminate.count)
    || (validCount(unresolved.count) && !validOldest(unresolved.count, oldestOpenAt))
    || (validCount(unresolved.count) && unresolved.count > (total.count as number))
    || (validCount(indeterminate.count) && validCount(unresolved.count) && indeterminate.count > unresolved.count);
  const failure = readFailure(spec, [unresolved.error, indeterminate.error], invalid);
  if (failure) return failure;

  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    availability: 'installed',
    metrics: [
      { code: 'total', label: 'Operations', count: total.count as number },
      { code: 'unresolved', label: 'Unresolved', count: unresolved.count as number },
      { code: 'indeterminate', label: 'Indeterminate', count: indeterminate.count as number },
    ],
    oldestOpenAt: oldestOpenAt ?? null,
    fixedErrorCodesSupported: false,
    fixedErrorCodes: [],
    fixedErrorCodesTruncated: false,
  };
}

async function readTaskLedger(admin: SupabaseClient, spec: TaskLedgerSpec): Promise<BillingOperationsLedger> {
  const total = await admin
    .from(spec.table)
    .select('task_state, created_at, dead_lettered_at, last_error_code', { count: 'exact', head: true }) as CountResult;
  const probeFailure = readFailure(spec, [total.error], !validCount(total.count));
  if (probeFailure) return probeFailure;

  const openQuery = admin.from(spec.table).select('created_at', { count: 'exact' })
    .in('task_state', ['ready', 'leased', 'retry_wait'])
    .order('created_at', { ascending: true })
    .limit(1);
  const fixedCodesQuery = admin.from(spec.table).select('last_error_code, dead_lettered_at', { count: 'exact' })
    .eq('task_state', 'dead_letter')
    .order('dead_lettered_at', { ascending: false })
    .limit(CODE_SAMPLE_LIMIT);
  const [open, fixedCodes] = await Promise.all([
    openQuery as unknown as PromiseLike<CountedRowsResult>,
    fixedCodesQuery as unknown as PromiseLike<CountedRowsResult>,
  ]);

  const oldestOpenAt = timestampFromFirstRow(open, 'created_at');
  const invalid = !validCount(open.count)
    || !validCount(fixedCodes.count)
    || (validCount(open.count) && !validOldest(open.count, oldestOpenAt))
    || (validCount(open.count) && open.count > (total.count as number))
    || (validCount(fixedCodes.count) && fixedCodes.count > (total.count as number))
    || !Array.isArray(fixedCodes.data)
    || (Array.isArray(fixedCodes.data) && validCount(fixedCodes.count) && (
      fixedCodes.data.length > CODE_SAMPLE_LIMIT
      || fixedCodes.data.length > fixedCodes.count
    ));
  const failure = readFailure(
    spec,
    [open.error, fixedCodes.error],
    invalid,
  );
  if (failure) return failure;

  const completedCount = (total.count as number) - (open.count as number) - (fixedCodes.count as number);
  const completedFailure = readFailure(spec, [], !validCount(completedCount));
  if (completedFailure) return completedFailure;

  const summary = summarizeBillingOperationsFixedCodes(
    fixedCodes.data,
    fixedCodes.count as number,
    spec.fixedErrorCodes,
  );
  const metrics: BillingOperationsMetric[] = [
    { code: 'total', label: 'Tasks', count: total.count as number },
    { code: 'unresolved', label: 'Open', count: open.count as number },
    { code: 'completed', label: 'Completed', count: completedCount },
    { code: 'dead_letter', label: 'Dead letter', count: fixedCodes.count as number },
  ];
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    availability: 'installed',
    metrics,
    oldestOpenAt: oldestOpenAt ?? null,
    fixedErrorCodesSupported: true,
    fixedErrorCodes: summary.codes,
    fixedErrorCodesTruncated: summary.truncated,
  };
}

type DirectSettlementSummaryRow = {
  total_count: unknown;
  open_count: unknown;
  completed_count: unknown;
  dead_letter_count: unknown;
  sms_indeterminate_count: unknown;
  oldest_open_at: unknown;
  fixed_error_code: unknown;
  fixed_error_code_count: unknown;
  fixed_error_codes_truncated: unknown;
};

function rpcCount(value: unknown): number | null {
  if (typeof value === 'number') return validCount(value) ? value : null;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return validCount(parsed) ? parsed : null;
}

async function readDirectSettlementLedger(admin: SupabaseClient): Promise<BillingOperationsLedger> {
  const result = await admin.rpc(DIRECT_SETTLEMENT_SUMMARY_RPC) as unknown as RowsResult;
  if (result.error) {
    return readFailure(DIRECT_SETTLEMENT_SPEC, [result.error])
      ?? emptyLedger(DIRECT_SETTLEMENT_SPEC, 'unavailable');
  }
  if (
    !Array.isArray(result.data)
    || result.data.length < 1
    || result.data.length > DIRECT_SETTLEMENT_ERROR_CODES.size
    || !result.data.every(isUnknownRecord)
  ) {
    return readFailure(DIRECT_SETTLEMENT_SPEC, [], true)
      ?? emptyLedger(DIRECT_SETTLEMENT_SPEC, 'unavailable');
  }

  const rows = result.data as DirectSettlementSummaryRow[];
  const first = rows[0];
  const total = rpcCount(first.total_count);
  const open = rpcCount(first.open_count);
  const completed = rpcCount(first.completed_count);
  const deadLetter = rpcCount(first.dead_letter_count);
  const smsIndeterminate = rpcCount(first.sms_indeterminate_count);
  const oldestOpenAt = first.oldest_open_at === null
    ? null
    : typeof first.oldest_open_at === 'string' && Number.isFinite(Date.parse(first.oldest_open_at))
      ? first.oldest_open_at
      : undefined;
  const truncated = first.fixed_error_codes_truncated;

  const repeatedFields = [
    'total_count',
    'open_count',
    'completed_count',
    'dead_letter_count',
    'sms_indeterminate_count',
    'oldest_open_at',
    'fixed_error_codes_truncated',
  ] as const;
  const repeated = rows.every((row) => repeatedFields.every((field) => row[field] === first[field]));
  const fixedErrorCodes: BillingOperationsFixedCode[] = [];
  const seenCodes = new Set<string>();
  let fixedCodeTotal = 0;
  let codesValid = true;

  for (const row of rows) {
    const code = row.fixed_error_code;
    const count = rpcCount(row.fixed_error_code_count);
    if (typeof code !== 'string' || !DIRECT_SETTLEMENT_ERROR_CODES.has(code) || seenCodes.has(code) || count === null || count < 1) {
      codesValid = false;
      continue;
    }
    seenCodes.add(code);
    fixedCodeTotal += count;
    fixedErrorCodes.push({ code, count });
  }

  const emptyCodesValid = deadLetter === 0
    && rows.length === 1
    && first.fixed_error_code === null
    && rpcCount(first.fixed_error_code_count) === 0;
  if (emptyCodesValid) {
    codesValid = true;
    fixedErrorCodes.length = 0;
    fixedCodeTotal = 0;
  }

  const invalid = total === null
    || open === null
    || completed === null
    || deadLetter === null
    || smsIndeterminate === null
    || truncated !== false
    || !repeated
    || !validOldest(open ?? -1, oldestOpenAt)
    || total !== open + completed + deadLetter
    || smsIndeterminate > deadLetter
    || !codesValid
    || fixedCodeTotal !== deadLetter
    || fixedErrorCodes.length !== (deadLetter === 0 ? 0 : rows.length);
  const failure = readFailure(DIRECT_SETTLEMENT_SPEC, [], invalid);
  if (failure) return failure;

  const totalCount = total as number;
  const openCount = open as number;
  const completedCount = completed as number;
  const deadLetterCount = deadLetter as number;
  const smsIndeterminateCount = smsIndeterminate as number;
  fixedErrorCodes.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return {
    ...DIRECT_SETTLEMENT_SPEC,
    availability: 'installed',
    metrics: [
      { code: 'total', label: 'Tasks', count: totalCount },
      { code: 'unresolved', label: 'Open', count: openCount },
      { code: 'completed', label: 'Completed', count: completedCount },
      { code: 'dead_letter', label: 'Dead letter', count: deadLetterCount },
      { code: 'indeterminate', label: 'SMS indeterminate', count: smsIndeterminateCount },
    ],
    oldestOpenAt: oldestOpenAt ?? null,
    fixedErrorCodesSupported: true,
    fixedErrorCodes,
    fixedErrorCodesTruncated: false,
  };
}

/**
 * Read-only, platform-wide health for the dark billing ledgers.
 *
 * The service-role client is intentionally supplied by requireAdmin(). This
 * module uses one fixed, read-only aggregate RPC for the table that deliberately
 * denies service-role SELECT. It exposes no record identifiers, provider
 * payloads, customer data, mutation controls, or worker activation path.
 */
export async function loadAdminBillingOperations(admin: SupabaseClient): Promise<AdminBillingOperationsReport> {
  const ledgers = await Promise.all([
    ...EVENT_SPECS.map((spec) => readEventLedger(admin, spec)),
    ...OPERATION_SPECS.map((spec) => readOperationLedger(admin, spec)),
    readDirectSettlementLedger(admin),
    ...TASK_SPECS.map((spec) => readTaskLedger(admin, spec)),
  ]);
  return { ledgers };
}
