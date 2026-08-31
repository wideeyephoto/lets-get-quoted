'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIGNUP_URL } from '@/components/flagship/site-chrome';
import styles from './marketing-ai-assistant.module.css';

type FaqItem = {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
  trade?: string;
  ctaText?: string;
  ctaHref?: string;
};

type SearchResult = {
  id?: string;
  query: string;
  title: string;
  answer: string;
  ctaText?: string;
  ctaHref?: string;
};

type QuoteScenario = {
  id: string;
  name: string;
  trade: string;
  customerMsg: string;
  title: string;
  laborLine: string;
  materialLine: string;
  total: string;
  deposit: string;
};

const TRADES = [
  { id: 'all', label: '✨ All Trades' },
  { id: 'plumbing', label: '🔧 Plumbing' },
  { id: 'hvac', label: '❄️ HVAC' },
  { id: 'carpentry', label: '🔨 Carpentry' },
  { id: 'landscaping', label: '🌳 Landscaping' },
  { id: 'solo', label: '⚡ Solo Handyman' },
] as const;

const QUICK_PROMPTS = [
  'How do instant quotes work?',
  'Does it sync with QuickBooks & Stripe?',
  'Can clients pay deposits online?',
  'How do I switch from Jobber or Housecall Pro?',
  'How soon do customer payments reach my bank?',
  'Can my crew log hours in the field?',
];

const QUOTE_SCENARIOS: QuoteScenario[] = [
  {
    id: 'pipe-emergency',
    name: '🔧 Burst Pipe',
    trade: 'Plumbing',
    customerMsg: 'Pipe burst under kitchen sink, water spreading across floor. Need emergency shutoff & repair!',
    title: 'Emergency Pipe Repair & Shutoff',
    laborLine: 'Emergency Labor & Pressure Testing: $240.00',
    materialLine: 'PEX/Copper Fittings & Shutoff Valve: $65.00',
    total: '$305.00',
    deposit: '$150.00',
  },
  {
    id: 'hvac-ac',
    name: '❄️ AC Repair',
    trade: 'HVAC',
    customerMsg: 'AC stopped cooling. Fan is spinning outside but vents blowing warm room temp air.',
    title: 'AC Diagnostic & Capacitor Replacement',
    laborLine: 'System Diagnostic & Inspection: $149.00',
    materialLine: 'Dual Run Capacitor & Coil Clean: $135.00',
    total: '$284.00',
    deposit: '$100.00',
  },
  {
    id: 'deck-build',
    name: '🔨 Cedar Deck',
    trade: 'Carpentry',
    customerMsg: 'Looking to replace 250 sq ft backyard deck with cedar decking and aluminum railing.',
    title: '250 sq ft Premium Cedar Deck',
    laborLine: 'Framing & Installation Labor: $3,200.00',
    materialLine: 'Cedar Decking & Railings: $4,450.00',
    total: '$7,650.00',
    deposit: '$500.00',
  },
  {
    id: 'tree-haul',
    name: '🌳 Tree Limb',
    trade: 'Landscaping',
    customerMsg: 'Large oak limb snapped in storm, blocking driveway. Need cut and hauled away today.',
    title: 'Emergency Tree Limb Removal & Haul',
    laborLine: 'Chainsaw Crew Labor & Chipper: $275.00',
    materialLine: 'Disposal & Yard Rake / Sweep: $75.00',
    total: '$350.00',
    deposit: '$150.00',
  },
];

