'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SIGNUP_URL } from '@/components/flagship/site-chrome';
import styles from './marketing-ai-assistant.module.css';

type FaqItem = {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
  ctaText?: string;
  ctaHref?: string;
};

type SearchResult = {
  query: string;
  title: string;
  answer: string;
  ctaText?: string;
  ctaHref?: string;
};

const KNOWLEDGE_BASE: FaqItem[] = [
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
      'pro',
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
      'Flex has $0 monthly fees and $0 setup cost. You get a custom contractor website, AI quote qualification, scheduling, customer portal, and Stripe payments. You only pay a 1.25% platform fee when a client pays you. Upgrading to Pro ($89/mo) or Scale ($299/mo) drops your fee to 0.45% or 0.10%.',
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
      'Our team is available at support@letsgetquoted.com and through our contact form. Real human support specialists answer all questions regarding setup, migrations, and billing.',
    ctaText: 'Contact Our Support Team',
    ctaHref: '/contact',
  },
];

// 5 starter FAQs displayed in the default accordion list
const STARTER_FAQ_IDS = ['switching', 'flex-plan', 'quotes', 'quick-stops', 'integrations'];

function searchKnowledgeBase(query: string): SearchResult {
  const clean = query.trim().toLowerCase();
  const tokens = clean.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let bestScore = 0;
  let bestItem: FaqItem | null = null;

  for (const item of KNOWLEDGE_BASE) {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const answerLower = item.answer.toLowerCase();

    // Exact query in title / answer
    if (titleLower.includes(clean)) score += 60;
    if (answerLower.includes(clean)) score += 25;

    // Token & keyword matches
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
      query: query.trim(),
      title: bestItem.title,
      answer: bestItem.answer,
      ctaText: bestItem.ctaText,
      ctaHref: bestItem.ctaHref,
    };
  }

  return {
    query: query.trim(),
    title: 'Let’s Get Quoted Contractor Platform',
    answer:
      'Let’s Get Quoted gives trade contractors a free custom website, 24/7 AI instant quotes, deposit collection, and crew scheduling starting at $0/mo. All plans include QuickBooks sync and Stripe bank payouts.',
    ctaText: 'Explore Features & Pricing',
    ctaHref: '/pricing',
  };
}

export default function MarketingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState<number>(20000);
  const drawerRef = useRef<HTMLDivElement>(null);
  const faqRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchResultRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Plan recommendation logic
  const planRecommendation = useMemo(() => {
    if (monthlyVolume < 15000) {
      return {
        name: 'Flex',
        price: '$0/mo + 1.25%',
        reason: 'Zero fixed overhead keeps 100% of your margin on low or seasonal volume.',
      };
    }
    if (monthlyVolume <= 45000) {
      return {
        name: 'Pro',
        price: '$89/mo + 0.45%',
        reason: 'The lower 0.45% rate saves you hundreds over Flex at this volume.',
      };
    }
    return {
      name: 'Scale',
      price: '$299/mo + 0.10%',
      reason: 'Ultra-low 0.10% fee maximizes profit for multi-truck crews and high volume.',
    };
  }, [monthlyVolume]);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    const result = searchKnowledgeBase(clean);
    setSearchResult(result);

    // If it matches an active starter FAQ, also expand that accordion
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

    setQuery('');
  };

  const starterFaqs = useMemo(
    () => KNOWLEDGE_BASE.filter((k) => STARTER_FAQ_IDS.includes(k.id)),
    []
  );

  return (
    <div className={styles.floatingWrapper}>
      {/* Floating Trigger Capsule */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={styles.floatingTrigger}
          aria-label="Open AI Product Assistant"
          aria-expanded={isOpen}
          aria-controls="marketing-ai-assistant-drawer"
        >
          <span className={styles.sparkleIcon}>✦</span>
          <div className={styles.triggerText}>
            <span className={styles.triggerTitle}>Ask AI Helper</span>
            <span className={styles.triggerSub}>Plans · Switching · Pricing</span>
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
          aria-label="Let’s Get Quoted AI Helper"
        >
          {/* Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.avatar}>✦</div>
              <div className={styles.botInfo}>
                <span className={styles.botName}>Let’s Get Quoted Assistant</span>
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
            <div className={styles.messageBubble}>
              👋 Hi! Ask anything about plans, switching, or integrations. Tap any question below to see instant answers:
            </div>

            {/* Interactive Plan Matcher */}
            <div className={styles.planBox}>
              <div className={styles.planBoxHeader}>
                <span className={styles.planBoxLabel}>🧮 Plan Matcher</span>
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

            {/* Search Answer Display */}
            {searchResult && (
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
              </div>
            )}

            {/* In-Place Accordion Questions */}
            <div className={styles.quickPillsSection}>
              <span className={styles.quickPillsLabel}>Common Contractor Questions</span>
              <div className={styles.accordionList}>
                {starterFaqs.map((faq) => {
                  const isExpanded = expandedFaqId === faq.id;
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Input + Conversion Link */}
          <div className={styles.drawerFooter}>
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
  );
}
