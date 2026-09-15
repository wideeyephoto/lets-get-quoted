create function public.quick_stop_deployment_pause() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Quick Stop is briefly unavailable during a release. Please retry shortly.' using errcode='55000';
end
$$;
revoke all on function public.quick_stop_deployment_pause() from public,anon,authenticated,service_role;
create trigger quick_stop_deployment_pause before insert or update or delete on public.extra_stop_requests for each statement execute function public.quick_stop_deployment_pause();;
