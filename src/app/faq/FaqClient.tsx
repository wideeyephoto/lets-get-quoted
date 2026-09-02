'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './faq.module.css';

export type QA = { id: string; q: string; a: string };
export type FaqGroup = { id: string; heading: string; items: QA[] };

interface FaqClientProps {
  groups: FaqGroup[];
}

const POPULAR_QUERIES = [
  { label: 'Is Flex really $0?', id: 'is-it-really-free' },
  { label: 'How do I get paid?', id: 'how-do-i-get-paid' },
  { label: 'Platform fees on refunds', id: 'fee-on-a-refund' },
  { label: 'Connect custom domain', id: 'do-i-need-a-domain' },
  { label: 'Export data anytime', id: 'export-my-data' },
  { label: 'AI instant estimate', id: 'ai-instant-estimate' },
];

const SUGGESTED_SEARCHES = [
  'refund',
  'Stripe fees',
  'custom domain',
  'ACH payment',
  'cancel plan',
  'export data',
  'crew access',
  'AI estimate',
];

const CATEGORY_META: Record<string, { subtitle: string; icon: string }> = {
  pricing: {
    subtitle: 'Transparent rates, zero monthly lock-in, and full platform fee refunds.',
    icon: '🏷️',
  },
  'getting-paid': {
    subtitle: 'Direct Stripe payouts, credit cards, bank (ACH) debits, and deposits.',
    icon: '💳',
  },
  'website-and-setup': {
    subtitle: 'Pre-built contractor templates, custom domains, and instant CSV export.',
    icon: '🌐',
  },
  'leads-and-customers': {
    subtitle: '24/7 AI quoting, automated two-way SMS, and on-site crew access.',
    icon: '⚡',
  },
  'trust-and-security': {
    subtitle: 'Bank-grade encryption, data isolation, and direct human support.',
    icon: '🛡️',
  },
};

const SYNONYMS: Record<string, string[]> = {
  'is-it-really-free': ['pricing', 'cost', 'subscription', 'base plan', 'free plan', 'monthly fee', 'rates'],
  'what-does-it-cost': ['pricing', 'cost', 'cut', 'percentage', 'stripe processing fee', 'commission', 'transaction fee', 'take rate'],
  'contract-or-cancel': ['cancellation', 'cancel subscription', 'terminate', 'lock-in', 'downgrade', 'leave', 'delete account'],
  'fee-on-a-refund': ['refund fee', 'money back', 'reversal', 'undone', 'dispute refund', 'chargeback refund'],
  'how-do-i-get-paid': ['payouts', 'credit card', 'debit card', 'ach transfer', 'stripe connect', 'customer payment', 'bank account'],
  'when-does-money-arrive': ['payout speed', 'transfer time', 'clearing', 'ach delay', 'stripe schedule', 'deposit time'],
  'deposits-and-plans': ['installment payments', 'down payment', 'retainer', 'milestone', 'payment plan', 'financing'],
  'ach-for-big-jobs': ['wire', 'direct debit', 'bank account transfer', 'large invoice', 'commercial payment'],
  'chargebacks': ['fraud', 'dispute', 'evidence', 'stolen card', 'customer dispute', 'clawback'],
  'do-i-need-to-be-technical': ['coding', 'web designer', 'developer', 'hard to use', 'template', 'launch fast'],
  'do-i-need-a-domain': ['url', 'web address', 'dns', 'godaddy', 'namecheap', 'google domains', 'squarespace', 'custom domain'],
  'can-i-switch': ['migration', 'import contacts', 'jobber', 'housecall pro', 'servicetitan', 'existing customers', 'phone number'],
  'export-my-data': ['backup', 'csv', 'quickbooks', 'download records', 'client list', 'invoices', 'portability', 'lock-in'],
  'if-lgq-shuts-down': ['business continuity', 'ownership', 'portability', 'risk', 'going out of business'],
  'ai-instant-estimate': ['calculator', 'quoting bot', 'automated pricing', 'instant lead', 'estimator widget', 'price range'],
  'can-i-text-customers': ['sms', 'text messaging', 'twilio', 'chat', 'reminders', 'arrival window', 'stop opt-out'],
  'crew-access': ['employees', 'subcontractors', 'field app', 'time tracking', 'hours', 'crew login', 'foreman'],
  'is-my-data-safe': ['security', 'ssl', 'encryption', 'pci compliance', 'privacy', 'row level security'],
  'how-do-i-get-help': ['support', 'customer service', 'phone support', 'email help', 'talk to human', 'problem'],
  'how-is-this-different': ['competitors', 'alternatives', 'jobber vs', 'housecall pro vs', 'all in one', 'contractor crm'],
};

