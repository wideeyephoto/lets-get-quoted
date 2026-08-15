begin;

alter table staff add column if not exists invited_at timestamptz;
alter table staff add column if not exists invited_by text;

commit;