const FOLLOW_UP_MAP: Record<string, string[]> = {
  quotes: [
    'How does the $0/month Flex plan work?',
    'Can clients pay deposits and milestone payments?',
    'What are Quick Stops and how do they work?',
  ],
  'flex-plan': [
    'How soon do customer payments reach my bank?',
    'How do I switch from Jobber or Housecall Pro?',
    'Does it sync with QuickBooks & Stripe?',
  ],
  switching: [
    'Can I cancel anytime or export my data?',
    'Does it sync with QuickBooks & Stripe?',
    'How does the $0/month Flex plan work?',
  ],
  deposits: [
    'How soon do customer payments reach my bank?',
    'Does it sync with QuickBooks & Stripe?',
    'How do Instant Quotes & Estimates work?',
  ],
  'quick-stops': [
    'How do Instant Quotes & Estimates work?',
    'Can my crew log hours and view jobs in the field?',
    'How does the $0/month Flex plan work?',
  ],
  integrations: [
    'How soon do customer payments reach my bank?',
    'Can clients pay deposits and milestone payments?',
    'How does the $0/month Flex plan work?',
  ],
  website: [
    'How do Instant Quotes & Estimates work?',
    'How do I switch from Jobber or Housecall Pro?',
    'How does the $0/month Flex plan work?',
  ],
  payouts: [
    'How does the $0/month Flex plan work?',
    'Does it sync with QuickBooks & Stripe?',
    'Can I cancel anytime or export my data?',
  ],
  crew: [
    'What are Quick Stops and how do they work?',
    'Does it sync with QuickBooks & Stripe?',
    'How does the $0/month Flex plan work?',
  ],
  cancellation: [
    'How does the $0/month Flex plan work?',
    'How do I switch from Jobber or Housecall Pro?',
    'How do Instant Quotes & Estimates work?',
  ],
  messaging: [
    'What are Quick Stops and how do they work?',
    'How do Instant Quotes & Estimates work?',
    'How does the $0/month Flex plan work?',
  ],
  support: [
    'How do I switch from Jobber or Housecall Pro?',
    'How does the $0/month Flex plan work?',
    'How do Instant Quotes & Estimates work?',
  ],
};

