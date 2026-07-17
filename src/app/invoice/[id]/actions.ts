'use server';

import { revalidatePath } from 'next/cache';
import { getPublicInvoice, signInvoice } from '@/lib/invoices';

export async function signInvoiceAction(invoiceId: string, formData: FormData) {
  const signerName = (formData.get('signerName') ?? '').toString().trim();
  const agreed = formData.get('agree') === 'on';

  if (!signerName || !agreed) {
    throw new Error('A full name and the agreement checkbox are required to sign.');
  }

  await signInvoice(invoiceId, signerName);

  const record = await getPublicInvoice(invoiceId);
  revalidatePath(`/invoice/${invoiceId}`);
  if (record?.invoice.job_id) {
    revalidatePath(`/dashboard/jobs/${record.invoice.job_id}`);
    revalidatePath(`/dashboard/jobs/${record.invoice.job_id}/invoices/${invoiceId}`);
  }
}
