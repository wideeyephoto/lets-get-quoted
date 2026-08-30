'use client';

import { useState, useEffect } from 'react';
import { Theme, THEME_CHOICES, themeCookieString, THEME_COOKIE } from '@/lib/theme';

interface ThemePalette {
  canvasBg: string;
  cardBg: string;
  elevatedBg: string;
  sidenavBg: string;
  sidenavGroupBg: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  headingColor: string;
  bodyTextColor: string;
  mutedTextColor: string;
  eyebrowColor: string;
  accentColor: string;
  accentEndColor: string;
  onAccentColor: string;
  activeNavBg: string;
  activeNavInk: string;
  activeTabBg: string;
  activeTabInk: string;
  inputBg: string;
  inputBorderColor: string;
  statusGood: string;
  statusWarn: string;
  statusBad: string;
}

const DEFAULT_PALETTES: Record<Theme, ThemePalette> = {
  sunlight: {
    canvasBg: '#eaeef4',
    cardBg: '#ffffff',
    elevatedBg: '#ffffff',
    sidenavBg: '#ffffff',
    sidenavGroupBg: '#ffffff',
    borderColor: '#090d16',
    borderWidth: 2,
    borderRadius: 12,
    headingColor: '#090d16',
    bodyTextColor: '#090d16',
    mutedTextColor: '#1e293b',
    eyebrowColor: '#9a3412',
    accentColor: '#b43403',
    accentEndColor: '#ea580c',
    onAccentColor: '#ffffff',
    activeNavBg: '#fff7ed',
    activeNavInk: '#b43403',
    activeTabBg: '#ffffff',
    activeTabInk: '#b43403',
    inputBg: '#ffffff',
    inputBorderColor: '#090d16',
    statusGood: '#047857',
    statusWarn: '#b45309',
    statusBad: '#b91c1c',
  },
  parchment: {
    canvasBg: '#f5f0e7',
    cardBg: '#fffdf9',
    elevatedBg: '#ffffff',
    sidenavBg: '#fbf8f2',
    sidenavGroupBg: '#ffffff',
    borderColor: '#241e17',
    borderWidth: 1.5,
    borderRadius: 12,
    headingColor: '#241e17',
    bodyTextColor: '#241e17',
    mutedTextColor: '#584f42',
    eyebrowColor: '#92400e',
    accentColor: '#c2410c',
    accentEndColor: '#ea580c',
    onAccentColor: '#ffffff',
    activeNavBg: '#fef3c7',
    activeNavInk: '#92400e',
    activeTabBg: '#ffffff',
    activeTabInk: '#92400e',
    inputBg: '#ffffff',
    inputBorderColor: '#241e17',
    statusGood: '#059669',
    statusWarn: '#d97706',
    statusBad: '#dc2626',
  },
  clarity: {
    canvasBg: '#0b0c0e',
    cardBg: '#121316',
    elevatedBg: '#1a1b1f',
    sidenavBg: '#08090b',
    sidenavGroupBg: '#121316',
    borderColor: '#56b4e9',
    borderWidth: 1.5,
    borderRadius: 12,
    headingColor: '#f6f7f8',
    bodyTextColor: '#f6f7f8',
    mutedTextColor: '#c0c3c8',
    eyebrowColor: '#f0e442',
    accentColor: '#56b4e9',
    accentEndColor: '#8ecdf0',
    onAccentColor: '#03151f',
    activeNavBg: 'rgba(86, 180, 233, 0.2)',
    activeNavInk: '#56b4e9',
    activeTabBg: '#1a1b1f',
    activeTabInk: '#56b4e9',
    inputBg: '#121316',
    inputBorderColor: '#56b4e9',
    statusGood: '#009e73',
    statusWarn: '#f0e442',
    statusBad: '#d55e00',
  },
  monochrome: {
    canvasBg: '#0a0a0b',
    cardBg: '#101012',
    elevatedBg: '#17171a',
    sidenavBg: '#050506',
    sidenavGroupBg: '#101012',
    borderColor: '#ffffff',
    borderWidth: 1.5,
    borderRadius: 8,
    headingColor: '#ffffff',
    bodyTextColor: '#fafafa',
    mutedTextColor: '#b4b4bb',
    eyebrowColor: '#ffffff',
    accentColor: '#ffffff',
    accentEndColor: '#e4e4e7',
    onAccentColor: '#000000',
    activeNavBg: 'rgba(255, 255, 255, 0.2)',
    activeNavInk: '#ffffff',
    activeTabBg: '#27272a',
    activeTabInk: '#ffffff',
    inputBg: '#101012',
    inputBorderColor: '#ffffff',
    statusGood: '#fafafa',
    statusWarn: '#a1a1aa',
    statusBad: '#ffffff',
  },
  light: {
    canvasBg: '#0e1219',
    cardBg: '#f8fafc',
    elevatedBg: '#ffffff',
    sidenavBg: '#0a0d13',
    sidenavGroupBg: '#121620',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 14,
    headingColor: '#0f172a',
    bodyTextColor: '#1e293b',
    mutedTextColor: '#475569',
    eyebrowColor: '#ea580c',
    accentColor: '#ff7a21',
    accentEndColor: '#ff9a4d',
    onAccentColor: '#ffffff',
    activeNavBg: 'rgba(255, 122, 33, 0.16)',
    activeNavInk: '#ff7a21',
    activeTabBg: '#ffffff',
    activeTabInk: '#c2410c',
    inputBg: '#ffffff',
    inputBorderColor: '#cbd5e1',
    statusGood: '#10b981',
    statusWarn: '#f59e0b',
    statusBad: '#ef4444',
  },
  dim: {
    canvasBg: '#1c1a17',
    cardBg: '#23201c',
    elevatedBg: '#2d2a25',
    sidenavBg: '#171512',
    sidenavGroupBg: '#23201c',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 14,
    headingColor: '#faf8f5',
    bodyTextColor: '#e5e1db',
    mutedTextColor: '#a39d93',
    eyebrowColor: '#ff9248',
    accentColor: '#ff8233',
    accentEndColor: '#ffa86b',
    onAccentColor: '#1a0a00',
    activeNavBg: 'rgba(255, 130, 51, 0.16)',
    activeNavInk: '#ff8233',
    activeTabBg: '#2d2a25',
    activeTabInk: '#ff8233',
    inputBg: '#23201c',
    inputBorderColor: 'rgba(255, 255, 255, 0.15)',
    statusGood: '#4acb92',
    statusWarn: '#f5b544',
    statusBad: '#f98a78',
  },
  dark: {
    canvasBg: '#070a11',
    cardBg: '#0e1219',
    elevatedBg: '#171b23',
    sidenavBg: '#05070d',
    sidenavGroupBg: '#0e1219',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 14,
    headingColor: '#ffffff',
    bodyTextColor: '#e2e8f0',
    mutedTextColor: '#94a3b8',
    eyebrowColor: '#ff8a3d',
    accentColor: '#ff7a21',
    accentEndColor: '#ff9a4d',
    onAccentColor: '#ffffff',
    activeNavBg: 'rgba(255, 122, 33, 0.16)',
    activeNavInk: '#ff7a21',
    activeTabBg: '#171b23',
    activeTabInk: '#ff7a21',
    inputBg: '#0e1219',
    inputBorderColor: 'rgba(255, 255, 255, 0.15)',
    statusGood: '#34d399',
    statusWarn: '#fbbf24',
    statusBad: '#f87171',
  },
  onyx: {
    canvasBg: '#000000',
    cardBg: '#0a0a0c',
    elevatedBg: '#141417',
    sidenavBg: '#000000',
    sidenavGroupBg: '#0a0a0c',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderRadius: 14,
    headingColor: '#ffffff',
    bodyTextColor: '#fafafa',
    mutedTextColor: '#a2a2ab',
    eyebrowColor: '#ff8a3d',
    accentColor: '#ff8a3d',
    accentEndColor: '#ffb066',
    onAccentColor: '#1a0a00',
    activeNavBg: 'rgba(255, 138, 61, 0.18)',
    activeNavInk: '#ff8a3d',
    activeTabBg: '#141417',
    activeTabInk: '#ff8a3d',
    inputBg: '#0a0a0c',
    inputBorderColor: 'rgba(255, 255, 255, 0.18)',
    statusGood: '#47cd89',
    statusWarn: '#f5b544',
    statusBad: '#f97066',
  },
};

