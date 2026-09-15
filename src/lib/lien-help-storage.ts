import { SupabaseClient } from '@supabase/supabase-js';

export async function getLienHelpUploadUrl(supabase: SupabaseClient, accountId: string, caseId: string, fileName: string) {
  const path = `${accountId}/${caseId}/${Date.now()}-${fileName}`;
  const { data, error } = await supabase.storage.from('lien-help').createSignedUploadUrl(path);
  if (error) throw error;
  return { signedUrl: data.signedUrl, path: data.path, token: data.token };
}

export async function getLienHelpDownloadUrl(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from('lien-help').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
