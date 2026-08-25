'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  KNOWLEDGE_BASE,
  FAQS,
  TRADE_PLAYBOOKS,
  DOWNLOADABLE_TEMPLATES,
  Article,
  DownloadableTemplate
} from './help-center-data';
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
  ChevronDown: () => <Icon d="m6 9 6 6 6-6" className={styles.faqChevron} />,
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
  LayoutGrid: () => (
    <Icon
      d={
        <>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </>
      }
    />
  ),
  List: () => (
    <Icon
      d={
        <>
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="3.01" y1="6" y2="6" />
          <line x1="3" x2="3.01" y1="12" y2="12" />
          <line x1="3" x2="3.01" y1="18" y2="18" />
        </>
      }
    />
  ),
  Clock: () => (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </>
      }
      className={styles.statIconCyan}
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
  ShieldCheck: () => (
    <Icon
      d={
        <>
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </>
      }
      className={styles.statIconOrange}
    />
  ),
  Bot: () => (
    <Icon
      d={
        <>
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </>
      }
      className={styles.statIconPurple}
    />
  ),
  MessagesSquare: () => (
    <Icon
      d={
        <>
          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
          <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
        </>
      }
      className={styles.channelIconCyan}
    />
  ),
  Calendar: () => (
    <Icon
      d={
        <>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </>
      }
      className={styles.channelIconEmerald}
    />
  ),
  UploadCloud: () => (
    <Icon
      d={
        <>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        </>
      }
      className={styles.dropzoneIcon}
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
  Hammer: <Icons.Hammer />
};

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [activeTrade, setActiveTrade] = useState('plumbing');
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [activeDocument, setActiveDocument] = useState<DownloadableTemplate | null>(null);
  const [isTicketDrawerOpen, setIsTicketDrawerOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Quick Start Checklist State
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDeflection, setTicketDeflection] = useState<string | null>(null);
  const [isTicketSubmitted, setIsTicketSubmitted] = useState(false);

  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [faqFeedback, setFaqFeedback] = useState<Record<number, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRecord(label);
    showToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedRecord(null), 2500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K focuses search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      }
      if (e.key === 'Escape') {
        setIsTicketDrawerOpen(false);
        setIsStatusModalOpen(false);
        setActiveArticle(null);
        setActiveDocument(null);
        setIsSearchFocused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const val = ticketSubject.toLowerCase();
    if (val.length < 3) {
      setTicketDeflection(null);
      return;
    }
    if (val.includes('sms') || val.includes('carrier') || val.includes('text') || val.includes('phone')) {
      setTicketDeflection(
        '10DLC carrier verification takes 2–24 hrs. Ensure your company legal name matches your IRS EIN letter in Settings.'
      );
    } else if (val.includes('stripe') || val.includes('deposit') || val.includes('payout')) {
      setTicketDeflection(
        'Stripe Connect deposits 50% upfront material funds directly to your verified bank account next business day.'
      );
    } else if (val.includes('domain') || val.includes('dns') || val.includes('godaddy') || val.includes('squarespace')) {
      setTicketDeflection(
        'Point root domain A record to 76.76.21.21 and CNAME www to cname.letsgetquoted.com in your registrar.'
      );
    } else {
      setTicketDeflection(null);
    }
  }, [ticketSubject]);

  const filteredCategories = KNOWLEDGE_BASE.filter(cat => {
    const matchesTopic = selectedTopic === 'all' || cat.topic === selectedTopic;
    if (!searchQuery) return matchesTopic;
    const q = searchQuery.toLowerCase();
    const catMatch = cat.title.toLowerCase().includes(q) || cat.desc.toLowerCase().includes(q);
    const artMatch = cat.articles.some(a => a.title.toLowerCase().includes(q));
    return matchesTopic && (catMatch || artMatch);
  });

  // Spotlight matches across all content
  const spotlightArticles = searchQuery
    ? KNOWLEDGE_BASE.flatMap(c => c.articles).filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const spotlightTrades = searchQuery
    ? TRADE_PLAYBOOKS.filter(
        t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.headline.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const spotlightTemplates = searchQuery
    ? DOWNLOADABLE_TEMPLATES.filter(
        d =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const currentTrade = TRADE_PLAYBOOKS.find(t => t.id === activeTrade) || TRADE_PLAYBOOKS[0];

  return (
    <div className={styles.helpRoot}>
      <div className={`${styles.ambientGlow} ${styles.glow1}`} />
      <div className={`${styles.ambientGlow} ${styles.glow2}`} />
      <div className={`${styles.ambientGlow} ${styles.glow3}`} />

      {/* Refined Command Strip */}
      <div className={styles.subNavbar}>
        <div className={styles.subNavContainer}>
          <div className={styles.subNavLeft}>
            <div className={styles.helpBadgePill}>
              <Icons.Sparkles />
              <span>Help Center &amp; Command Hub</span>
            </div>
            <nav className={styles.subNavLinks}>
              <a href="#quick-start" className={styles.subNavLink}>
                Quick Start
              </a>
              <a href="#trade-playbooks" className={styles.subNavLink}>
                Trade Playbooks
              </a>
              <a href="#knowledge-hub" className={styles.subNavLink}>
                Guides
              </a>
              <a href="#contractor-templates" className={styles.subNavLink}>
                Agreements
              </a>
              <a href="#faqs" className={styles.subNavLink}>
                FAQs
              </a>
            </nav>
          </div>

          <div className={styles.subNavActions}>
            <button
              className={styles.statusPillBtn}
              onClick={() => setIsStatusModalOpen(true)}
              aria-label="Check live system status"
            >
              <span className={styles.statusIndicatorDot} />
              <span>All Systems 99.9%</span>
            </button>

            <button className={styles.btnPrimarySm} onClick={() => setIsTicketDrawerOpen(true)}>
              <Icons.LifeBuoy />
              <span>Open Ticket</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroBadge}>
          <Icons.Sparkles />
          <span>Support &amp; Knowledge Command Center</span>
        </div>
        <h1 className={styles.heroTitle}>
          How can we help your <span className={styles.highlightText}>business thrive</span> today?
        </h1>
        <p className={styles.heroSubtitle}>
          Explore instant answers, step-by-step contractor playbooks, printable legal templates, or direct support from product engineers.
        </p>

        {/* Search Command Box & Spotlight Dropdown */}
        <div className={styles.searchCommandBox}>
          <div className={styles.searchGlowWrapper}>
            <div className={styles.searchInputWrapper}>
              <Icons.Search />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search guides, trade formulas, errors, or press ⌘K..."
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div className={styles.hotkeyBadge}>
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </div>
              {searchQuery && (
                <button
                  className={styles.clearBtn}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <Icons.X />
                </button>
              )}
            </div>
          </div>

          {/* ================= SPOTLIGHT COMMAND PALETTE ================= */}
          {isSearchFocused && searchQuery.length > 0 && (
            <div className={styles.spotlightDropdown}>
              {spotlightArticles.length > 0 && (
                <div>
                  <div className={styles.spotlightCategoryTitle}>📖 Contractor Guides</div>
                  {spotlightArticles.slice(0, 4).map(art => (
                    <div
                      key={art.id}
                      className={styles.spotlightItem}
                      onClick={() => {
                        setActiveArticle(art);
                        setIsSearchFocused(false);
                      }}
                    >
                      <div className={styles.spotlightItemLeft}>
                        <Icons.BookCheck />
                        <div>
                          <div className={styles.spotlightItemTitle}>{art.title}</div>
                          <div className={styles.spotlightItemMeta}>{art.category} · {art.readTime}</div>
                        </div>
                      </div>
                      <span className={styles.spotlightTag}>Open Guide</span>
                    </div>
                  ))}
                </div>
              )}

              {spotlightTrades.length > 0 && (
                <div>
                  <div className={styles.spotlightCategoryTitle}>🧰 Trade Playbooks</div>
                  {spotlightTrades.map(trade => (
                    <div
                      key={trade.id}
                      className={styles.spotlightItem}
                      onClick={() => {
                        setActiveTrade(trade.id);
                        setIsSearchFocused(false);
                        const el = document.getElementById('trade-playbooks');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <div className={styles.spotlightItemLeft}>
                        <Icons.Wrench />
                        <div>
                          <div className={styles.spotlightItemTitle}>{trade.name} Playbook</div>
                          <div className={styles.spotlightItemMeta}>{trade.headline}</div>
                        </div>
                      </div>
                      <span className={styles.spotlightTag}>Switch Trade</span>
                    </div>
                  ))}
                </div>
              )}

              {spotlightTemplates.length > 0 && (
                <div>
                  <div className={styles.spotlightCategoryTitle}>📄 Stylized Legal &amp; Billing Documents</div>
                  {spotlightTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      className={styles.spotlightItem}
                      onClick={() => {
                        setActiveDocument(tpl);
                        setIsSearchFocused(false);
                      }}
                    >
                      <div className={styles.spotlightItemLeft}>
                        <Icons.Eye />
                        <div>
                          <div className={styles.spotlightItemTitle}>{tpl.name}</div>
                          <div className={styles.spotlightItemMeta}>{tpl.fileFormat} · Print &amp; PDF Ready</div>
                        </div>
                      </div>
                      <span className={styles.spotlightTag}>Preview</span>
                    </div>
                  ))}
                </div>
              )}

              {spotlightArticles.length === 0 && spotlightTrades.length === 0 && spotlightTemplates.length === 0 && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                  No exact matches for &quot;{searchQuery}&quot;. Try searching for <em>&quot;DNS&quot;</em>, <em>&quot;Deposit&quot;</em>, or <em>&quot;SMS&quot;</em>.
                </div>
              )}
            </div>
          )}

          {/* Quick Topic Filter Pills */}
          <div className={styles.topicPillsRow}>
            <span className={styles.pillsLabel}>Popular:</span>
            {[
              { id: 'all', label: 'All Topics' },
              { id: 'quoting', label: 'Instant Quoting' },
              { id: 'sms', label: 'SMS & Business Phone' },
              { id: 'website', label: 'AI Website' },
              { id: 'invoicing', label: 'Invoicing & Stripe' },
              { id: 'team', label: 'Team & Dispatch' }
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

        {/* Hero Metric Highlights Bar */}
        <div className={styles.heroStatsDeck}>
          <div className={styles.statCard}>
            <Icons.Clock />
            <div className={styles.statMeta}>
              <span className={styles.statVal}>&lt; 2 mins</span>
              <span className={styles.statLbl}>Average Chat Reply</span>
            </div>
          </div>
          <div className={styles.statCard}>
            <Icons.BookCheck />
            <div className={styles.statMeta}>
              <span className={styles.statVal}>120+</span>
              <span className={styles.statLbl}>Contractor Guides</span>
            </div>
          </div>
          <div className={styles.statCard}>
            <Icons.ShieldCheck />
            <div className={styles.statMeta}>
              <span className={styles.statVal}>99.98%</span>
              <span className={styles.statLbl}>Uptime SLA</span>
            </div>
          </div>
          <div className={styles.statCard}>
            <Icons.Bot />
            <div className={styles.statMeta}>
              <span className={styles.statVal}>Priority SLA</span>
              <span className={styles.statLbl}>Engineering Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= QUICK START 3-STEP ONBOARDING CHECKLIST ================= */}
      <section id="quick-start" style={{ padding: '0 1.5rem' }}>
        <div className={styles.quickStartBanner}>
          <div className={styles.quickStartHeader}>
            <div className={styles.quickStartBadge}>
              <Icons.Rocket />
            </div>
            <div>
              <h3 className={styles.quickStartTitle}>New to Let&apos;s Get Quoted? Start Here</h3>
              <p className={styles.quickStartSubtitle}>Complete these 3 foundational steps to send your first quote today.</p>
            </div>
          </div>

          <div className={styles.quickStepsRow}>
            <div
              className={styles.quickStepItem}
              onClick={() => {
                setCompletedSteps(prev => ({ ...prev, 1: !prev[1] }));
                showToast('Step 1 status updated');
              }}
            >
              <div className={`${styles.stepNum} ${completedSteps[1] ? styles.stepDone : ''}`}>
                {completedSteps[1] ? <Icons.Check /> : '1'}
              </div>
              <div className={styles.stepText}>
                <strong>Set Profit Markup</strong>
                <span>Add materials &amp; labor rate</span>
              </div>
            </div>

            <div
              className={styles.quickStepItem}
              onClick={() => {
                setCompletedSteps(prev => ({ ...prev, 2: !prev[2] }));
                showToast('Step 2 status updated');
              }}
            >
              <div className={`${styles.stepNum} ${completedSteps[2] ? styles.stepDone : ''}`}>
                {completedSteps[2] ? <Icons.Check /> : '2'}
              </div>
              <div className={styles.stepText}>
                <strong>Verify Business SMS</strong>
                <span>10DLC carrier compliance</span>
              </div>
            </div>

            <div
              className={styles.quickStepItem}
              onClick={() => {
                setCompletedSteps(prev => ({ ...prev, 3: !prev[3] }));
                showToast('Step 3 status updated');
              }}
            >
              <div className={`${styles.stepNum} ${completedSteps[3] ? styles.stepDone : ''}`}>
                {completedSteps[3] ? <Icons.Check /> : '3'}
              </div>
              <div className={styles.stepText}>
                <strong>Send 3-Tier Quote</strong>
                <span>Good / Better / Best options</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= TRADE-SPECIFIC PLAYBOOKS ================= */}
      <section id="trade-playbooks" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Custom Workflows</span>
            <h2 className={styles.sectionTitle}>Playbooks Built for Your Trade</h2>
            <p className={styles.sectionDesc}>
              Tailored quoting formulas, emergency multipliers, and deposit schedules designed specifically for residential trade specialists.
            </p>
          </div>
        </div>

        {/* Trade Switcher Pills */}
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
            <div style={{ marginTop: 'auto' }}>
              <button
                className={styles.btnPrimarySm}
                onClick={() => showToast(`Loaded ${currentTrade.name} quote template configuration`)}
              >
                <Icons.Sparkles />
                <span>Load {currentTrade.name} Template</span>
              </button>
            </div>
          </div>

          <div className={styles.tradeCardRight}>
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

      {/* Bento Grid Knowledge Base */}
      <section id="knowledge-hub" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Knowledge Base</span>
            <h2 className={styles.sectionTitle}>Explore All Guides</h2>
            <p className={styles.sectionDesc}>
              Deep-dive into comprehensive workflows built specifically for modern residential contractors.
            </p>
          </div>
          <div className={styles.viewSwitchTabs}>
            <button
              className={`${styles.viewTab} ${viewMode === 'grid' ? styles.activeTab : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <Icons.LayoutGrid /> Grid
            </button>
            <button
              className={`${styles.viewTab} ${viewMode === 'list' ? styles.activeTab : ''}`}
              onClick={() => setViewMode('list')}
            >
              <Icons.List /> List
            </button>
          </div>
        </div>

        <div className={`${styles.bentoGrid} ${viewMode === 'list' ? styles.listView : ''}`}>
          {filteredCategories.map((cat, idx) => (
            <div
              key={cat.id}
              className={`${styles.bentoCard} ${idx === 0 && viewMode === 'grid' ? styles.spanTwo : ''}`}
            >
              <div className={styles.bentoCardTop}>
                <div className={styles.bentoIconBox}>
                  {ICON_MAP[cat.icon] || <Icons.Rocket />}
                </div>
                <span className={styles.bentoCountBadge}>{cat.count}</span>
              </div>
              <h3 className={styles.bentoCardTitle}>{cat.title}</h3>
              <p className={styles.bentoCardDesc}>{cat.desc}</p>
              <div className={styles.bentoArticleList}>
                {cat.articles.map(art => (
                  <div
                    key={art.id}
                    className={styles.bentoArticleItem}
                    onClick={() => setActiveArticle(art)}
                  >
                    <span>{art.title}</span>
                    <Icons.ArrowUpRight />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= STYLIZED CONTRACTOR AGREEMENTS ================= */}
      <section id="contractor-templates" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Stylized Legal Documents</span>
            <h2 className={styles.sectionTitle}>Preview &amp; Print Contractor Agreements</h2>
            <p className={styles.sectionDesc}>
              Ready-to-print, beautifully formatted contractor lien waivers, change order authorizations, and milestone deposit schedules.
            </p>
          </div>
        </div>

        <div className={styles.templateGrid}>
          {DOWNLOADABLE_TEMPLATES.map(tpl => (
            <div key={tpl.id} className={styles.templateCard}>
              <div className={styles.templateHeader}>
                <span className={styles.templateFormatTag}>Print &amp; PDF Ready</span>
                <span className={styles.templateDownloads}>{tpl.downloadsCount} downloads</span>
              </div>
              <h3 className={styles.templateName}>{tpl.name}</h3>
              <p className={styles.templateDesc}>{tpl.description}</p>
              <button
                className={styles.btnOutlineBlock}
                onClick={() => setActiveDocument(tpl)}
              >
                <Icons.Eye />
                <span>Preview &amp; Print Agreement</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs Section */}
      <section id="faqs" className={styles.sectionContainer}>
        <div className={styles.sectionHeaderCenter}>
          <span className={styles.sectionTag}>FAQ</span>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <p className={styles.sectionDesc}>Quick answers to the most common questions our team receives.</p>
        </div>

        <div className={styles.faqList}>
          {FAQS.map((faq, i) => (
            <div key={i} className={`${styles.faqItem} ${activeFaq === i ? styles.faqActive : ''}`}>
              <button
                className={styles.faqTrigger}
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
              >
                <span>{faq.question}</span>
                <Icons.ChevronDown />
              </button>
              {activeFaq === i && (
                <div className={styles.faqAnswer}>
                  <p>{faq.answer}</p>
                  <div className={styles.faqVoteRow}>
                    <span>Was this helpful?</span>
                    <button
                      className={styles.faqVoteBtn}
                      onClick={() => {
                        setFaqFeedback(prev => ({ ...prev, [i]: true }));
                        showToast('Thanks for your feedback!');
                      }}
                    >
                      {faqFeedback[i] ? <Icons.Check /> : <Icons.ThumbsUp />}
                      <span>{faqFeedback[i] ? 'Recorded' : 'Yes'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Multi-Channel Escalation Footer Dock */}
      <section className={styles.escalationSection}>
        <div className={styles.escalationCard}>
          <span className={styles.sectionTag}>Always Here For You</span>
          <h2 className={styles.escalationTitle}>Still have questions? We&apos;re on standby.</h2>
          <p className={styles.escalationSubtitle}>
            Our technical team and contractor specialists are ready to jump in via chat, ticket, or phone.
          </p>

          <div className={styles.channelsGrid}>
            <div className={styles.channelCard}>
              <Icons.MessagesSquare />
              <h3 className={styles.channelName}>Live Specialist Chat</h3>
              <p className={styles.channelDesc}>
                Instant real-time support from our engineering and product team.
              </p>
              <button
                className={styles.btnOutlineBlock}
                onClick={() => showToast('Connecting to on-call specialist...')}
              >
                Start Live Chat
              </button>
            </div>

            <div className={`${styles.channelCard} ${styles.channelFeatured}`}>
              <Icons.LifeBuoy />
              <h3 className={styles.channelName}>Priority Support Ticket</h3>
              <p className={styles.channelDesc}>
                Submit logs, screenshots, and receive in-depth diagnostic assistance.
              </p>
              <button
                className={styles.btnPrimaryBlock}
                onClick={() => setIsTicketDrawerOpen(true)}
              >
                Submit Priority Ticket
              </button>
            </div>

            <div className={styles.channelCard}>
              <Icons.Calendar />
              <h3 className={styles.channelName}>1-on-1 Onboarding Call</h3>
              <p className={styles.channelDesc}>
                Book a dedicated screen-share walkthrough with a contractor specialist.
              </p>
              <button
                className={styles.btnOutlineBlock}
                onClick={() => showToast('Opening calendar...')}
              >
                Schedule Session
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= DRAWERS & MODALS ================= */}

      {/* 1. Slide-Out Smart Ticket Drawer */}
      {isTicketDrawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsTicketDrawerOpen(false)}>
          <div className={styles.ticketDrawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <h3 className={styles.drawerTitle}>Priority Support Ticket</h3>
                <p className={styles.drawerSubtitle}>
                  Direct line to our senior engineering &amp; contractor support team.
                </p>
              </div>
              <button className={styles.iconBtn} onClick={() => setIsTicketDrawerOpen(false)}>
                <Icons.X />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {ticketDeflection && (
                <div className={styles.deflectionBox}>
                  <div className={styles.deflectionHeader}>
                    <Icons.Sparkles />
                    <span>Instant Solution Found!</span>
                  </div>
                  <p>{ticketDeflection}</p>
                  <div className={styles.deflectionActions}>
                    <button
                      className={styles.btnEmeraldSm}
                      onClick={() => {
                        setIsTicketDrawerOpen(false);
                        showToast('Glad this solved your question! 🎉');
                      }}
                    >
                      <Icons.Check />
                      <span>Yes, this resolved my issue</span>
                    </button>
                  </div>
                </div>
              )}

              {!isTicketSubmitted ? (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    setIsTicketSubmitted(true);
                    showToast('Priority Ticket #LGQ-8942 Created');
                  }}
                >
                  <div className={styles.formGroup}>
                    <label>Full Name</label>
                    <input type="text" required defaultValue="Brett (Maplewood Pro)" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Work Email</label>
                    <input type="email" required defaultValue="support@letsgetquoted.com" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Subject (Type to trigger instant answers)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SMS delivery pending carrier status"
                      value={ticketSubject}
                      onChange={e => setTicketSubject(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Description</label>
                    <textarea rows={4} required placeholder="Describe what you're trying to accomplish..." />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Attachments (Optional)</label>
                    <div className={styles.dropzone} onClick={() => showToast('Attached screenshot.png')}>
                      <Icons.UploadCloud />
                      <span>Drag &amp; drop screenshots or click to browse</span>
                    </div>
                  </div>
                  <div className={styles.drawerFooter}>
                    <button
                      type="button"
                      className={styles.btnOutline}
                      onClick={() => setIsTicketDrawerOpen(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={styles.btnPrimary}>
                      <Icons.Send />
                      <span>Submit Priority Ticket</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.ticketSuccess}>
                  <Icons.CheckCircle />
                  <h3>Ticket #LGQ-8942 Created!</h3>
                  <p>Our on-call engineers have been alerted. Guaranteed response within 4 hours.</p>
                  <button
                    className={styles.btnPrimaryBlock}
                    onClick={() => setIsTicketDrawerOpen(false)}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Article Reader Modal with 1-Click Clipboard Helpers */}
      {activeArticle && (
        <div className={styles.modalOverlay} onClick={() => setActiveArticle(null)}>
          <div className={styles.articleModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.categoryBadge}>{activeArticle.category}</span>
              <button className={styles.iconBtn} onClick={() => setActiveArticle(null)}>
                <Icons.X />
              </button>
            </div>
            <div className={styles.modalBody}>
              <h1 className={styles.articleTitle}>{activeArticle.title}</h1>
              <div className={styles.articleMeta}>
                <span>Verified by LGQ Engineering</span>
                <span>{activeArticle.readTime}</span>
              </div>

              {/* 1-Click DNS Copy Box for domain articles */}
              {activeArticle.id === 'art-custom-domain-dns' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div className={styles.copySnippetBox}>
                    <span>A Record (@): <strong>76.76.21.21</strong></span>
                    <button
                      className={styles.copyMiniBtn}
                      onClick={() => copyToClipboard('76.76.21.21', 'A Record IP')}
                    >
                      {copiedRecord === 'A Record IP' ? <Icons.Check /> : <Icons.Copy />}
                      <span>{copiedRecord === 'A Record IP' ? 'Copied' : 'Copy IP'}</span>
                    </button>
                  </div>

                  <div className={styles.copySnippetBox}>
                    <span>CNAME (www): <strong>cname.letsgetquoted.com</strong></span>
                    <button
                      className={styles.copyMiniBtn}
                      onClick={() => copyToClipboard('cname.letsgetquoted.com', 'CNAME')}
                    >
                      {copiedRecord === 'CNAME' ? <Icons.Check /> : <Icons.Copy />}
                      <span>{copiedRecord === 'CNAME' ? 'Copied' : 'Copy CNAME'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div
                className={styles.articleContent}
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. In-App Document Viewer & Print Modal (NO Auto-Save / Download Trigger) */}
      {activeDocument && (
        <div className={styles.modalOverlay} onClick={() => setActiveDocument(null)}>
          <div className={styles.docModal} onClick={e => e.stopPropagation()}>
            <div className={styles.docModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className={styles.categoryBadge}>Contractor Legal Suite</span>
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
                <button className={styles.iconBtn} onClick={() => setActiveDocument(null)}>
                  <Icons.X />
                </button>
              </div>
            </div>

            <div className={styles.docModalBody}>
              <div className={styles.docPaperHeader}>
                <div>
                  <span className={styles.docBadge}>
                    {activeDocument.id === 'tpl-lien-waiver'
                      ? 'FORM LW-101 · CONTRACTOR PROGRESS LIEN WAIVER'
                      : activeDocument.id === 'tpl-change-order'
                      ? 'FORM CO-202 · RESIDENTIAL CONTRACT CHANGE ORDER'
                      : 'FORM MD-303 · MATERIAL DEPOSIT & PAYMENT MILESTONES'}
                  </span>
                  <h1 className={styles.docPaperTitle}>{activeDocument.name}</h1>
                </div>
                <div className={styles.docPaperBrand}>
                  <div className={styles.docPaperBrandName}>Let&apos;s Get <span>Quoted</span></div>
                  <div className={styles.docPaperBrandSub}>Contractor Legal Suite</div>
                </div>
              </div>

              {activeDocument.id === 'tpl-lien-waiver' && (
                <div>
                  <div className={styles.docMetaCard}>
                    <div className={styles.docGrid2}>
                      <div>
                        <span className={styles.docMetaLabel}>Property / Jobsite Address</span>
                        <div className={styles.docMetaVal}>124 Maplewood Ave, Maplewood, NJ 07040</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Contractor / Business Name</span>
                        <div className={styles.docMetaVal}>Maplewood Pro Services LLC</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Owner / Customer Name</span>
                        <div className={styles.docMetaVal}>Jane &amp; David Miller</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Payment Amount Received</span>
                        <div className={`${styles.docMetaVal} ${styles.docMetaHighlight}`}>
                          $12,450.00 (Twelve Thousand Four Hundred Fifty Dollars)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.docClause}>
                    <h3>1. Conditional Waiver &amp; Release Upon Progress Payment</h3>
                    <p>
                      The undersigned Contractor, upon receipt of the sum stated above, hereby waives and releases any and all liens, claims, or rights to lien under the statutes of this State relating to mechanics&apos; and materialmen&apos;s liens, on account of labor, services, equipment, or materials furnished through the date of this instrument to the property described above.
                    </p>
                    <h3>2. Exceptions &amp; Exclusions</h3>
                    <p>
                      This waiver does not cover any retainage or disputed extra work not included in prior approved change orders. This release is conditioned upon clearance of funds into the Contractor&apos;s banking institution.
                    </p>
                  </div>

                  <div className={styles.docSigDeck}>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Authorized Contractor Signature</span>
                      <span className={styles.docSigSub}>Brett M. — Managing Partner</span>
                    </div>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Date Signed</span>
                      <span className={styles.docSigSub}>August 25, 2026</span>
                    </div>
                  </div>
                </div>
              )}

              {activeDocument.id === 'tpl-change-order' && (
                <div>
                  <div className={styles.docMetaCard}>
                    <div className={styles.docGrid2}>
                      <div>
                        <span className={styles.docMetaLabel}>Project Title &amp; Address</span>
                        <div className={styles.docMetaVal}>Master Bathroom &amp; Plumbing Remodel · 45 Highland Rd</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Change Order Number</span>
                        <div className={`${styles.docMetaVal} ${styles.docMetaHighlight}`}>CO-#003</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Prime Contractor</span>
                        <div className={styles.docMetaVal}>Maplewood Pro Services LLC</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Property Owner</span>
                        <div className={styles.docMetaVal}>Robert Sterling</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.docClause}>
                    <h3>1. Description of Unforeseen Scope / Material Additions</h3>
                    <p>
                      Upon demolition of subfloor, cracked 4&quot; cast iron main drain stack was uncovered requiring replacement with Schedule 40 PVC, plus customer-requested upgrade to thermostatic brushed nickel shower valve trim kit.
                    </p>

                    <table className={styles.docTable}>
                      <thead>
                        <tr>
                          <th>Itemized Scope Description</th>
                          <th>Labor Hours</th>
                          <th>Materials Cost</th>
                          <th>Total Adjustment</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Main Stack Cast Iron to PVC replacement</td>
                          <td>4.5 hrs</td>
                          <td>$340.00</td>
                          <td>$880.00</td>
                        </tr>
                        <tr>
                          <td>Thermostatic Valve upgrade &amp; rough-in adjustment</td>
                          <td>2.0 hrs</td>
                          <td>$480.00</td>
                          <td>$720.00</td>
                        </tr>
                      </tbody>
                    </table>

                    <h3>2. Financial &amp; Schedule Impact</h3>
                    <div className={styles.docFinancialBox}>
                      <div className={styles.docFinRow}>
                        <span>Original Contract Amount:</span>
                        <strong>$24,500.00</strong>
                      </div>
                      <div className={styles.docFinRow}>
                        <span>Prior Approved Changes (CO #1 &amp; #2):</span>
                        <strong>+$1,200.00</strong>
                      </div>
                      <div className={`${styles.docFinRow} ${styles.docFinRowHighlight}`}>
                        <span>This Change Order Amount (+):</span>
                        <strong>+$1,600.00</strong>
                      </div>
                      <div className={`${styles.docFinRow} ${styles.docFinRowTotal}`}>
                        <span>REVISED TOTAL CONTRACT PRICE:</span>
                        <strong>$27,300.00</strong>
                      </div>
                    </div>
                    <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                      Schedule Adjustment: <strong>+2 Additional Working Days</strong> required for final plumbing inspection.
                    </p>
                  </div>

                  <div className={styles.docSigDeck}>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Homeowner Acceptance Signature</span>
                      <span className={styles.docSigSub}>I authorize the scope and cost adjustment above</span>
                    </div>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Contractor Authorization Signature</span>
                      <span className={styles.docSigSub}>Maplewood Pro Services LLC</span>
                    </div>
                  </div>
                </div>
              )}

              {activeDocument.id === 'tpl-deposit-terms' && (
                <div>
                  <div className={styles.docMetaCard}>
                    <div className={styles.docGrid2}>
                      <div>
                        <span className={styles.docMetaLabel}>Customer / Jobsite Address</span>
                        <div className={styles.docMetaVal}>78 Elm Street, Millburn, NJ</div>
                      </div>
                      <div>
                        <span className={styles.docMetaLabel}>Total Contract Proposal Value</span>
                        <div className={`${styles.docMetaVal} ${styles.docMetaHighlight}`}>$18,600.00</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.docClause}>
                    <h3>1. Mandatory Upfront Material Deposit (50%)</h3>
                    <p>
                      In accordance with standard trade practices, a <strong>50% upfront material deposit ($9,300.00)</strong> is required upon signing to secure guaranteed calendar scheduling and place non-cancelable factory orders for specialty equipment and fixtures.
                    </p>

                    <div className={styles.docMilestonesDeck}>
                      <div className={styles.docMilestoneCard}>
                        <span className={styles.docMBadge}>Milestone 1 · 50%</span>
                        <h4>Upon Contract Signing</h4>
                        <p>Secures jobsite date &amp; purchases custom materials ($9,300.00).</p>
                      </div>
                      <div className={styles.docMilestoneCard}>
                        <span className={styles.docMBadge}>Milestone 2 · 40%</span>
                        <h4>Rough-In Inspection</h4>
                        <p>Due upon completion of framing, plumbing &amp; electrical rough-in ($7,440.00).</p>
                      </div>
                      <div className={styles.docMilestoneCard}>
                        <span className={styles.docMBadge}>Milestone 3 · 10%</span>
                        <h4>Final Punch List</h4>
                        <p>Due upon final walkthrough and customer sign-off ($1,860.00).</p>
                      </div>
                    </div>

                    <h3>2. Terms &amp; Instant Digital Payment Options</h3>
                    <p>
                      Homeowners may authorize payment via instant 1-click Apple Pay, Google Pay, major Credit Cards (Visa, MasterCard, Amex) through the Let&apos;s Get Quoted client portal, or certified bank draft.
                    </p>
                  </div>

                  <div className={styles.docSigDeck}>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Homeowner Acceptance Signature</span>
                      <span className={styles.docSigSub}>Date: ________________________</span>
                    </div>
                    <div className={styles.docSigBox}>
                      <div className={styles.docSigLine} />
                      <span className={styles.docSigLabel}>Contractor Authorized Representative</span>
                      <span className={styles.docSigSub}>Date: ________________________</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. System Status Modal */}
      {isStatusModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsStatusModalOpen(false)}>
          <div className={styles.statusModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>System Status &amp; Real-time Uptime</h3>
              <button className={styles.iconBtn} onClick={() => setIsStatusModalOpen(false)}>
                <Icons.X />
              </button>
            </div>
            <div className={styles.statusModalBody}>
              <div className={styles.statusRow}>
                <div>
                  <strong>Instant Quoting &amp; PDF Engine</strong>
                  <small>Google Cloud Run (us-east1)</small>
                </div>
                <span className={styles.badgeOperational}>Operational · 42ms</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Two-Way SMS &amp; Dedicated Phone Gateway</strong>
                  <small>Carrier Webhook Listeners</small>
                </div>
                <span className={styles.badgeOperational}>Operational · 100%</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Stripe Payments &amp; Deposits</strong>
                  <small>Webhook API V2</small>
                </div>
                <span className={styles.badgeOperational}>Operational · 100%</span>
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>AI Website CDN &amp; DNS</strong>
                  <small>Fastly Global Anycast</small>
                </div>
                <span className={styles.badgeOperational}>Operational · 18ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className={styles.toast}>
          <Icons.Check />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
