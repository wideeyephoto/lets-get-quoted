'use server';

import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';

export async function forceRunCron(formData: FormData) {
  const { adminEmail } = await requireAdmin();
  const job = formData.get('job');
  if (!job || typeof job !== 'string') return;
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/cron/${job}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    });
    if (!res.ok) {
      console.error(`Failed to triage-run cron ${job}: ${res.status}`);
    }
  } catch (err) {
    console.error(`Error triage-running cron ${job}`, err);
  }
  
  revalidatePath('/admin');
}

export async function assignCase(formData: FormData) {
  const { adminEmail, role } = await requireAdmin();
  const caseId = formData.get('caseId');
  if (!caseId || typeof caseId !== 'string') return;
  
  const supabase = createAdminClient();
  await supabase.from('support_cases').update({ assigned_to: adminEmail }).eq('id', caseId);
  revalidatePath('/admin');
}