const THEME_LABELS: Record<Theme, { name: string; icon: string }> = {
  sunlight: { name: 'Sunlight', icon: '☀️' },
  parchment: { name: 'Parchment', icon: '📜' },
  clarity: { name: 'Clarity (CVD)', icon: '👁️' },
  monochrome: { name: 'Mono (B&W)', icon: '⚪' },
  light: { name: 'Workbench', icon: '🪵' },
  dim: { name: 'Dim', icon: '🌫️' },
  dark: { name: 'Dark', icon: '🌙' },
  onyx: { name: 'Onyx (OLED)', icon: '🖤' },
};

function sanitizeFieldBg(color: string | undefined, themeKey: Theme): string {
  const defaultBg = DEFAULT_PALETTES[themeKey]?.inputBg || '#ffffff';
  if (!color) return defaultBg;
  const lower = color.toLowerCase().trim();
  if (
    lower.includes('ea580c') ||
    lower.includes('c2410c') ||
    lower.includes('ff7a21') ||
    lower.includes('ff8a3d') ||
    lower.includes('ff8233') ||
    lower.includes('ff9248') ||
    lower.includes('b43403') ||
    lower.includes('9a3412') ||
    lower.includes('f97316') ||
    lower.includes('fb923c') ||
    lower.includes('dc2626') ||
    lower.includes('ef4444') ||
    lower.includes('b91c1c') ||
    lower.includes('991b1b') ||
    lower.includes('f87171') ||
    lower.includes('fff7ed') ||
    lower.includes('ffedd5') ||
    lower.includes('fef3c7') ||
    lower.includes('fef2f2') ||
    lower.includes('fee2e2') ||
    lower.includes('rgba(255') ||
    lower.includes('rgba(234') ||
    lower.includes('rgba(249') ||
    lower.includes('rgba(220') ||
    lower.includes('rgba(239') ||
    lower === 'red' ||
    lower === 'orange'
  ) {
    return defaultBg;
  }
  return color;
}

