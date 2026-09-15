'use server';

import { requireAdmin } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function startImpersonation(formData: FormData) {
  await requireAdmin();
  const accountId = formData.get('accountId');
  if (typeof accountId === 'string' && accountId) {
    (await cookies()).set('lgq_impersonate', accountId, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
    redirect('/dashboard');
  }
}

export async function stopImpersonation() {
  (await cookies()).delete('lgq_impersonate');
  redirect('/admin');
}
