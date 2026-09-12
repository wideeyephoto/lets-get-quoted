import { describe, it, expect, vi } from 'vitest';

vi.mock('next/font/google', () => {
  const mockFont = (name: string) => () => ({ variable: `--font-${name}` });
  return {
    Anton: mockFont('anton'),
    Barlow: mockFont('barlow'),
    Fraunces: mockFont('fraunces'),
    Work_Sans: mockFont('work-sans'),
    Inter: mockFont('inter'),
    Poppins: mockFont('poppins'),
    Manrope: mockFont('manrope'),
    Plus_Jakarta_Sans: mockFont('jakarta'),
    DM_Sans: mockFont('dmsans'),
    Instrument_Sans: mockFont('instrument'),
    Outfit: mockFont('outfit'),
    Sora: mockFont('sora'),
    Urbanist: mockFont('urbanist'),
    Montserrat: mockFont('montserrat'),
    Oswald: mockFont('oswald'),
    Bebas_Neue: mockFont('bebas'),
  };
});

describe('Template Fonts', () => {
  it('loads fonts', async () => {
    const fonts = await import('@/lib/templates/fonts');
    expect(fonts.templateFontVars).toBeDefined();
    expect(typeof fonts.templateFontVars).toBe('string');
    expect(fonts.firstRunFontVars).toBeDefined();
  });
});
