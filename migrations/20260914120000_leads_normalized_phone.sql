-- Add normalized_phone column and index to leads table
alter table public.leads add column if not exists normalized_phone text;
create index if not exists leads_normalized_phone_idx on public.leads (normalized_phone) where normalized_phone is not null;
