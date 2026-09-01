import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/auth';
import { reactivateAccountAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function RecoverAccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Find membership
  const { data: membership } = await admin
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership || !membership.account_id) {
    redirect('/login');
  }

  const accountId = membership.account_id;

  // Check closure job
  const { data: closureJob } = await admin
    .from('account_closure_jobs')
    .select('*')
    .eq('closure_subject_id', accountId)
    .is('completed_at', null)
    .maybeSingle();

  // If no closure job exists or it has already completed local disposal, redirect
  if (!closureJob || closureJob.local_disposal_state === 'completed') {
    redirect('/dashboard');
  }

  // Fetch account business name
  const { data: account } = await admin
    .from('accounts')
    .select('business_name, created_at')
    .eq('id', accountId)
    .single();

  const businessName = account?.business_name || 'Your Workspace';
  const purgeDate = closureJob.recoverable_until
    ? new Date(closureJob.recoverable_until)
    : new Date(Date.now() + 30 * 86400000);

  const daysRemaining = Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xl">
            LGQ
          </div>
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white">
          Account Scheduled for Closure
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          {businessName} is currently in a 30-day recoverable grace period.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <p className="text-sm font-medium text-amber-200">
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining to recover this account
              </p>
            </div>
            <p className="text-xs text-amber-300/80 mt-2">
              Permanent data disposal is scheduled for{' '}
              <strong className="text-amber-200">{purgeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              Until that date, your client records, job histories, estimates, and financials remain securely preserved.
            </p>
          </div>

          <div className="space-y-4 text-sm text-slate-300 mb-8">
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Account:</span>
              <span className="font-medium text-slate-200">{businessName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Closure Requested:</span>
              <span className="font-medium text-slate-200">
                {new Date(closureJob.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Status:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Suspended (Grace Period)
              </span>
            </div>
          </div>

          <form action={reactivateAccountAction} className="space-y-4">
            <input type="hidden" name="accountId" value={accountId} />
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors"
            >
              Reactivate Account & Keep Data
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
            <Link href="/login" className="hover:text-slate-400 transition-colors">
              &larr; Return to Sign In
            </Link>
            <span>Need help? Contact support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
