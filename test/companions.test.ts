import { describe, it, expect } from 'vitest';
import { COMPANIONS, getCompanion, DEFAULT_COMPANION_ID } from '@/lib/ai-assistant/companions';

describe('AI Assistant Companions', () => {
  it('includes AI Assistant (Energy Orbit), Diesel, and Echo in the companion roster', () => {
    const ids = COMPANIONS.map((c) => c.id);
    expect(ids).toContain('assistant');
    expect(ids).toContain('diesel');
    expect(ids).toContain('echo');
  });

  it('provides Echo with safety inspector attributes', () => {
    const echo = getCompanion('echo');
    expect(echo.name).toBe('Echo');
    expect(echo.species).toBe('Great Horned Owl');
    expect(echo.role).toBe('Lead Code & Safety Auditor');
    expect(echo.avatarSrc).toBe('/brand/companions/echo.jpg');
    expect(echo.badgeLabel).toBe('Safety Inspector');
  });

  it('provides AI Assistant with energy orbit attributes', () => {
    const assistant = getCompanion('assistant');
    expect(assistant.name).toBe('AI Assistant');
    expect(assistant.species).toBe('Energy Orbit');
    expect(assistant.badgeLabel).toBe('Energy Orbit');
    expect(assistant.avatarSrc).toBe('/brand/companions/spark.jpg');
  });

  it('migrates legacy sparky and nova ids to AI Assistant gracefully', () => {
    const sparkyMigrated = getCompanion('sparky');
    expect(sparkyMigrated.id).toBe('assistant');
    expect(sparkyMigrated.name).toBe('AI Assistant');

    const novaMigrated = getCompanion('nova');
    expect(novaMigrated.id).toBe('assistant');
    expect(novaMigrated.name).toBe('AI Assistant');
  });

  it('defaults to AI Assistant (Energy Orbit) if no companion or unknown id is provided', () => {
    const defaultComp = getCompanion();
    expect(defaultComp.id).toBe(DEFAULT_COMPANION_ID);
    expect(defaultComp.id).toBe('assistant');

    const unknownComp = getCompanion('unknown_id' as any);
    expect(unknownComp.id).toBe(DEFAULT_COMPANION_ID);
    expect(unknownComp.id).toBe('assistant');
  });
});
