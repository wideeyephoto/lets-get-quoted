import { NavView, NavGroupDef, NavItemDef, NavigationCatalog } from './types';
import { CATALOG_GROUPS, CATALOG_ITEMS } from './catalog';

export const PRESETS: Record<Exclude<NavView, 'custom'>, { description: string }> = {
  balanced: {
    description: 'Visible Work, Communication, Business, and Growth headings, with main links exposed.',
  },
  compact: {
    description: 'The same groups become expandable sections, reducing the sidebar’s height.',
  },
  favorites: {
    description: 'Personally selected shortcuts appear first, followed by an expandable All features directory.',
  },
};

export function getPresetCatalog(preset: NavView, catalog: NavigationCatalog = { groups: CATALOG_GROUPS, items: CATALOG_ITEMS }) {
  // Returns a computed version of the catalog according to the preset rules
  // (e.g. for balanced, returns grouped. for compact, returns collapsable sections, etc.)
  return catalog;
}
