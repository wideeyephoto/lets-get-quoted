'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { respondAsClient } from '@/lib/change-order-client';

/**
 * The homeowner's answer to a change order.
 *
 * A public endpoint in every sense that matters: anyone holding the link can
 * call it, so it is rate-limited, the decision is validated against a fixed
 * pair, and the change order is confirmed to belong to this job before a single
 * write happens. See src/lib/change-order-client.ts.
 */
export async function respondToChangeOrderAction(
  token: string,
  changeOrderId: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());
  if (!(await checkRateLimit(admin, `co-respond:ip:${ip}`, 30, 60))) {
    return { ok: false, message: 'Too many attempts — wait a minute and try again.' };
  }

  const raw = String(formData.get('decision') ?? '');
  // Validated against the fixed pair before anything is read or written: a
  // caller must not be able to name their own status.
  if (raw !== 'approved' && raw !== 'declined') return { ok: false, message: 'Choose approve or decline.' };

  const result = await respondAsClient(token, changeOrderId, {
    decision: raw,
    signatureName: String(formData.get('signatureName') ?? ''),
    declineReason: String(formData.get('declineReason') ?? ''),
  });

  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
}
