/**
 * The vocabulary of platform_incidents.
 *
 * Pure, so the guards can be tested and so the check constraints in the
 * database have exactly one counterpart in the application rather than a set of
 * string literals repeated across a form, an action and a renderer. The
 * constraint and this list are duplicated by necessity; if one grows a value
 * the other lacks, an insert fails at runtime instead of here.
 */

export type IncidentKind = 'release' | 'incident';
export type IncidentSeverity = 'info' | 'warning' | 'critical';

export const INCIDENT_KINDS: IncidentKind[] = ['release', 'incident'];
export const INCIDENT_SEVERITIES: IncidentSeverity[] = ['info', 'warning', 'critical'];

export function isIncidentKind(value: string | null | undefined): value is IncidentKind {
  return !!value && (INCIDENT_KINDS as string[]).includes(value);
}
export function isIncidentSeverity(value: string | null | undefined): value is IncidentSeverity {
  return !!value && (INCIDENT_SEVERITIES as string[]).includes(value);
}

/** What each word means, so two staff members log the same thing the same way. */
export const SEVERITY_HELP: Record<IncidentSeverity, string> = {
  info: 'Worth writing down. Nobody was affected.',
  warning: 'Some customers hit it, or one part of the product was degraded.',
  critical: 'Customers could not do something important — payments, booking, sign-in.',
};

export const KIND_HELP: Record<IncidentKind, string> = {
  release: 'A change that went out. A point in time, never resolved.',
  incident: 'Something broke. Stays open until you mark it resolved.',
};

/** How long an incident ran, or how long it has been running. */
export function incidentDuration(startedAt: string, resolvedAt: string | null, now: Date = new Date()): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 'unknown';
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  if (!Number.isFinite(end)) return 'unknown';
  // A clock skew or a backdated resolution must not print "-4 min", which reads
  // as a rendering fault rather than as a bad timestamp.
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} hr`;
  return `${Math.round(hours / 24)} days`;
}
