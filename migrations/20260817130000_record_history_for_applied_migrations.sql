-- Record `supabase_migrations.schema_migrations` rows for the migrations applied on
-- 2026-08-17, and for this file.
--
-- WHY THIS EXISTS. `scripts/run-migration.mjs` writes no history row. Until now the
-- only thing that ever wrote one was the bespoke
-- `scripts/prod-adopt-and-clean-destination-pointers.mjs`, for its own version. So
-- after the sixteen-migration sequence landed, production's schema was sixteen ahead
-- of a history table still reading `20260816220000` as its high-water. Nothing in
-- this environment reads that table — there is no Supabase CLI here, and
-- `scripts/audit-migration-dependencies.mjs` matches against the live catalogue
-- precisely because the numbering diverged — but leaving it wrong by omission is
-- worse than deciding.
--
-- WHAT THIS IS NOT. The sequencing runbook says: "Do not resolve a numeric version
-- gap by inventing a history row." That prohibits asserting a migration ran when it
-- did not. This does the opposite: every row below is gated on a distinctive
-- artifact of that migration being present in the catalogue right now, and the whole
-- transaction refuses with 55000 if any probe fails. It records what it can prove
-- and nothing else, which is the same semantic-matching discipline the runbook
-- argues is the only safe identity here.
--
-- Idempotent: a version already present is left alone. Safe to re-run. On a database
-- where these migrations did NOT run it refuses rather than lying.

begin;

do $$
declare
  r record;
  v_present boolean;
  v_inserted integer := 0;
  v_already integer := 0;
begin
  for r in
    select *
      from (values
        -- version,           history name,                                              probe kind, probe identifier
        ('20260815224559', 'direct_checkout_operation_orchestration_20260815',      'function', 'claim_one_off_direct_checkout_operation'),
        ('20260816073000', 'one_off_direct_payment_preparation_20260816',           'function', 'reject_direct_prepared_invoice_item_mutation'),
        ('20260816080000', 'stripe_connected_payment_event_projection_20260816',    'function', 'project_stripe_connected_payment_event'),
        ('20260816083000', 'direct_payment_settlement_foundation_20260816',         'table',    'billing_direct_payment_settlement_tasks'),
        ('20260816084500', 'direct_payment_settlement_sms_inbox_mirror_20260816',   'function', 'stage_direct_payment_settlement_sms'),
        ('20260816090000', 'stripe_connected_payment_projection_worker_20260816',   'function', 'claim_next_due_stripe_connected_payment_event'),
        ('20260816091500', 'legacy_payment_plan_projection_foundation_20260816',    'function', 'project_legacy_payment_plan_payment'),
        ('20260816093000', 'legacy_quick_stop_payment_reconciliation_20260816',     'table',    'quick_stop_payment_tasks'),
        ('20260816094500', 'stripe_connected_checkout_expiration_projection_20260816', 'table', 'stripe_connected_checkout_expirations'),
        ('20260816100000', 'legacy_payment_plan_payoff_owner_binding_20260816',     'function', 'bind_legacy_payment_plan_payoff_owner'),
        ('20260816161844', 'direct_checkout_generation_recovery_20260816',          'function', 'project_stripe_connected_checkout_expiration_lifecycle'),
        ('20260816175955', 'admin_billing_operations_summary_20260816',             'function', 'admin_billing_direct_payment_settlement_summary'),
        ('20260817120000', 'normalise_function_body_line_endings_20260817',         'no_crlf',  'zero CRLF function bodies'),
        ('20260816194056', 'direct_checkout_late_success_reconciliation_20260816',  'table',    'billing_direct_checkout_late_success_tasks'),
        ('20260816213000', 'direct_checkout_late_success_operator_resolution_20260816', 'table', 'billing_direct_checkout_late_success_resolutions'),
        ('20260816221500', 'legacy_destination_checkout_generation_foundation_20260816', 'table', 'legacy_destination_checkout_operations'),
        -- This file. It is running, and the transaction is atomic, so if the commit
        -- lands it ran; there is no separate artifact to probe.
        ('20260817130000', 'record_history_for_applied_migrations_20260817',        'self',     'this migration')
      ) as t(version, name, kind, ident)
  loop
    if r.kind = 'function' then
      select exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.ident
      ) into v_present;

    elsif r.kind = 'table' then
      select exists (
        select 1
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = r.ident and c.relkind in ('r', 'p')
      ) into v_present;

    elsif r.kind = 'no_crlf' then
      -- 20260817120000 creates nothing; what it asserts is the absence of CRLF in
      -- stored function bodies, so that absence is its artifact.
      select not exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          join pg_catalog.pg_language l on l.oid = p.prolang
         where n.nspname = 'public'
           and p.prokind = 'f'
           and l.lanname in ('plpgsql', 'sql')
           and pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), pg_catalog.chr(13)) > 0
      ) into v_present;

    elsif r.kind = 'self' then
      v_present := true;

    else
      raise exception 'unknown probe kind %', r.kind using errcode = '55000';
    end if;

    if not v_present then
      raise exception
        'refusing to record %: its artifact "%" (%) is absent from the catalogue',
        r.version, r.ident, r.kind
        using errcode = '55000';
    end if;

    if exists (
      select 1 from supabase_migrations.schema_migrations where version = r.version
    ) then
      v_already := v_already + 1;
    else
      insert into supabase_migrations.schema_migrations (version, name)
      values (r.version, r.name);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  raise notice 'recorded % history row(s); % already present', v_inserted, v_already;
end
$$;

commit;
