'use client';

import { useEffect, useRef, useState, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type {
  SearchEntitySection,
  SearchResultItem,
  SearchResultBadge,
  WorkspaceSearchResults,
} from '@/lib/workspace-search';
import { QUICK_ACTIONS } from '@/lib/workspace-search';
import styles from './smart-search.module.css';

type FilterTabKey = 'all' | SearchEntitySection;

interface SmartSearchProps {
  /** Mode: 'rail' (desktop sidebar button) | 'mobile' (header button) | 'palette-only' (no trigger button, just listener + modal) */
  variant?: 'rail' | 'mobile' | 'palette-only';
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SECTION_LABELS: Record<SearchEntitySection, { title: string; icon: string }> = {
  actions: { title: 'Quick Actions', icon: '⚡' },
  jobs: { title: 'Jobs & Quotes', icon: '💼' },
  clients: { title: 'Clients & Contacts', icon: '👤' },
  addresses: { title: 'Job Sites & Addresses', icon: '📍' },
  crew: { title: 'Crew & Team', icon: '👷' },
  leads: { title: 'Leads & Inquiries', icon: '🎯' },
};

function getBadgeClass(badge: SearchResultBadge | null): string {
  if (!badge) return styles.badgeNeutral;
  switch (badge.tone) {
    case 'success':
      return `${styles.badge} ${styles.badgeSuccess}`;
    case 'warning':
      return `${styles.badge} ${styles.badgeWarning}`;
    case 'info':
      return `${styles.badge} ${styles.badgeInfo}`;
    case 'purple':
      return `${styles.badge} ${styles.badgePurple}`;
    case 'danger':
      return `${styles.badge} ${styles.badgeDanger}`;
    default:
      return `${styles.badge} ${styles.badgeNeutral}`;
  }
}

function getItemIcon(item: SearchResultItem): string {
  if (item.section === 'actions') return '⚡';
  if (item.section === 'jobs') return '💼';
  if (item.section === 'clients') return '👤';
  if (item.section === 'addresses') return '📍';
  if (item.section === 'crew') return '👷';
  if (item.section === 'leads') return '🎯';
  return '🔍';
}

export function SmartSearch({
  variant = 'rail',
  className = '',
  isOpen: controlledIsOpen,
  onOpenChange,
}: SmartSearchProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  useEffect(() => {
    setMounted(true);
  }, []);

  const setOpen = (open: boolean) => {
    if (onOpenChange) onOpenChange(open);
    if (!isControlled) setInternalOpen(open);
  };

  // If onOpenChange is provided for a trigger-only button (rail or mobile),
  // the parent or palette-only instance manages the modal and global shortcuts.
  const shouldRenderModal = variant === 'palette-only' || !onOpenChange;
  const shouldListenGlobal = variant === 'palette-only' || !onOpenChange;

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTabKey>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WorkspaceSearchResults>({
    query: '',
    totalMatches: QUICK_ACTIONS.length,
    sections: {
      jobs: [],
      clients: [],
      addresses: [],
      crew: [],
      leads: [],
      actions: QUICK_ACTIONS,
    },
    unavailable: [],
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global Shortcut listener (⌘K, Ctrl+K, or '/')
  useEffect(() => {
    if (!shouldListenGlobal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
        return;
      }

      // Open on '/' if user is not in an editable element
      if (e.key === '/' && !isOpen) {
        const target = e.target as HTMLElement | null;
        const isEditing =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'SELECT' ||
          target?.isContentEditable;

        if (!isEditing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, shouldListenGlobal]);

  // Autofocus input on open & freeze background
  useEffect(() => {
    if (isOpen && shouldRenderModal) {
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setActiveTab('all');
    }
  }, [isOpen, shouldRenderModal]);

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen && shouldRenderModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen, shouldRenderModal]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen || !shouldRenderModal) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, shouldRenderModal]);

  // Fetch search results on query change (debounced)
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults({
        query: '',
        totalMatches: QUICK_ACTIONS.length,
        sections: {
          jobs: [],
          clients: [],
          addresses: [],
          crew: [],
          leads: [],
          actions: QUICK_ACTIONS,
        },
        unavailable: [],
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=6`);
        if (res.ok) {
          const data: WorkspaceSearchResults = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Failed to query search API:', err);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, isOpen]);

  // Filter sections by activeTab
  const visibleSections = useMemo(() => {
    const s = results.sections;
    const sections: { key: SearchEntitySection; items: SearchResultItem[] }[] = [];

    const addIfNotEmpty = (key: SearchEntitySection, items: SearchResultItem[]) => {
      if (items.length > 0 && (activeTab === 'all' || activeTab === key)) {
        sections.push({ key, items });
      }
    };

    // Ordering of sections in results
    addIfNotEmpty('actions', s.actions);
    addIfNotEmpty('jobs', s.jobs);
    addIfNotEmpty('clients', s.clients);
    addIfNotEmpty('addresses', s.addresses);
    addIfNotEmpty('crew', s.crew);
    addIfNotEmpty('leads', s.leads);

    return sections;
  }, [results, activeTab]);

  // Flattened list for keyboard selection indexing
  const flatItems = useMemo(() => {
    return visibleSections.flatMap((s) => s.items);
  }, [visibleSections]);

  // Calculate item counts per category for tabs
  const tabCounts = useMemo(() => {
    const s = results.sections;
    return {
      all: results.totalMatches,
      jobs: s.jobs.length,
      clients: s.clients.length,
      addresses: s.addresses.length,
      crew: s.crew.length,
      leads: s.leads.length,
      actions: s.actions.length,
    };
  }, [results]);

  // Keyboard navigation inside list
  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length === 0 ? 0 : (prev + 1) % flatItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length === 0 ? 0 : (prev - 1 + flatItems.length) % flatItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems.length > 0 && flatItems[selectedIndex]) {
        const item = flatItems[selectedIndex];
        setOpen(false);
        router.push(item.href);
      }
    } else if (e.key === 'Tab') {
      // Cycle tabs with Tab / Shift+Tab if shift or plain
      const tabKeys: FilterTabKey[] = ['all', 'jobs', 'clients', 'addresses', 'crew', 'leads', 'actions'];
      const currentIdx = tabKeys.indexOf(activeTab);
      if (e.shiftKey) {
        e.preventDefault();
        const nextIdx = (currentIdx - 1 + tabKeys.length) % tabKeys.length;
        setActiveTab(tabKeys[nextIdx]);
      } else {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % tabKeys.length;
        setActiveTab(tabKeys[nextIdx]);
      }
    }
  };

  const handleSelectItem = (item: SearchResultItem) => {
    setOpen(false);
    router.push(item.href);
  };

  return (
    <>
      {/* Trigger Button Variants */}
      {variant === 'rail' && (
        <button
          type="button"
          className={`${styles.railTrigger} ${className}`}
          onClick={() => setOpen(true)}
          aria-label="Smart Search (Cmd+K)"
          title="Search jobs, clients, crew, addresses (⌘K)"
        >
          <svg className={styles.triggerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className={styles.triggerText}>Search workspace...</span>
          <kbd className={styles.triggerKbd}>⌘K</kbd>
        </button>
      )}

      {variant === 'mobile' && (
        <button
          type="button"
          className={`${styles.mobileTrigger} ${className}`}
          onClick={() => setOpen(true)}
          aria-label="Search workspace"
          title="Search (⌘K)"
        >
          <svg className={styles.mobileTriggerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span>Search</span>
        </button>
      )}

      {/* Modal Dialog Overlay via Portal */}
      {isOpen && shouldRenderModal && mounted && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.overlay}
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
              aria-modal="true"
              role="dialog"
            >
              <div className={styles.dialog} ref={dialogRef}>
                {/* Header / Search Input */}
                <div className={styles.searchHeader}>
                  <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search jobs, clients, addresses, team, actions..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search workspace"
                  />
                  {loading && <div className={styles.loadingSpinner} aria-label="Searching..." />}
                  {query && (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      onClick={() => {
                        setQuery('');
                        inputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                  <kbd className={styles.escBadge} onClick={() => setOpen(false)}>
                    ESC
                  </kbd>
                </div>

                {/* Category Filter Tabs */}
                <div className={styles.filterTabs} role="tablist">
                  <button
                    type="button"
                    className={`${styles.filterTab} ${activeTab === 'all' ? styles.filterTabActive : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    All
                    {tabCounts.all > 0 && <span className={styles.tabCount}>{tabCounts.all}</span>}
                  </button>
                  {tabCounts.jobs > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'jobs' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('jobs')}
                    >
                      Jobs
                      <span className={styles.tabCount}>{tabCounts.jobs}</span>
                    </button>
                  )}
                  {tabCounts.clients > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'clients' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('clients')}
                    >
                      Clients
                      <span className={styles.tabCount}>{tabCounts.clients}</span>
                    </button>
                  )}
                  {tabCounts.addresses > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'addresses' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('addresses')}
                    >
                      Addresses
                      <span className={styles.tabCount}>{tabCounts.addresses}</span>
                    </button>
                  )}
                  {tabCounts.crew > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'crew' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('crew')}
                    >
                      Crew
                      <span className={styles.tabCount}>{tabCounts.crew}</span>
                    </button>
                  )}
                  {tabCounts.leads > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'leads' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('leads')}
                    >
                      Leads
                      <span className={styles.tabCount}>{tabCounts.leads}</span>
                    </button>
                  )}
                  {tabCounts.actions > 0 && (
                    <button
                      type="button"
                      className={`${styles.filterTab} ${activeTab === 'actions' ? styles.filterTabActive : ''}`}
                      onClick={() => setActiveTab('actions')}
                    >
                      Actions
                      <span className={styles.tabCount}>{tabCounts.actions}</span>
                    </button>
                  )}
                </div>

                {/* Results Body */}
                <div className={styles.resultsBody}>
                  {flatItems.length === 0 && !loading && (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>🔍</div>
                      <div className={styles.emptyTitle}>No results found for &ldquo;{query}&rdquo;</div>
                      <p className={styles.emptySub}>
                        Try searching for a client name, job address, phone number, quote ID, or crew member.
                      </p>
                    </div>
                  )}

                  {visibleSections.map((section) => {
                    const secMeta = SECTION_LABELS[section.key];
                    return (
                      <div key={section.key} className={styles.sectionGroup}>
                        <div className={styles.sectionHeader}>
                          <span>
                            {secMeta.icon} {secMeta.title}
                          </span>
                          <span>{section.items.length}</span>
                        </div>
                        {section.items.map((item) => {
                          const itemFlatIndex = flatItems.indexOf(item);
                          const isSelected = itemFlatIndex === selectedIndex;
                          return (
                            <div
                              key={item.id}
                              className={styles.resultItem}
                              data-selected={isSelected}
                              onClick={() => handleSelectItem(item)}
                              onMouseEnter={() => setSelectedIndex(itemFlatIndex)}
                            >
                              <div className={styles.itemLeft}>
                                <div className={styles.itemIcon}>{getItemIcon(item)}</div>
                                <div className={styles.itemInfo}>
                                  <p className={styles.itemTitle}>{item.title}</p>
                                  {item.subtitle && <p className={styles.itemSubtitle}>{item.subtitle}</p>}
                                </div>
                              </div>
                              <div className={styles.itemRight}>
                                {item.badge && <span className={getBadgeClass(item.badge)}>{item.badge.label}</span>}
                                <span className={styles.enterArrow} aria-hidden="true">
                                  ↵
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Footer with keyboard guidance */}
                <div className={styles.dialogFooter}>
                  <div className={styles.shortcutsList}>
                    <span className={styles.shortcutItem}>
                      <kbd className={styles.shortcutKey}>↑</kbd>
                      <kbd className={styles.shortcutKey}>↓</kbd> to navigate
                    </span>
                    <span className={styles.shortcutItem}>
                      <kbd className={styles.shortcutKey}>↵</kbd> to select
                    </span>
                    <span className={styles.shortcutItem}>
                      <kbd className={styles.shortcutKey}>Tab</kbd> to filter
                    </span>
                    <span className={styles.shortcutItem}>
                      <kbd className={styles.shortcutKey}>esc</kbd> to close
                    </span>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
