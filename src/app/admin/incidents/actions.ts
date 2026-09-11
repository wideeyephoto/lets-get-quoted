'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { isIncidentKind, isIncidentSeverity } from '@/lib/platform-incidents';
import { dispatchOnCallPage } from '@/lib/on-call-paging';

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

function externalHttpUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function logIncidentAction(formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const { admin } = ctx;

  const title = String(formData.get('title') ?? '').trim().slice(0, 200);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000) || null;
  const kindRaw = String(formData.get('kind') ?? '');
  const severityRaw = String(formData.get('severity') ?? '');
  const startedRaw = String(formData.get('started_at') ?? '').trim();
  const owner = String(formData.get('owner') ?? '').trim().slice(0, 320) || ctx.adminEmail;
  const rootCause = String(formData.get('root_cause') ?? '').trim().slice(0, 4000) || null;
  const affectedServices = String(formData.get('affected_services') ?? '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 20);
  const impactSummary = String(formData.get('impact_summary') ?? '').trim().slice(0, 2000) || null;
  const externalRaw = String(formData.get('external_url') ?? '').trim().slice(0, 1000);
  const externalUrl = externalHttpUrl(externalRaw);

  if (!title) back('error=title');
  if (!isIncidentKind(kindRaw)) back('error=kind');
  if (externalRaw && !externalUrl) back('error=url');

  // A release is a point-in-time note and never carries a severity above
  // 'info' — the column allows it, but a "critical release" is a category
  // error, and the resolved_at half of the table has nothing to do with it.
  const severity = kindRaw === 'release' ? 'info' : (isIncidentSeverity(severityRaw) ? severityRaw : 'warning');

  // Backdating is the normal case: an incident is written up after it is
  // understood, not while it is burning. An unparseable date falls back to now
  // rather than rejecting the write and losing what was typed.
  const startedAt = startedRaw ? new Date(startedRaw) : new Date();
  const started_at = Number.isFinite(startedAt.getTime()) ? startedAt.toISOString() : new Date().toISOString();
  const published = formData.get('published') === 'true' || formData.get('published') === 'on';

  const { data, error } = await admin
    .from('platform_incidents')
    .insert({ kind: kindRaw, title, description, severity, started_at, created_by: ctx.adminEmail, owner, root_cause: rootCause, affected_services: affectedServices, impact_summary: impactSummary, external_url: externalUrl, published })
    .select('id')
    .single();
  if (error || !data) {
    console.error('logIncidentAction failed:', error);
    back('error=failed');
  }

  await logAdminAction(admin, ctx, {
    action: 'platform_incident_log',
    targetType: 'platform_incident',
    targetId: data.id,
    meta: { kind: kindRaw, severity, title, owner, affectedServices, externalUrl, published },
  });

  if (kindRaw === 'incident' && severity === 'critical') {
    try {
      await dispatchOnCallPage({
        incidentKey: `platform_incident_${data.id}`,
        title: `[${severity.toUpperCase()}] ${title}`,
        severity: 'P1_CRITICAL',
        summary: description || impactSummary || title,
        incidentType: 'database',
        source: `admin:incident:${data.id}`,
        details: { affectedServices, owner, impactSummary },
      });
    } catch (pageErr) {
      console.error('dispatchOnCallPage failed for incident:', pageErr);
    }
  }

  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  back('done=logged');
}

export async function resolveIncidentAction(incidentId: string, formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const { admin } = ctx;
  const resolutionSummary = String(formData.get('resolution_summary') ?? '').trim().slice(0, 4000);
  const rootCause = String(formData.get('root_cause') ?? '').trim().slice(0, 4000) || null;
  if (resolutionSummary.length < 4) back('error=resolution');

  // Only an unresolved incident, so a second click cannot move the resolution
  // time and quietly change how long an outage is on record as having lasted.
  const { data, error } = await admin
    .from('platform_incidents')
    .update({ resolved_at: new Date().toISOString(), resolution_summary: resolutionSummary, root_cause: rootCause })
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

  await logAdminAction(admin, ctx, {
    action: 'platform_incident_resolve',
    targetType: 'platform_incident',
    targetId: incidentId,
    reason: resolutionSummary,
    after: { resolution_summary: resolutionSummary, root_cause: rootCause },
  });

  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  back('done=resolved');
}
export async function togglePublishIncidentAction(formData: FormData) {
  const incidentId = String(formData.get('incident_id'));
  const published = formData.get('published') === 'true';
  const ctx = await requireMfaPermission('ops.manage');
  const { admin } = ctx;

  const { data, error } = await admin
    .from('platform_incidents')
    .update({ published })
    .eq('id', incidentId)
    .select('id, title, published')
    .single();

  if (error) {
    console.error('togglePublishIncidentAction failed:', error);
    back('error=failed');
  }

  await logAdminAction(admin, ctx, {
    action: 'platform_incident_update',
    targetType: 'platform_incident',
    targetId: incidentId,
    meta: { published },
  });

  revalidatePath('/admin/incidents');
  revalidatePath('/status');
  back('done=' + (published ? 'published' : 'unpublished'));
}

export async function updateIncidentDescriptionAction(incidentId: string, formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000) || null;
  const { data, error } = await ctx.admin
    .from('platform_incidents')
    .update({ description })
    .eq('id', incidentId)
    .select('id, title, description, published')
    .single();
  if (error || !data) back('error=failed');

  await logAdminAction(ctx.admin, ctx, {
    action: 'platform_incident_update',
    targetType: 'platform_incident',
    targetId: data.id,
    after: { description: data.description },
    meta: { title: data.title, published: data.published, edit: 'description' },
  });
  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  revalidatePath('/status');
  back('done=updated');
}

export async function deleteIncidentAction(incidentId: string, formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  if (formData.get('confirm_delete') !== 'yes') back('error=delete_confirmation');
  // Require retraction first, including if publication changed since the page loaded.
  const { data, error } = await ctx.admin
    .from('platform_incidents')
    .delete()
    .eq('id', incidentId)
    .eq('published', false)
    .select('id, title, description, root_cause, owner, published, resolution_summary')
    .maybeSingle();
  if (error) back('error=failed');
  if (!data) back('error=delete_unavailable');

  await logAdminAction(ctx.admin, ctx, {
    action: 'platform_incident_delete',
    targetType: 'platform_incident',
    targetId: data.id,
    before: data,
    meta: { title: data.title },
  });
  revalidatePath('/admin/incidents');
  revalidatePath('/admin');
  revalidatePath('/status');
  back('done=deleted');
}
