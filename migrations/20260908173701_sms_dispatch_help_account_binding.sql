-- A dispatch HELP receipt previously had no account binding, even for one
-- consented active crew workspace. The production canary gate consequently
-- suppressed its compliance acknowledgment. Use the existing STOP/START
-- authority lookup for HELP too, without changing consent or ambiguity rules.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  v_definition text;
  v_old text := $old$if p_keyword in ('stop', 'start')
     and v_sender.purpose = 'lgq_dispatch'
     and v_routed_account_id is null then$old$;
  v_new text := $new$if p_keyword in ('stop', 'start', 'help')
     and v_sender.purpose = 'lgq_dispatch'
     and v_routed_account_id is null then$new$;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.ingest_sms_inbound_webhook(text,text,text,text,text,text,text,text,text,text[],text)'::regprocedure
  );
  -- Historical Windows-loaded definitions retain CRLF. Preserve their exact
  -- whitespace rather than replacing the whole function with an older copy.
  if pg_catalog.strpos(v_definition, v_old) = 0
     and pg_catalog.strpos(v_definition, v_new) = 0 then
    v_old := pg_catalog.replace(v_old, E'\n', E'\r\n');
    v_new := pg_catalog.replace(v_new, E'\n', E'\r\n');
  end if;
  if pg_catalog.strpos(v_definition, v_old) = 0
     and pg_catalog.strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, '')))
       <> pg_catalog.length(v_old)
     or pg_catalog.strpos(v_definition, v_new) > 0 then
    raise exception 'Dispatch keyword authority block changed; review HELP migration before applying';
  end if;
  -- Patch the installed definition so later field-intake, suppression and
  -- callback changes survive. CREATE OR REPLACE preserves its owner/grants.
  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$migration$;

commit;
