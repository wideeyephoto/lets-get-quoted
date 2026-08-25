'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/brand-logo';
import { KNOWLEDGE_BASE, FAQS, DIAGNOSTIC_SCENARIOS, Article } from './help-center-data';
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
      className={styles.iconXs}
    />
  ),
  MessageSquare: () => (
    <Icon
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      className={styles.scenarioIcon}
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
  Cpu: () => (
    <Icon
      d={
        <>
          <rect width="16" height="16" x="4" y="4" rx="2" />
          <rect width="6" height="6" x="9" y="9" rx="1" />
          <path d="M15 2v2" />
          <path d="M15 20v2" />
          <path d="M2 15h2" />
          <path d="M2 9h2" />
          <path d="M20 15h2" />
          <path d="M20 9h2" />
          <path d="M9 2v2" />
          <path d="M9 20v2" />
        </>
      }
    />
  ),
  ArrowUpRight: () => <Icon d="M7 7h10v10M7 17 17 7" className={styles.arrowIcon} />
};

const ICON_MAP: Record<string, React.ReactNode> = {
  Rocket: <Icons.Rocket />,
  FileSpreadsheet: <Icons.FileSpreadsheet />,
  Globe: <Icons.Globe />,
  Smartphone: <Icons.Smartphone />,
  CreditCard: <Icons.CreditCard />,
  Users: <Icons.Users />
};

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [isTicketDrawerOpen, setIsTicketDrawerOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const [activeScenario, setActiveScenario] = useState('sms-verification');
  const [terminalLogs, setTerminalLogs] = useState<{ text: string; status: 'pass' | 'warn' }[]>([]);
  const [isTerminalDone, setIsTerminalDone] = useState(false);

  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDeflection, setTicketDeflection] = useState<string | null>(null);
  const [isTicketSubmitted, setIsTicketSubmitted] = useState(false);

  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [faqFeedback, setFaqFeedback] = useState<Record<number, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTicketDrawerOpen(false);
        setIsStatusModalOpen(false);
        setActiveArticle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const scenario = DIAGNOSTIC_SCENARIOS[activeScenario];
    if (!scenario) return;

    setTerminalLogs([]);
    setIsTerminalDone(false);

    scenario.steps.forEach((step, idx) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, { text: step.text, status: step.status }]);
        if (idx === scenario.steps.length - 1) {
          setIsTerminalDone(true);
        }
      }, step.delay);
    });
  }, [activeScenario]);

  useEffect(() => {
    const val = ticketSubject.toLowerCase();
    if (val.length < 3) {
      setTicketDeflection(null);
      return;
    }
    if (val.includes('sms') || val.includes('carrier') || val.includes('text') || val.includes('signalwire')) {
      setTicketDeflection(
        '10DLC carrier verification takes 2–24 hrs. Ensure your company legal name matches your IRS EIN letter in Settings.'
      );
    } else if (val.includes('stripe') || val.includes('deposit') || val.includes('payout')) {
      setTicketDeflection(
        'Stripe Connect deposits 50% upfront material funds directly to your verified bank account next business day.'
      );
    } else if (val.includes('domain') || val.includes('dns') || val.includes('godaddy')) {
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

  return (
    <div className={styles.helpRoot}>
      <div className={`${styles.ambientGlow} ${styles.glow1}`} />
      <div className={`${styles.ambientGlow} ${styles.glow2}`} />

      {/* Branded Header */}
      <header className={styles.navbar}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.brandLogo}>
            <BrandLogo size={32} />
            <div className={styles.logoText}>
              <strong className={styles.logoTitle}>Let&apos;s Get Quoted</strong>
              <span className={styles.logoBadge}>Help Center</span>
            </div>
          </Link>

          <nav className={styles.navLinks}>
            <a href="#knowledge-hub" className={styles.navLink}>
              Guides
            </a>
            <a href="#ai-troubleshooter" className={styles.navLink}>
              AI Copilot
            </a>
            <a href="#faqs" className={styles.navLink}>
              FAQs
            </a>
            <Link href="/contact" className={styles.navLink}>
              Contact
            </Link>
          </nav>

          <div className={styles.navActions}>
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
      </header>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroBadge}>
          <Icons.Sparkles />
          <span>Support &amp; Knowledge Command Center</span>
        </div>
        <h1 className={styles.heroTitle}>How can we help your business thrive today?</h1>
        <p className={styles.heroSubtitle}>
          Instant answers, step-by-step contractor playbooks, AI diagnostics, or direct support from product engineers.
        </p>

        {/* Search Bar */}
        <div className={styles.searchCommandBox}>
          <div className={styles.searchInputWrapper}>
            <Icons.Search />
            <input
              type="text"
              placeholder="Search guides, setup tutorials, errors, or ask a question..."
              value={searchQuery}
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

          {/* Quick Topic Filter Pills */}
          <div className={styles.topicPillsRow}>
            <span className={styles.pillsLabel}>Popular:</span>
            {[
              { id: 'all', label: 'All Topics' },
              { id: 'quoting', label: 'Instant Quoting' },
              { id: 'sms', label: 'SMS & SignalWire' },
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
      </section>

      {/* Bento Grid Knowledge Base */}
      <section id="knowledge-hub" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Knowledge Base</span>
            <h2 className={styles.sectionTitle}>Explore by Category</h2>
            <p className={styles.sectionDesc}>
              Deep-dive into workflows built specifically for modern residential contractors.
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

      {/* Interactive AI Diagnostic Copilot */}
      <section id="ai-troubleshooter" className={styles.sectionContainer}>
        <div className={styles.copilotCard}>
          <div className={styles.copilotHeader}>
            <div>
              <div className={styles.copilotBadge}>
                <Icons.Cpu />
                <span>Interactive AI Diagnostic Copilot</span>
              </div>
              <h2 className={styles.copilotTitle}>Smart Troubleshooting &amp; Self-Healing</h2>
              <p className={styles.copilotSubtitle}>
                Select an issue or integration. Our diagnostic engine checks your settings in real time.
              </p>
            </div>
            <div className={styles.copilotStatusChip}>
              <span className={styles.pulseDot} />
              <span>Diagnostic Engine Active</span>
            </div>
          </div>

          <div className={styles.copilotBody}>
            <div className={styles.scenarioList}>
              {Object.entries(DIAGNOSTIC_SCENARIOS).map(([key, sc]) => (
                <button
                  key={key}
                  className={`${styles.scenarioBtn} ${activeScenario === key ? styles.scenarioActive : ''}`}
                  onClick={() => setActiveScenario(key)}
                >
                  <Icons.MessageSquare />
                  <div className={styles.scenarioText}>
                    <strong>{sc.title}</strong>
                    <span>{sc.action.desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className={styles.terminalContainer}>
              <div className={styles.terminalHeader}>
                <div className={styles.terminalDots}>
                  <span className={styles.dotRed} />
                  <span className={styles.dotYellow} />
                  <span className={styles.dotGreen} />
                </div>
                <span className={styles.terminalTitle}>LGQ_AI_DIAGNOSTICS_V4.sh · LIVE</span>
              </div>
              <div className={styles.terminalBody}>
                {terminalLogs.map((log, i) => (
                  <div key={i} className={styles.logRow}>
                    <span className={styles.logPrompt}>&gt;</span>
                    <span className={log.status === 'pass' ? styles.logPass : styles.logWarn}>
                      [{log.status.toUpperCase()}]
                    </span>
                    <span>{log.text}</span>
                  </div>
                ))}
                {isTerminalDone && (
                  <div className={styles.terminalActionBox}>
                    <h4>{DIAGNOSTIC_SCENARIOS[activeScenario]?.action.title}</h4>
                    <p>{DIAGNOSTIC_SCENARIOS[activeScenario]?.action.desc}</p>
                    <button
                      className={styles.btnPrimarySm}
                      onClick={() =>
                        showToast(`Triggered: ${DIAGNOSTIC_SCENARIOS[activeScenario]?.action.btnText}`)
                      }
                    >
                      <Icons.Sparkles />
                      <span>{DIAGNOSTIC_SCENARIOS[activeScenario]?.action.btnText}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
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

      {/* 2. Article Reader Modal */}
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
                <span>
                  <Icons.Clock /> {activeArticle.readTime}
                </span>
                <span>Verified by LGQ Engineering</span>
              </div>
              <div
                className={styles.articleContent}
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. System Status Modal */}
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
                  <strong>SignalWire 10DLC SMS Gateway</strong>
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
