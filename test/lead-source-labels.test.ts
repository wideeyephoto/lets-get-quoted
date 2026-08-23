import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatLeadSource, type LeadSource } from '@/lib/leads';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/**
 * Every lead source must be nameable everywhere it is shown.
 *
 * `formatLeadSource` ends in `return 'Manual'`, so a source it does not know
 * renders as "Manual" — telling a contractor they added a lead by hand when
 * something else created it. That is not a missing label, it is a wrong one, and
 * nothing would have failed: the value is in the enum, the row saves, the page
 * renders, and the only symptom is a sentence that is untrue.
 *
 * The list is read from the enum in schema.sql rather than restated here,
 * because a hand-copied list would go stale in exactly the case that matters.
 */
const SOURCES: LeadSource[] = (() => {
  const schema = read('schema.sql');
  const match = /create type lead_source as enum \(([^)]*)\)/.exec(schema);
  if (!match) throw new Error('could not find the lead_source enum in schema.sql');
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) as LeadSource[];
})();

describe('every lead source is named, everywhere it is shown', () => {
  it('finds the sources in the schema rather than trusting a list here', () => {
    expect(SOURCES).toContain('website_form');
    expect(SOURCES).toContain('missed_call');
    expect(SOURCES.length).toBeGreaterThanOrEqual(4);
  });

  it('gives each one its own label, and never falls through to Manual', () => {
    const labels = new Map(SOURCES.map((source) => [source, formatLeadSource(source)]));
    for (const [source, label] of labels) {
      if (source === 'manual') continue;
      expect(label, `${source} renders as "${label}"`).not.toBe('Manual');
    }
    // Distinct labels, or two different origins read as the same thing.
    expect(new Set(labels.values()).size).toBe(labels.size);
  });

  it('names an AI-answered call as what it is, not as a missed one', () => {
    // The call was answered. Reusing 'missed_call' would also collide with the
    // text-back dedupe, which suppresses on source within a ten-minute window.
    expect(formatLeadSource('ai_voice')).toBe('AI receptionist');
    expect(formatLeadSource('ai_voice')).not.toBe(formatLeadSource('missed_call'));
  });

  it('is nameable on the two dashboards that keep their own maps', () => {
    // Both are Record<string, string> lookups, so a missing key is undefined
    // rather than a type error — it renders as nothing at all.
    const maps = [
      ['quick-stops', read('src', 'app', 'dashboard', 'quick-stops', 'page.tsx')],
      ['insights', read('src', 'lib', 'insights.ts')],
    ] as const;

    for (const [name, source] of maps) {
      for (const value of SOURCES) {
        expect(source, `${value} has no label in ${name}`).toContain(`${value}:`);
      }
    }
  });

  it('has the enum value in a migration, not only in schema.sql', () => {
    // migrations/ alone against a fresh database must produce the same enum.
    expect(read('migrations', '20260819130000_lead_source_ai_voice.sql'))
      .toContain("add value if not exists 'ai_voice'");
  });
});
