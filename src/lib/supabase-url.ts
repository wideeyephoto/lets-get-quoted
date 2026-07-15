export function normalizeSupabaseUrl(value?: string) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  const dashboardMatch = trimmed.match(/https?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  return trimmed;
}
