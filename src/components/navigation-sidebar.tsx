'use client';

import React from 'react';
import Link from 'next/link';
import { NavIcon } from './nav-icons';
import { NavGroupDef, NavItemDef, NavigationPreferences } from '@/lib/navigation/types';
import { getPresetCatalog } from '@/lib/navigation/presets';
import { CATALOG_GROUPS, CATALOG_ITEMS } from '@/lib/navigation/catalog';

interface NavigationSidebarProps {
  preferences: NavigationPreferences | null;
  eligibleNavIds: string[];
  isPinned: (id: string) => boolean;
  isActive: (pathname: string, href: string) => boolean;
  pathname: string;
  isCollapsed: boolean;
  renderPillAndCount: (href: string) => React.ReactNode;
  togglePin: (href: string) => void;
}

function CollapsibleGroup({ group, isCollapsed, content }: { group: NavGroupDef, isCollapsed: boolean, content: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(group.id === 'work' || group.id === 'favorites');
  
  // Force open if the sidebar is completely collapsed into icons
  const effectiveOpen = isCollapsed ? true : isOpen;

  return (
    <details 
      className={`sidenav-group sidenav-group--${group.accent || 'default'}`} 
      open={effectiveOpen}
      onToggle={(e) => {
        if (!isCollapsed) setIsOpen(e.currentTarget.open);
      }}
    >
      <summary className="sidenav-glabel" style={{ cursor: 'pointer', listStyle: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>{group.label}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="sidenav-collapse-indicator">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </summary>
      <div className="sidenav-group-content" style={{ marginTop: '0.25rem' }}>
        {content}
      </div>
    </details>
  );
}

export function NavigationSidebar({
  preferences,
  eligibleNavIds,
  isPinned,
  isActive,
  pathname,
  isCollapsed,
  renderPillAndCount,
  togglePin
}: NavigationSidebarProps) {
  const safePrefs = preferences ?? { selectedView: 'balanced', favoriteIds: [], customLayout: null };
  const eligibleIds = new Set(eligibleNavIds ?? []);
  
  // Wait for fetch to return eligible IDs before rendering
  if (!eligibleNavIds || eligibleNavIds.length === 0) {
    return <div className="sidenav-loading">Loading navigation...</div>;
  }

  const eligibleItems = CATALOG_ITEMS.filter(item => eligibleIds.has(item.id));
  
  const catalog = getPresetCatalog(safePrefs, {
    groups: CATALOG_GROUPS,
    items: eligibleItems
  });

  return (
    <>
      {catalog.groups.map(group => {
        const groupItems = catalog.items.filter(i => i.defaultGroupId === group.id && !i.parentId);
        if (groupItems.length === 0) return null;
        
        const isSingle = groupItems.length === 1;
        const isCompact = safePrefs.selectedView === 'compact' || (safePrefs.selectedView === 'custom' && safePrefs.customLayout?.presentation === 'compact');
        const isAllFeatures = group.id === 'all_features';
        const isCollapsible = !isCollapsed && !isSingle && (isCompact || isAllFeatures);
        
        const content = groupItems.map(item => {
          const active = isActive(pathname, item.href);
          const extraClass = ''; // add demoted logic if we want
          return (
            <div className="sidenav-link-row" key={item.id}>
              <Link
                href={item.href}
                className={`sidenav-link${extraClass ? ` ${extraClass}` : ''}${active ? ' active' : ''}`}
                title={isCollapsed ? `${item.label}${item.hint ? ` - ${item.hint}` : ''}` : item.hint}
              >
                <NavIcon href={item.href} />
                <span className="sidenav-label">{item.label}</span>
                {renderPillAndCount(item.href)}
              </Link>
              <button
                type="button"
                className="sidenav-pin-toggle"
                aria-label={isPinned(item.href) ? `Unpin ${item.label}` : `Pin ${item.label}`}
                title={isPinned(item.href) ? 'Unpin from primary navigation' : 'Pin to primary navigation'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  togglePin(item.href);
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill={isPinned(item.href) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-2l-3-3V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v7l-3 3v2z" />
                </svg>
              </button>
            </div>
          );
        });

        if (isCollapsible) {
          return <CollapsibleGroup key={group.id} group={group} isCollapsed={isCollapsed} content={content} />;
        }

        return (
          <div className={`sidenav-group sidenav-group--${group.accent || 'default'}${isSingle ? ' is-single' : ''}`} key={group.id}>
            {!isSingle && <p className="sidenav-glabel">{group.label}</p>}
            {content}
          </div>
        );
      })}
    </>
  );
}
