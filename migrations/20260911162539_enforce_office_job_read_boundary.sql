-- Final enforcement step, after application clients use public.job_access.
-- Operational columns retain ordinary RLS; financial values are available only
-- through the view's actor-checked private helper. New columns fail closed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke select on public.jobs from public,anon,authenticated;
do $grants$
declare allowed text; restricted text;
  protected text[] := array['quoted_amount','quote_items','deposit_gate',
    'reschedule_discount_percent','reschedule_discount_note','reschedule_discount_agreed_at',
    'quote_signer_name','quote_signed_at','quote_signature_path','quote_signature_method'];
begin
  select string_agg(format('%I',attname),', ' order by attnum) filter(where not attname=any(protected)),
    string_agg(format('%I',attname),', ' order by attnum) filter(where attname=any(protected))
    into allowed,restricted from pg_attribute
    where attrelid='public.jobs'::regclass and attnum>0 and not attisdropped;
  execute 'revoke select ('||restricted||') on public.jobs from public,anon,authenticated';
  execute 'grant select ('||allowed||') on public.jobs to authenticated';
  if has_column_privilege('authenticated','public.jobs','quoted_amount','SELECT')
    or has_column_privilege('authenticated','public.jobs','quote_items','SELECT') then
    raise exception 'Raw job quote columns remain readable';
  end if;
end;
$grants$;
notify pgrst,'reload schema';
commit;
