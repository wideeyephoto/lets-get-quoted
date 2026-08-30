'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { parseUnsubscribeToken, suppressEmail } from '@/lib/email-suppression';

// Confirm-button target for the human unsubscribe page. Verifies the signed token,
// records the opt-out with the service-role client (no session on a public page),
// then redirects back to a "you're unsubscribed" confirmation. Idempotent.
export async function unsubscribeAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const decoded = parseUnsubscribeToken(token);
  if (!decoded) {
    redirect('/unsubscribe?error=1');
  }

  const admin = createAdminClient();
  const ok = await suppressEmail(admin, decoded.accountId, decoded.email, 'unsubscribe_link');
  if (!ok) {
    redirect(`/unsubscribe?token=${encodeURIComponent(token)}&error=1`);
  }

  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1`);
}
