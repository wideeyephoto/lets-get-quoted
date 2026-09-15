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
  
  const catalog = getPresetCatalog(safePrefs.selectedView, {
    groups: CATALOG_GROUPS,
    items: eligibleItems
  });

  return (
    <>
      {catalog.groups.map(group => {
        const groupItems = catalog.items.filter(i => i.defaultGroupId === group.id && !i.parentId);
        if (groupItems.length === 0) return null;
        
        const isSingle = groupItems.length === 1;
        return (
          <div className={`sidenav-group sidenav-group--${group.accent || 'default'}${isSingle ? ' is-single' : ''}`} key={group.id}>
            {!isSingle && <p className="sidenav-glabel">{group.label}</p>}
            {groupItems.map(item => {
              const active = isActive(pathname, item.href);
              const extraClass = ''; // add demoted logic if we want
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`sidenav-link${extraClass ? ` ${extraClass}` : ''}${active ? ' active' : ''}`}
                  title={isCollapsed ? `${item.label}${item.hint ? ` - ${item.hint}` : ''}` : item.hint}
                >
                  <NavIcon href={item.href} />
                  <span className="sidenav-label">{item.label}</span>
                  {renderPillAndCount(item.href)}
                  <div className="sidenav-link-actions">
                    <button
                      type="button"
                      className="sidenav-pin"
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
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
