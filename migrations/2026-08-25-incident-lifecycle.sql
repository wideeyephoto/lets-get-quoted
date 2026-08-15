begin;

alter table platform_incidents add column if not exists owner text;
alter table platform_incidents add column if not exists affected_services text[] not null default '{}';
alter table platform_incidents add column if not exists impact_summary text;
alter table platform_incidents add column if not exists root_cause text;
alter table platform_incidents add column if not exists resolution_summary text;
alter table platform_incidents add column if not exists external_url text;

commit;
