import type { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import TextToJobWorkspace from './TextToJobWorkspace';

export const metadata: Metadata = {
  title: 'Text-to-Job Dashboard | SMS & Voice Memo Field Intake',
  description:
    'Review field SMS and voice memo intakes, audit extracted entities across Jobs, Leads, Schedule, and Crew, and manage authorized phone numbers and TOS acknowledgment.',
};

export default async function TextToJobDashboardPage() {
  const { supabase, accountId } = await requireOfficeContext('leads.read');

  const [
    { data: account },
    { data: crewRows },
    { count: jobCount },
    { count: leadCount },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('company_name, business_name, trade, phone, alert_phone, call_tracking_number')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('crew')
      .select('id, name, phone, role_label, active')
      .eq('account_id', accountId)
      .order('name'),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .neq('status', 'archived'),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
  ]);

  return (
    <TextToJobWorkspace
      account={account}
      crewMembers={crewRows || []}
      activeJobCount={jobCount ?? 4}
      leadCount={leadCount ?? 12}
      crewCount={crewRows?.length ?? 3}
    />
  );
}
