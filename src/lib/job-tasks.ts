import type { SupabaseClient } from '@supabase/supabase-js';

export type JobTask = {
  id: string;
  account_id: string;
  job_id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  sort_order: number;
  created_at: string;
};

// Per-job checklist / punch list. Defensive: an un-migrated DB degrades to an
// empty list rather than throwing, so the job + field pages still render.
export async function listJobTasks(supabase: SupabaseClient, accountId: string, jobId: string): Promise<JobTask[]> {
  const { data, error } = await supabase
    .from('job_tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as JobTask[];
}

export async function createJobTask(supabase: SupabaseClient, accountId: string, jobId: string, title: string): Promise<JobTask> {
  const { data, error } = await supabase
    .from('job_tasks')
    .insert({ account_id: accountId, job_id: jobId, title: title.trim() })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to add the task.');
  return data as JobTask;
}

// Toggle a task done/undone, recording who and when (null when re-opened).
export async function setJobTaskDone(supabase: SupabaseClient, accountId: string, taskId: string, done: boolean, doneBy: string): Promise<void> {
  const { error } = await supabase
    .from('job_tasks')
    .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? doneBy : null })
    .eq('account_id', accountId)
    .eq('id', taskId);
  if (error) throw error;
}

export async function deleteJobTask(supabase: SupabaseClient, accountId: string, taskId: string): Promise<void> {
  const { error } = await supabase.from('job_tasks').delete().eq('account_id', accountId).eq('id', taskId);
  if (error) throw error;
}

export function taskProgress(tasks: JobTask[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}
