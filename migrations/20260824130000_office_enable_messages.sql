-- Enable messages.read and messages.send capabilities in public.office_capabilities
-- and update RLS policies for sms_messages, sms_events, sms_consent, and message_templates.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in ('messages.read', 'messages.send');

-- 1. sms_messages
alter table if exists sms_messages enable row level security;
drop policy if exists sms_messages_owner on sms_messages;
drop policy if exists sms_messages_select on sms_messages;
drop policy if exists sms_messages_modify on sms_messages;

create policy sms_messages_select on sms_messages
  for select using (office_can(account_id, 'messages.read'));

create policy sms_messages_modify on sms_messages
  for all using (office_can(account_id, 'messages.send')) with check (office_can(account_id, 'messages.send'));

-- 2. sms_events
alter table if exists sms_events enable row level security;
drop policy if exists sms_events_owner on sms_events;
drop policy if exists sms_events_select on sms_events;

create policy sms_events_select on sms_events
  for select using (office_can(account_id, 'messages.read'));

-- 3. sms_consent & sms_consent_scopes
alter table if exists sms_consent enable row level security;
drop policy if exists sms_consent_owner on sms_consent;
drop policy if exists sms_consent_select on sms_consent;

create policy sms_consent_select on sms_consent
  for select using (
    office_can(account_id, 'messages.read')
    or office_can(account_id, 'leads.read')
    or office_can(account_id, 'jobs.read')
  );

alter table if exists sms_consent_scopes enable row level security;
drop policy if exists sms_consent_scopes_owner on sms_consent_scopes;
drop policy if exists sms_consent_scopes_select on sms_consent_scopes;

create policy sms_consent_scopes_select on sms_consent_scopes
  for select using (
    office_can(account_id, 'messages.read')
    or office_can(account_id, 'leads.read')
    or office_can(account_id, 'jobs.read')
  );

-- 4. message_templates
alter table if exists message_templates enable row level security;
drop policy if exists message_templates_owner on message_templates;
drop policy if exists message_templates_select on message_templates;
drop policy if exists message_templates_modify on message_templates;

create policy message_templates_select on message_templates
  for select using (office_can(account_id, 'messages.read'));

create policy message_templates_modify on message_templates
  for all using (office_can(account_id, 'messages.send')) with check (office_can(account_id, 'messages.send'));

commit;
