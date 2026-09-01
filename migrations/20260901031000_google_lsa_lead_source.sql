-- Add Google Local Services Ads as a first-class CRM lead source. Keep this
-- enum-only migration separate: PostgreSQL cannot safely use a newly-added
-- enum label until the transaction that adds it has committed.

do $google_lsa_lead_source$
begin
  if not exists (
    select 1
      from pg_catalog.pg_enum e
      join pg_catalog.pg_type t
        on t.oid = e.enumtypid
      join pg_catalog.pg_namespace n
        on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = 'lead_source'
       and e.enumlabel = 'google_lsa'
  ) then
    alter type public.lead_source add value 'google_lsa';
  end if;
end
$google_lsa_lead_source$;
