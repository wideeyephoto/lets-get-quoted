-- Let the top-up purchase ledger record the four voice SKUs.
--
-- WHY. `billing_top_up_purchase_operations` binds every top-up id to its
-- published price in a CHECK, deliberately, so a row cannot record an amount the
-- catalog does not carry — changing a customer-visible price is meant to be a
-- migration. Four SKUs were added to the catalog today, and the constraint still
-- lists eight. A purchase of any of the four would be refused at insert, the
-- action would fail, and the contractor would see a checkout that does not work.
--
-- This is the same shape as 20260818170000, which exists because a table's
-- allowlist was widened and its RPC's dispatch was not. Here it is the reverse
-- half: the CATALOG widened and the table did not. `test/top-up-purchase-
-- operations-migration.test.ts` reads every entry in TOP_UPS and asserts the
-- constraint carries its exact price, which is what caught this — before a
-- database saw it, rather than after a contractor did.
--
-- WHY THREE VOICE ADD-ON SKUS AND NOT ONE. The published price differs by plan:
-- $69 Flex, $59 Solo, $55 Growth. This constraint binds one amount per top-up
-- id, so a single `ai_voice` entry would have been unsatisfiable for two plans
-- out of three. Scale is absent because it includes voice in its base plan.
--
-- Nothing may be SOLD as a result of this. All four are in TOP_UPS_WITHHELD, so
-- `SELLABLE_TOP_UP_IDS` excludes them and no checkout can be started. This
-- migration only makes the ledger able to describe a purchase that the
-- application still refuses to begin.
--
-- Additive: two CHECK constraints widened, no rows touched, every previously
-- legal row still legal.

begin;

alter table public.billing_top_up_purchase_operations
  drop constraint if exists billing_top_up_purchase_operations_top_up_id_check;

alter table public.billing_top_up_purchase_operations
  drop constraint if exists billing_top_up_purchase_catalog_binding_check;

alter table public.billing_top_up_purchase_operations
  add constraint billing_top_up_purchase_operations_top_up_id_check
  check (top_up_id in (
    'flex_text_250',
    'text_1000',
    'marketing_email_5000',
    'ai_intake_100',
    'ai_writing_250',
    'storage_100gb',
    'office_user',
    'crew_user',
    'ai_voice_flex',
    'ai_voice_solo',
    'ai_voice_growth',
    'voice_minutes_100'
  ));

alter table public.billing_top_up_purchase_operations
  add constraint billing_top_up_purchase_catalog_binding_check
  check (
    (top_up_id = 'flex_text_250' and resource_code = 'text_segments' and units = 250 and unit_amount_cents = 1200)
    or (top_up_id = 'text_1000' and resource_code = 'text_segments' and units = 1000 and unit_amount_cents = 4200)
    or (top_up_id = 'marketing_email_5000' and resource_code = 'marketing_email_sends' and units = 5000 and unit_amount_cents = 1700)
    or (top_up_id = 'ai_intake_100' and resource_code = 'ai_intake_threads' and units = 100 and unit_amount_cents = 1500)
    or (top_up_id = 'ai_writing_250' and resource_code = 'ai_writing_drafts' and units = 250 and unit_amount_cents = 1900)
    or (top_up_id = 'storage_100gb' and resource_code = 'storage_gb' and units = 100 and unit_amount_cents = 1500)
    or (top_up_id = 'office_user' and resource_code = 'office_users' and units = 1 and unit_amount_cents = 1500)
    or (top_up_id = 'crew_user' and resource_code = 'crew_users' and units = 1 and unit_amount_cents = 500)
    -- $69 / $59 / $55, and Growth's allowance is 200 minutes rather than 100.
    or (top_up_id = 'ai_voice_flex' and resource_code = 'voice_minutes' and units = 100 and unit_amount_cents = 6900)
    or (top_up_id = 'ai_voice_solo' and resource_code = 'voice_minutes' and units = 100 and unit_amount_cents = 5900)
    or (top_up_id = 'ai_voice_growth' and resource_code = 'voice_minutes' and units = 200 and unit_amount_cents = 5500)
    or (top_up_id = 'voice_minutes_100' and resource_code = 'voice_minutes' and units = 100 and unit_amount_cents = 3500)
  );

do $$
declare
  v_definition text;
  v_sku text;
begin
  select pg_catalog.pg_get_constraintdef(oid) into v_definition
  from pg_catalog.pg_constraint
  where conname = 'billing_top_up_purchase_catalog_binding_check';

  if v_definition is null then
    raise exception 'the catalog binding constraint was not recreated';
  end if;

  -- Every SKU the application knows about must be describable here. Naming them
  -- one by one rather than counting: a count passes if two were swapped.
  foreach v_sku in array array[
    'flex_text_250', 'text_1000', 'marketing_email_5000', 'ai_intake_100',
    'ai_writing_250', 'storage_100gb', 'office_user', 'crew_user',
    'ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth', 'voice_minutes_100'
  ] loop
    if pg_catalog.strpos(v_definition, v_sku) = 0 then
      raise exception 'the catalog binding constraint does not carry %', v_sku;
    end if;
  end loop;

  -- And the allowlist must agree with it. These two drifting apart is exactly
  -- the failure this migration is fixing, so it must not ship having created a
  -- fresh instance of it.
  select pg_catalog.pg_get_constraintdef(oid) into v_definition
  from pg_catalog.pg_constraint
  where conname = 'billing_top_up_purchase_operations_top_up_id_check';

  if v_definition is null or pg_catalog.strpos(v_definition, 'voice_minutes_100') = 0 then
    raise exception 'the top_up_id allowlist does not carry the voice SKUs';
  end if;
end $$;

commit;
