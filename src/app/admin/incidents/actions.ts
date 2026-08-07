'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { isIncidentKind, isIncidentSeverity } from '@/lib/platform-incidents';

/**
 * Writing to platform_incidents.
 *
 * The table shipped with a reader, an index, a Command Center card and no way
 * to put a row in it — its own migration told staff to use the Supabase SQL
 * editor. So the card could only ever say "No releases or incidents logged
 * recently", which reads as good news rather than as "this cannot show you
 * anything".
 */

function back(query: string): never {
  redirect(`/admin/incidents?${query}`);
}

export async function logIncidentAction(formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();

  const title = String(formData.get('title') ?? '').trim().slice(0, 200);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000) || null;
  const kindRaw = String(formData.get('kind') ?? '');
  const severityRaw = String(formData.get('severity') ?? '');
  const startedRaw = String(formData.get('started_at') ?? '').trim();

  if (!title) back('error=title');
  if (!isIncidentKind(kindRaw)) back('error=kind');

  // A release is a point-in-time note and never carries a severity above
  // 'info' — the column allows it, but a "critical release" is a category
  // error, and the resolved_at half of the table has nothing to do with it.
  const severity = kindRaw === 'release' ? 'info' : (isIncidentSeverity(severityRaw) ? severityRaw : 'warning');

  // Backdating is the normal case: an incident is written up after it is
  // understood, not while it is burning. An unparseable date falls back to now
  // rather than rejecting the write and losing what was typed.
  const startedAt = startedRaw ? new Date(startedRaw) : new Date();
  const started_at = Number.isFinite(startedAt.getTime()) ? startedAt.toISOString() : new Date().toISOString();

  const { data, error } = await admin
    .from('platform_incidents')
    .insert({ kind: kindRaw, title, description, severity, started_at, created_by: adminEmail })
    .select('id')
    .single();
  if (error || !data) {
    console.error('logIncidentAction failed:', error);
    back('error=failed');
  }

  await logAdminAction(admin, adminEmail, {
    action: 'platform_incident_log',
    targetType: 'platform_incident',
    targetId: data.id,
    meta: { kind: kindRaw, severity, title },
  });

  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  back('done=logged');
}

export async function resolveIncidentAction(incidentId: string) {
  const { admin, adminEmail } = await requireAdmin();

  // Only an unresolved incident, so a second click cannot move the resolution
  // time and quietly change how long an outage is on record as having lasted.
  const { data, error } = await admin
    .from('platform_incidents')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', incidentId)
    .eq('kind', 'incident')
    .is('resolved_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('resolveIncidentAction failed:', error);
    back('error=failed');
  }
  if (!data) back('error=already_resolved');

  await logAdminAction(admin, adminEmail, {
    action: 'platform_incident_resolve',
    targetType: 'platform_incident',
    targetId: incidentId,
  });

  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  back('done=resolved');
}
