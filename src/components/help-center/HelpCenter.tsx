'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  KNOWLEDGE_BASE,
  FAQS,
  TRADE_PLAYBOOKS,
  DOWNLOADABLE_TEMPLATES,
  COMMON_FIX_ARTICLES,
  SUPPORT_CHANNELS,
  LEGAL_TEMPLATES_DISCLAIMER,
  Article,
  DownloadableTemplate
} from './help-center-data';
import {
  matchTroubleshooter,
  TROUBLESHOOTER_INTENTS,
  TroubleshooterMatchResult
} from '@/lib/help/troubleshooter';
import styles from './HelpCenter.module.css';

// Lightweight Zero-Dependency SVG Icon Helpers (24x24 stroke style)
function Icon({ d, className = styles.iconSm }: { d: string | React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {typeof d === 'string' ? <path d={d} /> : d}
    </svg>
  );
}

const Icons = {
  Search: () => (
    <Icon
      d={
        <>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </>
      }
      className={styles.searchIcon}
    />
  ),
  Sparkles: () => (
    <Icon
      d={
        <>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </>
      }
    />
  ),
  LifeBuoy: () => (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
          <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
          <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
        </>
      }
    />
  ),
  Send: () => (
    <Icon
      d={
        <>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </>
      }
    />
  ),
  X: () => (
    <Icon
      d={
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      }
    />
  ),
  Check: () => <Icon d="M20 6 9 17l-5-5" />,
  ThumbsUp: () => (
    <Icon
      d={
        <>
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3" />
        </>
      }
    />
  ),
  ThumbsDown: () => (
    <Icon
      d={
        <>
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" />
        </>
      }
    />
  ),
  ChevronDown: ({ isOpen }: { isOpen?: boolean }) => (
    <Icon
      d="m6 9 6 6 6-6"
      className={`${styles.faqChevron} ${isOpen ? styles.faqChevronRotated : ''}`}
    />
  ),
  Rocket: () => (
    <Icon
      d={
        <>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </>
      }
    />
  ),
  FileSpreadsheet: () => (
    <Icon
      d={
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M8 13h2" />
          <path d="M14 13h2" />
          <path d="M8 17h2" />
          <path d="M14 17h2" />
        </>
      }
    />
  ),
  Globe: () => (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </>
      }
    />
  ),
  Smartphone: () => (
    <Icon
      d={
        <>
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
          <path d="M12 18h.01" />
        </>
      }
    />
  ),
  CreditCard: () => (
    <Icon
      d={
        <>
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </>
      }
    />
  ),
  Users: () => (
    <Icon
      d={
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      }
    />
  ),
  BookCheck: () => (
    <Icon
      d={
        <>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
          <path d="m9 9.5 2 2 4-4" />
        </>
      }
      className={styles.statIconEmerald}
    />
  ),
  CheckCircle: () => (
    <Icon
      d={
        <>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </>
      }
      className={styles.successIcon}
    />
  ),
  ArrowUpRight: () => <Icon d="M7 7h10v10M7 17 17 7" className={styles.arrowIcon} />,
  Eye: () => (
    <Icon
      d={
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      }
    />
  ),
  Printer: () => (
    <Icon
      d={
        <>
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect width="12" height="8" x="6" y="14" />
        </>
      }
    />
  ),
  Copy: () => (
    <Icon
      d={
        <>
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </>
      }
      className={styles.iconXs}
    />
  ),
  Wrench: () => (
    <Icon
      d={
        <>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </>
      }
    />
  ),
  Home: () => (
    <Icon
      d={
        <>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </>
      }
    />
  ),
  Zap: () => (
    <Icon
      d={
        <>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </>
      }
    />
  ),
  Trees: () => (
    <Icon
      d={
        <>
          <path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z" />
          <path d="M7 16v6" />
          <path d="M13 19v3" />
          <path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-4 4.3a1 1 0 0 0 .8 1.7H10l-3 3.3a1 1 0 0 0 .7 1.7H9l-3 3.3a1 1 0 0 0 .7 1.7H12" />
        </>
      }
    />
  ),
  Hammer: () => (
    <Icon
      d={
        <>
          <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
          <path d="M17.64 15 22 10.64" />
          <path d="m20.91 3.26-1.25-1.25a2 2 0 0 0-2.83 0l-1.8 1.8a2 2 0 0 0 0 2.83l1.25 1.25" />
          <path d="m14 6 3 3" />
        </>
      }
    />
  ),
  AlertCircle: () => (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </>
      }
    />
  )
};

