'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { listCrewForUser } from '@/lib/crew';
import { writeFieldAccount } from '@/lib/field-account';

/**
 * "This one." — the crew member picks which business the app is for.
 *
 * Membership is re-checked here rather than trusted from the form. A server
 * action answers anybody, and the account id is a value in a POST body: without
 * this, choosing a business would be a matter of typing its uuid.
 */
export async function chooseFieldBusinessAction(accountId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field/login');

  const rosters = await listCrewForUser(createAdminClient(), user.id);
  if (!rosters.some((member) => member.account_id === accountId)) {
    redirect('/field/choose?error=not-yours');
  }

  writeFieldAccount(accountId);
  redirect('/field');
}
