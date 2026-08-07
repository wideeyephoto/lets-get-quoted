import { describe, it, expect } from 'vitest';
import {
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  KIND_HELP,
  SEVERITY_HELP,
  incidentDuration,
  isIncidentKind,
  isIncidentSeverity,
} from '@/lib/platform-incidents';

describe('the vocabulary', () => {
  it('accepts what the check constraint accepts', () => {
    expect(isIncidentKind('release')).toBe(true);
    expect(isIncidentKind('incident')).toBe(true);
    expect(isIncidentSeverity('info')).toBe(true);
    expect(isIncidentSeverity('warning')).toBe(true);
    expect(isIncidentSeverity('critical')).toBe(true);
  });

  it('rejects anything else rather than letting the insert fail at runtime', () => {
    expect(isIncidentKind('outage')).toBe(false);
    expect(isIncidentKind('')).toBe(false);
    expect(isIncidentKind(null)).toBe(false);
    expect(isIncidentSeverity('sev1')).toBe(false);
    expect(isIncidentSeverity('CRITICAL')).toBe(false);
    expect(isIncidentSeverity(undefined)).toBe(false);
  });

  // A severity scale nobody defined is a scale nobody can compare across
  // incidents — two staff grade the same outage differently and the history
  // becomes unreadable.
  it('explains every word it offers', () => {
    for (const kind of INCIDENT_KINDS) expect(KIND_HELP[kind], `no help for ${kind}`).toBeTruthy();
    for (const sev of INCIDENT_SEVERITIES) expect(SEVERITY_HELP[sev], `no help for ${sev}`).toBeTruthy();
  });
});

describe('how long it ran', () => {
  const start = '2026-08-09T10:00:00.000Z';
  const at = (mins: number) => new Date(Date.parse(start) + mins * 60000);

  it('counts up through minutes, hours and days', () => {
    expect(incidentDuration(start, null, at(20))).toBe('20 min');
    expect(incidentDuration(start, null, at(3 * 60))).toBe('3 hr');
    expect(incidentDuration(start, null, at(5 * 24 * 60))).toBe('5 days');
  });

  it('measures to the resolution when there is one, not to now', () => {
    const resolved = new Date(Date.parse(start) + 45 * 60000).toISOString();
    expect(incidentDuration(start, resolved, at(10000))).toBe('45 min');
  });

  // A backdated resolution or a clock skew must not print "-4 min", which reads
  // as a rendering fault rather than as a bad timestamp.
  it('never reports a negative duration', () => {
    const before = new Date(Date.parse(start) - 60 * 60000).toISOString();
    expect(incidentDuration(start, before)).toBe('0 min');
    expect(incidentDuration(start, null, at(-120))).toBe('0 min');
  });

  it('says so rather than printing NaN', () => {
    expect(incidentDuration('not-a-date', null)).toBe('unknown');
    expect(incidentDuration(start, 'not-a-date')).toBe('unknown');
  });
});