const ICON_MAP: Record<string, React.ReactNode> = {
  Rocket: <Icons.Rocket />,
  FileSpreadsheet: <Icons.FileSpreadsheet />,
  Globe: <Icons.Globe />,
  Smartphone: <Icons.Smartphone />,
  CreditCard: <Icons.CreditCard />,
  Users: <Icons.Users />,
  Wrench: <Icons.Wrench />,
  Home: <Icons.Home />,
  Zap: <Icons.Zap />,
  Trees: <Icons.Trees />,
  Hammer: <Icons.Hammer />,
  LifeBuoy: <Icons.LifeBuoy />,
  Send: <Icons.Send />,
  BookCheck: <Icons.BookCheck />
};

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [activeTrade, setActiveTrade] = useState('plumbing');
  const [isTradeWorkflowExpanded, setIsTradeWorkflowExpanded] = useState(false);

  // Category inline expansion
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Active modals
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [activeDocument, setActiveDocument] = useState<DownloadableTemplate | null>(null);
  const [isTicketDrawerOpen, setIsTicketDrawerOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Quick Start Checklist State
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [activeMobileStep, setActiveMobileStep] = useState<number | null>(1);

  // Support Ticket Form State
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketNotes, setTicketNotes] = useState('');
  const [ticketDeflection, setTicketDeflection] = useState<string | null>(null);
  const [isTicketSubmitted, setIsTicketSubmitted] = useState(false);

  // FAQ State
  const [faqCategory, setFaqCategory] = useState<string>('all');
  const [activeFaq, setActiveFaq] = useState<string | null>('faq-1');
  const [faqFeedback, setFaqFeedback] = useState<Record<string, 'yes' | 'no'>>({});
  const [_faqFeedbackReason, setFaqFeedbackReason] = useState<Record<string, string>>({});

  // Feedback Toast & Clipboard
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [_copiedRecord, setCopiedRecord] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  // Flatten all articles for lookup
  const allArticlesList = useMemo(() => {
    const map = new Map<string, Article>();
    COMMON_FIX_ARTICLES.forEach(a => map.set(a.id, a));
    KNOWLEDGE_BASE.forEach(cat => cat.articles.forEach(a => map.set(a.id, a)));
    return Array.from(map.values());
  }, []);

  const totalGuides = useMemo(() => {
    return KNOWLEDGE_BASE.reduce((sum, category) => sum + category.articles.length, 0);
  }, []);

  // Match troubleshooter intent
  const troubleshooterResult: TroubleshooterMatchResult = useMemo(() => {
    if (!searchQuery.trim()) {
      return { matched: false, confidence: 0 };
    }
    return matchTroubleshooter(searchQuery, allArticlesList);
  }, [searchQuery, allArticlesList]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedRecord(label);
    showToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedRecord(null), 2500);
  }, [showToast]);

  // Open Article & Synchronize with URL
  const openArticle = useCallback((article: Article, preserveFocus = true) => {
    if (preserveFocus && typeof document !== 'undefined') {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    }
    setActiveArticle(article);

    // Update URL query parameter
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('article', article.id);
      window.history.pushState(null, '', url.toString());
    }
  }, []);

  const closeArticle = useCallback(() => {
    setActiveArticle(null);

    // Remove article parameter from URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      window.history.pushState(null, '', url.toString());
    }

    // Restore focus
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, []);

  // Open ticket prefilled with query or reason
  const openTicketWithSubject = useCallback((subject: string, notes?: string) => {
    if (typeof document !== 'undefined') {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    }
    setTicketSubject(subject);
    if (notes) setTicketNotes(notes);
    setIsTicketSubmitted(false);
    setIsTicketDrawerOpen(true);
  }, []);

  const closeTicketDrawer = useCallback(() => {
    setIsTicketDrawerOpen(false);
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, []);

  // On initial mount: Check for URL query ?article=<id>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const articleParam = params.get('article');
    if (articleParam) {
      const found = allArticlesList.find(a => a.id === articleParam);
      if (found) {
        openArticle(found, false);
      }
    }
  }, [allArticlesList, openArticle]);

  // Keyboard Shortcuts (Ctrl/Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (activeArticle) closeArticle();
        if (activeDocument) setActiveDocument(null);
        if (isTicketDrawerOpen) closeTicketDrawer();
        if (isStatusModalOpen) setIsStatusModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, activeDocument, isTicketDrawerOpen, isStatusModalOpen, closeArticle, closeTicketDrawer]);

  // Real-time Deflection in Ticket Drawer
  useEffect(() => {
    const val = ticketSubject.toLowerCase();
    if (val.length < 3) {
      setTicketDeflection(null);
      return;
    }
    if (val.includes('sms') || val.includes('carrier') || val.includes('text') || val.includes('phone') || val.includes('10dlc')) {
      setTicketDeflection('10DLC carrier registration takes 2-24 hrs. Ensure your company legal name matches your IRS EIN letter in Settings.');
    } else if (val.includes('stripe') || val.includes('deposit') || val.includes('payout')) {
      setTicketDeflection('Stripe Connect deposits customer funds on a standard 2-business-day rolling schedule to your verified checking account.');
    } else if (val.includes('domain') || val.includes('dns') || val.includes('godaddy') || val.includes('squarespace')) {
      setTicketDeflection('Point root domain A record to 76.76.21.21 and CNAME www to cname.letsgetquoted.com in your registrar DNS.');
    } else {
      setTicketDeflection(null);
    }
  }, [ticketSubject]);

  const currentTrade = TRADE_PLAYBOOKS.find(t => t.id === activeTrade) || TRADE_PLAYBOOKS[0];

  const filteredFaqs = useMemo(() => {
    if (faqCategory === 'all') return FAQS;
    return FAQS.filter(f => f.category === faqCategory);
  }, [faqCategory]);

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleChipClick = (title: string) => {
    setSearchQuery(title);
    setHasInteracted(true);
    searchInputRef.current?.focus();
  };

  return (
    <div className={styles.helpRoot}>
      <div className={`${styles.ambientGlow} ${styles.glow1}`} />
      <div className={`${styles.ambientGlow} ${styles.glow2}`} />
      <div className={`${styles.ambientGlow} ${styles.glow3}`} />

      {/* Sticky Sub-Navigation (<= 64px on mobile) */}
      <nav className={styles.subNavbar} aria-label="Help Center Sub-navigation">
        <div className={styles.subNavContainer}>
          <div className={styles.subNavLeft}>
            <div className={styles.helpBadgePill}>
              <Icons.Sparkles />
              <span>Help Center</span>
            </div>
            <div className={styles.subNavLinks}>
              <a href="#ai-troubleshooter" className={styles.subNavLink}>Troubleshoot</a>
              <a href="#common-fixes" className={styles.subNavLink}>Common Fixes</a>
              <a href="#knowledge-hub" className={styles.subNavLink}>Guides</a>
              <a href="#quick-start" className={styles.subNavLink}>Setup</a>
              <a href="#faqs" className={styles.subNavLink}>FAQs</a>
              <a href="#contact-support" className={styles.subNavLink}>Contact</a>
            </div>
          </div>

          <div className={styles.subNavActions}>
            <button
              className={styles.statusPillBtn}
              onClick={() => setIsStatusModalOpen(true)}
              aria-label="View system status"
            >
              <span className={styles.statusIndicatorDot} />
              <span className={styles.statusTextDesktop}>System status</span>
            </button>

            <button
              className={styles.btnPrimarySm}
              onClick={() => openTicketWithSubject('')}
              aria-label="Open support ticket"
            >
              <Icons.LifeBuoy />
              <span className={styles.btnTextDesktop}>Open Ticket</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ================= 1. HERO SECTION & AI TROUBLESHOOTER ================= */}
      <section id="ai-troubleshooter" className={styles.heroSection}>
        <div className={styles.heroBadge}>
          <Icons.Sparkles />
          <span>Help Center</span>
        </div>
        <h1 className={styles.heroTitle}>What do you need help with?</h1>
        <p className={styles.heroSubtitle}>
          Describe what’s happening in plain language. We’ll identify the right help path and take you to the fastest fix.
        </p>

        {/* Search Command Box */}
        <div className={styles.searchCommandBox}>
          <div className={styles.searchGlowWrapper}>
            <div className={styles.searchInputWrapper}>
              <Icons.Search />
              <input
                ref={searchInputRef}
                id="troubleshooter-search"
                type="text"
                role="combobox"
                aria-expanded={hasInteracted && Boolean(searchQuery)}
                aria-autocomplete="list"
                aria-controls="troubleshooter-results"
                aria-label="Search troubleshooting topics or guides"
                placeholder='Try “my quote won’t send” or “my Stripe payout is missing”…'
                value={searchQuery}
                onFocus={() => setHasInteracted(true)}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setHasInteracted(true);
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                  }
                }}
              />
              <div className={styles.hotkeyBadge}>
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </div>
              {searchQuery && (
                <button
                  className={styles.clearBtn}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <Icons.X />
                </button>
              )}
            </div>
          </div>

          {/* Quick Secondary Navigation Links */}
          <div className={styles.heroSecondaryRow}>
            <a href="#knowledge-hub" className={styles.heroSecondaryAction}>
              Browse all guides →
            </a>
            <a href="#contact-support" className={styles.heroSecondaryAction}>
              Contact support →
            </a>
          </div>

          {/* 6 Quick-Issue Chips (Horizontal Snap Scroll on Mobile) */}
          <div className={styles.quickChipsWrapper}>
            <span className={styles.quickChipsLabel}>Quick fixes:</span>
            <div className={styles.quickChipsScroll}>
              {TROUBLESHOOTER_INTENTS.map(intent => (
                <button
                  key={intent.id}
                  className={`${styles.quickChipBtn} ${searchQuery === intent.title ? styles.quickChipActive : ''}`}
                  onClick={() => handleChipClick(intent.title)}
                >
                  {intent.title}
                </button>
              ))}
            </div>
          </div>

          {/* 3-Stage Progress Visual Indicator */}
          {hasInteracted && searchQuery.trim().length > 0 && (
            <div className={styles.threeStageProgress} aria-live="polite">
              <div className={`${styles.stageItem} ${searchQuery.length > 0 ? styles.stageResolved : styles.stageActive}`}>
                <span className={styles.stageDot} />
                <span className={styles.stageText}>1. Understanding issue</span>
              </div>
              <div className={styles.stageLine} />
              <div className={`${styles.stageItem} ${troubleshooterResult.matched ? styles.stageResolved : styles.stageActive}`}>
                <span className={styles.stageDot} />
                <span className={styles.stageText}>2. Matching help</span>
              </div>
              <div className={styles.stageLine} />
              <div className={`${styles.stageItem} ${troubleshooterResult.matched ? styles.stageResolved : styles.stageWaiting}`}>
                <span className={styles.stageDot} />
                <span className={styles.stageText}>3. Recommended action</span>
              </div>
            </div>
          )}

          {/* Troubleshooting Match Results Panel */}
          {hasInteracted && searchQuery.trim().length > 0 && (
            <div id="troubleshooter-results" className={styles.troubleshooterResultsPanel}>
              {troubleshooterResult.matched && troubleshooterResult.intent && (
                <div className={styles.matchCard}>
                  <div className={styles.matchHeader}>
                    <div className={styles.matchBadge}>✓ Recommended Fix</div>
                    <span className={styles.matchTime}>⏱ Est. time: {troubleshooterResult.intent.estimatedTime}</span>
                  </div>
                  <h3 className={styles.matchTitle}>{troubleshooterResult.intent.title}</h3>
                  <p className={styles.matchExplanation}>{troubleshooterResult.intent.explanation}</p>
                  
                  <div className={styles.matchActionsRow}>
                    <button
                      className={styles.btnPrimary}
                      onClick={() => {
                        const targetArt = allArticlesList.find(a => a.id === troubleshooterResult.intent?.articleId);
                        if (targetArt) openArticle(targetArt);
                      }}
                    >
                      <span>Open step-by-step guide</span>
                      <Icons.ArrowUpRight />
                    </button>
                    <button
                      className={styles.btnOutline}
                      onClick={() => openTicketWithSubject(searchQuery, `Matched intent: ${troubleshooterResult.intent?.title}`)}
                    >
                      Still stuck? Open a ticket
                    </button>
                  </div>
                </div>
              )}

              {!troubleshooterResult.matched && (
                <div className={styles.unmatchedCard}>
                  <div className={styles.unmatchedHeader}>
                    <Icons.AlertCircle />
                    <div>
                      <h4>Closest Recommended Guides for &quot;{searchQuery}&quot;</h4>
                      <p>We found related troubleshooting steps below or you can connect with our support desk:</p>
                    </div>
                  </div>

                  <div className={styles.unmatchedSuggestionsGrid}>
                    {troubleshooterResult.suggestedArticles?.map(art => (
                      <div
                        key={art.id}
                        className={styles.suggestedArticleCard}
                        onClick={() => {
                          const fullArt = allArticlesList.find(a => a.id === art.id);
                          if (fullArt) openArticle(fullArt);
                        }}
                      >
                        <div className={styles.suggestedArtTitle}>{art.title}</div>
                        <div className={styles.suggestedArtMeta}>
                          <span>{art.category}</span>
                          <span>•</span>
                          <span>{art.readTime}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.unmatchedActionFooter}>
                    <button
                      className={styles.btnPrimarySm}
                      onClick={() => openTicketWithSubject(searchQuery)}
                    >
                      <Icons.LifeBuoy />
                      <span>Ask support about &quot;{searchQuery}&quot;</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ================= 2. COMMON FIXES ================= */}
      <section id="common-fixes" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Diagnostic Guides</span>
            <h2 className={styles.sectionTitle}>Common Fixes</h2>
            <p className={styles.sectionDesc}>
              Fast step-by-step diagnostic solutions for top contractor setup and delivery workflows.
            </p>
          </div>
        </div>

        <div className={styles.commonFixesGrid}>
          {COMMON_FIX_ARTICLES.map(art => (
            <div key={art.id} className={styles.commonFixCard} onClick={() => openArticle(art)}>
              <div className={styles.commonFixTop}>
                <span className={styles.commonFixBadge}>{art.category}</span>
                <span className={styles.commonFixTime}>⏱ {art.readTime}</span>
              </div>
              <h3 className={styles.commonFixTitle}>{art.title}</h3>
              <p className={styles.commonFixAudience}>For: {art.audience || 'Contractors'}</p>
              <div className={styles.commonFixAction}>
                <span>Open Guide</span>
                <Icons.ArrowUpRight />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= 3. EXPLORE ALL GUIDES ================= */}
      <section id="knowledge-hub" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Knowledge Base</span>
            <h2 className={styles.sectionTitle}>Explore All Guides</h2>
            <p className={styles.sectionDesc}>
              {totalGuides} step-by-step guides covering instant quoting, custom domains, SMS carrier rules, and dispatch.
            </p>
          </div>

          <div className={styles.topicFilterPills}>
            {[
              { id: 'all', label: 'All Guides' },
              { id: 'onboarding', label: 'Setup' },
              { id: 'quoting', label: 'Quoting' },
              { id: 'sms', label: 'SMS & Phone' },
              { id: 'website', label: 'Website' },
              { id: 'invoicing', label: 'Invoicing' },
              { id: 'team', label: 'Team' }
            ].map(p => (
              <button
                key={p.id}
                className={`${styles.topicPill} ${selectedTopic === p.id ? styles.activePill : ''}`}
                onClick={() => setSelectedTopic(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.bentoGrid}>
          {KNOWLEDGE_BASE.filter(cat => selectedTopic === 'all' || cat.topic === selectedTopic).map(cat => {
            const isExpanded = Boolean(expandedCategories[cat.id]);
            const visibleArticles = isExpanded ? cat.articles : cat.articles.slice(0, 3);

            return (
              <div key={cat.id} className={styles.bentoCard}>
                <div className={styles.bentoCardTop}>
                  <div className={styles.bentoIconBox}>
                    {ICON_MAP[cat.icon] || <Icons.Rocket />}
                  </div>
                  <span className={styles.bentoCountBadge}>{cat.articles.length} Guides</span>
                </div>
                <h3 className={styles.bentoCardTitle}>{cat.title}</h3>
                <p className={styles.bentoCardDesc}>{cat.desc}</p>

                <div className={styles.bentoArticleList}>
                  {visibleArticles.map(art => (
                    <div
                      key={art.id}
                      className={styles.bentoArticleItem}
                      onClick={() => openArticle(art)}
                    >
                      <span>{art.title}</span>
                      <Icons.ArrowUpRight />
                    </div>
                  ))}
                </div>

                {cat.articles.length > 3 && (
                  <button
                    className={styles.expandCategoryBtn}
                    onClick={() => toggleCategoryExpand(cat.id)}
                  >
                    {isExpanded ? 'Show fewer guides ↑' : `View all ${cat.articles.length} guides ↓`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= 4. NEW-USER QUICK START ================= */}
      <section id="quick-start" className={styles.sectionContainer}>
        <div className={styles.quickStartBanner}>
          <div className={styles.quickStartHeader}>
            <div className={styles.quickStartBadge}>
              <Icons.Rocket />
            </div>
            <div>
              <h3 className={styles.quickStartTitle}>New to Let’s Get Quoted? Fast-Track Setup</h3>
              <p className={styles.quickStartSubtitle}>Complete these 3 foundational steps to send your first quote today.</p>
            </div>
          </div>

          {/* Desktop Compact Progress Row */}
          <div className={styles.quickStepsDesktopRow}>
            {[
              { num: 1, title: 'Set Profit Markup', desc: 'Add materials & hourly rates' },
              { num: 2, title: 'Verify Business SMS', desc: '10DLC carrier registration' },
              { num: 3, title: 'Send 3-Tier Quote', desc: 'Good / Better / Best packages' }
            ].map(step => (
              <div
                key={step.num}
                className={styles.quickStepItem}
                onClick={() => {
                  setCompletedSteps(prev => ({ ...prev, [step.num]: !prev[step.num] }));
                  showToast(`Step ${step.num} updated`);
                }}
              >
                <div className={`${styles.stepNum} ${completedSteps[step.num] ? styles.stepDone : ''}`}>
                  {completedSteps[step.num] ? <Icons.Check /> : step.num}
                </div>
                <div className={styles.stepText}>
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Accordion */}
          <div className={styles.quickStepsMobileAccordion}>
            {[
              { num: 1, title: '1. Set Profit Markup', desc: 'Configure company hourly labor rate and baseline material markups in Settings > Rates.' },
              { num: 2, title: '2. Verify Business SMS', desc: 'Submit your legal EIN and business address in Settings > SMS to enable dedicated carrier texting.' },
              { num: 3, title: '3. Send 3-Tier Quote', desc: 'Create a multi-option estimate in Jobs > Quotes and text the private approval link to a customer.' }
            ].map(step => (
              <div key={step.num} className={styles.mobileStepAccordionItem}>
                <button
                  className={styles.mobileStepHeaderBtn}
                  aria-expanded={activeMobileStep === step.num}
                  aria-controls={`mobile-step-body-${step.num}`}
                  onClick={() => setActiveMobileStep(activeMobileStep === step.num ? null : step.num)}
                >
                  <span>{step.title}</span>
                  <Icons.ChevronDown isOpen={activeMobileStep === step.num} />
                </button>
                {activeMobileStep === step.num && (
                  <div id={`mobile-step-body-${step.num}`} className={styles.mobileStepBody}>
                    <p>{step.desc}</p>
                    <button
                      className={styles.stepDoneToggleBtn}
                      onClick={() => setCompletedSteps(prev => ({ ...prev, [step.num]: !prev[step.num] }))}
                    >
                      {completedSteps[step.num] ? '✓ Marked as Completed' : 'Mark as Done'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 5. TRADE-SPECIFIC PLAYBOOKS ================= */}
      <section id="trade-playbooks" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Trade Playbooks</span>
            <h2 className={styles.sectionTitle}>Playbooks Built for Your Trade</h2>
            <p className={styles.sectionDesc}>
              Tailored quoting formulas, emergency multipliers, and deposit schedules for residential trade specialists.
            </p>
          </div>
        </div>

        {/* Trade Switcher Tabs */}
        <div className={styles.tradeTabsContainer}>
          {TRADE_PLAYBOOKS.map(trade => (
            <button
              key={trade.id}
              className={`${styles.tradeTabBtn} ${activeTrade === trade.id ? styles.activeTradeTab : ''}`}
              onClick={() => setActiveTrade(trade.id)}
            >
              {ICON_MAP[trade.icon] || <Icons.Wrench />}
              <span>{trade.name}</span>
            </button>
          ))}
        </div>

        {/* Trade Detail Showcase Card */}
        <div className={styles.tradePlaybookCard}>
          <div className={styles.tradeCardLeft}>
            <span className={styles.tradeBadge}>{currentTrade.badge}</span>
            <h3 className={styles.tradeHeadline}>{currentTrade.headline}</h3>
            <p className={styles.tradeDescription}>{currentTrade.description}</p>
            
            <button
              className={styles.viewWorkflowsBtn}
              onClick={() => setIsTradeWorkflowExpanded(!isTradeWorkflowExpanded)}
              aria-expanded={isTradeWorkflowExpanded}
              aria-controls="trade-workflows-panel"
            >
              {isTradeWorkflowExpanded ? 'Hide Workflows ↑' : 'View Workflows ↓'}
            </button>
          </div>

          <div id="trade-workflows-panel" className={`${styles.tradeCardRight} ${isTradeWorkflowExpanded ? styles.tradeCardRightExpanded : ''}`}>
            {currentTrade.keyWorkflows.map((wf, idx) => (
              <div key={idx} className={styles.workflowItemCard}>
                <h4 className={styles.workflowTitle}>
                  <Icons.CheckCircle />
                  <span>{wf.title}</span>
                </h4>
                <p className={styles.workflowDesc}>{wf.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 6. CONTRACTOR TEMPLATES & AGREEMENTS ================= */}
      <section id="contractor-templates" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Documentation</span>
            <h2 className={styles.sectionTitle}>Contractor Templates</h2>
            <p className={styles.sectionDesc}>
              Print-ready milestone deposit agreements, extra work change orders, and progress lien waiver templates.
            </p>
          </div>
        </div>

        <div className={styles.templatesGrid}>
          {DOWNLOADABLE_TEMPLATES.map(tpl => (
            <div key={tpl.id} className={styles.templateCard}>
              <div className={styles.templateTop}>
                <span className={styles.templateFormatBadge}>PDF &amp; Print Ready</span>
                <span className={styles.templateSize}>{tpl.fileSize}</span>
              </div>
              <h3 className={styles.templateName}>{tpl.name}</h3>
              <p className={styles.templateDesc}>{tpl.description}</p>
              <button
                className={styles.btnOutlineSm}
                onClick={() => setActiveDocument(tpl)}
              >
                <Icons.Eye />
                <span>Preview Template</span>
              </button>
            </div>
          ))}
        </div>

        {/* Mandatory Legal Disclaimer */}
        <div className={styles.legalDisclaimerBox}>
          <strong>Disclaimer:</strong> {LEGAL_TEMPLATES_DISCLAIMER}
        </div>
      </section>

      {/* ================= 7. FAQS ================= */}
      <section id="faqs" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Answers</span>
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
            <p className={styles.sectionDesc}>
              Common questions on 10DLC compliance, Stripe payout timings, domain setup, and crew dispatch.
            </p>
          </div>

          <div className={styles.faqCategoryPills}>
            {[
              { id: 'all', label: 'All' },
              { id: 'quotes', label: 'Quotes' },
              { id: 'messaging', label: 'Messaging' },
              { id: 'payments', label: 'Payments' },
              { id: 'website', label: 'Website' },
              { id: 'team', label: 'Team & Scheduling' },
              { id: 'billing', label: 'Account & Billing' }
            ].map(tab => (
              <button
                key={tab.id}
                className={`${styles.topicPill} ${faqCategory === tab.id ? styles.activePill : ''}`}
                onClick={() => setFaqCategory(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.faqAccordionList}>
          {filteredFaqs.map(faq => {
            const isOpen = activeFaq === faq.id;
            const currentFeedback = faqFeedback[faq.id];

            return (
              <div key={faq.id} className={styles.faqItem}>
                <button
                  className={styles.faqQuestionBtn}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${faq.id}`}
                  onClick={() => setActiveFaq(isOpen ? null : faq.id)}
                >
                  <span>{faq.question}</span>
                  <Icons.ChevronDown isOpen={isOpen} />
                </button>

                {isOpen && (
                  <div id={`faq-answer-${faq.id}`} className={styles.faqAnswerBody}>
                    <p>{faq.answer}</p>

                    {/* FAQ Feedback Row */}
                    <div className={styles.faqFeedbackRow}>
                      <span className={styles.faqFeedbackLabel}>Was this helpful?</span>
                      <button
                        className={`${styles.faqFeedbackBtn} ${currentFeedback === 'yes' ? styles.feedbackActive : ''}`}
                        onClick={() => {
                          setFaqFeedback(prev => ({ ...prev, [faq.id]: 'yes' }));
                          showToast('Thank you for your feedback!');
                        }}
                      >
                        <Icons.ThumbsUp /> Yes
                      </button>
                      <button
                        className={`${styles.faqFeedbackBtn} ${currentFeedback === 'no' ? styles.feedbackActive : ''}`}
                        onClick={() => setFaqFeedback(prev => ({ ...prev, [faq.id]: 'no' }))}
                      >
                        <Icons.ThumbsDown /> No
                      </button>
                    </div>

                    {/* Deflection options on "No" */}
                    {currentFeedback === 'no' && (
                      <div className={styles.faqFeedbackDeflection}>
                        <span>How can we improve this answer?</span>
                        <div className={styles.deflectionOptionsRow}>
                          <button
                            className={styles.deflectionChip}
                            onClick={() => {
                              setFaqFeedbackReason(prev => ({ ...prev, [faq.id]: 'incomplete' }));
                              showToast('Feedback recorded: Incomplete answer');
                            }}
                          >
                            The answer was incomplete
                          </button>
                          <button
                            className={styles.deflectionChip}
                            onClick={() => {
                              setFaqFeedbackReason(prev => ({ ...prev, [faq.id]: 'outdated' }));
                              showToast('Feedback recorded: Outdated steps');
                            }}
                          >
                            The steps appear outdated
                          </button>
                          <button
                            className={`${styles.deflectionChip} ${styles.deflectionChipContact}`}
                            onClick={() => openTicketWithSubject(`FAQ Issue: ${faq.question}`, 'User reported this FAQ answer was unhelpful or outdated.')}
                          >
                            Contact support →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= 8. CONTACT SUPPORT ================= */}
      <section id="contact-support" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Direct Assistance</span>
            <h2 className={styles.sectionTitle}>Contact Support</h2>
            <p className={styles.sectionDesc}>
              Open a help desk ticket for fast technical resolution or explore our step-by-step guides.
            </p>
          </div>
        </div>

        <div className={styles.supportChannelsGrid}>
          {SUPPORT_CHANNELS.map(chan => (
            <div key={chan.id} className={styles.supportChannelCard}>
              <div className={styles.channelTop}>
                <div className={styles.channelIconBox}>
                  {ICON_MAP[chan.icon] || <Icons.LifeBuoy />}
                </div>
                <h3 className={styles.channelName}>{chan.name}</h3>
              </div>

              <div className={styles.channelField}>
                <span className={styles.channelFieldLabel}>Best used for:</span>
                <span className={styles.channelFieldVal}>{chan.bestUsedFor}</span>
              </div>

              <div className={styles.channelField}>
                <span className={styles.channelFieldLabel}>Availability:</span>
                <span className={styles.channelFieldVal}>{chan.availability}</span>
              </div>

              <div className={styles.channelField}>
                <span className={styles.channelFieldLabel}>Expected response:</span>
                <span className={styles.channelFieldVal}><strong>{chan.responseTarget}</strong></span>
              </div>

              <div className={styles.channelField}>
                <span className={styles.channelFieldLabel}>What to prepare:</span>
                <ul className={styles.prepareList}>
                  {chan.prepareInfo.map((info, idx) => (
                    <li key={idx}>{info}</li>
                  ))}
                </ul>
              </div>

              {chan.id === 'chan-ticket' && (
                <button
                  className={styles.btnPrimaryBlock}
                  onClick={() => openTicketWithSubject('')}
                >
                  <Icons.LifeBuoy />
                  <span>Open Help Desk Ticket</span>
                </button>
              )}

              {chan.id === 'chan-community' && (
                <a
                  href="#knowledge-hub"
                  className={styles.btnOutlineBlock}
                >
                  <Icons.BookCheck />
                  <span>Browse Guides</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. Article Reader Modal with ?article= query synchronization */}
      {activeArticle && (
        <div className={styles.modalOverlay} onClick={closeArticle} role="dialog" aria-modal="true" aria-labelledby="modal-article-title">
          <div className={styles.articleModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className={styles.categoryBadge}>{activeArticle.category}</span>
                {activeArticle.audience && (
                  <span className={styles.audienceBadge}>Audience: {activeArticle.audience}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className={styles.copyLinkBtn}
                  onClick={() => copyToClipboard(`https://letsgetquoted.com/help?article=${activeArticle.id}`, 'Guide Link')}
                >
                  <Icons.Copy />
                  <span>Copy guide link</span>
                </button>
                <button className={styles.iconBtn} onClick={closeArticle} aria-label="Close guide modal">
                  <Icons.X />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              <h1 id="modal-article-title" className={styles.articleTitle}>{activeArticle.title}</h1>
              
              <div className={styles.articleMetaDeck}>
                <span>⏱ {activeArticle.readTime}</span>
                <span>📅 Last Updated: {activeArticle.lastUpdated || 'August 2026'}</span>
                <span>📁 Category: {activeArticle.category}</span>
              </div>

              <div
                className={styles.articleContent}
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />

              <div className={styles.modalFooterActions}>
                <button
                  className={styles.btnPrimarySm}
                  onClick={() => copyToClipboard(`https://letsgetquoted.com/help?article=${activeArticle.id}`, 'Guide Link')}
                >
                  <Icons.Copy />
                  <span>Share Guide</span>
                </button>
                <button
                  className={styles.btnOutlineSm}
                  onClick={() => openTicketWithSubject(`Question regarding: ${activeArticle.title}`)}
                >
                  Still stuck? Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. In-App Document Viewer & Print Modal */}
      {activeDocument && (
        <div className={styles.modalOverlay} onClick={() => setActiveDocument(null)} role="dialog" aria-modal="true">
          <div className={styles.docModal} onClick={e => e.stopPropagation()}>
            <div className={styles.docModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className={styles.categoryBadge}>Contractor Templates</span>
                <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                  ✓ Print &amp; PDF Ready
                </span>
              </div>
              <div className={styles.docHeaderActions}>
                <button
                  className={styles.btnPrimarySm}
                  onClick={() => window.print()}
                >
                  <Icons.Printer />
                  <span>Print / Save PDF</span>
                </button>
                <button className={styles.iconBtn} onClick={() => setActiveDocument(null)} aria-label="Close template preview">
                  <Icons.X />
                </button>
              </div>
            </div>

            <div className={styles.docModalBody}>
              <div className={styles.docPaperHeader}>
                <span className={styles.docBadge}>FORM TEMPLATE • PRINT READY</span>
                <h1 className={styles.docPaperTitle}>{activeDocument.name}</h1>
                <p className={styles.docPaperDesc}>{activeDocument.description}</p>
              </div>

              <div className={styles.docSampleBody}>
                <div className={styles.docClause}>
                  <h3>Template Structure &amp; Clauses</h3>
                  <p>Standard contractor agreement template ready for printing or attaching to customer proposals.</p>
                </div>
              </div>

              <div className={styles.legalDisclaimerBox}>
                <strong>Disclaimer:</strong> {LEGAL_TEMPLATES_DISCLAIMER}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Support Ticket Drawer with Prefilled Query */}
      {isTicketDrawerOpen && (
        <div className={styles.drawerOverlay} onClick={closeTicketDrawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
          <div className={styles.drawerCard} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icons.LifeBuoy />
                <h3 id="drawer-title">Open Support Ticket</h3>
              </div>
              <button className={styles.iconBtn} onClick={closeTicketDrawer} aria-label="Close ticket drawer">
                <Icons.X />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {!isTicketSubmitted ? (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    setIsTicketSubmitted(true);
                  }}
                >
                  <div className={styles.formGroup}>
                    <label>Full Name</label>
                    <input type="text" required placeholder="Your full name" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Work Email</label>
                    <input type="email" required placeholder="your.name@company.com" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Subject</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SMS delivery pending carrier status"
                      value={ticketSubject}
                      onChange={e => setTicketSubject(e.target.value)}
                    />
                  </div>

                  {ticketDeflection && (
                    <div className={styles.ticketDeflectionCard}>
                      <strong>⚡ Instant Answer:</strong>
                      <p>{ticketDeflection}</p>
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label>Description &amp; Error Details</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Describe what you're trying to accomplish..."
                      value={ticketNotes}
                      onChange={e => setTicketNotes(e.target.value)}
                    />
                  </div>

                  <div className={styles.drawerFooter}>
                    <button
                      type="button"
                      className={styles.btnOutline}
                      onClick={closeTicketDrawer}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={styles.btnPrimary}>
                      <Icons.Send />
                      <span>Submit Ticket</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.ticketSuccess}>
                  <Icons.CheckCircle />
                  <h3>Support Ticket Logged!</h3>
                  <p>Our team has received your details and will follow up promptly via your account email.</p>
                  <button
                    className={styles.btnPrimaryBlock}
                    onClick={closeTicketDrawer}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. System Status Modal */}
      {isStatusModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsStatusModalOpen(false)} role="dialog" aria-modal="true">
          <div className={styles.statusModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>System Status</h3>
              <button className={styles.iconBtn} onClick={() => setIsStatusModalOpen(false)} aria-label="Close status modal">
                <Icons.X />
              </button>
            </div>
            <div className={styles.statusModalBody}>
              <div className={styles.statusRow}>
                <div>
                  <strong>Instant Quoting &amp; PDF Engine</strong>
                  <small>Google Cloud Run (us-east1)</small>
                </div>
                <span className={styles.badgeOperational}>Operational</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Two-Way SMS &amp; Dedicated Phone Gateway</strong>
                  <small>Carrier Webhook Listeners</small>
                </div>
                <span className={styles.badgeOperational}>Operational</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Stripe Payments &amp; Deposits</strong>
                  <small>Webhook API V2</small>
                </div>
                <span className={styles.badgeOperational}>Operational</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Contractor Website CDN &amp; DNS</strong>
                  <small>Global Anycast CDN</small>
                </div>
                <span className={styles.badgeOperational}>Operational</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Message */}
      {toastMessage && (
        <div className={styles.toast} role="status">
          <Icons.Check />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
