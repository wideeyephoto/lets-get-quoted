import type { Site } from '@/lib/sites';
import type { PortfolioJob } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';

export interface TemplateConfig {
  name: string;
  id: string;
  description: string;
  previewImage?: string;
  // Brand color for the theme's picker chip (the monogram tile in the Design
  // tab), spread across the color wheel so the eight themes read as distinct.
  // This is picker branding ONLY — it is not the site's accent, so changing it
  // never touches a live site. The live accent is each template's own
  // `--theme-accent` fallback in src/lib/templates/<id>.tsx.
  accent: string;
  // Display font for the monogram (the theme's own display face).
  fontVar: string;
  // Optional 2-char monogram override; defaults to name.slice(0, 2). Set it
  // only to break a collision (Forge and Foundry both start "Fo").
  abbr?: string;
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
    accent: '#b0472f',
    fontVar: 'var(--font-guild-display), Georgia, Times New Roman, serif',
  },
  {
    id: 'modern',
    name: 'Vista',
    description: 'Image-first editorial layout for design-conscious builders',
    previewImage: '/template-previews/modern.jpg',
    accent: '#2fbf71',
    fontVar: 'var(--font-display), Arial Black, Helvetica, sans-serif',
  },
  {
    id: 'handy',
    name: 'Haven',
    description: 'Fresh home-services look — cyan-green gradients, rounded cards, and clear CTAs',
    accent: '#10b0b8',
    fontVar: 'var(--font-care), system-ui, sans-serif',
  },
  {
    id: 'coat',
    name: 'Foundry',
    description: 'Bold painting & finishes — deep-maroon hero with red bokeh, red accents, rounded cards',
    accent: '#e0322a',
    fontVar: 'var(--font-display), system-ui, sans-serif',
    abbr: 'Fd',
  },
  {
    id: 'fixit',
    name: 'Tinker',
    // Described by its LOOK, not by a trade. Every template is offered on
    // several trade pages, so naming one trade in the description put "handyman
    // look" on the plumbing page — a personalisation claim contradicting itself
    // in the same sentence.
    description: 'Clean, professional service-trade look — orange accent, angular hero, parallax + motion',
    accent: '#f5822a',
    fontVar: 'var(--font-display), system-ui, sans-serif',
  },
  {
    id: 'reno',
    name: 'Blueprint',
    description: 'Dark-navy + golden-yellow renovation look — hexagon motifs, angular hero, bold headlines',
    accent: '#2f6df6',
    fontVar: 'var(--font-display), system-ui, sans-serif',
  },
  {
    id: 'shine',
    name: 'Lustre',
    description: 'Modern premium cleaning — deep-navy + bright-yellow, rounded cards, floating hero badges',
    accent: '#7b5cff',
    fontVar: 'var(--font-display), system-ui, sans-serif',
  },
];
// Note: 17 additional templates (Haven, Meridian, Blueprint, Lumen, Atlas, Circuit,
// Cascade, Anchor, Foundry, Ironclad, Summit, Beacon, Timber, Heritage, Bloom, Drift,
// Nova) were built and remain registered in ./index.ts so any existing site still
// using one of those ids keeps rendering correctly — they're just no longer offered
// in the builder's template picker, which is now limited to these 3 curated options.
