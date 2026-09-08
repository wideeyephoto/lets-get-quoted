'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { WORKSPACE_COOKIE } from '@/lib/workspace-selection';

export async function selectWorkspaceAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fworkspaces');
  const accountId = String(form.get('accountId') ?? '');
  const { data: member, error } = await createAdminClient().from('memberships')
    .select('account_id, role, deactivated_at').eq('user_id', user.id).eq('account_id', accountId).maybeSingle();
  if (error || !member || member.deactivated_at || !['owner', 'office'].includes(member.role)) {
    throw new Error('This workspace is not available to your account.');
  }
  (await cookies()).set(WORKSPACE_COOKIE, `${user.id}:${member.account_id}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  redirect(member.role === 'office' ? '/office-access' : '/dashboard');
}
