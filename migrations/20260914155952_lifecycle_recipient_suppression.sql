-- Read-only lifecycle audience preflight; the existing ledger remains the final gate.
create function public.lifecycle_recipient_suppression(p_recipients jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_recipients is null or jsonb_typeof(p_recipients)<>'array' then raise exception 'Recipient array required'; end if;
  if jsonb_array_length(p_recipients)>100 then raise exception 'Recipient batch exceeds 100'; end if;
  if exists(select 1 from jsonb_array_elements(p_recipients) r
    where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'email') is distinct from 'string'
      or jsonb_typeof(r->'account_id') is distinct from 'string' or coalesce(r->>'account_id','')=''
      or coalesce(r->>'email','')='' or r->>'email'<>lower(btrim(r->>'email'))) then
    raise exception 'Normalized workspace recipient required';
  end if;
  perform (r->>'account_id')::uuid from jsonb_array_elements(p_recipients) r;
  select coalesce(jsonb_agg(jsonb_build_object('email',r->>'email','account_id',r->>'account_id',
    'blocked',exists(select 1 from public.email_suppression s
      where s.account_id=(r->>'account_id')::uuid and lower(s.email)=r->>'email')) order by ordinal),'[]'::jsonb)
  into result from jsonb_array_elements(p_recipients) with ordinality as candidates(r,ordinal);
  return result;
end;
$$;
revoke all on function public.lifecycle_recipient_suppression(jsonb) from public,anon,authenticated;
grant execute on function public.lifecycle_recipient_suppression(jsonb) to service_role;
