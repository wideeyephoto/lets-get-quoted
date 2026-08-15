begin;

create table if not exists risk_reviews (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  disposition   text not null check (disposition in ('open', 'monitor', 'cleared', 'escalated')),
  note          text not null,
  review_on     date,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists risk_reviews_account_created_idx on risk_reviews (account_id, created_at desc);
create index if not exists risk_reviews_disposition_created_idx on risk_reviews (disposition, created_at desc);
alter table risk_reviews enable row level security;

commit;
