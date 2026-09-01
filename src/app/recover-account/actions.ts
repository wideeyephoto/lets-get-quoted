'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { cancelAccountClosure } from '@/lib/recoverable-deletions';
import { createAdminClient } from '@/lib/auth';

export async function reactivateAccountAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const accountId = formData.get('accountId')?.toString();
  if (!accountId) throw new Error('Account ID is required for recovery');

  const admin = createAdminClient();
  // Verify that this user is actually an owner or member of this account
  const { data: membership } = await admin
    .from('memberships')
    .select('role')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role !== 'owner') {
    throw new Error('Only the account owner can reactivate a closed workspace');
  }

  await cancelAccountClosure({
    accountId,
    actor: {
      userId: user.id,
      role: 'owner',
      email: user.email,
    },
    source: 'web',
  });

  revalidatePath('/', 'layout');
  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard?reactivated=1');
}
