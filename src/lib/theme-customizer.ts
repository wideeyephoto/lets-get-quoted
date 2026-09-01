export type ThemeColorSchemeId =
  | 'sandstone'
  | 'slate'
  | 'forest'
  | 'copper'
  | 'navy'
  | 'charcoal'
  | 'terracotta';

export interface ThemeColorScheme {
  id: ThemeColorSchemeId;
  name: string;
  recommendedTrade: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    heroGlow: string;
  };
}

export const THEME_COLOR_SCHEMES: Record<ThemeColorSchemeId, ThemeColorScheme> = {
  sandstone: {
    id: 'sandstone',
    name: 'Sandstone Warm',
    recommendedTrade: 'Painting & Masonry',
    colors: {
      primary: '#e07a5f',
      secondary: '#3d405b',
      accent: '#f2cc8f',
      background: '#f4f1de',
      surface: '#ffffff',
      textPrimary: '#2b2d42',
      textSecondary: '#6c757d',
      border: 'rgba(61, 64, 91, 0.15)',
      heroGlow: 'rgba(224, 122, 95, 0.18)',
    },
  },
  slate: {
    id: 'slate',
    name: 'Modern Slate',
    recommendedTrade: 'Roofing & Siding',
    colors: {
      primary: '#0284c7',
      secondary: '#0f172a',
      accent: '#38bdf8',
      background: '#0f172a',
      surface: '#1e293b',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      border: 'rgba(255, 255, 255, 0.1)',
      heroGlow: 'rgba(56, 189, 248, 0.15)',
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest Alpine',
    recommendedTrade: 'Landscaping & Tree Service',
    colors: {
      primary: '#16a34a',
      secondary: '#052e16',
      accent: '#4ade80',
      background: '#061a0e',
      surface: '#0f331d',
      textPrimary: '#f0fdf4',
      textSecondary: '#86efac',
      border: 'rgba(74, 222, 128, 0.15)',
      heroGlow: 'rgba(34, 197, 94, 0.18)',
    },
  },
  copper: {
    id: 'copper',
    name: 'Industrial Copper',
    recommendedTrade: 'HVAC & Plumbing',
    colors: {
      primary: '#ea580c',
      secondary: '#1c1917',
      accent: '#fb923c',
      background: '#0c0a09',
      surface: '#1c1917',
      textPrimary: '#fafaf9',
      textSecondary: '#a8a29e',
      border: 'rgba(234, 88, 12, 0.25)',
      heroGlow: 'rgba(234, 88, 12, 0.2)',
    },
  },
  navy: {
    id: 'navy',
    name: 'Executive Navy',
    recommendedTrade: 'General Contracting & Remodeling',
    colors: {
      primary: '#2563eb',
      secondary: '#030712',
      accent: '#60a5fa',
      background: '#030712',
      surface: '#111827',
      textPrimary: '#f9fafb',
      textSecondary: '#9ca3af',
      border: 'rgba(37, 99, 235, 0.2)',
      heroGlow: 'rgba(37, 99, 235, 0.18)',
    },
  },
  charcoal: {
    id: 'charcoal',
    name: 'Stealth Charcoal',
    recommendedTrade: 'Concrete, Paving & Welding',
    colors: {
      primary: '#f97316',
      secondary: '#18181b',
      accent: '#fbbf24',
      background: '#09090b',
      surface: '#18181b',
      textPrimary: '#f4f4f5',
      textSecondary: '#a1a1aa',
      border: 'rgba(255, 255, 255, 0.12)',
      heroGlow: 'rgba(249, 115, 22, 0.15)',
    },
  },
  terracotta: {
    id: 'terracotta',
    name: 'Tuscan Terracotta',
    recommendedTrade: 'Flooring & Tile',
    colors: {
      primary: '#c2410c',
      secondary: '#431407',
      accent: '#fdba74',
      background: '#fff7ed',
      surface: '#ffedd5',
      textPrimary: '#431407',
      textSecondary: '#7c2d12',
      border: 'rgba(194, 65, 12, 0.2)',
      heroGlow: 'rgba(194, 65, 12, 0.15)',
    },
  },
};

/**
 * Returns CSS variable style map for a color scheme
 */
export function generateCssVariablesForScheme(schemeId: ThemeColorSchemeId): Record<string, string> {
  const scheme = THEME_COLOR_SCHEMES[schemeId] || THEME_COLOR_SCHEMES.sandstone;
  const { colors } = scheme;

  return {
    '--theme-primary': colors.primary,
    '--theme-secondary': colors.secondary,
    '--theme-accent': colors.accent,
    '--theme-bg': colors.background,
    '--theme-surface': colors.surface,
    '--theme-text': colors.textPrimary,
    '--theme-text-muted': colors.textSecondary,
    '--theme-border': colors.border,
    '--theme-glow': colors.heroGlow,
  };
}