const CONTEXT_ACTIONS: Record<string, { label: string; href: string }> = {
  'is-it-really-free': { label: 'Compare plan tiers on Pricing →', href: '/pricing' },
  'what-does-it-cost': { label: 'See full pricing fee breakdown →', href: '/pricing' },
  'ai-instant-estimate': { label: 'Test the AI Estimator in the live demo →', href: '/demo' },
  'how-do-i-get-help': { label: 'Open the direct contact form →', href: '/contact' },
  'do-i-need-a-domain': { label: 'Explore website & domain features →', href: '/website' },
};

export default function FaqClient({ groups }: FaqClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'helpful' | 'unhelpful'>>({});
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Total questions count
  const totalQuestions = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.items.length, 0);
  }, [groups]);

  // Handle URL fragment deep-linking on load & on hashchange
  const handleHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    setOpenItems((prev) => ({ ...prev, [hash]: true }));
    setHighlightedId(hash);
    setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) {
        const headerOffset = 96;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }, 60);
    const timer = setTimeout(() => {
      setHighlightedId(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setMounted(true);
    handleHash();
    window.addEventListener('hashchange', handleHash);

    const onScroll = () => {
      setShowBackToTop(window.scrollY > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('scroll', onScroll);
    };
  }, [handleHash]);

  // Keyboard shortcut: '/' focuses search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter groups & questions by search tokens, synonyms, and category
  const filteredGroups = useMemo(() => {
    const rawTokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return groups
      .map((group) => {
        if (selectedCategory !== 'all' && group.id !== selectedCategory) {
          return null;
        }
        if (rawTokens.length === 0) {
          return group;
        }
        const filteredItems = group.items.filter((item) => {
          const itemSynonyms = (SYNONYMS[item.id] || []).join(' ').toLowerCase();
          const itemCorpus = (
            item.q +
            ' ' +
            item.a +
            ' ' +
            group.heading +
            ' ' +
            itemSynonyms
          ).toLowerCase();

          // Every token must match somewhere in the item's content, category, or synonyms
          return rawTokens.every((token) => itemCorpus.includes(token));
        });
        if (filteredItems.length === 0) return null;
        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((g): g is FaqGroup => g !== null);
  }, [groups, searchQuery, selectedCategory]);

  // Total visible questions after filter
  const visibleQuestionCount = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [filteredGroups]);

  // Check how many of the visible questions are open
  const allVisibleAreOpen = useMemo(() => {
    const visibleIds = filteredGroups.flatMap((g) => g.items.map((i) => i.id));
    if (visibleIds.length === 0) return false;
    return visibleIds.every((id) => openItems[id]);
  }, [filteredGroups, openItems]);

  const toggleAllVisible = () => {
    const visibleIds = filteredGroups.flatMap((g) => g.items.map((i) => i.id));
    if (allVisibleAreOpen) {
      setOpenItems((prev) => {
        const next = { ...prev };
        for (const id of visibleIds) {
          delete next[id];
        }
        return next;
      });
    } else {
      setOpenItems((prev) => {
        const next = { ...prev };
        for (const id of visibleIds) {
          next[id] = true;
        }
        return next;
      });
    }
  };

  const handleToggleItem = (id: string, e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = e.currentTarget.open;
    setOpenItems((prev) => ({
      ...prev,
      [id]: isOpen,
    }));
  };

  const copyPermalink = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/faq#${id}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      window.history.replaceState(null, '', `#${id}`);
      setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2400);
    } catch {
      window.location.hash = id;
    }
  };

  const jumpToQuestion = (id: string) => {
    setOpenItems((prev) => ({ ...prev, [id]: true }));
    setHighlightedId(id);
    window.history.replaceState(null, '', `#${id}`);
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 96;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
    setTimeout(() => setHighlightedId(null), 3200);
  };

  const scrollToSearch = () => {
    if (searchInputRef.current) {
      const headerOffset = 96;
      const elementPosition = searchInputRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 350);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFeedback = (id: string, type: 'helpful' | 'unhelpful') => {
    setFeedback((prev) => ({ ...prev, [id]: type }));
  };

  // Safe keyword highlighter with multi-token support
  const highlightMatches = (text: string, query: string) => {
    const rawTokens = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (rawTokens.length === 0) return text;

    const regex = new RegExp(`(${rawTokens.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className={styles.highlight}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Format special UI navigation paths (e.g. Settings, then Plan & usage, then Cancel plan)
  const formatAnswerText = (text: string, query: string) => {
    const targetPhrase = 'Settings, then Plan & usage, then Cancel plan';
    if (text.includes(targetPhrase)) {
      const [before, after] = text.split(targetPhrase);
      return (
        <>
          {highlightMatches(before, query)}
          <span className={styles.uiStepBadge}>Settings</span>
          <span className={styles.uiStepArrow}>›</span>
          <span className={styles.uiStepBadge}>Plan & usage</span>
          <span className={styles.uiStepArrow}>›</span>
          <span className={styles.uiStepBadge}>Cancel plan</span>
          {highlightMatches(after, query)}
        </>
      );
    }
    return highlightMatches(text, query);
  };

  return (
    <>
      {/* ── Hero Card with Atmospheric Backdrop ── */}
      <section className={styles.heroGlowContainer}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrowBadge}>
            <span className={styles.heroEyebrowDot} aria-hidden="true" />
            Questions, answered &mdash; {totalQuestions} contractor topics
          </div>
          <h1 className={styles.heroTitle}>
            Everything you’re wondering, before you sign up.
          </h1>
          <p className={styles.heroSubtitle}>
            Clear plan prices, payment fee breakdowns, data portability, and answers about how Let’s Get Quoted works for your trade.
          </p>
          <div className={styles.heroActions}>
            <a href={APP_SIGNUP_URL} className="btn primary">
              Build my free site
            </a>
            <Link href="/demo" className="btn secondary">
              Explore the demo &mdash; no signup
            </Link>
          </div>

          {/* Trust Signals */}
          <div className={styles.trustStrip}>
            <span className={styles.trustItem}>
              <span className={styles.trustCheck}>✓</span> $0 Setup Fee
            </span>
            <span className={styles.trustItem}>
              <span className={styles.trustCheck}>✓</span> No Monthly Lock-in
            </span>
            <span className={styles.trustItem}>
              <span className={styles.trustCheck}>✓</span> Direct Stripe Bank Payouts
            </span>
            <span className={styles.trustItem}>
              <span className={styles.trustCheck}>✓</span> Instant CSV & QuickBooks Export
            </span>
          </div>

          {/* Popular Questions Quick Jump */}
          <div className={styles.popularRow}>
            <span className={styles.popularLabel}>Common questions:</span>
            {POPULAR_QUERIES.map((pop) => (
              <button
                key={pop.id}
                type="button"
                className={styles.popularPill}
                onClick={() => jumpToQuestion(pop.id)}
              >
                {pop.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Interactive Search & Filter Toolbar ── */}
      <div className={styles.searchSection} role="search" aria-label="Search frequently asked questions">
        <div className={styles.searchBox}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${totalQuestions} questions (e.g. fees, stripe, refunds, domain, crew)...`}
            className={styles.searchInput}
            aria-label="Search questions"
          />
          <div className={styles.searchActions}>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={styles.clearButton}
                aria-label="Clear search query"
              >
                ✕
              </button>
            ) : (
              <span className={styles.keyboardBadge} title="Press / to search" aria-hidden="true">
                /
              </span>
            )}
          </div>
        </div>

        {/* Suggested Searches Quick Chips */}
        {!searchQuery && (
          <div className={styles.suggestedRow} aria-label="Suggested search queries">
            <span className={styles.suggestedLabel}>Try searching:</span>
            {SUGGESTED_SEARCHES.map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.suggestedChip}
                onClick={() => setSearchQuery(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Categories & Expand All Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.categoryPills} role="tablist" aria-label="Filter by category">
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              className={`${styles.categoryPill} ${selectedCategory === 'all' ? styles.categoryPillActive : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Questions <span className={styles.pillCount}>{totalQuestions}</span>
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === group.id}
                className={`${styles.categoryPill} ${selectedCategory === group.id ? styles.categoryPillActive : ''}`}
                onClick={() => setSelectedCategory(group.id)}
              >
                {group.heading} <span className={styles.pillCount}>{group.items.length}</span>
              </button>
            ))}
          </div>

          <div className={styles.toolbarUtility}>
            <button
              type="button"
              className={styles.expandAllBtn}
              onClick={toggleAllVisible}
              aria-label={allVisibleAreOpen ? 'Collapse all visible questions' : 'Expand all visible questions'}
            >
              {allVisibleAreOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>

        {/* Live Search Status Bar */}
        {searchQuery.trim() ? (
          <div className={styles.searchMetaBar} aria-live="polite">
            <span>
              Showing <span className={styles.searchMetaCount}>{visibleQuestionCount}</span> of {totalQuestions} questions matching &ldquo;{searchQuery}&rdquo;
            </span>
            <button
              type="button"
              className={styles.clearSearchLink}
              onClick={() => setSearchQuery('')}
            >
              Reset search
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Table of Contents (Shown on desktop when not searching) ── */}
      {!searchQuery.trim() && selectedCategory === 'all' && (
        <nav className={styles.contentsNav} aria-label="Questions on this page">
          {groups.map((group) => (
            <div key={group.id} className={styles.contentsColumn}>
              <div className={styles.contentsHeadingWrap}>
                <span className={styles.contentsGroupTitle}>{group.heading}</span>
              </div>
              <ul className={styles.contentsList}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={styles.contentsLink}
                      onClick={(e) => {
                        e.preventDefault();
                        jumpToQuestion(item.id);
                      }}
                    >
                      {item.q}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}

      {/* ── Empty State ── */}
      {filteredGroups.length === 0 ? (
        <div className={styles.emptyCard} role="status">
          <div className={styles.emptyIcon} aria-hidden="true">🔍</div>
          <h2 className={styles.emptyTitle}>No questions found</h2>
          <p className={styles.emptyDesc}>
            We couldn&apos;t find any questions matching &ldquo;{searchQuery}&rdquo;. Try clicking one of the suggested search topics above or ask our team directly.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Show all questions
            </button>
            <Link href="/contact" className="btn primary">
              Ask us directly
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── FAQ Accordion Groups ── */}
      {filteredGroups.map((group) => {
        const meta = CATEGORY_META[group.id];
        return (
          <section className={`section-block ${styles.faqSection}`} key={group.id} id={group.id}>
            <div className={styles.groupHeading}>
              <div className={styles.groupHeaderRow}>
                <h2 className={styles.groupTitle}>
                  {group.heading}
                  <span className={styles.groupBadge}>{group.items.length}</span>
                </h2>
              </div>
              {meta ? <p className={styles.groupSubtitle}>{meta.subtitle}</p> : null}
            </div>

            <div className={styles.faqList}>
              {group.items.map((item) => {
                const isSearchActive = searchQuery.trim().length > 0;
                const isOpen = isSearchActive || (mounted ? !!openItems[item.id] : false);
                const isHighlighted = highlightedId === item.id;
                const isCopied = copiedId === item.id;
                const itemFeedback = feedback[item.id];
                const contextAction = CONTEXT_ACTIONS[item.id];

                return (
                  <details
                    className={`${styles.faqCard} ${isHighlighted ? styles.faqCardTargetHighlight : ''}`}
                    key={item.id}
                    id={item.id}
                    open={isOpen}
                    onToggle={(e) => handleToggleItem(item.id, e)}
                  >
                    <summary className={styles.faqSummary}>
                      <span className={styles.faqQuestionText}>
                        {highlightMatches(item.q, searchQuery)}
                      </span>
                      <span className={styles.toggleIcon} aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                    </summary>

                    <div className={styles.answerWrapper}>
                      <div className={styles.answerInner}>
                        <div className={styles.answerBody}>
                          <p className={styles.answerText}>
                            {formatAnswerText(item.a, searchQuery)}
                          </p>

                          {/* Contextual Deep Link Pill if available */}
                          {contextAction && (
                            <div className={styles.contextLinkBox}>
                              <Link href={contextAction.href} className={styles.contextActionLink}>
                                {contextAction.label}
                              </Link>
                            </div>
                          )}

                          {/* Footer Bar: Permalink Copy & Helpful Feedback */}
                          <div className={styles.answerFooterBar}>
                            <div className={styles.permalinkRow}>
                              <button
                                type="button"
                                className={`${styles.copyLinkBtn} ${isCopied ? styles.copyLinkBtnActive : ''}`}
                                onClick={(e) => copyPermalink(item.id, e)}
                                title="Copy direct link to this answer"
                                aria-label={isCopied ? 'Direct link copied to clipboard' : 'Copy link to this answer'}
                              >
                                {isCopied ? (
                                  <>
                                    <svg className={styles.copyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Link copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className={styles.copyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                    <span>Copy link to this answer</span>
                                  </>
                                )}
                              </button>
                              <a href={`#${item.id}`} className="sr-only">
                                Direct anchor to {item.q}
                              </a>
                            </div>

                            {/* Helpful / Not Helpful Micro-Feedback */}
                            <div className={styles.feedbackGroup} aria-label="Was this answer helpful?">
                              {itemFeedback === 'helpful' ? (
                                <span className={styles.feedbackMsg}>✓ Thanks for letting us know!</span>
                              ) : itemFeedback === 'unhelpful' ? (
                                <span className={styles.feedbackMsg} style={{ color: 'var(--muted)' }}>
                                  Need more info?
                                  <Link href="/contact" className={styles.feedbackFollowupLink}>
                                    Ask us directly →
                                  </Link>
                                </span>
                              ) : (
                                <>
                                  <span>Helpful?</span>
                                  <button
                                    type="button"
                                    className={styles.feedbackBtn}
                                    onClick={() => handleFeedback(item.id, 'helpful')}
                                    aria-label="Mark answer as helpful"
                                  >
                                    👍 Yes
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.feedbackBtn}
                                    onClick={() => handleFeedback(item.id, 'unhelpful')}
                                    aria-label="Mark answer as needing more info"
                                  >
                                    👎 Needs info
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* ── Closing Call to Action ── */}
      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Still have a question?</p>
          <h2>The fastest way to see it is to try it.</h2>
          <p>Start with Flex at $0/month plus a 1.25% LGQ platform fee.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">
              Build my free site
            </a>
            <Link href="/contact" className="btn secondary">
              Ask us directly
            </Link>
          </div>
        </div>
      </section>

      {/* ── Floating "Back to Search & Top" Pill ── */}
      <button
        type="button"
        className={`${styles.floatingBackToTop} ${showBackToTop ? styles.floatingBackToTopVisible : ''}`}
        onClick={scrollToSearch}
        aria-label="Return to search and top of questions"
      >
        <svg className={styles.floatingIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
        <span>Top / Search</span>
      </button>
    </>
  );
}
