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

export function getTemplate(templateId: string): TemplateComponent | null {
  return templates[templateId] ?? null;
}

export const AVAILABLE_TEMPLATES: TemplateConfig[] = [
  {
    id: 'carbon',
    name: 'Forge',
    description: 'Bold, industrial, and built for high-impact project photography',
    previewImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80',
    accent: '#f0b429',
    fontVar: 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
  },
  {
    id: 'professional',
    name: 'Guild',
    description: 'Trust-led and polished for established local contractors',
    previewImage: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
    accent: '#a33a2b',
    fontVar: 'var(--font-guild-display), Georgia, Times New Roman, serif',
  },
  {
    id: 'modern',
    name: 'Vista',
    description: 'Image-first editorial layout for design-conscious builders',
    previewImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    accent: '#d8ff45',
    fontVar: 'var(--font-display), Arial Black, Helvetica, sans-serif',
  },
  {
    id: 'minimal',
    name: 'Haven',
    description: 'Calm, minimal, and light — ideal for high-end remodelers and design-build studios',
    previewImage: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
    accent: '#a98a5b',
    fontVar: 'var(--font-haven-display), Cormorant, Georgia, serif',
  },
  {
    id: 'meridian',
    name: 'Meridian',
    description: 'Architectural and refined, with an asymmetric layout for upscale custom builders',
    previewImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    accent: '#b08d3e',
    fontVar: 'var(--font-haven-display), Georgia, serif',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Technical blueprint aesthetic for architects and detail-driven general contractors',
    previewImage: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=900&q=80',
    accent: '#eaf2ff',
    fontVar: 'var(--font-mono), monospace',
  },
  {
    id: 'lumen',
    name: 'Lumen',
    description: 'Bright, airy, and rounded — built for interior remodelers and finish specialists',
    previewImage: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
    accent: '#ff9d81',
    fontVar: 'var(--font-lumen-display), Poppins, sans-serif',
  },
  {
    id: 'atlas',
    name: 'Atlas',
    description: 'Confident and data-driven, for contractors who run a tight, well-documented operation',
    previewImage: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=900&q=80',
    accent: '#2dd4bf',
    fontVar: 'var(--font-atlas-display), Arial, sans-serif',
  },
  {
    id: 'circuit',
    name: 'Circuit',
    description: 'Dark and tech-forward, built for electricians and smart-home installers',
    previewImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80',
    accent: '#c6ff3d',
    fontVar: 'var(--font-circuit-display), Arial, sans-serif',
  },
  {
    id: 'cascade',
    name: 'Cascade',
    description: 'Calm blue tones and clear service tiles, made for plumbers and service pros',
    previewImage: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
    accent: '#38bdf8',
    fontVar: 'var(--font-atlas-display), Arial, sans-serif',
  },
  {
    id: 'anchor',
    name: 'Anchor',
    description: 'Steady, traditional, and trustworthy — a fit for established, community-rooted builders',
    previewImage: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80',
    accent: '#b8873f',
    fontVar: 'var(--font-anchor-display), Georgia, serif',
  },
  {
    id: 'foundry',
    name: 'Foundry',
    description: 'Heavy industrial styling for concrete, masonry, and foundation specialists',
    previewImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80',
    accent: '#ff6a1a',
    fontVar: 'var(--font-foundry-display), Arial Narrow, sans-serif',
  },
  {
    id: 'ironclad',
    name: 'Ironclad',
    description: 'Bold and rugged, built for roofing and exterior protection contractors',
    previewImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    accent: '#e2231a',
    fontVar: 'var(--font-ironclad-display), Impact, sans-serif',
  },
  {
    id: 'summit',
    name: 'Summit',
    description: 'Outdoor-ready styling for deck, patio, and outdoor living builders',
    previewImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80',
    accent: '#e8a33d',
    fontVar: 'var(--font-forge-display), Impact, sans-serif',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    description: 'Warm and rounded, made for friendly, family-owned service businesses',
    previewImage: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
    accent: '#ff8a3d',
    fontVar: 'var(--font-beacon-display), Arial, sans-serif',
  },
  {
    id: 'timber',
    name: 'Timber',
    description: 'Warm wood tones for custom carpentry and fine finish craftsmen',
    previewImage: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
    accent: '#a5673f',
    fontVar: 'var(--font-timber-display), Georgia, serif',
  },
  {
    id: 'heritage',
    name: 'Heritage',
    description: 'Classic and dependable, for established builders with a long track record',
    previewImage: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80',
    accent: '#8c1f2b',
    fontVar: 'var(--font-heritage-display), Georgia, serif',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    description: 'Vibrant and organic, designed for landscapers and outdoor living designers',
    previewImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    accent: '#7bc142',
    fontVar: 'var(--font-bloom-display), Arial, sans-serif',
  },
  {
    id: 'drift',
    name: 'Drift',
    description: 'Relaxed coastal styling for remodelers working near the water',
    previewImage: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
    accent: '#5ec6d8',
    fontVar: 'var(--font-drift-display), Arial, sans-serif',
  },
  {
    id: 'nova',
    name: 'Nova',
    description: 'Bold gradient tech styling for design-forward, future-facing builders',
    previewImage: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=900&q=80',
    accent: '#c04dff',
    fontVar: 'var(--font-nova-display), Arial, sans-serif',
  },
];
