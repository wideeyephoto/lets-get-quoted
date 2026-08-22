-- An auto-reply for LGQ's own shared/dispatch numbers, and its audit trail.
--
-- WHY THIS EXISTS. The shared number sends account alerts to the contractor and
-- nothing else. Until now a reply to it produced total silence: a consented
-- owner's message was filed for review, and an unrecognised sender's message
-- went nowhere at all. Somebody texting a business number and receiving nothing
-- is worse than either a monitored inbox or an honest automated answer.
--
-- WHY IT IS NOT PART OF THE COMPLIANCE REPLY. record_sms_compliance_reply_result
-- binds its audit row to the receipt's disposition:
--
--     v_receipt.disposition is distinct from ('keyword_' || p_keyword) -> raise
--
-- A notice reply's disposition is `routed` or `shared_destination_unroutable`,
-- never `keyword_notice`. Widening that function to admit it would weaken the
-- one invariant that ties a compliance acknowledgement to the keyword that
-- earned it. STOP/START/HELP are carrier obligations; this is a courtesy. They
-- get separate machinery on purpose.
--
-- WHAT IS SHARED is the SHAPE, deliberately: a synchronous carrier Message verb
-- is only ever returned by the request that won an atomic insert, so a provider
-- retry cannot text somebody twice.

begin;

-- ---------------------------------------------------------------------------
-- 1. The audit row. One per inbound receipt, immutable, claim-by-insert.
-- ---------------------------------------------------------------------------
create table if not exists public.sms_shared_notice_replies (
  webhook_receipt_id uuid primary key
    references public.sms_webhook_receipts(id) on delete restrict,
  -- `suppressed` records that the reply was WITHHELD by the kill switch, canary
  -- or lane gate. Recording the decision is the point: silence with no row and
  -- silence with a `suppressed` row are different failures.
  egress_result text not null check (egress_result in ('twiml', 'suppressed')),
  response_body_sha256 text not null check (response_body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now()
);

-- ---------------------------------------------------------------------------
-- 2. The claim.
--
-- Returns true to EXACTLY ONE caller per receipt. Everyone else -- concurrent
-- duplicate, provider retry -- gets false and must answer with empty TwiML.
-- ---------------------------------------------------------------------------
create or replace function public.record_sms_shared_notice_reply(
  p_webhook_receipt_id uuid,
  p_egress_result text,
  p_response_body_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_purpose text;
  v_result public.sms_shared_notice_replies%rowtype;
begin
  if p_webhook_receipt_id is null
     or p_egress_result not in ('twiml', 'suppressed')
     or p_response_body_sha256 is null
     or p_response_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS shared notice reply result is invalid' using errcode = '22023';
  end if;

  select r.* into v_receipt
    from public.sms_webhook_receipts r
   where r.id = p_webhook_receipt_id
   for share;

  -- `review` is admitted alongside `processed` on purpose: an unroutable
  -- shared-number message is exactly the case with no other answer, and
  -- refusing it here would leave the original silence in place.
  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state not in ('processed', 'review') then
    raise exception 'SMS shared notice reply is not bound to an inbound receipt'
      using errcode = '55000';
  end if;

  -- NEVER shadow a compliance acknowledgement. STOP/START/HELP already answer,
  -- and two Message verbs for one inbound would double-text the sender.
  if v_receipt.disposition is not null
     and v_receipt.disposition like 'keyword\_%' then
    raise exception 'SMS shared notice reply may not answer a compliance keyword'
      using errcode = '55000';
  end if;

  -- Only LGQ's own lanes. A contractor's dedicated number is a real two-way
  -- conversation and must never be auto-answered on their behalf.
  select s.purpose into v_purpose
    from public.sms_sender_numbers s
   where s.id = v_receipt.sender_number_id;
  if v_purpose is null or v_purpose not in ('lgq_shared', 'lgq_dispatch') then
    raise exception 'SMS shared notice reply is only for LGQ platform lanes'
      using errcode = '55000';
  end if;

  insert into public.sms_shared_notice_replies (
    webhook_receipt_id, egress_result, response_body_sha256
  ) values (
    p_webhook_receipt_id, p_egress_result, p_response_body_sha256
  ) on conflict (webhook_receipt_id) do nothing
  returning * into v_result;

  -- The first committed row wins. Anything else answers with empty TwiML.
  return v_result.webhook_receipt_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Least privilege. Same posture as the compliance audit: unreachable by
--    anon and authenticated, reached by the route only through the function.
-- ---------------------------------------------------------------------------
alter table public.sms_shared_notice_replies enable row level security;
alter table public.sms_shared_notice_replies force row level security;
-- No policy, deliberately: RLS on with no policy means anon and authenticated
-- read nothing, and the service-role client bypasses RLS.

revoke all on table public.sms_shared_notice_replies
  from public, anon, authenticated, service_role;
grant select on table public.sms_shared_notice_replies to service_role;

revoke all on function public.record_sms_shared_notice_reply(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_sms_shared_notice_reply(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. Prove it, do not trust that the statements above did what
--    they read like.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_sms_shared_notice_reply'
       and p.prosecdef
  ) then
    raise exception 'record_sms_shared_notice_reply is not security definer';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'sms_shared_notice_replies'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'row level security is not forced on sms_shared_notice_replies';
  end if;

  select pg_catalog.string_agg(distinct g.grantee_name, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as grantee_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
     where n.nspname = 'public' and c.relname = 'sms_shared_notice_replies'
  ) g
  where g.grantee_name in ('anon', 'authenticated');
  if v_bad is not null then
    raise exception 'sms_shared_notice_replies is reachable by: %', v_bad;
  end if;
end $$;

commit;
