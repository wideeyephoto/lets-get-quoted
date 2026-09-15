import { NavView, NavGroupDef, NavItemDef, NavigationCatalog, NavigationPreferences } from './types';
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

export function getPresetCatalog(prefs: NavigationPreferences, catalog: NavigationCatalog = { groups: CATALOG_GROUPS, items: CATALOG_ITEMS }): NavigationCatalog {
  const { selectedView, favoriteIds, customLayout } = prefs;

  if (selectedView === 'favorites') {
    const favItems = favoriteIds.map(id => catalog.items.find(i => i.id === id)).filter(Boolean) as NavItemDef[];
    
    const allFeaturesGroup: NavGroupDef = { id: 'all_features', label: 'All features', accent: 'default' };
    const restItems = catalog.items.map(item => ({ ...item, defaultGroupId: 'all_features' }));
    
    return {
      groups: [
        { id: 'favorites', label: 'Favorites', accent: 'work' },
        allFeaturesGroup
      ],
      items: [
        ...favItems.map(item => ({ ...item, defaultGroupId: 'favorites' })),
        ...restItems
      ]
    };
  }

  if (selectedView === 'custom' && customLayout) {
    const groups: NavGroupDef[] = customLayout.groups.map(g => ({ id: g.id, label: g.label, accent: 'default' }));
    const items: NavItemDef[] = [];
    customLayout.groups.forEach(g => {
      g.itemIds.forEach(id => {
        const item = catalog.items.find(i => i.id === id);
        if (item) {
          items.push({ ...item, defaultGroupId: g.id });
        }
      });
    });
    return { groups, items };
  }

  return catalog;
}
