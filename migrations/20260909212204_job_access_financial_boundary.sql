-- Additive first step: deploy the job_access client adapter before the separate
-- column-revocation migration. Keep jobs/FKs/publication identities unchanged.
begin;
set local lock_timeout = '5s';

create schema if not exists private;
revoke create on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.job_quote_values(p_job_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'quoted_amount',j.quoted_amount,'quote_items',j.quote_items,'deposit_gate',j.deposit_gate,
    'reschedule_discount_percent',j.reschedule_discount_percent,
    'reschedule_discount_note',j.reschedule_discount_note,
    'reschedule_discount_agreed_at',j.reschedule_discount_agreed_at,
    'quote_signer_name',j.quote_signer_name,'quote_signed_at',j.quote_signed_at,
    'quote_signature_path',j.quote_signature_path,'quote_signature_method',j.quote_signature_method
  ) from public.jobs j where j.id=p_job_id and (
    current_setting('role',true)='service_role' or (
      auth.uid() is not null and public.office_can(j.account_id,'jobs.read')
      and (public.office_can(j.account_id,'quotes.read') or public.office_can(j.account_id,'reports.read'))
    )
  );
$$;
revoke all on function private.job_quote_values(uuid) from public,anon;
grant execute on function private.job_quote_values(uuid) to authenticated,service_role;

-- Keep every existing column in its original order/type. The view uses the
-- caller's column grants and RLS for operational data. Only the narrowly scoped
-- private function reads quote values; it validates current actor + capability.
do $view$
declare cols text;
  protected text[] := array['quoted_amount','quote_items','deposit_gate',
    'reschedule_discount_percent','reschedule_discount_note','reschedule_discount_agreed_at',
    'quote_signer_name','quote_signed_at','quote_signature_path','quote_signature_method'];
  d record;
begin
  select string_agg(case
    when a.attname='quoted_amount' then 'coalesce(q.quoted_amount,0)::numeric(12,2) as quoted_amount'
    when a.attname=any(protected) then format('q.%I',a.attname)
    else format('j.%I',a.attname) end,', ' order by a.attnum)
    into cols from pg_attribute a where a.attrelid='public.jobs'::regclass and a.attnum>0 and not a.attisdropped;
  execute 'create or replace view public.job_access with (security_invoker=true,security_barrier=true) as select '
    ||cols||' from public.jobs j left join lateral jsonb_populate_record(null::public.jobs,private.job_quote_values(j.id)) q on true';
  for d in select a.attname,pg_get_expr(ad.adbin,ad.adrelid) expr from pg_attribute a
    join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
    where a.attrelid='public.jobs'::regclass and not a.attisdropped loop
    execute format('alter view public.job_access alter column %I set default %s',d.attname,d.expr);
  end loop;
end;
$view$;
revoke all on public.job_access from public,anon;
grant select,insert,update,delete on public.job_access to authenticated,service_role;

-- Enforced on the base table, including direct REST writes and upserts. Looking
-- only at UI controls or the view would leave the original PATCH exploit open.
create or replace function private.guard_job_protected_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_money jsonb; new_money jsonb;
  protected text[] := array['quoted_amount','quote_items','deposit_gate',
    'reschedule_discount_percent','reschedule_discount_note','reschedule_discount_agreed_at',
    'quote_signer_name','quote_signed_at','quote_signature_path','quote_signature_method'];
begin
  if auth.uid() is null then return new; end if;
  if tg_op='UPDATE' and new.account_id is distinct from old.account_id then
    raise exception 'job_workspace_cannot_change' using errcode='42501';
  end if;
  if public.office_can(new.account_id,'quotes.write') then return new; end if;
  select jsonb_object_agg(key,value) into new_money from jsonb_each(to_jsonb(new)) where key=any(protected);
  if tg_op='INSERT' then
    if new.quoted_amount=0 and not exists (
      select 1 from jsonb_each(new_money) where key<>'quoted_amount' and value<>'null'::jsonb
    ) then return new; end if;
  else
    select jsonb_object_agg(key,value) into old_money from jsonb_each(to_jsonb(old)) where key=any(protected);
    if new_money is not distinct from old_money then return new; end if;
  end if;
  raise exception 'job_quote_write_required' using errcode='42501';
end;
$$;
revoke all on function private.guard_job_protected_fields() from public,anon,authenticated;
drop trigger if exists job_protected_fields_guard on public.jobs;
create trigger job_protected_fields_guard before insert or update on public.jobs
for each row execute function private.guard_job_protected_fields();

-- DML on the permission-aware view stays SECURITY INVOKER. Base RLS and the
-- quote guard remain the authority. UPDATE changes only fields distinct from
-- OLD so a masked zero/null is never written over the stored confidential value.
create or replace function private.write_job_access()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare names text; expressions text; changed text; written uuid;
begin
  if tg_op='DELETE' then
    delete from public.jobs where id=old.id returning id into written;
    if written is null then return null; end if;
    return old;
  elsif tg_op='INSERT' then
    select string_agg(format('%I',a.attname),', ' order by a.attnum),
      string_agg(format('r.%I',a.attname),', ' order by a.attnum) into names,expressions
    from pg_attribute a where a.attrelid='public.jobs'::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='';
    execute 'insert into public.jobs ('||names||') select '||expressions
      ||' from jsonb_populate_record(null::public.jobs,$1) r returning id'
      into written using to_jsonb(new);
  else
    if new.id is distinct from old.id then raise exception 'job_id_cannot_change' using errcode='42501'; end if;
    select string_agg(format('%I = (jsonb_populate_record(null::public.jobs,$1)).%I',a.attname,a.attname),', ' order by a.attnum)
      into changed from pg_attribute a where a.attrelid='public.jobs'::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated=''
      and (to_jsonb(new)->a.attname) is distinct from (to_jsonb(old)->a.attname);
    -- Even an unchanged submitted row must pass UPDATE RLS. Never claim a write
    -- succeeded just because the view's SELECT policy let the actor find it.
    execute 'update public.jobs set '||coalesce(changed,'id=id')||' where id=$2 returning id'
      into written using to_jsonb(new),old.id;
  end if;
  if written is null then return null; end if;
  select v.* into new from public.job_access v where v.id=written;
  return new;
end;
$$;
revoke all on function private.write_job_access() from public,anon,authenticated;
drop trigger if exists job_access_write on public.job_access;
create trigger job_access_write instead of insert or update or delete on public.job_access
for each row execute function private.write_job_access();

-- The referenced client must belong to the same workspace, including when an
-- authorized caller changes a parent, creates a row, or uses ON CONFLICT UPDATE.
create unique index if not exists clients_account_id_id_key on public.clients(account_id,id);
create index if not exists jobs_account_id_client_id_idx on public.jobs(account_id,client_id);
alter table public.jobs add constraint jobs_client_same_workspace_fkey
  foreign key(account_id,client_id) references public.clients(account_id,id)
  on delete set null (client_id) not valid;
alter table public.jobs validate constraint jobs_client_same_workspace_fkey;
-- Retain the existing relationship name used by PostgREST hints, with exactly
-- one jobs-to-clients FK so embedding does not become ambiguous.
alter table public.jobs drop constraint jobs_client_id_fkey;
alter table public.jobs rename constraint jobs_client_same_workspace_fkey to jobs_client_id_fkey;

notify pgrst,'reload schema';
commit;
