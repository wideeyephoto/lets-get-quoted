import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './supabase-url';

/**
 * What the public status page is allowed to know.
 *
 * Separate from the page because a Next.js page file may only export the fields
 * Next itself defines, and because the interesting half of this feature is the
 * reading rather than the rendering: whether a failed query is allowed to read
 * as good news, and which columns are asked for at all.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. The first version of the page logged a
 * query error and then carried on with an empty array — which renders as "All
 * Systems Operational". The one moment a status page exists for, the database
 * being unreachable, was the moment it reassured every customer. Unknown is now
 * its own state and it is not green.
 *
 * THE COLUMNS ARE NAMED, NEVER `*`. They are exactly the columns anon is
 * granted in 20260911094000_platform_incidents_published.sql, so `select *`
 * would now 403 — but the reason to name them is that root_cause, owner,
 * created_by, external_url and affected_services are the internal half of an
 * incident write-up and must never be requested in the first place.
 */

export const PUBLIC_INCIDENT_COLUMNS =
  'id, kind, title, description, severity, impact_summary, resolution_summary, started_at, resolved_at';

export interface PublicIncident {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  severity: string;
  impact_summary: string | null;
  resolution_summary: string | null;
  started_at: string;
  resolved_at: string | null;
}

export type StatusView =
  | { state: 'unavailable' }
  | { state: 'incident'; active: PublicIncident[]; past: PublicIncident[] }
  | { state: 'operational'; active: PublicIncident[]; past: PublicIncident[] };

/** Minimal shape of the PostgREST builder, so this is testable without a network. */
type IncidentReader = { from: (table: string) => any };

/**
 * A session-free anon client, or null when the app is not configured.
 *
 * Deliberately not createSupabaseServerClient: the status page has to render
 * when the rest of the platform is unhealthy, so it should not depend on a
 * session refresh round-trip to reach the one table it needs. Signed in or
 * signed out, everyone is shown the same published rows, so there is nothing a
 * session would change.
 */
export function createStatusReader(): IncidentReader | null {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Misconfiguration reads as "we cannot tell you", never as "all is well".
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function loadStatus(client: IncidentReader | null): Promise<StatusView> {
  if (!client) return { state: 'unavailable' };

  const { data, error } = await client
    .from('platform_incidents')
    .select(PUBLIC_INCIDENT_COLUMNS)
    .eq('published', true)
    .order('started_at', { ascending: false })
    .limit(50);

  // A failed read is not an all-clear. Neither is a null payload carrying no
  // error, which is what a transport that gave up mid-flight looks like.
  if (error || !Array.isArray(data)) {
    console.error('Failed to load status incidents', error);
    return { state: 'unavailable' };
  }

  const incidents = data as PublicIncident[];
  // A release is a point-in-time note that never resolves. Counting one as an
  // open incident would park the page on red permanently.
  const active = incidents.filter((i) => i.kind === 'incident' && !i.resolved_at);
  const past = incidents.filter((i) => i.kind === 'release' || i.resolved_at);
  return active.length > 0 ? { state: 'incident', active, past } : { state: 'operational', active: [], past };
}