const KNOWLEDGE_BASE: FaqItem[] = [
  {
    id: 'copilot',
    title: 'How does your AI Copilot & customizable trade companions work?',
    keywords: [
      'copilot',
      'ai copilot',
      'sparky',
      'diesel',
      'echo',
      'sidekick',
      'assistant',
      'ai assistant',
      'brain dump',
      'text copilot',
      'call copilot',
      'photo sorting',
      'reminders',
      'no app',
    ],
    answer:
      'Your AI Copilot is your 24/7 contractor sidekick—with customizable avatars (including Energy Orbit, Diesel, and Echo). You don’t even need to open an app: text or call your Copilot to draft quotes, file site photos, reschedule jobs, check unpaid invoices, and set reminders.',
    ctaText: 'Explore AI Copilot & Demos',
    ctaHref: '/features/sparky',
  },
  {
    id: 'what-is-lgq',
    title: 'What is Let’s Get Quoted?',
    keywords: [
      'what is',
      'about',
      'overview',
      'let\'s get quoted',
      'lgq',
      'platform',
      'system',
      'how it works',
      'software',
      'features',
    ],
    answer:
      'Let’s Get Quoted is one connected system for winning the job, running it, and getting paid—starting with a free contractor website. It connects your website, AI intake, quotes, scheduling, crew management, customer texts, and Stripe payments in one place.',
    ctaText: 'See The Full Workflow',
    ctaHref: '/how-it-works',
  },
  {
    id: 'quotes',
    title: 'How do Instant Quotes & Estimates work?',
    keywords: [
      'quote',
      'quotes',
      'quoting',
      'estimate',
      'estimates',
      'estimator',
      'estimating',
      'proposal',
      'bidding',
      'bid',
      'instant quote',
      'instant estimate',
      'price estimate',
      'intake',
      'lead qualification',
      'pricing job',
      'jobs',
    ],
    answer:
      'Homeowners on your site get an instant, conversational estimate 24/7 based on your trade rules and price ranges. When you approve or send an official quote, clients can sign online, pay required deposits via Apple Pay or card, and get scheduled immediately.',
    ctaText: 'Test AI Lead & Quote Sandbox',
    ctaHref: '/features/ai-intake',
  },
  {
    id: 'flex-plan',
    title: 'How does the $0/month Flex plan work?',
    keywords: [
      'pricing',
      'price',
      'cost',
      'fee',
      'fees',
      'flex',
      'solo',
      'growth',
      'scale',
      'plan',
      'plans',
      'rate',
      'rates',
      'commission',
      'percentage',
      'free',
      'cheap',
      'monthly',
      'subscription',
      'how much',
      'base price',
    ],
    answer:
      'Flex has $0 monthly fees and $0 setup cost. You get a custom contractor website, AI quote qualification, scheduling, customer portal, and Stripe payments. You only pay a 1.25% platform fee when a client pays you. Upgrading to Solo ($39/mo), Growth ($129/mo), or Scale ($329/mo) drops your fee to 0.50%, 0.25%, or 0.10%.',
    ctaText: 'See Full Pricing Breakdown',
    ctaHref: '/pricing',
  },
  {
    id: 'switching',
    title: 'How do I switch from Jobber or Housecall Pro?',
    keywords: [
      'switch',
      'switching',
      'migrate',
      'migration',
      'import',
      'importing',
      'csv',
      'jobber',
      'housecall',
      'housecall pro',
      'servicetitan',
      'workiz',
      'markate',
      'gorilladesk',
      'competitor',
      'old tool',
      'existing tool',
    ],
    answer:
      'Switching takes under 10 minutes. You can export your clients and price list to CSV and import them directly into Let’s Get Quoted. There are no contracts, and you can start free on Flex ($0/mo) while running it alongside your old tool.',
    ctaText: 'Compare Jobber vs LGQ',
    ctaHref: '/compare/jobber-alternative',
  },
  {
    id: 'deposits',
    title: 'Can clients pay deposits and milestone payments?',
    keywords: [
      'deposit',
      'deposits',
      'milestone',
      'down payment',
      'retainer',
      'installment',
      'installments',
      'progress payment',
      'split',
      'financing',
      'credit card saved',
      'card on file',
    ],
    answer:
      'Yes! You can require upfront deposits before putting jobs on your schedule, collect stage/progress payments for multi-day projects, and securely save customer cards on file for final completion billing.',
    ctaText: 'View Back Office & Payment Tools',
    ctaHref: '/features/back-office',
  },
  {
    id: 'quick-stops',
    title: 'What are Quick Stops and how do they work?',
    keywords: [
      'quick stop',
      'quick stops',
      'quickstop',
      'route',
      'proximity',
      'radius',
      'dispatch',
      'emergency',
      'on the way',
      'small job',
      'neighbor',
      'fill gap',
      'lead',
    ],
    answer:
      'Quick Stops match incoming emergency and small repair leads to your crew’s live route proximity. If you are finishing a job in a neighborhood, nearby requests are dispatched directly to your phone so you book an extra $300–$600 on the way home.',
    ctaText: 'Test AI Lead Sandbox',
    ctaHref: '/features/ai-intake',
  },
  {
    id: 'integrations',
    title: 'Does it sync with QuickBooks & Stripe?',
    keywords: [
      'quickbooks',
      'qbo',
      'stripe',
      'sync',
      'accounting',
      'payout',
      'bank',
      'ach',
      'apple pay',
      'google pay',
      'credit card',
      'invoice',
      'invoices',
      'bookkeeping',
    ],
    answer:
      'Yes! We feature official 2-way synchronization with QuickBooks Online for invoices and customer records, plus Stripe Connect for instant bank payouts, Apple Pay, Google Pay, and ACH transfers.',
    ctaText: 'View Back Office Features',
    ctaHref: '/features/back-office',
  },
  {
    id: 'website',
    title: 'Do I get a website on my own custom domain?',
    keywords: [
      'website',
      'domain',
      'domains',
      'custom domain',
      'url',
      'template',
      'templates',
      'theme',
      'design',
      'builder',
      'seo',
      'google review',
      'ssl',
      'dns',
    ],
    answer:
      'Yes! You can choose from 20 trade-tested website templates, customize colors and photos, and publish to your own domain (e.g. yourcompany.com) with SSL and Google 5-star review integration included.',
    ctaText: 'Explore Website Templates',
    ctaHref: '/features/website-builder',
  },
  {
    id: 'payouts',
    title: 'How soon do customer payments reach my bank?',
    keywords: [
      'payout',
      'payouts',
      'when do i get paid',
      'bank account',
      'direct deposit',
      'transfer',
      'money arrive',
      'clear',
      'ach payout',
      'stripe balance',
      'speed',
    ],
    answer:
      'Payouts are transferred directly into your own bank account by Stripe on a rolling 2-day schedule for cards. You can view all scheduled and incoming payouts inside your connected Stripe dashboard.',
    ctaText: 'See Payment Terms',
    ctaHref: '/pricing',
  },
  {
    id: 'crew',
    title: 'Can my crew log hours and view jobs in the field?',
    keywords: [
      'crew',
      'crews',
      'employee',
      'employees',
      'technician',
      'technicians',
      'field',
      'mobile',
      'hours',
      'labor',
      'timesheet',
      'photos',
      'crew login',
      'app',
    ],
    answer:
      'Yes! Crew members get dedicated field logins to view daily job details, customer addresses, upload site photos, and clock labor hours that roll up automatically under Crew & Labor.',
    ctaText: 'View Crew Management',
    ctaHref: '/features/back-office',
  },
  {
    id: 'cancellation',
    title: 'Can I cancel anytime or export my data?',
    keywords: [
      'cancel',
      'cancelling',
      'cancellation',
      'contract',
      'contracts',
      'lock in',
      'export',
      'download data',
      'csv',
      'refund',
      'refunds',
      'delete account',
    ],
    answer:
      'There are zero long-term contracts. You can cancel or downgrade to Flex at any time with one click. You can also export your clients, quotes, invoices, and jobs to CSV or QuickBooks format at any time for free.',
    ctaText: 'Read Full FAQs',
    ctaHref: '/faq',
  },
  {
    id: 'messaging',
    title: 'How does SMS texting and the AI Receptionist work?',
    keywords: [
      'text',
      'texts',
      'texting',
      'sms',
      'message',
      'messages',
      'messaging',
      'phone',
      'receptionist',
      'call',
      'calls',
      'carrier',
      '10dlc',
      'opt out',
    ],
    answer:
      'LGQ features an integrated 2-way messaging inbox, automated quote links, and a 24/7 AI Receptionist that qualifies phone leads and books estimates when you’re on a job.',
    ctaText: 'Explore AI Receptionist & SMS',
    ctaHref: '/features/ai-intake',
  },
  {
    id: 'support',
    title: 'How do I contact customer support?',
    keywords: [
      'support',
      'help',
      'contact',
      'email',
      'talk to human',
      'phone support',
      'customer service',
      'assistance',
      'reach out',
    ],
    answer:
      'Our team is available through the contact form. Real human support specialists answer all questions regarding setup, migrations, and billing.',
    ctaText: 'Contact Our Support Team',
    ctaHref: '/contact',
  },
];

