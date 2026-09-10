-- A technical downgrade and its owner notice must commit together. Unknown
-- submission outcomes require review; they must never cause a blind resend.
alter table public.email_sending_domains add column failure_notice_requested_at timestamptz;
create table public.email_domain_failure_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain_id uuid references public.email_sending_domains(id) on delete set null,
  domain text not null,
  reason text,
  created_at timestamptz not null default now(),
  state text not null default 'pending'
    check (state in ('pending','sending','accepted','manual_review','resolved','cancelled')),
  attempted_at timestamptz,
  provider_id text unique,
  accepted_at timestamptz,
  last_error text,
  resolved_at timestamptz,
  resolved_by text,
  resolution text,
  check (state <> 'sending' or attempted_at is not null),
  check (state <> 'accepted' or (provider_id is not null and accepted_at is not null)),
  check (state <> 'resolved' or (resolved_at is not null and resolved_by is not null and resolution is not null))
);
alter table public.email_domain_failure_notices enable row level security;
revoke all on public.email_domain_failure_notices from public, anon, authenticated;
grant select, insert, update, delete on public.email_domain_failure_notices to service_role;
create index email_domain_failure_notices_account_idx on public.email_domain_failure_notices(account_id);
create index email_domain_failure_notices_domain_idx on public.email_domain_failure_notices(domain_id);
create index email_domain_failure_notices_open_idx on public.email_domain_failure_notices(state, created_at)
  where state in ('pending','sending','accepted','manual_review');

create function public.record_email_domain_failure_notice() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.email_domain_failure_notices(account_id, domain_id, domain, reason)
  values (new.account_id, new.id, new.domain, left(new.failure_reason, 2000));
  return new;
end $$;
revoke all on function public.record_email_domain_failure_notice() from public, anon, authenticated;
create trigger email_domain_failure_notice
  after update of status on public.email_sending_domains
  for each row when (old.status = 'verified' and new.status in ('pending','failed')
    and new.failure_notice_requested_at is distinct from old.failure_notice_requested_at)
  execute function public.record_email_domain_failure_notice();

create function public.claim_email_domain_failure_notices(p_limit integer default 5)
returns setof public.email_domain_failure_notices
language plpgsql security invoker set search_path = '' as $$
begin
  -- A dead worker may already have submitted its email. Escalate, never reclaim.
  update public.email_domain_failure_notices set state='manual_review', last_error='send_outcome_unknown'
    where state='sending' and attempted_at < now()-interval '5 minutes';
  -- Do not send obsolete notices after recovery, a hold, or disconnection.
  update public.email_domain_failure_notices n set state='cancelled', resolution='Domain no longer needs a failure notice.'
    where n.state='pending' and not exists (
      select 1 from public.email_sending_domains d where d.id=n.domain_id and d.account_id=n.account_id
        and d.domain=n.domain and d.status in ('pending','failed')
    );
  return query with picked as (
    select n.id from public.email_domain_failure_notices n where n.state='pending'
      order by n.created_at,n.id for update skip locked limit greatest(1,least(coalesce(p_limit,5),10))
  ) update public.email_domain_failure_notices n set state='sending',attempted_at=now()
    from picked where n.id=picked.id returning n.*;
end $$;
revoke all on function public.claim_email_domain_failure_notices(integer) from public, anon, authenticated;
grant execute on function public.claim_email_domain_failure_notices(integer) to service_role;

-- Supported incident closeout: exact notice + account, with retained evidence.
-- This never sends mail, changes domain eligibility, or deletes the incident.
create function public.resolve_email_domain_failure_notice(
  p_id uuid, p_account_id uuid, p_actor text, p_evidence text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if length(btrim(coalesce(p_actor,''))) < 3 or length(btrim(coalesce(p_evidence,''))) < 20 then
    raise exception 'Operator and verified recovery evidence are required';
  end if;
  update public.email_domain_failure_notices set state='resolved',resolved_at=now(),
    resolved_by=left(btrim(p_actor),200),resolution=left(btrim(p_evidence),4000)
    where id=p_id and account_id=p_account_id and state='manual_review';
  get diagnostics v_count = row_count;
  return v_count=1;
end $$;
revoke all on function public.resolve_email_domain_failure_notice(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_email_domain_failure_notice(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
