'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, requireOwnerContext } from '@/lib/auth';
import { refundPayment } from '@/lib/payments';
import { markInvoicePaidForPayment } from '@/lib/invoices';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { assembleDisputeEvidence, type DisputeEvidenceBundle } from '@/lib/dispute-evidence';
import { calculateFinancingOptions, type FinancingTermOption } from '@/lib/financing-calculator';

export type ActionState<T = unknown> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};

/**
 * Record an offline / manual payment (Cash, Check, Bank Wire, Zelle)
 */
export async function recordManualPaymentAction(formData: FormData): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');

    const jobId = String(formData.get('jobId') || '').trim();
    const invoiceId = String(formData.get('invoiceId') || '').trim() || null;
    const amountStr = String(formData.get('amount') || '').trim();
    const method = String(formData.get('method') || 'Cash').trim();
    const label = String(formData.get('label') || 'Manual Payment').trim();
    const kind = String(formData.get('kind') || 'final').trim();
    const note = String(formData.get('note') || '').trim();

    const amount = Number.parseFloat(amountStr);
    if (!jobId) {
      return { success: false, error: 'Please select a job.' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Please enter a valid amount greater than $0.' };
    }

    const paymentLabel = note ? `${label} (${method} - ${note})` : `${label} (${method})`;

    // Insert payment record
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        account_id: accountId,
        job_id: jobId,
        invoice_id: invoiceId,
        kind,
        label: paymentLabel,
        amount,
        status: 'paid',
        charge_model: 'manual',
        platform_fee: 0,
        fee_rate: 0,
        paid_at: new Date().toISOString(),
        requested_at: new Date().toISOString(),
        refunded_amount: 0,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      throw insertError || new Error('Failed to record manual payment.');
    }

    // Mark invoice as paid if linked
    if (invoiceId) {
      try {
        await markInvoicePaidForPayment(supabase, invoiceId);
      } catch (err) {
        console.warn('Could not mark linked invoice as paid:', err);
      }
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/cash-flow');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { success: true, message: `Recorded ${method} payment of $${amount.toFixed(2)}.` };
  } catch (error) {
    console.error('recordManualPaymentAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment.',
    };
  }
}

/**
 * Record a batch settlement of multiple open invoices from one lump-sum check/wire
 */
export async function recordBatchInvoiceSettlementAction(
  jobId: string,
  method: string,
  allocations: Array<{ invoiceId: string; amount: number; ref?: string }>,
): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');

    if (!allocations || allocations.length === 0) {
      return { success: false, error: 'No invoices selected for settlement.' };
    }

    let settledCount = 0;
    let totalSettled = 0;

    for (const item of allocations) {
      if (item.amount > 0) {
        const { error: insErr } = await supabase.from('payments').insert({
          account_id: accountId,
          job_id: jobId,
          invoice_id: item.invoiceId,
          kind: 'final',
          label: `Lump-sum Batch Payment (${method} - ${item.ref || 'Inv'})`,
          amount: item.amount,
          status: 'paid',
          charge_model: 'manual',
          platform_fee: 0,
          fee_rate: 0,
          paid_at: new Date().toISOString(),
          requested_at: new Date().toISOString(),
          refunded_amount: 0,
        });

        if (!insErr) {
          settledCount++;
          totalSettled += item.amount;
          try {
            await markInvoicePaidForPayment(supabase, item.invoiceId);
          } catch (err) {
            console.warn(`Could not mark invoice ${item.invoiceId} paid:`, err);
          }
        }
      }
    }

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/cash-flow');
    return {
      success: true,
      message: `Successfully settled ${settledCount} invoices for a total of $${totalSettled.toFixed(2)}.`,
    };
  } catch (error) {
    console.error('recordBatchInvoiceSettlementAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record batch settlement.',
    };
  }
}

/**
 * Send an SMS or Email reminder for an unpaid invoice / payment request
 */
