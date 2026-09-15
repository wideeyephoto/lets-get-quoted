'use server';

import { requireOfficeContext } from '@/lib/auth';
import { createLienHelpCase, updateLienHelpCase } from '@/lib/lien-help-data';
import { revalidatePath } from 'next/cache';

export async function startLienHelpAction(formData: FormData) {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.collect');
    const jobId = formData.get('jobId') as string;
    if (!jobId) throw new Error('Missing job ID');

    await createLienHelpCase(supabase, accountId, jobId);
    
    revalidatePath(`/dashboard/jobs/${jobId}/lien-help`);
    
  } catch (err: any) {
    console.error('startLienHelpAction failed:', err);
    
  }
}

export async function advanceLienHelpLifecycleAction(formData: FormData) {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.collect');
    const caseId = formData.get('caseId') as string;
    const jobId = formData.get('jobId') as string;
    const lifecycle = formData.get('lifecycle') as 'preparing' | 'ready' | 'filed' | 'closed';
    if (!caseId || !jobId || !lifecycle) throw new Error('Missing fields');

    await updateLienHelpCase(supabase, accountId, caseId, { lifecycle });
    
    revalidatePath(`/dashboard/jobs/${jobId}/lien-help`);
    
  } catch (err: any) {
    console.error('advanceLienHelpLifecycleAction failed:', err);
    
  }
}
