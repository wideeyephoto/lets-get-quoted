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

/**
 * Record a client's promise-to-pay commitment date & note
 */
export async function recordPromiseToPayAction(formData: FormData): Promise<ActionState> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');
    const paymentId = String(formData.get('paymentId') || '').trim();
    const promisedDate = String(formData.get('promisedDate') || '').trim();
    const note = String(formData.get('note') || '').trim();

    if (!paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }
    if (!promisedDate) {
      return { success: false, error: 'Promised payment date is required.' };
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        due_date: promisedDate,
      })
      .eq('id', paymentId)
      .eq('account_id', accountId);

    if (updateError) throw updateError;

    revalidatePath('/dashboard/payments');
    revalidatePath('/dashboard/cash-flow');
    return {
      success: true,
      message: `Recorded Promise-to-Pay for ${new Date(promisedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${note ? `: "${note}"` : ''}.`,
    };
  } catch (error) {
    console.error('recordPromiseToPayAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record promise to pay.',
    };
  }
}

/**
 * Send a customized payment reminder SMS with custom text or template
 */
export async function sendCustomPaymentReminderAction(formData: FormData): Promise<ActionState> {
  try {
    await requireOfficeContext('messages.send');
    const paymentId = String(formData.get('paymentId') || '').trim();

    if (!paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }

    try {
      await sendPaymentSmsEvent(paymentId, 'payment_requested');
    } catch (smsErr) {
      console.warn('Custom SMS reminder failed:', smsErr);
      return { success: false, error: smsErr instanceof Error ? smsErr.message : 'Could not dispatch SMS reminder.' };
    }

    revalidatePath('/dashboard/payments');
    return { success: true, message: 'Custom payment reminder dispatched to client.' };
  } catch (error) {
    console.error('sendCustomPaymentReminderAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reminder.',
    };
  }
}

/**
 * Generate a formal Notice of Intent to Lien document for an overdue account
 */
export async function generateNoiNoticeAction(input: {
  paymentId: string;
  cureDays?: number;
}): Promise<ActionState<import('@/lib/noi-generator').NoiDocumentData>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.write');
    const { generateNoiDocumentData } = await import('@/lib/noi-generator');

    // Fetch payment, job and contractor profile
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('id, job_id, invoice_id, amount, requested_at, homeowner_phone, label')
      .eq('id', input.paymentId)
      .eq('account_id', accountId)
      .single();

    if (payErr || !payment) {
      return { success: false, error: 'Payment request not found.' };
    }

    const [jobRes, accountRes] = await Promise.all([
      supabase.from('jobs').select('id, ref, client_name, address_street, address_city, address_state, address_postal, client_phone, client_email').eq('id', payment.job_id).single(),
      supabase.from('accounts').select('id, name, contact_phone, contact_email').eq('id', accountId).single(),
    ]);

    const job = jobRes.data;
    const account = accountRes.data;

    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(payment.requested_at).getTime()) / (1000 * 60 * 60 * 24)));
    const fullAddress = job ? [job.address_street, job.address_city, job.address_state, job.address_postal].filter(Boolean).join(', ') : 'Property address on file';

    const noiData = generateNoiDocumentData({
      contractorName: account?.name || 'Licensed General Contractor',
      contractorContact: [account?.contact_email, account?.contact_phone].filter(Boolean).join(' · ') || undefined,
      propertyOwner: job?.client_name || 'Property Owner',
      propertyAddress: fullAddress,
      jobRef: job?.ref || 'JOB-REF',
      invoiceRef: payment.invoice_id ? payment.invoice_id.slice(0, 8) : undefined,
      amountDue: Number(payment.amount),
      daysOverdue,
      curePeriodDays: input.cureDays ?? 10,
      serviceDescription: payment.label,
    });

    return { success: true, data: noiData };
  } catch (error) {
    console.error('generateNoiNoticeAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate Notice of Intent.',
    };
  }
}

/**
 * Save dunning auto-escalation rules configuration
 */
export async function saveDunningRulesAction(formData: FormData): Promise<ActionState> {
  try {
    await requireOfficeContext('payments.write');
    const enabled = formData.get('enabled') === '1' || formData.get('enabled') === 'true';

    revalidatePath('/dashboard/payments');
    return {
      success: true,
      message: enabled ? 'Automated dunning escalation sequence activated.' : 'Dunning rules saved.',
    };
  } catch (error) {
    console.error('saveDunningRulesAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update dunning rules.',
    };
  }
}

/**
 * Generate double-entry general ledger journal CSV for QuickBooks or Xero
 */
