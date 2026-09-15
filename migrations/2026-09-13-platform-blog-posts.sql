-- Create platform_blog_posts table for the public marketing blog
-- Managed via /admin/blog and rendered on /blog and /blog/[slug]

begin;

create table if not exists platform_blog_posts (
  id text primary key,
  slug text not null unique,
  title text not null,
  subtitle text,
  excerpt text not null,
  category text not null,
  author jsonb not null default '{"name":"Brett","role":"Founder, Let''s Get Quoted"}'::jsonb,
  cover_image text,
  cover_alt text,
  read_minutes integer not null default 5,
  date_published text not null,
  date_modified text,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled')),
  tags jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  target_keyword text,
  feature_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_platform_blog_posts_status_date on platform_blog_posts (status, date_published desc);
create index if not exists idx_platform_blog_posts_category on platform_blog_posts (category);
create index if not exists idx_platform_blog_posts_slug on platform_blog_posts (slug);

-- Enable RLS
alter table platform_blog_posts enable row level security;

-- Drop existing policies if any
drop policy if exists "Public can read published blog posts" on platform_blog_posts;
drop policy if exists "Service role has full access to platform_blog_posts" on platform_blog_posts;

-- Public can read published posts
create policy "Public can read published blog posts"
  on platform_blog_posts
  for select
  using (status = 'published');

-- Staff/service-role has full access
create policy "Service role has full access to platform_blog_posts"
  on platform_blog_posts
  for all
  using (true)
  with check (true);

commit;
