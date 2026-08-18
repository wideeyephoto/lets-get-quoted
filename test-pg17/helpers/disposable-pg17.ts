import { Client } from 'pg';

const DATABASE_URL_VARIABLE = 'LGQ_PG17_DATABASE_URL';
const DESTRUCTIVE_SENTINEL_VARIABLE = 'LGQ_PG17_DESTRUCTIVE_TEST';
const DESTRUCTIVE_SENTINEL = '1';
const DATABASE_NAME_PATTERN = /^lgq_payment_preview_[a-z0-9_]+$/;
const DATABASE_COMMENT_MARKER = 'lgq-disposable-payment-race';
const REFUSED_PROJECT_REFS = [
  'uydlabvgauzujdwuqzxq',
  'mfuvvtrkipkigwqqtcal',
] as const;
const REFUSED_POOLER_PORT = 6543;

const APPLICATION_NAMES = Object.freeze({
  control: 'lgq-pg17-late-success-control',
  a: 'lgq-pg17-late-success-a',
  b: 'lgq-pg17-late-success-b',
});

// Connector-applied staging histories use connector-assigned versions and a
// dated name suffix, while a disposable database built directly from this repo
// normally uses the filename version and bare name. Match names, not unstable
// versions, and accept only those two known spellings.
const REQUIRED_MIGRATION_NAMES = Object.freeze([
  ['direct_checkout_operation_orchestration', 'direct_checkout_operation_orchestration_20260815'],
  ['one_off_direct_payment_preparation', 'one_off_direct_payment_preparation_20260816'],
  ['stripe_connected_payment_event_projection', 'stripe_connected_payment_event_projection_20260816'],
  ['direct_payment_settlement_foundation', 'direct_payment_settlement_foundation_20260816'],
  ['direct_payment_settlement_sms_inbox_mirror', 'direct_payment_settlement_sms_inbox_mirror_20260816'],
  ['stripe_connected_payment_projection_worker', 'stripe_connected_payment_projection_worker_20260816'],
  ['stripe_connected_checkout_expiration_projection', 'stripe_connected_checkout_expiration_projection_20260816'],
  ['direct_checkout_generation_recovery', 'direct_checkout_generation_recovery_20260816'],
  ['direct_checkout_late_success_reconciliation', 'direct_checkout_late_success_reconciliation_20260816'],
  ['direct_checkout_late_success_operator_resolution', 'direct_checkout_late_success_operator_resolution_20260816'],
] as const);

const REQUIRED_REGPROCEDURES = Object.freeze([
  'public.plan_direct_checkout_late_success_operator_resolution(uuid,uuid,uuid,text)',
  'public.settle_direct_checkout_late_success_task(uuid,uuid,uuid,text,text,text,text,uuid)',
  'public.record_direct_checkout_late_success_manual_disposition(uuid,uuid,uuid,text,text,text,text,text,uuid)',
] as const);

type ClientRole = keyof typeof APPLICATION_NAMES;
type SqlRow = Record<string, unknown>;

export type DisposablePg17Clients = Readonly<{
  control: Client;
  a: Client;
  b: Client;
  databaseName: string;
}>;

function fail(message: string): never {
  throw new Error(`Disposable PG17 safety check failed: ${message}`);
}

