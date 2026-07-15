'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import {
  addInvoiceItem,
  createInvoice,
  deleteInvoice,
  deleteInvoiceItem,
  updateInvoiceStatus,
  getInvoiceWithItems,
  type InvoiceStatus,
} from '@/lib/invoices';
import { getJob } from '@/lib/jobs';
import { sendInvoiceEmail } from '@/lib/email';

export async function createInvoiceAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const status = (formData.get('status') as InvoiceStatus) || 'draft';
  const invoice = await createInvoice(supabase, accountId, jobId, status);

  revalidatePath(`/dashboard/jobs/${jobId}`);
  redirect(`/dashboard/jobs/${jobId}/invoices/${invoice.id}`);
}

export async function addInvoiceItemAction(jobId: string, invoiceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const description = (formData.get('description') ?? '').toString().trim() || 'Line item';
  const amount = Number(formData.get('amount'));

  await addInvoiceItem(supabase, accountId, invoiceId, { description, amount });

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function deleteInvoiceItemAction(jobId: string, invoiceId: string, itemId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteInvoiceItem(supabase, accountId, invoiceId, itemId);

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function updateInvoiceStatusAction(jobId: string, invoiceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const status = (formData.get('status') as InvoiceStatus) || 'draft';

  // If status is changing to 'sent', send invoice email
  if (status === 'sent') {
    try {
      const invoiceData = await getInvoiceWithItems(supabase, accountId, invoiceId);
      if (!invoiceData) {
        throw new Error('Invoice not found');
      }

      const { invoice, items } = invoiceData;

      // Get account details
      const { data: account } = await supabase
        .from('accounts')
        .select('business_name')
        .eq('id', accountId)
        .maybeSingle();

      if (!account) {
        throw new Error('Account not found');
      }

      // Get job details
      const job = await getJob(supabase, accountId, jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Get owner email
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error('Owner email not found');
      }

      // Get origin for email link
      const h = headers();
      const proto = h.get('x-forwarded-proto') ?? 'http';
      const host = h.get('host');
      const origin = `${proto}://${host}`;

      // Send invoice email to the contractor owner
      await sendInvoiceEmail({
        invoice,
        items,
        businessName: account.business_name,
        clientName: job.client_name,
        jobRef: job.ref,
        recipientEmail: user.email,
        origin,
      });
    } catch (err) {
      // Log error but don't fail the status update
      console.error('Failed to send invoice email:', err);
    }
  }

  await updateInvoiceStatus(supabase, accountId, invoiceId, status);

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function deleteInvoiceAction(jobId: string, invoiceId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteInvoice(supabase, accountId, invoiceId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
  redirect(`/dashboard/jobs/${jobId}?tab=invoices`);
}
