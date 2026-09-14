-- Cover the three foreign keys identified by the staging release advisor.
create index if not exists client_owner_request_receipts_feed_idx on public.client_owner_request_receipts(feed_id);
create index if not exists operational_alert_findings_delivery_idx on public.operational_alert_findings(delivery_id);
create index if not exists portal_message_requests_client_idx on public.portal_message_requests(client_id);
