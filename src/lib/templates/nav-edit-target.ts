import { PORTAL_SITE_PATH } from '@/lib/site-content';

// In the builder preview, clicking a nav link should open the editor for the
// section it points at rather than scrolling the (non-browsable) preview. Maps
// each nav link's hash or path to a click-to-edit target; anything unmapped
// (structural anchors like #top/#about) falls back to the business identity.
export const NAV_EDIT_TARGET: Record<string, string> = {
  '#our-services': 'our-services',
  '#services': 'our-services',
  '#work': 'showcase',
  '#projects': 'showcase',
  '#why': 'whyUs',
  '#how-it-works': 'how-it-works',
  '#showcase': 'showcase',
  '#reviews': 'reviews',
  '#faqs': 'faqs',
  '#blog': 'blog',
  '/blog': 'blog',
  '/videos': 'video',
  [PORTAL_SITE_PATH]: 'clientPortal',
  '#contact': 'contact',
  '/#our-services': 'our-services',
  '/#services': 'our-services',
  '/#showcase': 'showcase',
  '/#reviews': 'reviews',
  '/#faqs': 'faqs',
  '/#blog': 'blog',
  '/#contact': 'contact',
  '/privacy': 'legal',
  '/terms': 'legal',
};

export const navEditTarget = (href: string): string => NAV_EDIT_TARGET[href] || 'identity';