const STARTER_FAQ_IDS = ['quotes', 'flex-plan', 'switching', 'quick-stops', 'integrations'];

function searchKnowledgeBase(query: string): SearchResult {
  const clean = query.trim().toLowerCase();
  const tokens = clean.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let bestScore = 0;
  let bestItem: FaqItem | null = null;

  for (const item of KNOWLEDGE_BASE) {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const answerLower = item.answer.toLowerCase();

    if (titleLower.includes(clean)) score += 60;
    if (answerLower.includes(clean)) score += 25;

    for (const token of tokens) {
      if (token.length < 2) continue;

      if (item.keywords.some((k) => k === token)) {
        score += 40;
      } else if (item.keywords.some((k) => k.includes(token) || token.includes(k))) {
        score += 20;
      }

      if (titleLower.includes(token)) score += 15;
      if (answerLower.includes(token)) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (bestItem && bestScore >= 5) {
    return {
      id: bestItem.id,
      query: query.trim(),
      title: bestItem.title,
      answer: bestItem.answer,
      ctaText: bestItem.ctaText,
      ctaHref: bestItem.ctaHref,
    };
  }

  return {
    id: 'what-is-lgq',
    query: query.trim(),
    title: 'Let’s Get Quoted Contractor Software',
    answer:
      'Let’s Get Quoted is one connected system for winning the job, running it, and getting paid—starting with a free contractor website. It connects your website, AI intake, quotes, scheduling, crew management, customer texts, and Stripe payments in one place.',
    ctaText: 'See The Full Workflow',
    ctaHref: '/how-it-works',
  };
}

export default function MarketingAiAssistant() {
  const pathname = usePathname();
  const isTargetPage = pathname?.startsWith('/pricing') || pathname?.startsWith('/faq');
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(isTargetPage);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState<number>(20000);
  const [activeToolTab, setActiveToolTab] = useState<'matcher' | 'savings' | 'simulator'>('matcher');
  const [competitorMonthly, setCompetitorMonthly] = useState<number>(199);
  const [selectedTrade, setSelectedTrade] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isTargetPage) {
      setScrolled(true);
      return;
    }
    const checkScroll = () => {
      if (window.scrollY > 350) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    checkScroll();
    window.addEventListener('scroll', checkScroll, { passive: true });
    return () => window.removeEventListener('scroll', checkScroll);
  }, [isTargetPage]);

  // Quote Simulator state
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('pipe-emergency');
  const [isDepositPaid, setIsDepositPaid] = useState<boolean>(false);

  // Callback form state
  const [showCallback, setShowCallback] = useState(false);
  const [callbackPhone, setCallbackPhone] = useState('');
  const [callbackSent, setCallbackSent] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const faqRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchResultRef = useRef<HTMLDivElement>(null);
  // Close on Escape key and body scroll lock when open on mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Listen for global open-marketing-assistant events from inline "Questions about this?" buttons
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ query?: string; faqId?: string }>;
      setIsOpen(true);
      if (customEvent.detail?.query) {
        handleTriggerSearch(customEvent.detail.query);
      } else if (customEvent.detail?.faqId) {
        setExpandedFaqId(customEvent.detail.faqId);
      }
    };
    window.addEventListener('open-marketing-assistant', handleOpenEvent);
    return () => window.removeEventListener('open-marketing-assistant', handleOpenEvent);
  }, []);

  // Contextual page guidance
  const pageGreeting = useMemo(() => {
    if (pathname?.startsWith('/pricing')) {
      return '⚡ Hi! I\'m your AI Copilot. Looking for the right plan? Calculate your card volume fees below or compare your annual savings on Flex ($0/mo).';
    }
    if (pathname?.startsWith('/compare')) {
      return '⚡ Hi! I\'m your AI Copilot. Switching from Jobber or Housecall Pro takes under 10 minutes via CSV with zero contracts and $0 upfront setup.';
    }
    if (pathname?.startsWith('/features/website-builder')) {
      return '⚡ Hi! I\'m your AI Copilot. Choose from 20 trade-tested website templates with custom domain connection, Google Reviews, and SSL included.';
    }
    if (pathname?.startsWith('/features/ai-intake') || pathname?.startsWith('/features/quick-stops')) {
      return '⚡ Hi! I\'m your AI Copilot. Quick Stops match small emergency leads directly to your crew’s live route so you book extra revenue on the way home.';
    }
    return '⚡ Hi! I\'m your AI Copilot. Ask me anything about plans, instant quotes, QuickBooks sync, or switching. Tap a quick question or use the tools below:';
  }, [pathname]);

  // Plan recommendation logic derived directly from product truth catalog
  const planRecommendation = useMemo(() => {
    if (monthlyVolume < 6000) {
      return {
        name: 'Flex',
        price: '$0/mo + 1.25%',
        reason: 'Zero fixed overhead keeps 100% of your margin on low or seasonal volume.',
      };
    }
    if (monthlyVolume <= 30000) {
      return {
        name: 'Solo',
        price: '$39/mo + 0.50%',
        reason: 'The lower 0.50% fee and 500 monthly texts save money over Flex for active owner-operators.',
      };
    }
    if (monthlyVolume <= 80000) {
      return {
        name: 'Growth',
        price: '$129/mo + 0.25%',
        reason: '0.25% platform fee plus team dispatch for 5 office and 10 crew seats.',
      };
    }
    return {
      name: 'Scale',
      price: '$329/mo + 0.10%',
      reason: 'Ultra-low 0.10% fee maximizes profit for multi-truck crews and high volume.',
    };
  }, [monthlyVolume]);

  // Annual competitor savings logic
  const annualSavings = useMemo(() => {
    const annualOldSoftware = (competitorMonthly + 35) * 12; // software + standard website hosting
    return annualOldSoftware;
  }, [competitorMonthly]);

  // Current selected quote scenario
  const currentScenario = useMemo(() => {
    return QUOTE_SCENARIOS.find((s) => s.id === selectedScenarioId) || QUOTE_SCENARIOS[0];
  }, [selectedScenarioId]);

  const handleToggleFaq = (faqId: string) => {
    const nextId = expandedFaqId === faqId ? null : faqId;
    setExpandedFaqId(nextId);

    if (nextId) {
      setTimeout(() => {
        const el = faqRefs.current[nextId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  };

  const handleTriggerSearch = (searchQuery: string) => {
    const clean = searchQuery.trim();
    if (!clean) return;

    setIsSearching(true);

    setTimeout(() => {
      const result = searchKnowledgeBase(clean);
      setSearchResult(result);
      setIsSearching(false);

      const matchedStarter = KNOWLEDGE_BASE.find(
        (k) => STARTER_FAQ_IDS.includes(k.id) && k.title === result.title
      );
      if (matchedStarter) {
        setExpandedFaqId(matchedStarter.id);
      }

      setTimeout(() => {
        if (searchResultRef.current) {
          searchResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }, 180);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTriggerSearch(query);
    setQuery('');
  };

  const handleCallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackPhone.trim()) return;
    setCallbackSent(true);
  };

  const starterFaqs = useMemo(
    () => KNOWLEDGE_BASE.filter((k) => STARTER_FAQ_IDS.includes(k.id)),
    []
  );

  if (!scrolled && !isOpen) {
    return null;
  }

  return (
    <>
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={`${styles.floatingWrapper} ${isOpen ? styles.wrapperOpen : ''}`}>
        {/* Floating Trigger Capsule — desktop only */}
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={styles.floatingTrigger}
            aria-label="Open AI Copilot Assistant"
            aria-expanded={isOpen}
            aria-controls="marketing-ai-assistant-drawer"
          >
            <span className={styles.sparkleIcon}>✦</span>
            <div className={styles.triggerText}>
              <span className={styles.triggerTitle}>AI Copilot</span>
            </div>
          </button>
        )}

        {/* Slide-Up Chat Drawer */}
        {isOpen && (
          <div
            id="marketing-ai-assistant-drawer"
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-label="AI Copilot - Let’s Get Quoted"
          >
          {/* Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.avatar}>✦</div>
              <div className={styles.botInfo}>
                <span className={styles.botName}>AI Copilot · Let’s Get Quoted</span>
                <span className={styles.botStatus}>
                  <span className={styles.statusDot} /> Online · Instant Answers
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={styles.closeBtn}
              aria-label="Close Assistant"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className={styles.chatBody}>
            {/* Contextual Greeting Banner */}
            <div className={styles.messageBubble}>
              {pageGreeting}
            </div>

            {/* Trade Filter Bar */}
            <div className={styles.tradeBar} role="tablist" aria-label="Trade Persona Selector">
              {TRADES.map((trade) => (
                <button
                  key={trade.id}
                  type="button"
                  onClick={() => setSelectedTrade(trade.id)}
                  className={`${styles.tradePill} ${selectedTrade === trade.id ? styles.tradePillActive : ''}`}
                >
                  {trade.label}
                </button>
              ))}
            </div>

            {/* Tool Switcher Tabs */}
            <div className={styles.toolTabRow}>
              <button
                type="button"
                onClick={() => setActiveToolTab('matcher')}
                className={`${styles.toolTab} ${activeToolTab === 'matcher' ? styles.toolTabActive : ''}`}
              >
                🧮 Plan Matcher
              </button>
              <button
                type="button"
                onClick={() => setActiveToolTab('savings')}
                className={`${styles.toolTab} ${activeToolTab === 'savings' ? styles.toolTabActive : ''}`}
              >
                💸 Switch &amp; Save
              </button>
              <button
                type="button"
                onClick={() => setActiveToolTab('simulator')}
                className={`${styles.toolTab} ${activeToolTab === 'simulator' ? styles.toolTabActive : ''}`}
              >
                ⚡ Test a Quote
              </button>
            </div>

            {/* Tool 1: Plan Matcher */}
            {activeToolTab === 'matcher' && (
              <div className={styles.planBox}>
                <div className={styles.planBoxHeader}>
                  <span className={styles.planBoxLabel}>🧮 Volume Matcher</span>
                  <span className={styles.planBadgeMini}>
                    <strong>{planRecommendation.name}</strong> (${(monthlyVolume / 1000).toFixed(0)}k/mo)
                  </span>
                </div>
                <div className={styles.planInputRow}>
                  <span className={styles.planVolLabel}>Volume:</span>
                  <input
                    type="range"
                    min={2000}
                    max={90000}
                    step={2000}
                    value={monthlyVolume}
                    onChange={(e) => setMonthlyVolume(Number(e.target.value))}
                    className={styles.planSlider}
                    aria-label="Estimated monthly card volume"
                  />
                  <span className={styles.planVolDisplay}>${(monthlyVolume / 1000).toFixed(0)}k/mo</span>
                </div>
                <div className={styles.planRecBadge}>
                  Recommended: <strong>{planRecommendation.name} Plan</strong> ({planRecommendation.price})
                  <div className={styles.planRecReason}>{planRecommendation.reason}</div>
                </div>
              </div>
            )}

            {/* Tool 2: Switch & Save Calculator */}
            {activeToolTab === 'savings' && (
              <div className={styles.savingsBox}>
                <div className={styles.savingsHeader}>
                  <span className={styles.savingsLabel}>💸 Competitor ROI Calculator</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#a7bcc8' }}>What do you pay Jobber / Housecall Pro today?</div>
                <div className={styles.savingsPresetRow}>
                  {[149, 199, 299].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCompetitorMonthly(amt)}
                      className={`${styles.savingsPresetBtn} ${competitorMonthly === amt ? styles.savingsPresetBtnActive : ''}`}
                    >
                      ${amt}/mo
                    </button>
                  ))}
                </div>
                <div className={styles.savingsResultBadge}>
                  Switch to Flex ($0/mo): Save <strong>${annualSavings.toLocaleString()}/yr</strong> in fixed software &amp; website costs.
                </div>
              </div>
            )}

            {/* Tool 3: Live Interactive Quote Simulator */}
            {activeToolTab === 'simulator' && (
              <div className={styles.quoteSimBox}>
                <div className={styles.quoteSimHeader}>
                  <span className={styles.quoteSimLabel}>⚡ Instant Quote Simulator</span>
                </div>
                {/* Scenario buttons */}
                <div className={styles.quoteSimScenarioRow}>
                  {QUOTE_SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedScenarioId(s.id);
                        setIsDepositPaid(false);
                      }}
                      className={`${styles.quoteSimScenarioBtn} ${selectedScenarioId === s.id ? styles.quoteSimScenarioBtnActive : ''}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {/* Simulated Customer Quote Card */}
                <div className={styles.quoteSimCard}>
                  <div className={styles.quoteSimCustomerMsg}>
                    &ldquo;{currentScenario.customerMsg}&rdquo;
                  </div>
                  <div className={styles.quoteSimTitle}>{currentScenario.title}</div>
                  <div className={styles.quoteSimLineRow}>
                    <span>Labor &amp; Service:</span>
                    <span>{currentScenario.laborLine.split(': ')[1]}</span>
                  </div>
                  <div className={styles.quoteSimLineRow}>
                    <span>Parts &amp; Materials:</span>
                    <span>{currentScenario.materialLine.split(': ')[1]}</span>
                  </div>
                  <div className={styles.quoteSimTotalRow}>
                    <span>Estimated Total:</span>
                    <span>{currentScenario.total}</span>
                  </div>
                  <div className={styles.quoteSimDepositRow}>
                    <span>Required Deposit:</span>
                    <span>{currentScenario.deposit}</span>
                  </div>

                  {!isDepositPaid ? (
                    <button
                      type="button"
                      onClick={() => setIsDepositPaid(true)}
                      className={styles.quoteSimPayBtn}
                    >
                      Simulate Apple Pay Deposit ({currentScenario.deposit}) &rarr;
                    </button>
                  ) : (
                    <div className={styles.quoteSimSuccess}>
                      <span>✓ {currentScenario.deposit} Deposit Collected! Auto-scheduled.</span>
                      <button
                        type="button"
                        onClick={() => setIsDepositPaid(false)}
                        className={styles.quoteSimResetLink}
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Typing Animation State */}
            {isSearching && (
              <div className={styles.typingIndicator}>
                <span>✦ Consulting AI Knowledge Base</span>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
            )}

            {/* Search Answer Display */}
            {searchResult && !isSearching && (
              <div ref={searchResultRef} className={styles.customResultCard}>
                <div className={styles.customResultHeader}>
                  <span className={styles.customResultBadge}>
                    ✦ Answer for &ldquo;{searchResult.query}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchResult(null)}
                    className={styles.customResultDismiss}
                    aria-label="Dismiss answer"
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.customResultTitle}>{searchResult.title}</div>
                <p className={styles.customResultText}>{searchResult.answer}</p>
                {searchResult.ctaText && searchResult.ctaHref && (
                  <div>
                    <Link href={searchResult.ctaHref} className={styles.accordionCta}>
                      {searchResult.ctaText} &rarr;
                    </Link>
                  </div>
                )}

                {/* Follow-up suggestions for custom search result */}
                {searchResult.id && FOLLOW_UP_MAP[searchResult.id] && (
                  <div className={styles.followUpSection}>
                    <span className={styles.followUpLabel}>Related Topics:</span>
                    <div className={styles.followUpChipsRow}>
                      {FOLLOW_UP_MAP[searchResult.id].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleTriggerSearch(chip)}
                          className={styles.followUpChip}
                        >
                          {chip} &rarr;
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* In-Place Accordion Questions */}
            <div className={styles.quickPillsSection}>
              <span className={styles.quickPillsLabel}>
                {selectedTrade !== 'all' ? `${TRADES.find((t) => t.id === selectedTrade)?.label} Questions` : 'Common Contractor Questions'}
              </span>
              <div className={styles.accordionList}>
                {starterFaqs.map((faq) => {
                  const isExpanded = expandedFaqId === faq.id;
                  const followUps = FOLLOW_UP_MAP[faq.id];
                  return (
                    <div
                      key={faq.id}
                      ref={(el) => {
                        faqRefs.current[faq.id] = el;
                      }}
                      className={`${styles.accordionCard} ${isExpanded ? styles.accordionCardOpen : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleFaq(faq.id)}
                        className={styles.accordionHeader}
                        aria-expanded={isExpanded}
                        aria-controls={`faq-answer-${faq.id}`}
                      >
                        <span>{faq.title}</span>
                        <span className={`${styles.accordionArrow} ${isExpanded ? styles.accordionArrowOpen : ''}`}>
                          &rarr;
                        </span>
                      </button>

                      {isExpanded && (
                        <div id={`faq-answer-${faq.id}`} className={styles.accordionBody}>
                          <p className={styles.accordionAnswerText}>{faq.answer}</p>
                          {faq.ctaText && faq.ctaHref && (
                            <div>
                              <Link href={faq.ctaHref} className={styles.accordionCta}>
                                {faq.ctaText} &rarr;
                              </Link>
                            </div>
                          )}

                          {/* Contextual Follow-Up Suggestions inside Accordion */}
                          {followUps && followUps.length > 0 && (
                            <div className={styles.followUpSection}>
                              <span className={styles.followUpLabel}>Related Topics:</span>
                              <div className={styles.followUpChipsRow}>
                                {followUps.map((chip) => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => handleTriggerSearch(chip)}
                                    className={styles.followUpChip}
                                  >
                                    {chip} &rarr;
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Direct Human Callback Section */}
            <div className={styles.callbackSection}>
              {!showCallback && !callbackSent && (
                <button
                  type="button"
                  onClick={() => setShowCallback(true)}
                  className={styles.callbackToggleBtn}
                >
                  💬 Have a specific question? Get answers via SMS &rarr;
                </button>
              )}

              {showCallback && !callbackSent && (
                <form onSubmit={handleCallbackSubmit} className={styles.callbackCard}>
                  <div className={styles.callbackCardTitle}>📱 Drop your number for a quick text answer:</div>
                  <div className={styles.callbackInputRow}>
                    <input
                      type="tel"
                      value={callbackPhone}
                      onChange={(e) => setCallbackPhone(e.target.value)}
                      placeholder="(555) 000-0000"
                      className={styles.callbackPhoneInput}
                      required
                      aria-label="Your mobile phone number"
                    />
                    <button type="submit" className={styles.callbackSubmitBtn}>
                      Text Me
                    </button>
                  </div>
                </form>
              )}

              {callbackSent && (
                <div className={styles.callbackCard}>
                  <div className={styles.callbackSuccess}>
                    ✓ Thanks! A product specialist will text you at {callbackPhone} shortly.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Input + Quick Prompts + Conversion Link */}
          <div className={styles.drawerFooter}>
            {/* Quick Prompt Chips */}
            <div className={styles.quickPromptsRow} role="list" aria-label="Suggested questions">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleTriggerSearch(prompt)}
                  className={styles.quickPromptChip}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSearchSubmit} className={styles.inputForm}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about pricing, quotes, QuickBooks, Stripe..."
                className={styles.textInput}
                aria-label="Ask a question about Let's Get Quoted"
              />
              <button type="submit" className={styles.sendBtn}>
                Ask
              </button>
            </form>
            <a href={SIGNUP_URL} className={styles.drawerCtaBtn}>
              Start Free on Flex ($0/mo) &rarr;
            </a>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

