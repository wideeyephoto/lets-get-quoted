import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// Service-role client bypasses RLS for trusted server-side writes.
// Never expose this client or its key to the browser.
export function createAdminClient() {
  return createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type CurrentMembership = {
  accountId: string | null;
  role: 'owner' | 'crew' | null;
};

export async function getCurrentMembership(userId: string): Promise<CurrentMembership> {
  // Use the admin client to bypass RLS.
  const supabase = createAdminClient();

  const { data, error: membershipError } = await supabase
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError || !data) {
    return { accountId: null, role: null };
  }

  return {
    accountId: data.account_id ?? null,
    role: data.role ?? null,
  };
}

export async function ensureAccountMembership(userId: string) {
  const admin = createAdminClient();

  const { data: existingMembership } = await admin
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMembership) {
    return existingMembership;
  }

  const { data: newAccount, error: createAccountError } = await admin
    .from('accounts')
    .insert({ business_name: 'My Business' })
    .select('id')
    .single();

  if (createAccountError || !newAccount) {
    throw createAccountError ?? new Error('Unable to create account');
  }

  const { error: createMembershipError } = await admin.from('memberships').insert({
    account_id: newAccount.id,
    user_id: userId,
    role: 'owner',
  });

  if (createMembershipError) {
    throw createMembershipError;
  }

  return { account_id: newAccount.id, role: 'owner' };
}

// Shared guard for server components/actions that require a logged-in owner.
// Returns a session-scoped (RLS-respecting) Supabase client plus the resolved
// user + account context. Redirects to /login if any check fails.
export async function requireOwnerContext() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await ensureAccountMembership(user.id);
  } catch (error) {
    console.error('ensureAccountMembership error:', error);
    throw error;
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId || membership.role !== 'owner') {
    redirect('/login');
  }

  return { supabase, userId: user.id, accountId: membership.accountId };
}