export default function ThemeTuner() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme>('sunlight');
  const [palettes, setPalettes] = useState<Record<Theme, ThemePalette>>(() => {
    if (typeof window === 'undefined') return DEFAULT_PALETTES;
    try {
      const saved = localStorage.getItem('lgq_multi_theme_studio');
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged: Record<Theme, ThemePalette> = { ...DEFAULT_PALETTES };
        (Object.keys(DEFAULT_PALETTES) as Theme[]).forEach((k) => {
          if (parsed[k]) {
            merged[k] = {
              ...DEFAULT_PALETTES[k],
              ...parsed[k],
              inputBg: sanitizeFieldBg(parsed[k].inputBg, k),
            };
          }
        });
        return merged;
      }
    } catch {}
    return DEFAULT_PALETTES;
  });

  const [activeTab, setActiveTab] = useState<'surfaces' | 'borders' | 'typography' | 'accents' | 'navigation'>('surfaces');
  const [copied, setCopied] = useState<string | null>(null);

  // Read current theme on mount
  useEffect(() => {
    const rootTheme = document.documentElement.dataset.theme as Theme | undefined;
    if (rootTheme && DEFAULT_PALETTES[rootTheme]) {
      setActiveTheme(rootTheme);
    }
  }, []);

  // When active theme tab changes in studio, switch the document theme to match!
  const switchTheme = (theme: Theme) => {
    setActiveTheme(theme);
    document.documentElement.dataset.theme = theme;
    document.cookie = themeCookieString(THEME_COOKIE, theme);
  };

  // Generate dynamic CSS rules for all configured themes
  useEffect(() => {
    let styleTag = document.getElementById('lgq-theme-studio-live') as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'lgq-theme-studio-live';
      document.head.appendChild(styleTag);
    }

    let css = '';
    (Object.keys(palettes) as Theme[]).forEach((themeKey) => {
      const p = palettes[themeKey];
      const safeInputBg = sanitizeFieldBg(p.inputBg, themeKey);
      css += `
        :root[data-theme='${themeKey}'] {
          --bg: ${p.canvasBg} !important;
          --bg-2: ${p.cardBg} !important;
          --bg-elevated: ${p.elevatedBg} !important;
          --text: ${p.bodyTextColor} !important;
          --muted: ${p.mutedTextColor} !important;
          --accent: ${p.accentColor} !important;
          --accent-end: ${p.accentEndColor} !important;
          --on-accent: ${p.onAccentColor} !important;
          --good: ${p.statusGood} !important;
          --warn: ${p.statusWarn} !important;
          --bad: ${p.statusBad} !important;
        }

        :root[data-theme='${themeKey}'] body,
        :root[data-theme='${themeKey}'] .app-shell,
        :root[data-theme='${themeKey}'] .settings-shell {
          background-color: ${p.canvasBg} !important;
        }

        :root[data-theme='${themeKey}'] .panel,
        :root[data-theme='${themeKey}'] .workspace-section-card,
        :root[data-theme='${themeKey}'] .bset-card,
        :root[data-theme='${themeKey}'] .bset-master,
        :root[data-theme='${themeKey}'] .bset-section,
        :root[data-theme='${themeKey}'] .feature-card,
        :root[data-theme='${themeKey}'] .client-modal,
        :root[data-theme='${themeKey}'] .settings-panel-card,
        :root[data-theme='${themeKey}'] .payout-card,
        :root[data-theme='${themeKey}'] .quickbooks-box {
          background-color: ${p.cardBg} !important;
          border: ${p.borderWidth}px solid ${p.borderColor} !important;
          border-color: ${p.borderColor} !important;
          border-radius: ${p.borderRadius}px !important;
        }

        :root[data-theme='${themeKey}'] h1,
        :root[data-theme='${themeKey}'] h2,
        :root[data-theme='${themeKey}'] h3,
        :root[data-theme='${themeKey}'] h4,
        :root[data-theme='${themeKey}'] .section-heading h2,
        :root[data-theme='${themeKey}'] .workspace-section-heading h2,
        :root[data-theme='${themeKey}'] .settings-heading h1 {
          color: ${p.headingColor} !important;
        }

        :root[data-theme='${themeKey}'] p,
        :root[data-theme='${themeKey}'] .workspace-card-copy,
        :root[data-theme='${themeKey}'] .section-desc,
        :root[data-theme='${themeKey}'] .settings-desc,
        :root[data-theme='${themeKey}'] .card-desc {
          color: ${p.bodyTextColor} !important;
        }

        :root[data-theme='${themeKey}'] .eyebrow,
        :root[data-theme='${themeKey}'] .section-eyebrow,
        :root[data-theme='${themeKey}'] .compact-heading .eyebrow {
          color: ${p.eyebrowColor} !important;
        }

        :root[data-theme='${themeKey}'] .sidenav {
          background-color: ${p.sidenavBg} !important;
          border-right: ${p.borderWidth}px solid ${p.borderColor} !important;
        }

        :root[data-theme='${themeKey}'] .sidenav-group,
        :root[data-theme='${themeKey}'] .sidenav-fcard {
          background-color: ${p.sidenavGroupBg} !important;
          border: ${p.borderWidth}px solid ${p.borderColor} !important;
          border-radius: ${Math.max(6, p.borderRadius - 2)}px !important;
        }

        :root[data-theme='${themeKey}'] .sidenav-glabel,
        :root[data-theme='${themeKey}'] .sidenav-group-label,
        :root[data-theme='${themeKey}'] .sidenav-bizname,
        :root[data-theme='${themeKey}'] .sidenav-wordmark {
          color: ${p.headingColor} !important;
        }

        :root[data-theme='${themeKey}'] .sidenav-wordmark {
          background-color: ${p.cardBg} !important;
          border: ${p.borderWidth}px solid ${p.borderColor} !important;
        }

        :root[data-theme='${themeKey}'] .sidenav-link,
        :root[data-theme='${themeKey}'] .sidenav-sublink {
          color: ${p.bodyTextColor} !important;
        }

        :root[data-theme='${themeKey}'] .sidenav-link.active {
          background-color: ${p.activeNavBg} !important;
          color: ${p.activeNavInk} !important;
          border-color: ${p.activeNavInk} !important;
        }

        :root[data-theme='${themeKey}'] .settings-tabnav,
        :root[data-theme='${themeKey}'] .plan-subnav-bar,
        :root[data-theme='${themeKey}'] .plan-glancebar,
        :root[data-theme='${themeKey}'] .sign-in-method-row,
        :root[data-theme='${themeKey}'] .plan-jump-pill,
        :root[data-theme='${themeKey}'] .btn.secondary,
        :root[data-theme='${themeKey}'] button.btn.secondary,
        :root[data-theme='${themeKey}'] .btn.outline {
          border: ${p.borderWidth}px solid ${p.borderColor} !important;
          border-color: ${p.borderColor} !important;
        }

        :root[data-theme='${themeKey}'] .plan-glancebar-cell {
          border-left: ${p.borderWidth}px solid ${p.borderColor} !important;
        }

        :root[data-theme='${themeKey}'] .settings-tab.active {
          background-color: ${p.activeTabBg} !important;
          color: ${p.activeTabInk} !important;
          border: ${p.borderWidth}px solid ${p.borderColor} !important;
        }

        :root[data-theme='${themeKey}'] input:not([type='checkbox']):not([type='radio']):not([type='submit']):not([type='button']):not([class*='searchInput']):not([class*='search']):not([type='search']),
        :root[data-theme='${themeKey}'] select,
        :root[data-theme='${themeKey}'] textarea {
          background-color: ${safeInputBg} !important;
          border: ${p.borderWidth}px solid ${p.inputBorderColor} !important;
          color: ${p.bodyTextColor} !important;
        }
      `;
    });

    css += `
      :root[data-theme] .smart-search-palette,
      :root[data-theme] [data-smart-search='true'],
      :root .smart-search-palette,
      :root [data-smart-search='true'] {
        background: #0f1219 !important;
        background-color: #0f1219 !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.85) !important;
        color: #f8fafc !important;
      }
      :root[data-theme] .smart-search-palette input,
      :root[data-theme] [data-smart-search='true'] input,
      :root[data-theme] [class*='searchInput'],
      :root[data-theme] input[class*='searchInput'],
      :root .smart-search-palette input,
      :root [data-smart-search='true'] input,
      :root [class*='searchInput'],
      :root input[class*='searchInput'] {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        color: #f8fafc !important;
      }
      :root[data-theme] .smart-search-palette [class*='resultsBody'],
      :root[data-theme] [data-smart-search='true'] [class*='resultsBody'],
      :root .smart-search-palette [class*='resultsBody'],
      :root [data-smart-search='true'] [class*='resultsBody'] {
        background: #0f1219 !important;
        background-color: #0f1219 !important;
      }
      :root[data-theme] .smart-search-palette [class*='resultItem'],
      :root[data-theme] [data-smart-search='true'] [class*='resultItem'],
      :root .smart-search-palette [class*='resultItem'],
      :root [data-smart-search='true'] [class*='resultItem'] {
        background: transparent !important;
        background-color: transparent !important;
        border: 1px solid transparent !important;
        color: #f8fafc !important;
      }
      :root[data-theme] .smart-search-palette [class*='resultItem']:hover,
      :root[data-theme] .smart-search-palette [class*='resultItem'][data-selected='true'],
      :root[data-theme] [data-smart-search='true'] [class*='resultItem']:hover,
      :root[data-theme] [data-smart-search='true'] [class*='resultItem'][data-selected='true'],
      :root .smart-search-palette [class*='resultItem']:hover,
      :root .smart-search-palette [class*='resultItem'][data-selected='true'],
      :root [data-smart-search='true'] [class*='resultItem']:hover,
      :root [data-smart-search='true'] [class*='resultItem'][data-selected='true'] {
        background: rgba(255, 255, 255, 0.07) !important;
        background-color: rgba(255, 255, 255, 0.07) !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
      }
      :root[data-theme] .smart-search-palette [class*='itemTitle'],
      :root[data-theme] [data-smart-search='true'] [class*='itemTitle'],
      :root .smart-search-palette [class*='itemTitle'],
      :root [data-smart-search='true'] [class*='itemTitle'] {
        color: #f8fafc !important;
      }
      :root[data-theme] .smart-search-palette [class*='itemSubtitle'],
      :root[data-theme] [data-smart-search='true'] [class*='itemSubtitle'],
      :root .smart-search-palette [class*='itemSubtitle'],
      :root [data-smart-search='true'] [class*='itemSubtitle'] {
        color: #94a3b8 !important;
      }
      :root[data-theme] .smart-search-palette [class*='filterTabs'],
      :root[data-theme] [data-smart-search='true'] [class*='filterTabs'],
      :root .smart-search-palette [class*='filterTabs'],
      :root [data-smart-search='true'] [class*='filterTabs'] {
        background: #090c13 !important;
        background-color: #090c13 !important;
      }
      :root[data-theme] .smart-search-palette [class*='filterTab'],
      :root[data-theme] [data-smart-search='true'] [class*='filterTab'],
      :root .smart-search-palette [class*='filterTab'],
      :root [data-smart-search='true'] [class*='filterTab'] {
        background: rgba(255, 255, 255, 0.04) !important;
        background-color: rgba(255, 255, 255, 0.04) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        color: #94a3b8 !important;
      }
      :root[data-theme] .smart-search-palette [class*='dialogFooter'],
      :root[data-theme] [data-smart-search='true'] [class*='dialogFooter'],
      :root .smart-search-palette [class*='dialogFooter'],
      :root [data-smart-search='true'] [class*='dialogFooter'] {
        background: #090c13 !important;
        background-color: #090c13 !important;
      }
    `;

    styleTag.textContent = css;

    try {
      localStorage.setItem('lgq_multi_theme_studio', JSON.stringify(palettes));
    } catch {}
  }, [palettes]);

  const current = palettes[activeTheme];

  const updateCurrent = (key: keyof ThemePalette, val: string | number) => {
    const safeVal = key === 'inputBg' && typeof val === 'string' ? sanitizeFieldBg(val, activeTheme) : val;
    setPalettes((prev) => ({
      ...prev,
      [activeTheme]: {
        ...prev[activeTheme],
        [key]: safeVal,
      },
    }));
  };

  const copySingleTheme = () => {
    const p = current;
    const css = `/* ${THEME_LABELS[activeTheme].name} Theme Tuned Values */
:root[data-theme='${activeTheme}'] {
  --bg: ${p.canvasBg};
  --bg-2: ${p.cardBg};
  --bg-elevated: ${p.elevatedBg};
  --text: ${p.bodyTextColor};
  --muted: ${p.mutedTextColor};
  --accent: ${p.accentColor};
  --accent-end: ${p.accentEndColor};
  --on-accent: ${p.onAccentColor};
}
:root[data-theme='${activeTheme}'] body,
:root[data-theme='${activeTheme}'] .app-shell,
:root[data-theme='${activeTheme}'] .settings-shell {
  background-color: ${p.canvasBg};
}
:root[data-theme='${activeTheme}'] .panel,
:root[data-theme='${activeTheme}'] .workspace-section-card {
  background-color: ${p.cardBg};
  border: ${p.borderWidth}px solid ${p.borderColor};
  border-radius: ${p.borderRadius}px;
}
:root[data-theme='${activeTheme}'] h1,
:root[data-theme='${activeTheme}'] h2,
:root[data-theme='${activeTheme}'] h3 {
  color: ${p.headingColor};
}
:root[data-theme='${activeTheme}'] p {
  color: ${p.bodyTextColor};
}
:root[data-theme='${activeTheme}'] .sidenav {
  background-color: ${p.sidenavBg};
  border-right: ${p.borderWidth}px solid ${p.borderColor};
}
:root[data-theme='${activeTheme}'] .sidenav-group {
  background-color: ${p.sidenavGroupBg};
  border: ${p.borderWidth}px solid ${p.borderColor};
}`;
    navigator.clipboard.writeText(css);
    setCopied('single');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAllThemes = () => {
    let full = `/* All Themes Tuned CSS Export */\n`;
    (Object.keys(palettes) as Theme[]).forEach((tk) => {
      const p = palettes[tk];
      full += `
/* ${THEME_LABELS[tk].name} */
:root[data-theme='${tk}'] {
  --bg: ${p.canvasBg};
  --bg-2: ${p.cardBg};
  --bg-elevated: ${p.elevatedBg};
  --text: ${p.bodyTextColor};
  --muted: ${p.mutedTextColor};
  --accent: ${p.accentColor};
}
:root[data-theme='${tk}'] .panel,
:root[data-theme='${tk}'] .workspace-section-card {
  background-color: ${p.cardBg};
  border: ${p.borderWidth}px solid ${p.borderColor};
  border-radius: ${p.borderRadius}px;
}
:root[data-theme='${tk}'] .sidenav {
  background-color: ${p.sidenavBg};
  border-right: ${p.borderWidth}px solid ${p.borderColor};
}
`;
    });
    navigator.clipboard.writeText(full);
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  const resetCurrent = () => {
    setPalettes((prev) => ({
      ...prev,
      [activeTheme]: DEFAULT_PALETTES[activeTheme],
    }));
  };

  const resetAll = () => {
    setPalettes(DEFAULT_PALETTES);
  };

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: '#090d16',
            color: '#ffffff',
            border: '2px solid #ffffff',
            borderRadius: '9999px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 800,
          }}
        >
          <span>🎨 Realtime CSS Theme Studio</span>
        </button>
      ) : (
        <div
          style={{
            width: '360px',
            background: '#ffffff',
            color: '#090d16',
            border: '2.5px solid #090d16',
            borderRadius: '16px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            padding: '16px',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1.5px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🎨 Realtime Theme Studio</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Select theme &amp; tune all values in real time</div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}
            >
              ✕
            </button>
          </div>

          {/* Theme Selector Tabs (All 8 Themes) */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: '6px' }}>
              Active Theme to Edit (Live Switches Page)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {(Object.keys(THEME_LABELS) as Theme[]).map((tk) => {
                const isSelected = activeTheme === tk;
                const info = THEME_LABELS[tk];
                return (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => switchTheme(tk)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 2px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 800 : 600,
                      borderRadius: '6px',
                      border: isSelected ? '2px solid #090d16' : '1px solid #cbd5e1',
                      background: isSelected ? '#090d16' : '#f8fafc',
                      color: isSelected ? '#ffffff' : '#090d16',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{info.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Sub-Tabs */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '12px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '6px' }}>
            {[
              { id: 'surfaces', label: 'Surfaces' },
              { id: 'borders', label: 'Borders' },
              { id: 'typography', label: 'Text' },
              { id: 'accents', label: 'Accents' },
              { id: 'navigation', label: 'Nav' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  flex: 1,
                  padding: '5px 2px',
                  fontSize: '11px',
                  fontWeight: activeTab === tab.id ? 800 : 600,
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === tab.id ? '#e2e8f0' : 'transparent',
                  color: activeTab === tab.id ? '#090d16' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form Controls Container */}
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* --- SURFACES --- */}
            {activeTab === 'surfaces' && (
              <>
                <ColorRow label="Canvas Ground (--bg)" value={current.canvasBg} onChange={(v) => updateCurrent('canvasBg', v)} />
                <ColorRow label="Card / Panel Ground (--bg-2)" value={current.cardBg} onChange={(v) => updateCurrent('cardBg', v)} />
                <ColorRow label="Elevated Surfaces (--bg-elevated)" value={current.elevatedBg} onChange={(v) => updateCurrent('elevatedBg', v)} />
                <ColorRow label="Sidenav Background" value={current.sidenavBg} onChange={(v) => updateCurrent('sidenavBg', v)} />
                <ColorRow label="Sidenav Group Card BG" value={current.sidenavGroupBg} onChange={(v) => updateCurrent('sidenavGroupBg', v)} />
              </>
            )}

            {/* --- BORDERS --- */}
            {activeTab === 'borders' && (
              <>
                <ColorRow label="Border Color" value={current.borderColor} onChange={(v) => updateCurrent('borderColor', v)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                    <span>Border Width:</span>
                    <span>{current.borderWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={0.5}
                    value={current.borderWidth}
                    onChange={(e) => updateCurrent('borderWidth', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                    <span>Border Radius:</span>
                    <span>{current.borderRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={2}
                    value={current.borderRadius}
                    onChange={(e) => updateCurrent('borderRadius', parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            )}

            {/* --- TYPOGRAPHY --- */}
            {activeTab === 'typography' && (
              <>
                <ColorRow label="Headings Color (h1-h4)" value={current.headingColor} onChange={(v) => updateCurrent('headingColor', v)} />
                <ColorRow label="Body Text Color (p, copy)" value={current.bodyTextColor} onChange={(v) => updateCurrent('bodyTextColor', v)} />
                <ColorRow label="Muted / Metadata Labels" value={current.mutedTextColor} onChange={(v) => updateCurrent('mutedTextColor', v)} />
                <ColorRow label="Eyebrow / Category Tag" value={current.eyebrowColor} onChange={(v) => updateCurrent('eyebrowColor', v)} />
              </>
            )}

            {/* --- ACCENTS --- */}
            {activeTab === 'accents' && (
              <>
                <ColorRow label="Primary Accent Brand" value={current.accentColor} onChange={(v) => updateCurrent('accentColor', v)} />
                <ColorRow label="Accent Gradient End" value={current.accentEndColor} onChange={(v) => updateCurrent('accentEndColor', v)} />
                <ColorRow label="Text on Accent (Button Ink)" value={current.onAccentColor} onChange={(v) => updateCurrent('onAccentColor', v)} />
                <ColorRow label="Status Good / Success" value={current.statusGood} onChange={(v) => updateCurrent('statusGood', v)} />
                <ColorRow label="Status Warn / Pending" value={current.statusWarn} onChange={(v) => updateCurrent('statusWarn', v)} />
                <ColorRow label="Status Bad / Error" value={current.statusBad} onChange={(v) => updateCurrent('statusBad', v)} />
              </>
            )}

            {/* --- NAVIGATION & CONTROLS --- */}
            {activeTab === 'navigation' && (
              <>
                <ColorRow label="Active Nav Link Background" value={current.activeNavBg} onChange={(v) => updateCurrent('activeNavBg', v)} />
                <ColorRow label="Active Nav Link Ink" value={current.activeNavInk} onChange={(v) => updateCurrent('activeNavInk', v)} />
                <ColorRow label="Active Tab Background" value={current.activeTabBg} onChange={(v) => updateCurrent('activeTabBg', v)} />
                <ColorRow label="Active Tab Ink" value={current.activeTabInk} onChange={(v) => updateCurrent('activeTabInk', v)} />
                <ColorRow label="Input Field Background" value={current.inputBg} onChange={(v) => updateCurrent('inputBg', v)} />
                <ColorRow label="Input Field Border Color" value={current.inputBorderColor} onChange={(v) => updateCurrent('inputBorderColor', v)} />
              </>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={copySingleTheme}
                style={{
                  flex: 1,
                  padding: '7px',
                  background: copied === 'single' ? '#16a34a' : '#090d16',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                {copied === 'single' ? '✓ Copied!' : `📋 Copy ${THEME_LABELS[activeTheme].name} CSS`}
              </button>
              <button
                type="button"
                onClick={copyAllThemes}
                style={{
                  flex: 1,
                  padding: '7px',
                  background: copied === 'all' ? '#16a34a' : '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                {copied === 'all' ? '✓ Copied All!' : '📋 Copy All 8 Themes'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={resetCurrent}
                style={{
                  flex: 1,
                  padding: '5px',
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset {THEME_LABELS[activeTheme].name}
              </button>
              <button
                type="button"
                onClick={resetAll}
                style={{
                  flex: 1,
                  padding: '5px',
                  background: '#f8fafc',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset All to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  // If value is rgba, we can still show a color picker using hex conversion or fallback
  const isRgba = value.startsWith('rgba') || value.startsWith('rgb');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
      <span style={{ fontWeight: 650, color: '#1e293b' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            width: '68px',
            padding: '2px 4px',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#090d16',
          }}
        />
        {!isRgba && (
          <input
            type="color"
            value={value.startsWith('#') && value.length === 7 ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '24px', height: '22px', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
          />
        )}
      </div>
    </div>
  );
}
