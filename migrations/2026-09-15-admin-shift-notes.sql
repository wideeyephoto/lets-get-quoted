create table if not exists admin_shift_notes (
  id uuid primary key default gen_random_uuid(),
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);