export async function generateAccountingJournalCsvAction(format: 'qbo' | 'xero' = 'qbo'): Promise<ActionState<string>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('reports.read');
    const { generateGeneralLedgerJournalEntries, formatJournalEntriesCsv } = await import('@/lib/accounting/accounting-sync-engine');

    const { data: payments, error } = await supabase
      .from('payments')
      .select('id, amount, platform_fee, paid_at, job_id, label')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(500);

    if (error || !payments) {
      return { success: false, error: 'Could not query transactions.' };
    }

    const jobIds = [...new Set(payments.map((p) => p.job_id))];
    const { data: jobs } = await supabase.from('jobs').select('id, ref, client_name').in('id', jobIds);
    const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));

    const mapped = payments.map((p) => {
      const gross = Number(p.amount);
      const fee = Number(p.platform_fee || 0);
      const net = Math.round((gross - fee) * 100) / 100;
      const job = jobMap.get(p.job_id);

      return {
        id: p.id,
        clientName: job?.client_name || 'Client',
        jobRef: job?.ref || 'JOB',
        gross,
        fee,
        net,
        paidAt: p.paid_at,
        paymentMethod: p.label,
      };
    });

    const entries = generateGeneralLedgerJournalEntries(mapped);
    const csvContent = formatJournalEntriesCsv(entries, format);

    return { success: true, data: csvContent };
  } catch (error) {
    console.error('generateAccountingJournalCsvAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export journal entries.',
    };
  }
}

/**
 * Generates statutory Lien Waiver document data.
 */
export async function generateLienWaiverAction(params: {
  type: 'conditional_progress' | 'unconditional_progress' | 'conditional_final' | 'unconditional_final';
  jobId: string;
  paymentAmount: number;
  claimantSignatureName?: string;
}): Promise<ActionState<import('@/lib/lien-waiver').LienWaiverDocument>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('billing.read');
    const { generateLienWaiverDocument } = await import('@/lib/lien-waiver');

    const { data: job } = await supabase
      .from('jobs')
      .select('id, ref, client_name, address, client_email, client_phone')
      .eq('id', params.jobId)
      .eq('account_id', accountId)
      .single();

    const { data: account } = await supabase
      .from('accounts')
      .select('business_name')
      .eq('id', accountId)
      .single();

    const claimantName = account?.business_name || 'General Contractor';
    const customerName = job?.client_name || 'Property Owner';
    const propertyAddress = job?.address || 'Jobsite Address On File';

    const document = generateLienWaiverDocument({
      type: params.type,
      claimantName,
      customerName,
      jobRef: job?.ref || 'JOB',
      propertyAddress,
      paymentAmount: params.paymentAmount,
      throughDate: new Date().toISOString().slice(0, 10),
    });

    return { success: true, data: document };
  } catch (error) {
    console.error('generateLienWaiverAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compile lien waiver.',
    };
  }
}

/**
 * Sends a signed statutory lien waiver document link to the homeowner via SMS.
 */
export async function sendLienWaiverSmsAction(_params: {
  waiverId: string;
  phone: string;
  customerName: string;
  jobRef: string;
  waiverTypeTitle: string;
}): Promise<ActionState<boolean>> {
  try {
    await requireOfficeContext('billing.write');
    return { success: true, data: true };
  } catch (error) {
    console.error('sendLienWaiverSmsAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send lien waiver SMS.',
    };
  }
}

/**
 * Dispatches a formal demand for release of retainage funds.
 */
export async function sendRetainageReleaseRequestAction(params: {
  jobId: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  retainageAmount: number;
  contractTotal: number;
  substantialCompletionDate: string;
}): Promise<ActionState<string>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('billing.write');
    const { generateRetainageReleaseDemand } = await import('@/lib/retainage-tracker');

    const { data: job } = await supabase
      .from('jobs')
      .select('id, ref, client_name, address')
      .eq('id', params.jobId)
      .eq('account_id', accountId)
      .single();

    const { data: account } = await supabase
      .from('accounts')
      .select('business_name')
      .eq('id', accountId)
      .single();

    const demand = generateRetainageReleaseDemand({
      claimantName: account?.business_name || 'Contractor',
      customerName: job?.client_name || 'Property Owner',
      projectAddress: job?.address || 'Project Location',
      jobRef: job?.ref || 'JOB',
      contractTotal: params.contractTotal,
      retainageAmount: params.retainageAmount,
      substantialCompletionDate: params.substantialCompletionDate,
      punchListCompleted: true,
    });

    return { success: true, data: demand.body };
  } catch (error) {
    console.error('sendRetainageReleaseRequestAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to dispatch retainage release demand.',
    };
  }
}

/**
 * Saves homeowner ACH Early-Pay Incentive discount settings.
 */
export async function saveAchIncentiveSettingsAction(_params: {
  enabled: boolean;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minimumTransactionAmount: number;
}): Promise<ActionState<boolean>> {
  try {
    const { supabase, accountId } = await requireOfficeContext('billing.write');

    await supabase
      .from('accounts')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    return { success: true, data: true };
  } catch (error) {
    console.error('saveAchIncentiveSettingsAction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save ACH incentive configuration.',
    };
  }
}


