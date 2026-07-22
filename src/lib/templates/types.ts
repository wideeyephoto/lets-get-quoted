import type { Site } from '@/lib/sites';
import type { PortfolioJob } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';

export interface TemplateConfig {
  name: string;
  id: string;
  description: string;
  previewImage?: string;
  // Theme's accent color + display font, used to render a branded monogram
  // icon in the theme picker instead of a generic stock-photo thumbnail.
  // Matches the same defaults each template component falls back to via
  // `--theme-accent`/`--theme-display` (see src/lib/templates/<id>.tsx).
  accent: string;
  fontVar: string;
}

export interface TemplateProps {
  site: Site;
  galleryImages?: SiteImage[];
  portfolioJobs?: PortfolioJob[];
}

export type TemplateComponent = React.FC<TemplateProps>;

// Template registry — maps template ID to component
const templates: Record<string, TemplateComponent> = {};

export function registerTemplate(id: string, component: TemplateComponent) {
  templates[id] = component;
}

// Fall back to Forge for any unknown/retired template id so an existing site
// that had picked a legacy template keeps rendering instead of 404-ing.
const FALLBACK_TEMPLATE_ID = 'carbon';

export function getTemplate(templateId: string): TemplateComponent | null {
  return templates[templateId] ?? templates[FALLBACK_TEMPLATE_ID] ?? null;
}

export const AVAILABLE_TEMPLATES: TemplateConfig[] = [
  {
    id: 'carbon',
    name: 'Forge',
    description: 'Bold, industrial, and built for high-impact project photography',
    previewImage: '/template-previews/carbon.jpg',
    accent: '#f0b429',
    fontVar: 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
  },
  {
    id: 'professional',
    name: 'Guild',
    description: 'Trust-led and polished for established local contractors',
    previewImage: '/template-previews/professional.jpg',
    accent: '#a33a2b',
    fontVar: 'var(--font-guild-display), Georgia, Times New Roman, serif',
  },
  {
    id: 'modern',
    name: 'Vista',
    description: 'Image-first editorial layout for design-conscious builders',
    previewImage: '/template-previews/modern.jpg',
    accent: '#d8ff45',
    fontVar: 'var(--font-display), Arial Black, Helvetica, sans-serif',
  },
  {
    id: 'handy',
    name: 'Handy',
    description: 'Bright and friendly, with icon service cards — built for handyman & repair trades',
    accent: '#ee5a1a',
    fontVar: 'var(--font-display), system-ui, sans-serif',
  },
];
// Note: 17 additional templates (Haven, Meridian, Blueprint, Lumen, Atlas, Circuit,
// Cascade, Anchor, Foundry, Ironclad, Summit, Beacon, Timber, Heritage, Bloom, Drift,
// Nova) were built and remain registered in ./index.ts so any existing site still
// using one of those ids keeps rendering correctly — they're just no longer offered
// in the builder's template picker, which is now limited to these 3 curated options.
