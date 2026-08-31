'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { sendCrewMagicLink } from '@/lib/crew-auth';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

// Same exposure as the owner sign-in link, same limits — see app/login/actions.
// A crew member's inbox is no less worth protecting than an owner's, and this
// route reaches Resend on exactly the same sending domain.
const PER_EMAIL_LIMIT = 5;
const PER_EMAIL_WINDOW_SECONDS = 15 * 60;
const PER_IP_LIMIT = 15;
const PER_IP_WINDOW_SECONDS = 60 * 60;

export async function sendCrewMagicLinkAction(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('Enter a valid email address.');

  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());
  const withinEmailLimit = await checkRateLimitStrict(admin, `crewmagiclink:email:${clean}`, PER_EMAIL_LIMIT, PER_EMAIL_WINDOW_SECONDS);
  const withinIpLimit = await checkRateLimitStrict(admin, `crewmagiclink:ip:${ip}`, PER_IP_LIMIT, PER_IP_WINDOW_SECONDS);
  if (!withinEmailLimit || !withinIpLimit) {
    throw new Error('Too many sign-in links requested. Wait a few minutes and try again.');
  }

  // Personalize the email with the business name when the address matches a
  // crew roster — but don't reveal roster membership, so we always send.
  const { data: crew } = await admin
    .from('crew')
    .select('account_id')
    .ilike('email', clean)
    .is('deleted_at', null)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  let businessName = 'your team';
  if (crew?.account_id) {
    const [{ data: account }, { data: site }] = await Promise.all([
      admin.from('accounts').select('business_name, suspended_at').eq('id', crew.account_id).maybeSingle(),
      admin.from('sites').select('company_name').eq('account_id', crew.account_id).maybeSingle(),
    ]);
    if (!account?.suspended_at) {
      businessName = site?.company_name || account?.business_name || 'your team';
    }
  }

  await sendCrewMagicLink(clean, businessName);
}
