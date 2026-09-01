import type { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import { isCrewPhoneVerified, resolveCrewPhoneVerification } from '@/lib/crew-verification';
import { evaluateFieldNoteConfidence } from '@/lib/field-intake-quality';
import { isOwnerFieldLineReady, loadOwnerAlerts } from '@/lib/owner-sms';
import TextToJobWorkspace, { type InboundMessage, type CrewRow } from './TextToJobWorkspace';

export const metadata: Metadata = {
  title: 'Text-to-Job Dashboard | SMS & Voice Memo Field Intake',
  description:
    'Send messages by voice or text to your smart AI Copilot, and it will organize notes, update job records, calculate change orders, log punch lists, and manage schedule slots automatically.',
};

export default async function TextToJobDashboardPage() {
  const { supabase, accountId, capabilities } = await requireOfficeContext('leads.read');
  const canManageOwnerPhone = capabilities.has('settings.write');

  const [
    { data: account, error: accountError },
    { data: crewRows, error: crewError },
    { count: jobCount },
    { count: leadCount },
    { data: feedRows },
    ownerAlerts,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('business_name, trade, call_tracking_number')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('crew')
      .select('id, name, phone, role_label, active, user_id, last_signed_in_at')
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
    loadOwnerAlerts(accountId),
  ]);

  if (accountError) {
    // Do not silently turn a database read failure into a false "phone setup
    // required" state. The owner-alert loader below has its own explicit
    // unavailable state, so the page can distinguish an outage from no setup.
    console.error('Text-to-Job account details unreadable:', accountError);
  }
  if (crewError) {
    console.error('Text-to-Job crew phone status unreadable:', crewError);
  }

  const ownerAlertPhone = ownerAlerts.kind === 'ok' ? ownerAlerts.phone : null;

  const mappedCrew: CrewRow[] = (crewRows || []).map((c) => {
    const verified = isCrewPhoneVerified(c);
    const verificationInfo = resolveCrewPhoneVerification(c);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      role_label: c.role_label,
      active: c.active !== false,
      phoneVerified: verified,
      verificationReason: verificationInfo.reason,
    };
  });

  const realMessages: InboundMessage[] = (feedRows || []).map((row) => {
    const jobTitle = (row.jobs as unknown as { title?: string } | null)?.title;
    const isVoice = row.kind === 'field_voice_note';
    const isCost = row.kind === 'cost_added';
    const createdDate = new Date(row.created_at);
    const timeFormatted = createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const rawText = row.body || row.title || 'Field update logged';
    const matchedRef = jobTitle ? `Job: ${jobTitle}` : undefined;
    const verdict = evaluateFieldNoteConfidence(rawText, {
      type: isVoice ? 'voice' : isCost ? 'receipt' : 'sms',
      matchedJobRef: matchedRef,
      extractedItemsCount: 1,
    });

    return {
      id: row.id,
      sender: row.author || (ownerAlertPhone ? `Owner (${ownerAlertPhone})` : 'Field Note'),
      type: isVoice ? 'voice' : isCost ? 'receipt' : 'sms',
      time: timeFormatted,
      rawText,
      audioDuration: isVoice ? '0:15' : undefined,
      confidence: verdict.score,
      qualityVerdict: verdict,
      matchedJobRef: matchedRef,
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

  const rawSharedNumber = process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323';
  // Match the owner lane used by inbound field routing: a normalized phone on
  // file, owner alerts enabled, and affirmative consent that has not been
  // stopped. A phone-shaped string alone is not a verified sender.
  const isQualified = isOwnerFieldLineReady(ownerAlerts);
  const workspaceAccount = {
    business_name: account?.business_name ?? null,
    alert_phone: ownerAlertPhone,
    trade: account?.trade ?? null,
    call_tracking_number: account?.call_tracking_number ?? null,
  };
  const ownerPhoneSetup = ownerAlerts.kind === 'ok'
    ? {
        phone: ownerAlerts.phone,
        enabled: ownerAlerts.enabled,
        consent: ownerAlerts.consent,
        consentedAt: ownerAlerts.consentedAt,
        consentVersion: ownerAlerts.consentVersion,
        disabled: !canManageOwnerPhone,
        disabledReason: canManageOwnerPhone
          ? null
          : 'Only the account owner or someone with Settings access can manage this phone.',
      }
    : {
        phone: null,
        enabled: false,
        consent: 'none' as const,
        consentedAt: null,
        consentVersion: null,
        disabled: true,
        disabledReason: 'Phone setup is unavailable until the saved settings can be checked.',
      };

  return (
    <TextToJobWorkspace
      account={workspaceAccount}
      crewMembers={mappedCrew}
      initialMessages={realMessages.length > 0 ? realMessages : undefined}
      sharedPhoneNumber={rawSharedNumber}
      isQualified={isQualified}
      qualificationUnavailable={ownerAlerts.kind === 'unavailable'}
      ownerPhoneSetup={ownerPhoneSetup}
      activeJobCount={jobCount ?? 0}
      leadCount={leadCount ?? 0}
      crewCount={crewRows?.length ?? 0}
    />
  );
}
