-- The existing account/client history index does not cover the client-only foreign key.
create index if not exists portal_message_requests_client_fk_idx on public.portal_message_requests(client_id);
