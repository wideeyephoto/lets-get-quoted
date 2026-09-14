import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { queueQuickStopRefund, processQuickStopRefunds } from '@/lib/quick-stop-refund-recovery';
import { getQuickStopRequest, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { centsToDollars } from '@/lib/quick-stop';
import { sendQuickStopOfferSms, sendQuickStopConfirmedSms } from '@/lib/sms';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

function fmtMoneyCents(cents: number | null): string {
  if (!cents) return '$0';
  return `$${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function whenLabel(date: string | null, start: string | null, end: string | null): string {
  const d = date ?? '';
  const range = start && end ? ` ${fmtTime(start)}–${fmtTime(end)}` : '';
  return `${d}${range}`.trim();
}

async function businessNameFor(admin: SupabaseClient, accountId: string): Promise<string> {
  const { data: site } = await admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle();
  if (site?.company_name) return site.company_name as string;
  const { data: account } = await admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  return (account?.business_name as string) || 'your contractor';
}

// The atomic offer RPC already linked the job/payment and started expiration.
// Delivery may be retried; this helper never creates another payment or changes
// the reservation, so a delivery failure cannot leave an incomplete offer.
export async function sendQuickStopOffer(supabase: SupabaseClient, accountId: string, requestId: string): Promise<void> {
  try {
    const request = await getQuickStopRequest(supabase, accountId, requestId);
    if (!request || request.status !== 'awaiting_customer_payment' || !request.job_id
      || !request.payment_id || !request.fee_cents || !request.client_phone) return;
    const deadline = new Date(request.payment_deadline_at ?? '').getTime();
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const minutes = Math.max(1, Math.ceil((deadline - Date.now()) / 60_000));
    const admin = createAdminClient();
    const businessName = await businessNameFor(admin, accountId);
    const feeLabel = `${fmtMoneyCents(request.fee_cents)} priority visit fee${request.diagnostic_fee_cents ? ` (+ ${fmtMoneyCents(request.diagnostic_fee_cents)} diagnostic)` : ''}`;
    await sendQuickStopOfferSms({
      accountId,
      toPhone: request.client_phone,
      businessName,
      whenLabel: whenLabel(request.arrival_date, request.arrival_start, request.arrival_end),
      feeLabel,
      payUrl: `${APP_ORIGIN}/pay/${request.payment_id}`,
      minutes,
      idempotencyKey: `quick-stop:${requestId}:offer:${request.payment_id}`,
    });
  } catch (error) {
    console.error('Quick Stop offer notification failed:', error instanceof Error ? error.message : error);
  }
}

// Webhook-side confirmation. Runs after markPaymentPaid; idempotent via an
// atomic compare-and-set on the request so an at-least-once webhook can't
// double-confirm. No-op for any payment that isn't a live Quick Stop offer.
export async function confirmQuickStopPayment(admin: SupabaseClient, paymentId: string): Promise<void> {
  const { data: confirmations, error: confirmationError } = await admin.rpc('confirm_quick_stop_payment', { p_payment_id: paymentId });
  if (confirmationError) throw new Error(confirmationError.message);
  const confirmed = confirmations?.[0];
  if (!confirmed) {
    const { data: stale, error: staleError } = await admin
      .from('extra_stop_requests')
      .select('id, account_id, status')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (staleError) throw new Error(staleError.message);
    if (stale && ['offer_expired', 'customer_canceled', 'customer_declined', 'contractor_canceled',
      'contractor_declined', 'no_show_confirmed', 'refunded'].includes(stale.status)) {
      // A redelivered webhook preserves any existing partial/zero cancellation
      // obligation. A never-booked late charge owes the entire visit fee.
      await queueQuickStopRefund(admin, stale.id as string);
      await processQuickStopRefunds(admin, 1, stale.account_id as string, stale.id as string);
    }
    return;
  }
  const accountId = confirmed.account_id as string;

  await logQuickStopEvent(admin, accountId, confirmed.id as string, {
    actor: 'stripe',
    from: 'awaiting_customer_payment',
    to: 'confirmed',
    meta: { paymentId },
  });

  const businessName = await businessNameFor(admin, accountId);
  const when = whenLabel(confirmed.arrival_date, confirmed.arrival_start, confirmed.arrival_end);

  if (confirmed.client_phone) {
    await sendQuickStopConfirmedSms({
      accountId,
      toPhone: confirmed.client_phone as string,
      businessName,
      whenLabel: when,
      statusUrl: `${APP_ORIGIN}/quick-stop/${confirmed.id}`,
      idempotencyKey: `quick-stop:${confirmed.id}:confirmed:${paymentId}`,
    });
  }

  // Owner receipt/notification.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject: '✅ Quick Stop confirmed & paid',
        heading: 'A Quick Stop is confirmed',
        bodyLines: [
          `${confirmed.client_name} paid the Quick Stop fee.`,
          `Arrival: ${when}.`,
          confirmed.address ? `Location: ${confirmed.address}` : 'No address on file.',
          'It’s locked on your calendar. Mark “I’ve Arrived” when you get there.',
        ],
        ctaLabel: 'View Quick Stops',
        ctaUrl: `${APP_ORIGIN}/dashboard/quick-stops`,
        tone: 'info',
      });
    }
  } catch (error) {
    console.error('Quick Stop confirm owner email failed:', error instanceof Error ? error.message : error);
  }
}
