-- Finding an account by the owner's login email.
--
-- This is the first ten seconds of every support ticket, and the console could
-- not do it. A customer emails in; staff have their address and nothing else.
-- listAccountsForAdmin searches account_number, accounts.business_name and
-- sites.company_name — and the accounts table has no email column at all,
-- because the owner's address lives in auth.users. Universal Search made it
-- worse than merely absent: it advertises "customer name/email/phone" and
-- searches clients.email, which is the CONTRACTORS' homeowners, so staff were
-- pointed at a lookup that confidently answers a different question.
--
-- WHY A FUNCTION RATHER THAN A COLUMN. The obvious fix is a denormalised
-- accounts.owner_email kept in sync on signup and membership change. That is
-- two more write paths to keep correct forever, and the failure mode is silent:
-- a stale address means staff cannot find an account that exists, which is
-- indistinguishable from the bug being fixed here. auth.users is already the
-- source of truth, so this reads it directly.
--
-- PostgREST does not expose the auth schema, so the service-role client cannot
-- select from auth.users. A security-definer function in public can, and is
-- then callable via .rpc(). That is the standard Supabase shape for this, and
-- the grants below are the whole security story: revoked from everyone, then
-- granted to service_role alone. The service-role key never reaches a browser —
-- it is only used inside requireAdmin's context.

-- Search: an email fragment in, matching accounts out.
create or replace function public.accounts_by_owner_email(term text, max_rows int default 50)
returns table (account_id uuid, email text)
language sql
stable
security definer
-- Pinned so a caller cannot shadow `memberships` or `users` with something of
-- their own and have this definer-rights function read it.
set search_path = public, auth, pg_temp
as $$
  select m.account_id, u.email::text
    from auth.users u
    join public.memberships m on m.user_id = u.id
   where m.role = 'owner'
     and u.email ilike '%' || term || '%'
   order by u.email
   limit greatest(1, least(max_rows, 200));
$$;

-- Display: account ids in, their owners' emails out. One round trip for a
-- whole page of results, instead of one getUserById per row.
create or replace function public.owner_emails_for_accounts(ids uuid[])
returns table (account_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select distinct on (m.account_id) m.account_id, u.email::text
    from public.memberships m
    join auth.users u on u.id = m.user_id
   where m.account_id = any(ids)
     and m.role = 'owner'
   -- An account with two owner memberships gets the earliest, matching what
   -- getAccountOwnerEmail already returns for the same account.
   order by m.account_id, m.created_at;
$$;

-- These read every user's email address in the system. Nothing but the
-- service-role client may call them.
revoke all on function public.accounts_by_owner_email(text, int) from public;
revoke all on function public.accounts_by_owner_email(text, int) from anon, authenticated;
grant execute on function public.accounts_by_owner_email(text, int) to service_role;

revoke all on function public.owner_emails_for_accounts(uuid[]) from public;
revoke all on function public.owner_emails_for_accounts(uuid[]) from anon, authenticated;
grant execute on function public.owner_emails_for_accounts(uuid[]) to service_role;