function parseTargetFromApprovedEnvironment(): Readonly<{
  baseUrl: URL;
  databaseName: string;
}> {
  // Do not enumerate or spread process.env. These are intentionally the only
  // two environment variables this harness reads.
  const destructiveSentinel = process.env.LGQ_PG17_DESTRUCTIVE_TEST;
  const rawDatabaseUrl = process.env.LGQ_PG17_DATABASE_URL;

  if (destructiveSentinel !== DESTRUCTIVE_SENTINEL) {
    fail(`${DESTRUCTIVE_SENTINEL_VARIABLE} must equal ${DESTRUCTIVE_SENTINEL}`);
  }
  if (!rawDatabaseUrl) {
    fail(`${DATABASE_URL_VARIABLE} is required`);
  }

  const loweredTarget = rawDatabaseUrl.toLowerCase();
  if (REFUSED_PROJECT_REFS.some((projectRef) => loweredTarget.includes(projectRef))) {
    fail('known staging and production project references are forbidden');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawDatabaseUrl);
  } catch {
    fail(`${DATABASE_URL_VARIABLE} must be a valid PostgreSQL URL`);
  }
  if (baseUrl.protocol !== 'postgres:' && baseUrl.protocol !== 'postgresql:') {
    fail(`${DATABASE_URL_VARIABLE} must use postgres:// or postgresql://`);
  }
  if (!baseUrl.hostname) {
    fail('the PostgreSQL host is missing');
  }

  const configuredPort = baseUrl.port ? Number(baseUrl.port) : 5432;
  if (!Number.isSafeInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
    fail('the configured PostgreSQL port is invalid');
  }
  if (configuredPort === REFUSED_POOLER_PORT) {
    fail('the Supabase transaction-pooler port is forbidden');
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(baseUrl.pathname.replace(/^\//, ''));
  } catch {
    fail('the database name is invalid');
  }
  // Supabase branches normally expose the database name `postgres`, so they
  // are intentionally incompatible with this standalone disposable-target
  // sentinel. Do not weaken this check to point the destructive harness at a
  // shared branch.
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    fail('the database name must use the lgq_payment_preview_ prefix');
  }

  return Object.freeze({ baseUrl, databaseName });
}

function connectionStringFor(baseUrl: URL, role: ClientRole): string {
  const url = new URL(baseUrl.toString());
  url.searchParams.set('application_name', APPLICATION_NAMES[role]);
  url.searchParams.set('connect_timeout', '5');
  return url.toString();
}

function makeClient(baseUrl: URL, role: ClientRole): Client {
  return new Client({
    connectionString: connectionStringFor(baseUrl, role),
    ssl: baseUrl.searchParams.get('sslmode') === 'disable'
      ? false
      : undefined,
  });
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) fail(`${label} is missing`);
  return value;
}

function asInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?[0-9]+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed)) fail(`${label} is not an integer`);
  return parsed;
}

async function one(client: Client, sql: string, values: unknown[] = []): Promise<SqlRow> {
  const result = await client.query(sql, values);
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    fail('a safety query did not return exactly one row');
  }
  return result.rows[0];
}

async function configureSession(client: Client): Promise<void> {
  await client.query("select pg_catalog.set_config('statement_timeout', '15000', false)");
  await client.query("select pg_catalog.set_config('lock_timeout', '5000', false)");
  await client.query(
    "select pg_catalog.set_config('idle_in_transaction_session_timeout', '15000', false)",
  );
}

async function assertSessionIdentity(client: Client, role: ClientRole): Promise<void> {
  const row = await one(
    client,
    `select
       pg_catalog.current_setting('application_name') as application_name,
       pg_catalog.pg_backend_pid() as backend_pid`,
  );
  if (row.application_name !== APPLICATION_NAMES[role]) {
    fail(`the ${role} connection application_name is not deterministic`);
  }
  if (asInteger(row.backend_pid, `${role} backend PID`) <= 0) {
    fail(`the ${role} backend PID is invalid`);
  }
}

