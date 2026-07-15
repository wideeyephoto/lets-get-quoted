import type { Site } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';

export interface TemplateConfig {
  name: string;
  id: string;
  description: string;
  previewImage?: string;
}

export interface TemplateProps {
  site: Site;
  galleryImages?: SiteImage[];
  portfolioJobs?: any[];
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
  },
  {
    id: 'professional',
    name: 'Guild',
    description: 'Trust-led and polished for established local contractors',
    previewImage: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'modern',
    name: 'Vista',
    description: 'Image-first editorial layout for design-conscious builders',
    previewImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
  },
];
