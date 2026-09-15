-- App-managed admin WebAuthn step-up. These grants never change Supabase AAL.
-- Only the server service role can read/write credentials, challenges, or grants.
begin;

create schema if not exists admin_security;
revoke all on schema admin_security from public, anon, authenticated;
grant usage on schema admin_security to service_role;

create table public.admin_passkey_credentials (
  id text primary key check (length(id) between 1 and 1400),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  public_key text not null check (length(public_key) between 1 and 16384),
  counter bigint not null default 0 check (counter between 0 and 4294967295),
  revision bigint not null default 0 check (revision >= 0),
  transports text[] not null default '{}',
  device_type text not null check (device_type in ('singleDevice', 'multiDevice')),
  backed_up boolean not null default false,
  rp_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (id, user_id)
);
create index admin_passkey_credentials_user_idx on public.admin_passkey_credentials(user_id);

create table public.admin_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  purpose text not null check (purpose in ('register', 'authenticate')),
  challenge text not null check (length(challenge) between 32 and 256),
  rp_id text not null,
  origin text not null,
  label text check (length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
create index admin_passkey_challenges_user_idx on public.admin_passkey_challenges(user_id, session_id);
create index admin_passkey_challenges_expiry_idx on public.admin_passkey_challenges(expires_at);

create table public.admin_passkey_grants (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  foreign key (credential_id, user_id) references public.admin_passkey_credentials(id, user_id) on delete cascade,
  check (expires_at > verified_at and expires_at <= verified_at + interval '15 minutes')
);
create index admin_passkey_grants_user_idx on public.admin_passkey_grants(user_id);
create index admin_passkey_grants_credential_idx on public.admin_passkey_grants(credential_id, user_id);

alter table public.admin_passkey_credentials enable row level security;
alter table public.admin_passkey_challenges enable row level security;
alter table public.admin_passkey_grants enable row level security;
revoke all on public.admin_passkey_credentials, public.admin_passkey_challenges, public.admin_passkey_grants from public, anon, authenticated;
grant select, insert, update, delete on public.admin_passkey_credentials, public.admin_passkey_challenges, public.admin_passkey_grants to service_role;

-- auth.sessions is intentionally unavailable through the Data API. This narrow
-- private-schema definer is the only privileged reader; all public RPCs below
-- are invokers and executable exclusively by service_role. The server supplies
-- user/session IDs only after cryptographic verification of the Supabase JWT.
create function admin_security.passkey_session_active(p_user_id uuid, p_session_id uuid, p_require_totp boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
      and (not p_require_totp or (
        s.aal = 'aal2' and exists (
          select 1 from auth.mfa_factors f
          where f.id = s.factor_id and f.user_id = p_user_id
            and f.factor_type = 'totp' and f.status = 'verified'
        )
      ))
  );
$$;
revoke all on function admin_security.passkey_session_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function admin_security.passkey_session_active(uuid, uuid, boolean) to service_role;

create function public.admin_passkey_session_active(p_user_id uuid, p_session_id uuid, p_require_totp boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select admin_security.passkey_session_active(p_user_id, p_session_id, p_require_totp);
$$;

create function public.admin_passkey_grant_status(p_user_id uuid, p_session_id uuid)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select g.expires_at from public.admin_passkey_grants g
  join public.admin_passkey_credentials c on c.id = g.credential_id and c.user_id = g.user_id
  where g.session_id = p_session_id and g.user_id = p_user_id and g.expires_at > now()
    and admin_security.passkey_session_active(p_user_id, p_session_id, false);
$$;

create function public.admin_passkey_begin_challenge(
  p_user_id uuid, p_session_id uuid, p_purpose text, p_challenge text,
  p_rp_id text, p_origin text, p_label text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not admin_security.passkey_session_active(p_user_id, p_session_id, p_purpose = 'register') then
    raise exception 'Passkey session is not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 89214));
  delete from public.admin_passkey_challenges where expires_at <= now();
  delete from public.admin_passkey_challenges where user_id = p_user_id and session_id = p_session_id and purpose = p_purpose;
  if (select count(*) from public.admin_passkey_challenges where user_id = p_user_id) >= 10 then
    raise exception 'Too many passkey attempts' using errcode = '54000';
  end if;
  if p_purpose = 'register' and (select count(*) from public.admin_passkey_credentials where user_id = p_user_id) >= 10 then
    raise exception 'Passkey limit reached' using errcode = '54000';
  end if;
  insert into public.admin_passkey_challenges(user_id, session_id, purpose, challenge, rp_id, origin, label)
  values (p_user_id, p_session_id, p_purpose, p_challenge, p_rp_id, p_origin, p_label)
  returning id into v_id;
  return v_id;
end;
$$;

-- Claim before performing WebAuthn verification. Even a failed verification
-- burns the challenge, so concurrent requests and replays cannot both verify.
create function public.admin_passkey_consume_challenge(p_id uuid, p_user_id uuid, p_session_id uuid, p_purpose text)
returns setof public.admin_passkey_challenges language sql volatile security invoker set search_path = '' as $$
  update public.admin_passkey_challenges
  set consumed_at = now()
  where id = p_id and user_id = p_user_id and session_id = p_session_id
    and purpose = p_purpose and consumed_at is null and expires_at > now()
    and admin_security.passkey_session_active(p_user_id, p_session_id, p_purpose = 'register')
  returning *;
$$;

create function public.admin_passkey_finish_registration(
  p_challenge_id uuid, p_user_id uuid, p_session_id uuid, p_credential_id text,
  p_public_key text, p_counter bigint, p_transports text[], p_device_type text, p_backed_up boolean
) returns text language plpgsql security invoker set search_path = '' as $$
declare v_challenge public.admin_passkey_challenges;
begin
  if not admin_security.passkey_session_active(p_user_id, p_session_id, true) then
    raise exception 'TOTP verification is required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 89214));
  delete from public.admin_passkey_challenges
  where id = p_challenge_id and user_id = p_user_id and session_id = p_session_id
    and purpose = 'register' and consumed_at is not null and expires_at > now()
  returning * into v_challenge;
  if not found then raise exception 'Passkey challenge expired or already used' using errcode = '42501'; end if;
  if (select count(*) from public.admin_passkey_credentials where user_id = p_user_id) >= 10 then
    raise exception 'Passkey limit reached' using errcode = '54000';
  end if;
  insert into public.admin_passkey_credentials(id, user_id, label, public_key, counter, transports, device_type, backed_up, rp_id)
  values (p_credential_id, p_user_id, v_challenge.label, p_public_key, p_counter, p_transports, p_device_type, p_backed_up, v_challenge.rp_id);
  return p_credential_id;
end;
$$;

-- The WebAuthn verifier supplies the verified new counter. Recheck credential
-- ownership/revision and the live session inside the same grant transaction.
create function public.admin_passkey_finish_authentication(
  p_challenge_id uuid, p_user_id uuid, p_session_id uuid, p_credential_id text,
  p_expected_counter bigint, p_expected_revision bigint, p_new_counter bigint, p_backed_up boolean
) returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare v_challenge public.admin_passkey_challenges; v_until timestamptz := now() + interval '15 minutes';
begin
  if not admin_security.passkey_session_active(p_user_id, p_session_id, false) then
    raise exception 'Passkey session is no longer active' using errcode = '42501';
  end if;
  delete from public.admin_passkey_challenges
  where id = p_challenge_id and user_id = p_user_id and session_id = p_session_id
    and purpose = 'authenticate' and consumed_at is not null and expires_at > now()
  returning * into v_challenge;
  if not found then raise exception 'Passkey challenge expired or already used' using errcode = '42501'; end if;
  update public.admin_passkey_credentials
  set counter = p_new_counter, revision = revision + 1, backed_up = p_backed_up, last_used_at = now()
  where id = p_credential_id and user_id = p_user_id and rp_id = v_challenge.rp_id
    and counter = p_expected_counter and revision = p_expected_revision
    and ((counter = 0 and p_new_counter = 0) or p_new_counter > counter);
  if not found then raise exception 'Passkey changed during verification; try again' using errcode = '40001'; end if;
  insert into public.admin_passkey_grants(session_id, user_id, credential_id, verified_at, expires_at)
  values (p_session_id, p_user_id, p_credential_id, now(), v_until)
  on conflict (session_id) do update set credential_id = excluded.credential_id,
    user_id = excluded.user_id, verified_at = excluded.verified_at, expires_at = excluded.expires_at;
  return v_until;
end;
$$;

create function public.admin_passkey_remove(p_user_id uuid, p_session_id uuid, p_credential_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_removed boolean;
begin
  if not admin_security.passkey_session_active(p_user_id, p_session_id, false)
    or (not admin_security.passkey_session_active(p_user_id, p_session_id, true)
      and public.admin_passkey_grant_status(p_user_id, p_session_id) is null) then
    raise exception 'Verify an authenticator before removing a passkey' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 89214));
  delete from public.admin_passkey_credentials where id = p_credential_id and user_id = p_user_id;
  v_removed := found;
  -- Invalidates unfinished attempts too; removed credentials cannot be revived.
  delete from public.admin_passkey_challenges where user_id = p_user_id;
  if not exists (select 1 from public.admin_passkey_credentials where user_id = p_user_id) then
    delete from public.admin_passkey_grants where user_id = p_user_id;
  end if;
  return v_removed;
end;
$$;

revoke all on function public.admin_passkey_session_active(uuid, uuid, boolean),
  public.admin_passkey_grant_status(uuid, uuid),
  public.admin_passkey_begin_challenge(uuid, uuid, text, text, text, text, text),
  public.admin_passkey_consume_challenge(uuid, uuid, uuid, text),
  public.admin_passkey_finish_registration(uuid, uuid, uuid, text, text, bigint, text[], text, boolean),
  public.admin_passkey_finish_authentication(uuid, uuid, uuid, text, bigint, bigint, bigint, boolean),
  public.admin_passkey_remove(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_passkey_session_active(uuid, uuid, boolean),
  public.admin_passkey_grant_status(uuid, uuid),
  public.admin_passkey_begin_challenge(uuid, uuid, text, text, text, text, text),
  public.admin_passkey_consume_challenge(uuid, uuid, uuid, text),
  public.admin_passkey_finish_registration(uuid, uuid, uuid, text, text, bigint, text[], text, boolean),
  public.admin_passkey_finish_authentication(uuid, uuid, uuid, text, bigint, bigint, bigint, boolean),
  public.admin_passkey_remove(uuid, uuid, text) to service_role;

comment on table public.admin_passkey_grants is 'App-managed admin step-up only. Does not set Supabase aal2 and does not authorize direct Data API access.';
notify pgrst, 'reload schema';
commit;