async function assertServerIdentity(
  client: Client,
  expectedDatabaseName: string,
): Promise<void> {
  // `current_user` is unqualified on purpose. It is SQL grammar, not a function,
  // so `pg_catalog.current_user` parses as a column reference and the whole
  // query fails 42P01 "missing FROM-clause entry for table pg_catalog" -- which
  // meant this helper could never open a connection, and every test behind it
  // was unreachable rather than failing. Same trap as coalesce and nullif.
  // `current_database()` and `current_setting()` ARE real functions and stay
  // qualified.
  const row = await one(
    client,
    `select
       pg_catalog.current_setting('server_version_num')::integer as server_version_num,
       pg_catalog.current_database() as database_name,
       pg_catalog.inet_server_port() as server_port,
       pg_catalog.shobj_description(d.oid, 'pg_database') as database_comment,
       r.rolsuper as is_superuser
     from pg_catalog.pg_database d
     join pg_catalog.pg_roles r on r.rolname = current_user
     where d.datname = pg_catalog.current_database()`,
  );

  const versionNumber = asInteger(row.server_version_num, 'server version');
  if (versionNumber < 170_000 || versionNumber >= 180_000) {
    fail('the live server is not PostgreSQL 17');
  }
  const liveDatabaseName = asString(row.database_name, 'live database name');
  if (
    liveDatabaseName !== expectedDatabaseName
    || !DATABASE_NAME_PATTERN.test(liveDatabaseName)
  ) {
    fail('the live database identity does not match the guarded URL');
  }
  const liveServerPort = asInteger(row.server_port, 'live server port');
  if (liveServerPort < 1 || liveServerPort > 65_535) {
    fail('the live server port is invalid');
  }
  if (liveServerPort === REFUSED_POOLER_PORT) {
    fail('the live server is using the forbidden transaction-pooler port');
  }
  if (row.database_comment !== DATABASE_COMMENT_MARKER) {
    fail(`the database comment must equal ${DATABASE_COMMENT_MARKER}`);
  }
  if (row.is_superuser !== true) {
    fail('the disposable fixture connection must be a PostgreSQL superuser');
  }
}

async function assertMigrationHistory(client: Client): Promise<void> {
  const historyRow = await one(
    client,
    `select pg_catalog.to_regclass(
       'supabase_migrations.schema_migrations'
     )::text as history_table`,
  );
  if (historyRow.history_table !== 'supabase_migrations.schema_migrations') {
    fail('Supabase migration history is missing');
  }

  const result = await client.query(
    `select name::text as name
       from supabase_migrations.schema_migrations`,
  );
  const installedNames = new Set(result.rows.map((row) => String(row.name)));
  for (const acceptedNames of REQUIRED_MIGRATION_NAMES) {
    if (!acceptedNames.some((name) => installedNames.has(name))) {
      fail(`required migration ${acceptedNames[0]} is missing`);
    }
  }

  const procedureRows = await client.query(
    `select signature,
            pg_catalog.to_regprocedure(signature)::text as installed
       from pg_catalog.unnest($1::text[]) as signature`,
    [[...REQUIRED_REGPROCEDURES]],
  );
  if (
    procedureRows.rowCount !== REQUIRED_REGPROCEDURES.length
    || procedureRows.rows.some((row) => row.installed == null)
  ) {
    fail('one or more operator-resolution RPC signatures are missing');
  }
}

async function assertFreshDisposableDatabase(client: Client): Promise<void> {
  const result = await client.query(
    `select relation_name, row_count
       from (
         select 'auth.users'::text as relation_name,
                pg_catalog.count(*)::text as row_count from auth.users
         union all
         select 'public.accounts', pg_catalog.count(*)::text
           from public.accounts
         union all
         select 'public.jobs', pg_catalog.count(*)::text from public.jobs
         union all
         select 'public.invoices', pg_catalog.count(*)::text
           from public.invoices
         union all
         select 'public.invoice_items', pg_catalog.count(*)::text
           from public.invoice_items
         union all
         select 'public.payments', pg_catalog.count(*)::text
           from public.payments
         union all
         select 'public.workspace_entitlements', pg_catalog.count(*)::text
           from public.workspace_entitlements
         union all
         select 'public.usage_credit_lots', pg_catalog.count(*)::text
           from public.usage_credit_lots
         union all
         select 'public.usage_reservations', pg_catalog.count(*)::text
           from public.usage_reservations
         union all
         select 'public.usage_reservation_allocations', pg_catalog.count(*)::text
           from public.usage_reservation_allocations
         union all
         select 'public.billing_events', pg_catalog.count(*)::text
           from public.billing_events
         union all
         select 'public.billing_payment_operations', pg_catalog.count(*)::text
           from public.billing_payment_operations
         union all
         select 'public.stripe_connected_checkout_expirations',
                pg_catalog.count(*)::text
           from public.stripe_connected_checkout_expirations
         union all
         select 'public.billing_direct_checkout_late_success_tasks',
                pg_catalog.count(*)::text
           from public.billing_direct_checkout_late_success_tasks
         union all
         select 'public.billing_direct_checkout_late_success_resolutions',
                pg_catalog.count(*)::text
           from public.billing_direct_checkout_late_success_resolutions
         union all
         select 'public.billing_direct_payment_settlement_tasks',
                pg_catalog.count(*)::text
           from public.billing_direct_payment_settlement_tasks
         union all
         select 'public.billing_direct_payment_settlement_attempts',
                pg_catalog.count(*)::text
           from public.billing_direct_payment_settlement_attempts
         union all
         select 'public.billing_direct_refund_authorizations',
                pg_catalog.count(*)::text
           from public.billing_direct_refund_authorizations
         union all
         select 'public.billing_direct_refund_operations',
                pg_catalog.count(*)::text
           from public.billing_direct_refund_operations
       ) guarded_relations
      where row_count <> '0'
      order by relation_name`,
  );
  if (result.rowCount !== 0) {
    const populated = result.rows.map((row) => String(row.relation_name)).join(', ');
    fail(
      `the one-shot database is not fresh; guarded relations contain rows: ${populated}`,
    );
  }
}

