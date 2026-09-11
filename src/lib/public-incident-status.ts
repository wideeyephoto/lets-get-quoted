import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_INCIDENT_COLUMNS, type PublicIncident } from './platform-incidents';

export async function getPublicIncidentStatus(client?: SupabaseClient): Promise<{
  available: boolean; active: PublicIncident[]; history: PublicIncident[];
}> {
  try {
    // Public status never depends on an admin session or a service-role key.
    const publicClient = client ?? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
      },
    );
    // Read active incidents separately so a long-running outage cannot disappear
    // behind ten newer history entries.
    const signal = AbortSignal.timeout(5000);
    const [active, history] = await Promise.all([
      publicClient.from('platform_incidents').select(PUBLIC_INCIDENT_COLUMNS)
        .eq('published', true).eq('kind', 'incident').is('resolved_at', null)
        .order('started_at', { ascending: false }).limit(100).abortSignal(signal),
      publicClient.from('platform_incidents').select(PUBLIC_INCIDENT_COLUMNS)
        .eq('published', true).or('resolved_at.not.is.null,kind.eq.release')
        .order('started_at', { ascending: false }).limit(10).abortSignal(signal),
    ]);
    if (active.error || history.error || !active.data || !history.data) {
      console.error('Public incident status unavailable', { code: active.error?.code ?? history.error?.code ?? 'missing_data' });
      return { available: false, active: [], history: [] };
    }
    return { available: true, active: active.data as PublicIncident[], history: history.data as PublicIncident[] };
  } catch {
    console.error('Public incident status unavailable: request or configuration failure');
    return { available: false, active: [], history: [] };
  }
}
