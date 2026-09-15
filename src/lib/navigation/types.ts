export type NavView = 'balanced' | 'compact' | 'favorites' | 'custom';

export interface NavGroupDef {
  id: string;
  label: string;
  accent?: string;
}

export interface NavItemDef {
  id: string;
  label: string;
  href: string;
  icon?: string;
  hint?: string;
  parentId?: string;
  defaultGroupId?: string;
  aliases?: string[];
  badgeSource?: string;
  // Evaluates whether the user's role and workspace plan grants access to this item
  isEligible?: (context: any) => boolean;
}

export interface NavigationCatalog {
  groups: NavGroupDef[];
  items: NavItemDef[];
}

export interface CustomNavGroup {
  id: string;
  label: string;
  itemIds: string[];
}

export interface NavigationPreferences {
  selectedView: NavView;
  favoriteIds: string[];
  customLayout: {
    basePreset: 'balanced' | 'compact' | 'favorites';
    presentation: 'grouped' | 'compact';
    groups: CustomNavGroup[];
    hiddenIds: string[];
  } | null;
}
