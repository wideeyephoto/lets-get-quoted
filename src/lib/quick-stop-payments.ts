import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { createDepositRequest, refundPayment } from '@/lib/payments';
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

// Turn a sent offer into a live payment request: create the Stripe-backed
// payment row against the tentative job, stamp the 15-minute payment deadline
// (enforced app-side — see createCheckoutSessionForPayment; Stripe's own minimum
// is 30 min), move the request to awaiting_customer_payment, and text the
// customer the pay link. Called at the end of the offer action. Throws if the
// contractor hasn't finished Stripe payout setup (can't collect otherwise).
export async function sendQuickStopOffer(supabase: SupabaseClient, accountId: string, requestId: string): Promise<void> {
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  if (request.status !== 'contractor_offer_sent') throw new Error('This offer is no longer pending.');
  if (!request.job_id || !request.fee_cents) throw new Error('The offer is missing its job or fee.');

  const { data: account } = await supabase
    .from('accounts')
    .select('connect_onboarded, stripe_connect_id, extra_stop_payment_deadline_mins')
    .eq('id', accountId)
    .single();
  if (!account?.connect_onboarded || !account?.stripe_connect_id) {
    throw new Error('Finish your Stripe payout setup (Settings → Payouts) before sending Quick Stop offers.');
  }
  const minutes = Number(account.extra_stop_payment_deadline_mins) || 15;

  const payment = await createDepositRequest(supabase, accountId, request.job_id, {
    label: 'Quick Stop fee',
    amount: centsToDollars(request.fee_cents),
    kind: 'deposit',
    homeownerPhone: request.client_phone,
    smsConsent: Boolean(request.client_phone),
  });

  const now = Date.now();
  const deadlineIso = new Date(now + minutes * 60_000).toISOString();
  await supabase
    .from('extra_stop_requests')
    .update({
      status: 'awaiting_customer_payment',
      payment_id: payment.id,
      payment_deadline_at: deadlineIso,
      hold_expires_at: deadlineIso,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .eq('status', 'contractor_offer_sent');

  await logQuickStopEvent(supabase, accountId, requestId, {
    actor: 'contractor',
    from: 'contractor_offer_sent',
    to: 'awaiting_customer_payment',
    meta: { paymentId: payment.id, minutes },
  });

  if (request.client_phone) {
    const admin = createAdminClient();
    const businessName = await businessNameFor(admin, accountId);
    const feeLabel = `${fmtMoneyCents(request.fee_cents)} Quick Stop fee${request.diagnostic_fee_cents ? ` (+ ${fmtMoneyCents(request.diagnostic_fee_cents)} diagnostic)` : ''}`;
    await sendQuickStopOfferSms({
      accountId,
      toPhone: request.client_phone,
      businessName,
      whenLabel: whenLabel(request.arrival_date, request.arrival_start, request.arrival_end),
      feeLabel,
      payUrl: `${APP_ORIGIN}/pay/${payment.id}`,
      minutes,
    });
  }
}

// Webhook-side confirmation. Runs after markPaymentPaid; idempotent via an
// atomic compare-and-set on the request so an at-least-once webhook can't
// double-confirm. No-op for any payment that isn't a live Quick Stop offer.
export async function confirmQuickStopPayment(admin: SupabaseClient, paymentId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: confirmed } = await admin
    .from('extra_stop_requests')
    .update({ status: 'confirmed', paid_at: nowIso, updated_at: nowIso })
    .eq('payment_id', paymentId)
    .eq('status', 'awaiting_customer_payment')
    .select('*')
    .maybeSingle();
  if (!confirmed) {
    // Money-safety race: the sweep expired this offer (failing the pending
    // payment) but the charge still landed a moment later. Never keep money
    // without an appointment — refund it in full and mark it refunded.
    const { data: stale } = await admin
      .from('extra_stop_requests')
      .select('id, account_id, status, fee_cents, refund_cents')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (stale && stale.status === 'offer_expired' && !stale.refund_cents) {
      try {
        await refundPayment(admin, stale.account_id as string, paymentId);
        await admin
          .from('extra_stop_requests')
          .update({ status: 'refunded', refund_cents: stale.fee_cents ?? 0, updated_at: nowIso })
          .eq('id', stale.id)
          .eq('status', 'offer_expired');
        await logQuickStopEvent(admin, stale.account_id as string, stale.id as string, {
          actor: 'system',
          from: 'offer_expired',
          to: 'refunded',
          meta: { reason: 'late_payment_after_expiry', paymentId },
        });
      } catch (error) {
        console.error('Quick Stop late-payment refund failed:', error instanceof Error ? error.message : error);
      }
    }
    return; // not a live Quick Stop payment (or handled above)
  }

  const accountId = confirmed.account_id as string;

  // Make the tentative placeholder a live, confirmed appointment on the calendar.
  if (confirmed.job_id) {
    await admin.from('jobs').update({ status: 'in_progress' }).eq('id', confirmed.job_id).eq('account_id', accountId);
  }

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
    });
  }

  // Owner receipt/notification.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
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