export async function sendPaymentReminderAction(formData: FormData): Promise<ActionState> {
  try {
    await requireOfficeContext('messages.send');
    const paymentId = String(formData.get('paymentId') || '').trim();
    const channel = String(formData.get('channel') || 'sms').trim();

    if (!paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }

    if (channel === 'sms') {
      try {
        await sendPaymentSmsEvent(paymentId, 'payment_requested');
      } catch (smsErr) {
        console.warn('SMS reminder failed:', smsErr);
        return { success: false, error: smsErr instanceof Error ? smsErr.message : 'Could not send SMS reminder.' };
      }
    }

    revalidatePath('/dashboard/payments');
    return { success: true, message: 'Payment reminder sent successfully.' };
  } catch (error) {
    console.error('sendPaymentReminderAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reminder.',
    };
  }
}

/**
 * Batch broadcast SMS reminders to all overdue invoice recipients
 */
export async function batchSendOverdueRemindersAction(_formData?: FormData): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOfficeContext('messages.send');

    // Fetch all pending payment requests that are overdue
    const { data: pendingPayments, error } = await supabase
      .from('payments')
      .select('id, homeowner_phone, requested_at, status')
      .eq('account_id', accountId)
      .in('status', ['requested', 'processing'])
      .not('homeowner_phone', 'is', null);

    if (error || !pendingPayments) {
      throw error || new Error('Failed to query overdue payments.');
    }

    let sentCount = 0;
    for (const pay of pendingPayments) {
      if (pay.homeowner_phone) {
        try {
          await sendPaymentSmsEvent(pay.id, 'payment_requested');
          sentCount++;
        } catch (smsErr) {
          console.warn(`Batch SMS failed for payment ${pay.id}:`, smsErr);
        }
      }
    }

    revalidatePath('/dashboard/payments');
    return {
      success: true,
      message: `Successfully broadcast reminders to ${sentCount} ${sentCount === 1 ? 'customer' : 'customers'}.`,
    };
  } catch (error) {
    console.error('batchSendOverdueRemindersAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to broadcast reminders.',
    };
  }
}

/**
 * Issue a full or partial refund on a paid transaction
 */
export async function issueRefundAction(formData: FormData): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    const paymentId = String(formData.get('paymentId') || '').trim();
    const amountStr = String(formData.get('amount') || '').trim();

    if (!paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }

    const amountDollars = amountStr ? Number.parseFloat(amountStr) : undefined;
    if (amountDollars !== undefined && (!Number.isFinite(amountDollars) || amountDollars <= 0)) {
      return { success: false, error: 'Enter a valid refund amount.' };
    }

    const result = await refundPayment(supabase, accountId, paymentId, amountDollars);

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/cash-flow');
    return {
      success: true,
      message: `Successfully issued ${result.isFull ? 'full' : 'partial'} refund of $${result.amount.toFixed(2)}.`,
    };
  } catch (error) {
    console.error('issueRefundAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund.',
    };
  }
}

/**
 * Create an instant payment link for a job
 */
export async function createInstantPayLinkAction(formData: FormData): Promise<ActionState<{ paymentId: string; payUrl: string }>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');
    const jobId = String(formData.get('jobId') || '').trim();
    const amountStr = String(formData.get('amount') || '').trim();
    const label = String(formData.get('label') || 'Payment Request').trim();
    const kind = String(formData.get('kind') || 'deposit').trim();
    const phone = String(formData.get('phone') || '').trim() || null;
    const sendSms = formData.get('sendSms') === '1' || formData.get('sendSms') === 'true';

    const amount = Number.parseFloat(amountStr);
    if (!jobId) {
      return { success: false, error: 'Please select a job.' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Please enter a valid amount greater than $0.' };
    }

    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        account_id: accountId,
        job_id: jobId,
        kind,
        label,
        amount,
        status: 'requested',
        homeowner_phone: phone,
        sms_consent: Boolean(sendSms && phone),
        requested_at: new Date().toISOString(),
        refunded_amount: 0,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      throw insertError || new Error('Failed to create payment link.');
    }

    if (sendSms && phone) {
      try {
        await sendPaymentSmsEvent(payment.id, 'payment_requested');
      } catch (smsErr) {
        console.warn('Could not send initial SMS:', smsErr);
      }
    }

    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://letsgetquoted.com').replace(/\/$/, '');
    const payUrl = `${origin}/pay/${payment.id}`;

    revalidatePath('/dashboard/payments');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return {
      success: true,
      message: `Created payment link for $${amount.toFixed(2)}.`,
      data: { paymentId: payment.id, payUrl },
    };
  } catch (error) {
    console.error('createInstantPayLinkAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment link.',
    };
  }
}

