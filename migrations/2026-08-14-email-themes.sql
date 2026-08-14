-- One email layout per contractor, reused across every customer-facing send.
-- Keeping the choice on `sites` puts it next to the logo and accent color the
-- renderer already loads, with a database constraint so an old client or a
-- hand-written request cannot save a theme the mailer does not understand.
alter table sites
  add column if not exists email_theme text not null default 'studio';

alter table sites
  drop constraint if exists sites_email_theme_check;

alter table sites
  add constraint sites_email_theme_check
  check (email_theme in ('studio', 'letterhead', 'neighborly', 'blueprint', 'spotlight'));