export async function openDisposablePg17Clients(): Promise<DisposablePg17Clients> {
  // All URL/sentinel checks run before Client construction and before any
  // socket can be opened.
  const target = parseTargetFromApprovedEnvironment();
  const clients = {
    control: makeClient(target.baseUrl, 'control'),
    a: makeClient(target.baseUrl, 'a'),
    b: makeClient(target.baseUrl, 'b'),
  };
  const connected: Client[] = [];
  try {
    for (const role of ['control', 'a', 'b'] as const) {
      const client = clients[role];
      await client.connect();
      connected.push(client);
      await configureSession(client);
      await assertSessionIdentity(client, role);
    }
    await assertServerIdentity(clients.control, target.databaseName);
    await assertMigrationHistory(clients.control);
    await assertFreshDisposableDatabase(clients.control);
    process.stderr.write(
      `Disposable PG17 one-shot target ${target.databaseName} passed its empty-ledger guard. `
        + 'Destroy this database after the race run; committed append-only fixtures are not cleaned.\n',
    );
    return Object.freeze({ ...clients, databaseName: target.databaseName });
  } catch (error) {
    await Promise.allSettled(connected.map((client) => client.end()));
    throw error;
  }
}

export async function closeDisposablePg17Clients(
  clients: DisposablePg17Clients | undefined,
): Promise<void> {
  if (!clients) return;
  await Promise.allSettled([
    clients.control.end(),
    clients.a.end(),
    clients.b.end(),
  ]);
}

export async function rollbackIfOpen(client: Client): Promise<void> {
  try {
    await client.query('rollback');
  } catch {
    // A connection can already have been closed by a bounded timeout. Cleanup
    // is best effort; the original test failure remains authoritative.
  }
}

export async function waitForApplicationLock(
  control: Client,
  applicationName: (typeof APPLICATION_NAMES)['a' | 'b'],
  timeoutMs = 5_000,
): Promise<Readonly<{ waitEvent: string; query: string }>> {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await control.query(
      `select wait_event, query
         from pg_catalog.pg_stat_activity
        where datname = pg_catalog.current_database()
          and application_name = $1
          and state = 'active'
          and wait_event_type = 'Lock'`,
      [applicationName],
    );
    if (result.rowCount === 1) {
      return Object.freeze({
        waitEvent: asString(result.rows[0].wait_event, 'lock wait event'),
        query: asString(result.rows[0].query, 'blocked query'),
      });
    }
    if (result.rowCount !== 0) {
      fail(`multiple active ${applicationName} lock waiters were observed`);
    }
    // Intentionally no sleep and no pg_sleep: each pg_stat_activity statement
    // is a fresh snapshot, and the wall-clock deadline bounds the spin.
  } while (Date.now() < deadline);

  fail(`${applicationName} did not enter a PostgreSQL lock wait`);
}

export const disposablePg17ApplicationNames = APPLICATION_NAMES;