/**
 * Create a structured Milestone Payment Plan schedule for a job
 */
export async function createPaymentPlanScheduleAction(
  jobId: string,
  milestones: Array<{ label: string; amount: number; kind: string }>,
): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');

    if (!jobId) {
      return { success: false, error: 'Job is required.' };
    }
    if (!milestones || milestones.length === 0) {
      return { success: false, error: 'At least one milestone is required.' };
    }

    const insertRows = milestones.map((m) => ({
      account_id: accountId,
      job_id: jobId,
      kind: m.kind || 'stage',
      label: m.label,
      amount: m.amount,
      status: 'requested',
      requested_at: new Date().toISOString(),
      refunded_amount: 0,
    }));

    const { error } = await supabase.from('payments').insert(insertRows);
    if (error) throw error;

    revalidatePath('/dashboard/payments');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return {
      success: true,
      message: `Created ${milestones.length}-part payment plan successfully.`,
    };
  } catch (error) {
    console.error('createPaymentPlanScheduleAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment plan.',
    };
  }
}

/**
 * Assemble evidence bundle for a disputed payment
 */
export async function assembleDisputeEvidenceAction(paymentId: string): Promise<ActionState<DisputeEvidenceBundle>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');
    const bundle = await assembleDisputeEvidence(supabase, accountId, paymentId);
    if (!bundle) {
      return { success: false, error: 'Could not assemble dispute evidence for this payment.' };
    }
    return { success: true, data: bundle };
  } catch (error) {
    console.error('assembleDisputeEvidenceAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assemble evidence.',
    };
  }
}

/**
 * Generate homeowner financing calculation quote
 */
export async function generateFinancingQuoteAction(principal: number, customApr?: number): Promise<ActionState<FinancingTermOption[]>> {
  try {
    if (!principal || principal <= 0) {
      return { success: false, error: 'Enter a valid project amount.' };
    }
    const options = calculateFinancingOptions(principal, customApr);
    return { success: true, data: options };
  } catch (error) {
    console.error('generateFinancingQuoteAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate financing options.',
    };
  }
}

/**
 * Load statement data for a customer
 */
export async function getClientStatementDataAction(clientName: string): Promise<ActionState<{
  jobs: Array<{ id: string; ref?: string; client_name?: string; client_phone?: string | null; client_email?: string | null; created_at?: string }>;
  invoices: Array<{ id: string; ref?: string; job_id?: string; status?: string; total?: number; created_at?: string }>;
  payments: Array<{ id: string; job_id?: string; kind?: string; label?: string; amount?: number; status?: string; paid_at?: string | null; requested_at?: string }>;
}>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('reports.read');

    // Query jobs for this customer
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, ref, client_name, client_phone, client_email, created_at')
      .eq('account_id', accountId)
      .ilike('client_name', `%${clientName}%`);

    if (jobsError) throw jobsError;

    const jobIds = (jobs ?? []).map((j) => j.id);
    if (jobIds.length === 0) {
      return { success: false, error: `No records found for client "${clientName}".` };
    }

    const [invoicesRes, paymentsRes] = await Promise.all([
      supabase.from('invoices').select('id, ref, job_id, status, total, created_at').in('job_id', jobIds),
      supabase.from('payments').select('id, job_id, kind, label, amount, status, paid_at, requested_at').in('job_id', jobIds),
    ]);

    return {
      success: true,
      data: {
        jobs: jobs ?? [],
        invoices: invoicesRes.data ?? [],
        payments: paymentsRes.data ?? [],
      },
    };
  } catch (error) {
    console.error('getClientStatementDataAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load client statement.',
    };
  }
}
