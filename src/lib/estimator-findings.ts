import type { SupabaseClient } from '@supabase/supabase-js';
import type { DefectItem } from './multimodal-defect-estimator';

export type EstimatorFinding = {
  id: string;
  job_id: string;
  account_id: string;
  photo_urls: string[];
  notes: string | null;
  trade: string | null;
  defects: DefectItem[];
  total_estimated_repair_dollars: number;
  urgency: 'routine' | 'urgent' | 'emergency';
  created_at: string;
};

export async function saveEstimatorFinding(
  supabase: SupabaseClient,
  finding: Omit<EstimatorFinding, 'id' | 'created_at'>
): Promise<{ ok: boolean; finding?: EstimatorFinding; message?: string }> {
  const { data, error } = await supabase
    .from('estimator_findings')
    .insert({
      job_id: finding.job_id,
      account_id: finding.account_id,
      photo_url: JSON.stringify(finding.photo_urls),
      notes: finding.notes,
      trade: finding.trade,
      defects: finding.defects,
      total_estimated_repair_dollars: finding.total_estimated_repair_dollars,
      urgency: finding.urgency,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving estimator finding:', error);
    return { ok: false, message: error.message };
  }
  return { ok: true, finding: { ...data, photo_urls: JSON.parse(data.photo_url || '[]') } as EstimatorFinding };
}

export async function getEstimatorFindingsForJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<EstimatorFinding[]> {
  const { data, error } = await supabase
    .from('estimator_findings')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching estimator findings:', error);
    return [];
  }
  return (data as any[]).map(d => ({
    ...d,
    photo_urls: JSON.parse(d.photo_url || '[]'),
  })) as EstimatorFinding[];
}
