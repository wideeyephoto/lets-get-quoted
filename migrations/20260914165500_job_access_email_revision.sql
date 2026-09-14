-- Expose the document version through the session view after the send-ledger
-- migration added it to jobs. Keep every existing financial mask and RLS guard.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $view$
declare
  cols text;
  extra_columns text[];
  protected text[] := array['quoted_amount','quote_items','deposit_gate',
    'reschedule_discount_percent','reschedule_discount_note','reschedule_discount_agreed_at',
    'quote_signer_name','quote_signed_at','quote_signature_path','quote_signature_method'];
begin
  if not exists (select 1 from pg_attribute where attrelid='public.jobs'::regclass
      and attname='document_email_revision' and atttypid='uuid'::regtype and attnotnull and not attisdropped) then
    raise exception 'Document email revision migration must be applied first';
  end if;
  if not exists (select 1 from pg_class where oid='public.job_access'::regclass
      and reloptions @> array['security_invoker=true','security_barrier=true']) then
    raise exception 'Expected invoker and financial masking view';
  end if;
  -- Never expose unrelated columns introduced by another migration.
  select array_agg(j.attname::text order by j.attnum) into extra_columns
    from pg_attribute j where j.attrelid='public.jobs'::regclass and j.attnum>0 and not j.attisdropped
      and not exists (select 1 from pg_attribute v where v.attrelid='public.job_access'::regclass
        and v.attnum>0 and not v.attisdropped and v.attname=j.attname);
  if extra_columns is not null and extra_columns <> array['document_email_revision'] then
    raise exception 'Unexpected unprojected job columns: %', extra_columns;
  end if;
  select string_agg(case
    when a.attname='quoted_amount' then 'coalesce(q.quoted_amount,0)::numeric(12,2) as quoted_amount'
    when a.attname=any(protected) then format('q.%I',a.attname)
    else format('j.%I',a.attname) end,', ' order by a.attnum)
    into cols from pg_attribute a where a.attrelid='public.job_access'::regclass and a.attnum>0 and not a.attisdropped;
  if extra_columns is not null then cols := cols || ', j.document_email_revision'; end if;
  execute 'create or replace view public.job_access with (security_invoker=true,security_barrier=true) as select '
    ||cols||' from public.jobs j left join lateral jsonb_populate_record(null::public.jobs,private.job_quote_values(j.id)) q on true';
end;
$view$;

-- This UUID is an optimistic document version, not a client access token.
-- Existing quote columns still require the permission-checked private helper.
grant select(document_email_revision) on public.jobs to authenticated;
alter view public.job_access alter column document_email_revision set default gen_random_uuid();
notify pgrst,'reload schema';
commit;
