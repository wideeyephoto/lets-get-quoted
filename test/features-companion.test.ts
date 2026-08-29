import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('features companion and live interactivity', () => {
  const PAGE = read('src/app/features/page.tsx');
  const HUD = read('src/app/features/CompanionHUD.tsx');
  const PULSE = read('src/app/features/LiveFieldPulse.tsx');
  const PHOTO_DEMO = read('src/app/features/CompanionPhotoScopeDemo.tsx');
  const ROUTE_DEMO = read('src/app/features/CompanionRouteDemo.tsx');

  it('renders LiveFieldPulse, CompanionHUD, PhotoScopeDemo and RouteDemo on the features page', () => {
    expect(PAGE).toContain('<LiveFieldPulse />');
    expect(PAGE).toContain('<CompanionHUD />');
    expect(PAGE).toContain('<CompanionPhotoScopeDemo />');
    expect(PAGE).toContain('<CompanionRouteDemo />');
  });

  it('provides section-aware contextual commentary in CompanionHUD', () => {
    expect(HUD).toContain('24/7 FIELD COPILOT');
    expect(HUD).toContain('AI PHOTO ESTIMATOR');
    expect(HUD).toContain('QUICK ACTIONS');
    expect(HUD).toContain('PRESET_QUESTIONS');
    expect(HUD).toContain('60s Guided Tour');
  });

  it('streams realistic multi-trade events in LiveFieldPulse', () => {
    expect(PULSE).toContain('LIVE FIELD COPILOT');
    expect(PULSE).toContain('Royal Oak, MI');
    expect(PULSE).toContain('Austin, TX');
    expect(PULSE).toContain('Denver, CO');
    expect(PULSE).toContain('Tampa, FL');
  });

  it('supports interactive trade photo scope scenarios with OCR and BOM extraction', () => {
    expect(PHOTO_DEMO).toContain('200A Panel Replacement');
    expect(PHOTO_DEMO).toContain('4-Ton Condenser');
    expect(PHOTO_DEMO).toContain('50-Gal Hybrid Water Heater');
    expect(PHOTO_DEMO).toContain('billOfMaterials');
    expect(PHOTO_DEMO).toContain('detectedSpecs');
    expect(PHOTO_DEMO).toContain('risksDetected');
  });

  it('supports interactive route detour slider and priority fee settings in CompanionRouteDemo', () => {
    expect(ROUTE_DEMO).toContain('detourMiles');
    expect(ROUTE_DEMO).toContain('fee');
    expect(ROUTE_DEMO).toContain('MATCHED QUICK STOP');
    expect(ROUTE_DEMO).toContain('Zero auto-booking');
  });
});
