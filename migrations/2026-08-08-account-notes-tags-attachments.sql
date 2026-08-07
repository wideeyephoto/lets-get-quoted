-- Staff annotations on an account (Phase 4 of the admin dashboard build-out):
-- free-text notes, short categorization tags, and uploaded files. Distinct
-- from clients.notes, which is a single owner-authored field on a customer
-- record — these are staff-only, append-only, and scoped to the account itself.
create table if not exists account_notes (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  body          text not null,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists account_notes_account_idx on account_notes (account_id, created_at desc);

alter table account_notes enable row level security;

create table if not exists account_tags (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  tag           text not null,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  unique (account_id, tag)
);

create index if not exists account_tags_account_idx on account_tags (account_id);

alter table account_tags enable row level security;

-- Path convention `${accountId}/${uuid}.${ext}` — mirrors insurance-proof
-- exactly (src/lib/insurance-storage.ts), generalized from one certificate
-- per account to any number of staff-uploaded files.
create table if not exists account_attachments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  path          text not null,
  filename      text not null,
  content_type  text,
  size_bytes    bigint,
  uploaded_by   text not null,
  created_at    timestamptz not null default now()
);

create index if not exists account_attachments_account_idx on account_attachments (account_id, created_at desc);

alter table account_attachments enable row level security;

-- PRIVATE bucket. Signed URLs only, re-checked against the account's own path
-- prefix before minting — see src/lib/account-attachments.ts.
insert into storage.buckets (id, name, public)
values ('account-attachments', 'account-attachments', false)
on conflict (id) do nothing;
