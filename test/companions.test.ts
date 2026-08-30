import { describe, it, expect } from 'vitest';
import { COMPANIONS, getCompanion, DEFAULT_COMPANION_ID } from '@/lib/ai-assistant/companions';

describe('AI Assistant Companions', () => {
  it('includes Sparky, Diesel, Echo, and AI Assistant in the companion roster', () => {
    const ids = COMPANIONS.map((c) => c.id);
    expect(ids).toContain('sparky');
    expect(ids).toContain('diesel');
    expect(ids).toContain('echo');
    expect(ids).toContain('assistant');
  });

  it('provides Echo with safety inspector attributes', () => {
    const echo = getCompanion('echo');
    expect(echo.name).toBe('Echo');
    expect(echo.species).toBe('Great Horned Owl');
    expect(echo.role).toBe('Lead Code & Safety Auditor');
    expect(echo.avatarSrc).toBe('/brand/companions/echo.jpg');
    expect(echo.badgeLabel).toBe('Safety Inspector');
  });

  it('provides AI Assistant with energy spark attributes', () => {
    const assistant = getCompanion('assistant');
    expect(assistant.name).toBe('AI Assistant');
    expect(assistant.species).toBe('Energy Spark');
    expect(assistant.badgeLabel).toBe('Energy Spark');
    expect(assistant.avatarSrc).toBe('/brand/companions/spark.jpg');
  });

  it('migrates legacy nova id to AI Assistant gracefully', () => {
    const migrated = getCompanion('nova');
    expect(migrated.id).toBe('assistant');
    expect(migrated.name).toBe('AI Assistant');
  });

  it('defaults to Sparky if no companion or unknown id is provided', () => {
    const defaultComp = getCompanion();
    expect(defaultComp.id).toBe(DEFAULT_COMPANION_ID);

    const unknownComp = getCompanion('unknown_id' as any);
    expect(unknownComp.id).toBe(DEFAULT_COMPANION_ID);
  });

  it('resolves trade uniform variations for Sparky', () => {
    const electricianSparky = getCompanion('sparky', 'electrician');
    expect(electricianSparky.avatarSrc).toBe('/brand/sparky/sparky-electrician.jpg');
  });
});
