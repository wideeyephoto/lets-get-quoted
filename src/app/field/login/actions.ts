'use server';

import { createAdminClient } from '@/lib/auth';
import { sendCrewMagicLink } from '@/lib/crew-auth';

export async function sendCrewMagicLinkAction(email: string, origin: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('Enter a valid email address.');

  // Personalize the email with the business name when the address matches a
  // crew roster — but don't reveal roster membership, so we always send.
  const admin = createAdminClient();
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
      admin.from('accounts').select('business_name').eq('id', crew.account_id).maybeSingle(),
      admin.from('sites').select('company_name').eq('account_id', crew.account_id).maybeSingle(),
    ]);
    businessName = site?.company_name || account?.business_name || 'your team';
  }

  await sendCrewMagicLink(clean, businessName, origin);
}
