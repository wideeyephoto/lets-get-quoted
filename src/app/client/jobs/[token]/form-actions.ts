'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { signCustomerFormSubmission } from '@/lib/forms/forms-data';
import { headers } from 'next/headers';

/**
 * Signs a job form completion certificate from the customer portal.
 */
export async function signClientFormAction(
  token: string,
  submissionId: string,
  signatureData: {
    signaturePath: string;
    signerName: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await resolveJobAccess(token);
    if (!access) {
      return { success: false, error: 'Invalid or expired client access link.' };
    }

    const admin = createAdminClient();
    const headerList = await headers();
    const ip = headerList.get('x-forwarded-for') || headerList.get('x-real-ip') || '127.0.0.1';

    const signed = await signCustomerFormSubmission(admin, submissionId, {
      signaturePath: signatureData.signaturePath,
      signerName: signatureData.signerName,
      ip,
    });

    if (!signed) {
      return { success: false, error: 'Certificate record not found.' };
    }

    // Log to job feed
    try {
      await admin.from('job_feed').insert({
        account_id: access.accountId,
        job_id: access.jobId,
        kind: 'form_signed_by_client',
        author: signatureData.signerName,
        title: `Completion Certificate Signed by Customer`,
        body: `Customer e-signed "${signed.templateSnapshot.title}". Formal certificate of completion executed.`,
        visibility: 'client',
      });
    } catch {
      // Non-critical feed logging
    }

    revalidatePath(`/client/jobs/${token}`);
    revalidatePath(`/dashboard/jobs/${access.jobId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to sign certificate.' };
  }
}
