import { describe, expect, it } from 'vitest';

import {
  AI_LOGO_DIRECTIONS,
  buildAiLogoPrompt,
  isAiLogoDirection,
} from '@/lib/logo-image-prompt';

describe('AI logo image prompt', () => {
  it('turns brand inputs into a production-minded transparent-logo brief', () => {
    const prompt = buildAiLogoPrompt({
      businessName: 'Summit Electric Co.',
      trade: 'electrical contractor',
      tagline: 'Powering What Matters',
      establishedYear: '2018',
      accentColor: '#f59e0b',
      secondaryColor: '#1e3a8a',
      emblem: 'bolt',
      direction: 'art_director',
      creativeBrief: 'Hide a mountain peak inside the lightning bolt.',
    });

    expect(prompt).toContain('Use case: logo-brand');
    expect(prompt).toContain('"Summit Electric Co."');
    expect(prompt).toContain('"Powering What Matters"');
    expect(prompt).toContain('#F59E0B');
    expect(prompt).toContain('#1E3A8A');
    expect(prompt).toContain('genuinely transparent');
    expect(prompt).toContain('no scene');
    expect(prompt).toContain('Hide a mountain peak inside the lightning bolt.');
  });

  it('sanitizes control characters and rejects unknown directions', () => {
    const prompt = buildAiLogoPrompt({
      businessName: 'Apex\nPlumbing',
      direction: 'bold_symbol',
      creativeBrief: 'Clean\u0000and direct',
    });

    expect(prompt).toContain('Apex Plumbing');
    expect(prompt).toContain('Clean and direct');
    expect(isAiLogoDirection('bold_symbol')).toBe(true);
    expect(isAiLogoDirection('copy_a_famous_logo')).toBe(false);
  });

  it('keeps the creative-direction catalog stable and distinct', () => {
    expect(AI_LOGO_DIRECTIONS.map((direction) => direction.id)).toEqual([
      'art_director',
      'bold_symbol',
      'premium_wordmark',
      'modern_heritage',
      'character_mascot',
    ]);
  });
});
