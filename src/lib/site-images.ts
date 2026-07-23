export type SiteImageSource = 'stock' | 'upload';

export type SiteImage = {
  id: string;
  url: string;
  alt: string;
  category: 'exterior' | 'interior' | 'kitchen' | 'craft' | 'commercial';
  source: SiteImageSource;
  storagePath?: string;
  // Visible overlay title on gallery tiles (e.g. the service being advertised).
  caption?: string;
};

export const STOCK_SITE_IMAGES: SiteImage[] = [
  {
    id: 'stock-modern-exterior',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=85',
    alt: 'Modern home exterior with warm wood details',
    category: 'exterior',
    source: 'stock',
  },
  {
    id: 'stock-active-jobsite',
    url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1800&q=85',
    alt: 'Contractor working at an active construction site',
    category: 'craft',
    source: 'stock',
  },
  {
    id: 'stock-commercial-build',
    url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1800&q=85',
    alt: 'Large commercial construction project in progress',
    category: 'commercial',
    source: 'stock',
  },
  {
    id: 'stock-bright-interior',
    url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=85',
    alt: 'Bright finished interior with natural materials',
    category: 'interior',
    source: 'stock',
  },
  {
    id: 'stock-finished-kitchen',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85',
    alt: 'Finished kitchen renovation with a central island',
    category: 'kitchen',
    source: 'stock',
  },
  {
    id: 'stock-planning-table',
    url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1800&q=85',
    alt: 'Builder reviewing plans at a project site',
    category: 'craft',
    source: 'stock',
  },
];

export function getSiteGallery(content: Record<string, unknown>): SiteImage[] {
  const gallery = content.gallery;

  if (!Array.isArray(gallery)) {
    return [];
  }

  return gallery.filter((image): image is SiteImage => {
    if (!image || typeof image !== 'object') {
      return false;
    }

    const candidate = image as Partial<SiteImage>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.url === 'string' &&
      typeof candidate.alt === 'string' &&
      typeof candidate.category === 'string' &&
      (candidate.source === 'stock' || candidate.source === 'upload')
    );
  });
}