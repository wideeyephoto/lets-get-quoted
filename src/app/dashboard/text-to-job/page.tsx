import type { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import TextToJobWorkspace, { type InboundMessage } from './TextToJobWorkspace';

export const metadata: Metadata = {
  title: 'Text-to-Job Dashboard | SMS & Voice Memo Field Intake',
  description:
    'Send messages by voice or text to Sparky, your smart assistant, and he will organize things, submit and update job records, change orders, punch lists, and schedule slots automatically.',
};

export default async function TextToJobDashboardPage() {
  const { supabase, accountId } = await requireOfficeContext('leads.read');

  const [
    { data: account },
    { data: crewRows },
    { count: jobCount },
    { count: leadCount },
    { data: feedRows },
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
    supabase
      .from('job_feed')
      .select('id, kind, title, body, amount, author, created_at, meta, job_id, jobs(title)')
      .eq('account_id', accountId)
      .in('kind', ['field_voice_note', 'field_sms_update', 'cost_added', 'task_created'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const realMessages: InboundMessage[] = (feedRows || []).map((row) => {
    const jobTitle = (row.jobs as unknown as { title?: string } | null)?.title;
    const isVoice = row.kind === 'field_voice_note';
    const isCost = row.kind === 'cost_added';
    const createdDate = new Date(row.created_at);
    const timeFormatted = createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return {
      id: row.id,
      sender: row.author || (account?.alert_phone ? `Owner (${account.alert_phone})` : 'Field Note'),
      type: isVoice ? 'voice' : isCost ? 'receipt' : 'sms',
      time: timeFormatted,
      rawText: row.body || row.title || 'Field update logged',
      audioDuration: isVoice ? '0:15' : undefined,
      confidence: 99.8,
      matchedJobRef: jobTitle ? `Job: ${jobTitle}` : undefined,
      extractedItems: [
        {
          id: `item-${row.id}`,
          pillar: isCost ? 'jobs' : 'crew',
          title: row.title || 'Logged Field Action',
          detail: row.body || 'Stored in job records',
          targetTable: isCost ? 'costs' : 'job_activity_feed',
          mutation: row.amount ? `+$${Number(row.amount).toFixed(2)} Logged` : 'Record Updated',
          enabled: true,
        },
      ],
    };
  });

  return (
    <TextToJobWorkspace
      account={account}
      crewMembers={crewRows || []}
      initialMessages={realMessages.length > 0 ? realMessages : undefined}
      isDedicatedNumber={Boolean(account?.call_tracking_number)}
      activeJobCount={jobCount ?? 0}
      leadCount={leadCount ?? 0}
      crewCount={crewRows?.length ?? 0}
    />
  );
}
