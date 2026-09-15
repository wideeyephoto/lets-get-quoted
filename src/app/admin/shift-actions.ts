'use server';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import type { ShiftNote } from './ShiftNotesWidget';

export async function getRecentShiftNotes(): Promise<ShiftNote[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('admin_shift_notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    return data || [];
  } catch (err) {
    // Graceful fallback if table doesn't exist yet
    return [];
  }
}

export async function addShiftNote(body: string) {
  const { adminEmail } = await requireAdmin();
  const supabase = createAdminClient();
  
  try {
    await supabase.from('admin_shift_notes').insert({
      author_email: adminEmail,
      body
    });
  } catch (err) {
    console.error('Failed to add shift note', err);
  }
  
  revalidatePath('/admin');
}
