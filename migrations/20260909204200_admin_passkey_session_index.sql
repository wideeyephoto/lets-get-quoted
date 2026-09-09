-- Keep provider-session deletion and its cascading challenge cleanup indexed.
create index if not exists admin_passkey_challenges_session_idx
  on public.admin_passkey_challenges(session_id);
