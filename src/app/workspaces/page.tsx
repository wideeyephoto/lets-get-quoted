import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { selectWorkspaceAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fworkspaces');
  const { data, error } = await createAdminClient().from('memberships')
    .select('account_id, role, deactivated_at, accounts(business_name)').eq('user_id', user.id).order('created_at');
  if (error) throw new Error('Could not load your workspaces. Please try again.');
  const memberships = (data ?? []).filter((member) => !member.deactivated_at && ['owner', 'office'].includes(member.role));
  return (
    <main style={{ maxWidth: 640, margin: '48px auto', padding: 24 }}>
      <h1>Choose your workspace</h1>
      <p>You are signed in as {user.email || 'an account without an email address'}. Your access depends on the workspace you choose.</p>
      {memberships.map((member) => {
        const account = Array.isArray(member.accounts) ? member.accounts[0] : member.accounts;
        return <form key={member.account_id} action={selectWorkspaceAction} style={{ marginTop: 20 }}>
          <input type="hidden" name="accountId" value={member.account_id} />
          <button className="btn secondary" type="submit">{account?.business_name || 'Workspace'} — {member.role === 'owner' ? 'Owner' : 'Office'}</button>
        </form>;
      })}
      {memberships.length === 0 ? <p>No active office or owner workspaces are available.</p> : null}
    </main>
  );
}
