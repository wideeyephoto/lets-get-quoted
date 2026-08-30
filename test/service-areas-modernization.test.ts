import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSiteContent } from '@/lib/site-content';
import { matchesServedCity } from '@/lib/service-area-match';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const FIELD_CODE = read('src', 'app', 'dashboard', 'sites', 'ServiceAreasField.tsx');
const ACTIONS_CODE = read('src', 'app', 'dashboard', 'sites', 'actions.ts');
const BUILDER_CODE = read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx');
const CSS_CODE = read('src', 'app', 'dashboard', 'sites', 'SiteEditor.module.css');

describe('Service Areas Modernization', () => {
  it('normalizes radiusMiles and baseZip in getSiteContent', () => {
    const content = getSiteContent({
      serviceAreas: {
        enabled: true,
        title: 'Areas We Serve',
        intro: 'Serving Greater Detroit',
        radiusMiles: 25,
        baseZip: '48067',
        cities: ['Royal Oak, MI', 'Troy, MI', 'Birmingham, MI'],
      },
    });

    expect(content.serviceAreas.radiusMiles).toBe(25);
    expect(content.serviceAreas.baseZip).toBe('48067');
    expect(content.serviceAreas.cities).toEqual(['Royal Oak, MI', 'Troy, MI', 'Birmingham, MI']);
  });

  it('exports suggestNearbyCitiesAction and testIntakeLocationAction in actions.ts', () => {
    expect(ACTIONS_CODE).toContain('export async function suggestNearbyCitiesAction(');
    expect(ACTIONS_CODE).toContain('export async function testIntakeLocationAction(');
  });

  it('provides continuous always-3 surrounding cities stream, place chips, and intake tester in ServiceAreasField.tsx', () => {
    // Automatic always-3 surrounding cities stream (0 AI credits)
    expect(FIELD_CODE).toContain('candidatePool');
    expect(FIELD_CODE).toContain('dismissedCities');
    expect(FIELD_CODE).toContain('remainingCandidates');
    expect(FIELD_CODE).toContain('next3Suggestions');
    expect(FIELD_CODE).toContain('always3Container');
    expect(FIELD_CODE).toContain('always3Grid');
    expect(FIELD_CODE).toContain('addAll3');
    expect(FIELD_CODE).toContain('skipCity');

    // Place chips & bulk paste quick add
    expect(FIELD_CODE).toContain('activeCities');
    expect(FIELD_CODE).toContain('handleQuickAddCommit');
    expect(FIELD_CODE).toContain('cityChip');
    expect(FIELD_CODE).toContain('cityChipRemove');

    // Live Homeowner Intake Match Tester
    expect(FIELD_CODE).toContain('testIntakeLocationAction');
    expect(FIELD_CODE).toContain('handleTestIntake');
    expect(FIELD_CODE).toContain('intakeTesterCard');
    expect(FIELD_CODE).toContain('intakeTestSuccess');
    expect(FIELD_CODE).toContain('intakeTestWarn');
  });

  it('refreshes nearby suggestions when the normalized served-city list changes', () => {
    expect(FIELD_CODE).toContain('const activeCitiesKey = JSON.stringify(activeCities);');
    expect(FIELD_CODE).toContain('const existingCities = JSON.parse(activeCitiesKey) as string[];');
    expect(FIELD_CODE).toContain('existingCities,');
    expect(FIELD_CODE).toMatch(/\[baseLocation, radius, defaultZip, defaultServiceArea, activeCitiesKey\]/);
  });

  it('ensures suggestNearbyCitiesAction uses site_copy kind (0 AI credits charged)', () => {
    expect(ACTIONS_CODE).toContain('kind: \'site_copy\'');
  });

  it('embeds ServiceAreasField in WebsiteBuilder.tsx inside Cities you serve card', () => {
    expect(BUILDER_CODE).toContain('import ServiceAreasField from \'./ServiceAreasField\'');
    expect(BUILDER_CODE).toContain('<ServiceAreasField');
    expect(BUILDER_CODE).toContain('content={siteContent.serviceAreas}');
  });

  it('includes complete CSS styling for the modernized service areas component', () => {
    expect(CSS_CODE).toContain('.serviceAreasBox');
    expect(CSS_CODE).toContain('.serviceAreaRadiusBar');
    expect(CSS_CODE).toContain('.always3Container');
    expect(CSS_CODE).toContain('.always3Grid');
    expect(CSS_CODE).toContain('.cityChipsGrid');
    expect(CSS_CODE).toContain('.cityChip');
    expect(CSS_CODE).toContain('.intakeTesterCard');
    expect(CSS_CODE).toContain('.intakeTestSuccess');
    expect(CSS_CODE).toContain('.intakeTestWarn');
  });

  it('properly validates service area matching for Smart Intake against city lists', () => {
    const served = ['Royal Oak, MI', 'Birmingham, MI', 'Troy, MI', 'Bloomfield Hills, MI'];

    // Direct match
    expect(matchesServedCity('Royal Oak, MI', served)).toBe(true);
    expect(matchesServedCity('royal oak', served)).toBe(true);
    expect(matchesServedCity('Birmingham', served)).toBe(true);

    // Outside match
    expect(matchesServedCity('Chicago, IL', served)).toBe(false);
    expect(matchesServedCity('Austin, TX', served)).toBe(false);
  });
});
