import { createAdminClient } from '@/lib/auth';
import { sendContractorAlertEmail, getAccountOwnerEmail } from '@/lib/email';
import { serviceDue, todayKey } from '@/lib/warranties';
import { loadBusinessName } from '@/lib/business-name';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export type SweepResult = { checked: number; notified: number; skipped: number };

/**
 * Tell contractors which of their past jobs are due a service.
 *
 * It nudges the CONTRACTOR, not the customer. A service reminder that goes
 * straight to the homeowner is a marketing message they didn't ask for, and it
 * arrives without the one thing that would make it useful — somebody with a van
 * and a free Tuesday. The contractor gets the list and decides who to call.
 *
 * Stamps service_reminded_at BEFORE sending, so a send that fails halfway
 * doesn't produce a second email on the next run. A missed reminder is
 * recoverable — the warranty stays due and the owner sees it on the job. A
 * duplicate is the thing that makes people mute a feature.
 */
export async function runServiceReminderSweep(): Promise<SweepResult> {
  const admin = createAdminClient();
  const today = todayKey();
  const result: SweepResult = { checked: 0, notified: 0, skipped: 0 };

  // Everything due or overdue, that hasn't already been flagged. The window is
  // handled by serviceDue so the definition of "due" lives in exactly one place.
  const { data, error } = await admin
    .from('warranties')
    .select('id, account_id, job_id, title, next_service_due, service_interval_months, last_service_on, service_reminded_at')
    .not('next_service_due', 'is', null)
    .is('service_reminded_at', null)
    .lte('next_service_due', new Date(Date.parse(`${today}T00:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10))
    .limit(500);

  if (error) {
    console.error('Service reminder sweep read failed:', error.message);
    return result;
  }

  const byAccount = new Map<string, { id: string; jobId: string; title: string; label: string }[]>();
  for (const row of data ?? []) {
    result.checked += 1;
    const due = serviceDue(
      {
        serviceIntervalMonths: row.service_interval_months === null ? null : Number(row.service_interval_months),
        nextServiceDue: row.next_service_due as string | null,
      },
      today,
    );
    if (!due.due) {
      result.skipped += 1;
      continue;
    }
    const list = byAccount.get(row.account_id as string) ?? [];
    list.push({ id: row.id as string, jobId: row.job_id as string, title: row.title as string, label: due.label });
    byAccount.set(row.account_id as string, list);
  }

  for (const [accountId, items] of byAccount) {
    // Stamped first. See the note above.
    const { error: stampError } = await admin
      .from('warranties')
      .update({ service_reminded_at: new Date().toISOString() })
      .in('id', items.map((item) => item.id));
    if (stampError) {
      console.error(`Service reminder stamp failed for account ${accountId}:`, stampError.message);
      continue;
    }

    try {
      const [ownerEmail, businessName] = await Promise.all([
        getAccountOwnerEmail(admin, accountId),
        loadBusinessName(admin, accountId),
      ]);
      if (!ownerEmail) continue;

      await sendContractorAlertEmail({
        accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject: `${items.length} job${items.length === 1 ? '' : 's'} due a service`,
        heading: 'Work you could book this month',
        bodyLines: [
          'These past jobs are due the servicing their warranty depends on:',
          ...items.slice(0, 12).map((item) => `${item.title} — ${item.label}`),
          items.length > 12 ? `…and ${items.length - 12} more.` : '',
          'Some manufacturer warranties are void without it, so this is a call the customer will thank you for.',
        ].filter(Boolean),
        ctaLabel: 'Open your jobs',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs`,
        tone: 'info',
      });
      result.notified += items.length;
    } catch (error) {
      console.error(`Service reminder email failed for account ${accountId}:`, error instanceof Error ? error.message : error);
    }
  }

  return result;
}
