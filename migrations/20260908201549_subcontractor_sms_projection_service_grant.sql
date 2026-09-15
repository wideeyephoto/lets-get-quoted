-- The offer-link trigger runs as the server's service_role. Its nested
-- projector call needs EXECUTE; browser roles must remain excluded.
begin;
grant execute on function public.apply_subcontractor_sms_event_projection(uuid)
  to service_role;
commit;
