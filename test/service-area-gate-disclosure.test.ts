import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The service-area gate has to say what it actually does.
 *
 * In the intake route a prune flag makes high-value impossible BY CONSTRUCTION,
 * forces the score to `low`, and the low-quality mute — on by default — then
 * suppresses the owner alert:
 *
 *   const isHighValue = !hasPruneFlag && ...
 *   score: hasPruneFlag ? 'low' : ...
 *   if (alert.muteLow && lead.triage?.score === 'low') return;
 *
 * So a large job from a town the list omits arrives with NO alert and no text.
 * The lead is never lost — it lands on the board — but nobody is told, and the
 * list doing the filtering was generated at site creation rather than written by
 * the owner. The old hint said "flags leads outside your list", which is true
 * and reads as cosmetic.
 */

const section = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'IntakeContentSection.tsx'),
  'utf8',
);
const automations = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'automations', 'page.tsx'),
  'utf8',
);
const intakeRoute = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'public', 'leads', 'route.ts'),
  'utf8',
);

describe('the intake route still behaves the way the disclosure claims', () => {
  // If any of these three change, the copy below becomes a lie and this file is
  // where that gets caught. Asserted against the ROUTE, not restated from memory.
  it('lets a prune flag defeat high-value', () => {
    expect(intakeRoute).toContain('const isHighValue = !hasPruneFlag');
  });

  it('forces a pruned lead to the low score', () => {
    expect(intakeRoute).toMatch(/score: hasPruneFlag \? 'low'/);
  });

  it('drops the owner alert for a low-scored lead when muted', () => {
    expect(intakeRoute).toMatch(/if \(alert\.muteLow && lead\.triage\?\.score === 'low'\) return;/);
  });

  it('still puts out_of_area behind the service-area gate', () => {
    expect(intakeRoute).toContain("flags.push('out_of_area')");
  });
});

describe('the service-area gate discloses its real effect', () => {
  it('receives the city list and the mute state, not just a boolean', () => {
    // hasCities alone can only ever produce "you have a list somewhere".
    expect(automations).toContain('cities={businessBasics.serviceAreas.cities');
    expect(automations).toContain('muteLowQualityLeads={muteLowQualityLeads}');
    expect(section).toContain('cities: string[];');
    expect(section).toContain('muteLowQualityLeads: boolean;');
  });

  it('names the towns rather than referring to "your list"', () => {
    // A filter the owner cannot see is indistinguishable from a quiet week.
    expect(section).toContain("cities.join(', ')");
  });

  it('says an omitted town costs the ALERT, and says it in the hint too', () => {
    // The hint is what shows when the detail is collapsed, which is most of the
    // time — so the consequence cannot live only in the expanded panel.
    expect(section).toMatch(/Leads from anywhere else get no alert/);
    expect(section).toMatch(/will not alert you/);
  });

  it('does not claim the lead is lost, because it is not', () => {
    // It lands on the leads board like anything else. Overstating this sends
    // somebody hunting for missing rows.
    expect(section).toContain('still lands in your leads board');
    for (const wrong of ['discarded', 'rejected', 'deleted', 'blocked', 'hidden from']) {
      expect(section.toLowerCase(), `must not claim leads are ${wrong}`).not.toContain(wrong);
    }
  });

  it('offers the two ways out that actually work', () => {
    // Add the town, or stop muting. Both are real; nothing else is.
    expect(section).toMatch(/Add every town/);
    expect(section).toContain('low-quality leads');
    expect(section).toContain('/dashboard/sites');
  });

  it('stays quiet when there is no list, because then the gate cannot fire', () => {
    // serviceAreaVerdict returns null for an empty list, so there is nothing to
    // warn about and a warning would be noise.
    expect(section).toContain('detail={hasCities ?');
  });
});
