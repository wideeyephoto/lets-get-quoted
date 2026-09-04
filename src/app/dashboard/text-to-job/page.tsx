import type { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import { isCrewPhoneVerified, resolveCrewPhoneVerification } from '@/lib/crew-verification';
import { evaluateFieldNoteConfidence } from '@/lib/field-intake-quality';
import { loadSmsFieldLeads } from '@/lib/field-intake-leads';
import { formatFeedTime } from '@/lib/job-detail-labels';
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
    { count: leadCount, error: leadError },
    { data: feedRows, error: feedError },
    ownerAlerts,
    fieldLeads,
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
    loadSmsFieldLeads(accountId),
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
  if (leadError) {
    console.error('Text-to-Job leads unreadable:', leadError);
  }
  if (feedError) {
    console.error('Text-to-Job feed rows unreadable:', feedError);
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

  type InboundMessageWithTime = InboundMessage & { createdAtMs: number };

  const feedMessages: InboundMessageWithTime[] = (feedRows || []).map((row) => {
    const jobTitle = (row.jobs as unknown as { title?: string } | null)?.title;
    const isVoice = row.kind === 'field_voice_note';
    const isCost = row.kind === 'cost_added';
    const createdDate = new Date(row.created_at);
    const timeFormatted = formatFeedTime(row.created_at);
    const rawText = row.body || row.title || 'Field update logged';
    const matchedRef = jobTitle ? `Job: ${jobTitle}` : undefined;
    const targetUrl = row.job_id ? `/dashboard/jobs/${row.job_id}` : '/dashboard/jobs';
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
      targetRecordUrl: targetUrl,
      extractedItems: [
        {
          id: `item-${row.id}`,
          pillar: isCost ? 'jobs' : 'crew',
          title: row.title || 'Logged Field Action',
          detail: row.body || 'Stored in job records',
          targetTable: isCost ? 'costs' : 'job_activity_feed',
          mutation: row.amount ? `+$${Number(row.amount).toFixed(2)} Logged` : 'Record Updated',
          enabled: true,
          targetUrl,
        },
      ],
      createdAtMs: createdDate.getTime(),
    };
  });

  const leadMessages: InboundMessageWithTime[] = (fieldLeads || []).map((lead) => {
    const leadCreatedDate = new Date(lead.createdAt);
    const timeFormatted = formatFeedTime(lead.createdAt);
    const rawText = lead.rawSmsText;
    const matchedRef = `New Lead: ${lead.leadName || 'New Prospect'}`;
    const targetUrl = lead.leadId ? `/dashboard/leads/${lead.leadId}` : '/dashboard/leads';
    const verdict = evaluateFieldNoteConfidence(rawText, {
      type: 'sms',
      matchedJobRef: matchedRef,
      extractedItemsCount: 1,
      isLead: true,
      hasPhone: Boolean(lead.phone),
    });

    const detailParts: string[] = [];
    if (lead.phone) detailParts.push(`Phone: ${lead.phone}`);
    if (lead.address) detailParts.push(`Address: ${lead.address}`);
    if (lead.message) detailParts.push(`Note: ${lead.message}`);
    const detail = detailParts.join(' · ') || 'Captured in leads pipeline';

    return {
      id: `lead-${lead.leadId}`,
      sender: lead.senderPhone || (ownerAlertPhone ? `Owner (${ownerAlertPhone})` : 'Field Lead Intake'),
      type: 'sms' as const,
      time: timeFormatted,
      rawText,
      confidence: verdict.score,
      qualityVerdict: verdict,
      matchedJobRef: matchedRef,
      targetRecordUrl: targetUrl,
      extractedItems: [
        {
          id: `item-lead-${lead.leadId}`,
          pillar: 'leads' as const,
          title: `New Lead: ${lead.leadName || 'New Prospect'}`,
          detail,
          targetTable: 'leads',
          mutation: lead.status === 'new' ? 'Lead Created · Ingested from Field' : `Lead Status: ${lead.status}`,
          enabled: true,
          targetUrl,
        },
      ],
      createdAtMs: leadCreatedDate.getTime(),
    };
  });

  const realMessages: InboundMessage[] = [...feedMessages, ...leadMessages]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 20)
    .map(({ createdAtMs: _ignored, ...msg }) => msg);

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
