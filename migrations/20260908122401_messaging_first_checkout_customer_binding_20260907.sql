-- First Checkout can legitimately have no pre-existing Stripe Customer.
-- Preserve that immutable request field. Use only the projector's durable
-- subscription + Customer binding for the NULL case; never a loose NULL bypass.
begin;
do $repair$
declare
  definition text;
  old_clause text := $old$            and o.provider_customer_id=s.provider_customer_id and o.state='activated'
            and o.metadata->>'provider_subscription_id'=s.provider_subscription_id) into paid;$old$;
  new_clause text := $new$            and (
              o.provider_customer_id=s.provider_customer_id
              or (o.provider_customer_id is null
                and o.metadata->>'projection_schema'='stripe_subscription_projection_v1'
                and o.metadata->>'billing_subscription_id'=s.id::text
                and exists(select 1 from public.billing_subscription_customers customer_binding
                  where customer_binding.account_id=s.account_id
                    and customer_binding.provider=s.provider
                    and customer_binding.livemode=s.livemode
                    and customer_binding.provider_customer_id=s.provider_customer_id))
            ) and o.state='activated'
            and o.metadata->>'provider_subscription_id'=s.provider_subscription_id) into paid;$new$;
begin
  definition := pg_get_functiondef('public.messaging_primary_number_entitlement(uuid,boolean)'::regprocedure);
  if strpos(definition,new_clause)>0 then
    return;
  end if;
  if (length(definition)-length(replace(definition,old_clause,'')))/length(old_clause) <> 1 then
    raise exception 'Expected exactly one initial Checkout customer-binding clause; refusing drift';
  end if;
  execute replace(definition,old_clause,new_clause);
end;
$repair$;
-- Preserve the service-only reader and its existing empty search path.
revoke all on function public.messaging_primary_number_entitlement(uuid,boolean) from public,anon,authenticated;
grant execute on function public.messaging_primary_number_entitlement(uuid,boolean) to service_role;
commit;

;
