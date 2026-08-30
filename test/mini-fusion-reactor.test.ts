import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPANIONS, getCompanion } from '@/lib/ai-assistant/companions';
import MiniFusionReactor from '@/components/mascot/MiniFusionReactor';

describe('Mini Fusion Reactor & Energy Spark Avatar', () => {
  it('verifies MiniFusionReactor component file exists and exports a valid React component', () => {
    expect(MiniFusionReactor).toBeDefined();
    expect(typeof MiniFusionReactor).toBe('function');
  });

  it('verifies MiniFusionReactor CSS contains keyframe animations for continuous motion at all times', () => {
    const cssPath = resolve(__dirname, '../src/components/mascot/MiniFusionReactor.module.css');
    expect(existsSync(cssPath)).toBe(true);

    const cssContent = readFileSync(cssPath, 'utf-8');

    // Multi-layered continuous animations
    expect(cssContent).toContain('@keyframes spinClockwise');
    expect(cssContent).toContain('@keyframes spinCounterClockwise');
    expect(cssContent).toContain('@keyframes plasmaVortexRotateA');
    expect(cssContent).toContain('@keyframes plasmaVortexRotateB');
    expect(cssContent).toContain('@keyframes coreBreath');
    expect(cssContent).toContain('@keyframes coreFlicker');
    expect(cssContent).toContain('@keyframes plasmaArcFlicker1');
    expect(cssContent).toContain('@keyframes plasmaArcFlicker2');
    expect(cssContent).toContain('@keyframes microArcCrackle');
    expect(cssContent).toContain('@keyframes ledPulse');
    expect(cssContent).toContain('@keyframes ambientHaloPulse');
    expect(cssContent).toContain('@keyframes lightningJitter');
    expect(cssContent).toContain('@keyframes orbit1');
    expect(cssContent).toContain('@keyframes orbit2');
  });

  it('verifies SparkyAvatar integrates MiniFusionReactor for energy spark / assistant companion', () => {
    const avatarPath = resolve(__dirname, '../src/components/mascot/SparkyAvatar.tsx');
    const avatarContent = readFileSync(avatarPath, 'utf-8');

    expect(avatarContent).toContain('MiniFusionReactor');
    expect(avatarContent).toContain('isReactor');
    expect(avatarContent).toContain("companionId === 'assistant'");
    expect(avatarContent).toContain("imageSrc?.includes('spark.jpg')");
  });

  it('verifies CompanionPickerModal renders live MiniFusionReactor for energy spark avatar selection', () => {
    const modalPath = resolve(__dirname, '../src/components/ai-assistant/CompanionPickerModal.tsx');
    const modalContent = readFileSync(modalPath, 'utf-8');

    expect(modalContent).toContain('MiniFusionReactor');
    expect(modalContent).toContain("comp.id === 'assistant'");
  });

  it('resolves AI Assistant energy orbit profile correctly', () => {
    const assistant = getCompanion('assistant');
    expect(assistant.id).toBe('assistant');
    expect(assistant.name).toBe('AI Assistant');
    expect(assistant.badgeLabel).toBe('Energy Orbit');
    expect(assistant.species).toBe('Energy Orbit');
  });
});
