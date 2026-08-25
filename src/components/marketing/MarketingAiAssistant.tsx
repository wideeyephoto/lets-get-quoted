'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SIGNUP_URL } from '@/components/flagship/site-chrome';
import styles from './marketing-ai-assistant.module.css';

type FaqItem = {
  id: string;
  title: string;
  answer: string;
  ctaText?: string;
  ctaHref?: string;
};

type CustomAnswer = {
  question: string;
  answer: string;
  ctaText?: string;
  ctaHref?: string;
};

const KNOWLEDGE_BASE: FaqItem[] = [
  {
    id: 'switching',
    title: 'How do I switch from Jobber or Housecall Pro?',
    answer:
      'Switching takes under 10 minutes. You can export your clients and price list to CSV and import them directly into Let’s Get Quoted. There are no contracts, and you can start free on Flex ($0/mo) while running it alongside your old tool.',
    ctaText: 'Compare Jobber vs LGQ',
    ctaHref: '/compare/jobber-alternative',
  },
  {
    id: 'flex-plan',
    title: 'How does the $0/month Flex plan work?',
    answer:
      'Flex has $0 monthly fees and $0 setup cost. You get a custom contractor website, AI quote qualification, scheduling, customer portal, and Stripe payments. You only pay a 1.25% platform fee when a client pays you.',
    ctaText: 'See Full Pricing Breakdown',
    ctaHref: '/pricing',
  },
  {
    id: 'quick-stops',
    title: 'What are Quick Stops and how do they work?',
    answer:
      'Quick Stops match incoming repair and small-job leads to your crew’s live route proximity. If you are finishing a job in a neighborhood, nearby emergency requests are dispatched to your phone so you book an extra $300–$600 on the way home.',
    ctaText: 'Test AI Lead Sandbox',
    ctaHref: '/features/ai-intake',
  },
  {
    id: 'integrations',
    title: 'Does it sync with QuickBooks & Stripe?',
    answer:
      'Yes! We feature official 2-way synchronization with QuickBooks Online for invoices and customer records, plus Stripe Connect for instant bank payouts, Apple Pay, Google Pay, and ACH transfers.',
    ctaText: 'View Back Office Features',
    ctaHref: '/features/back-office',
  },
  {
    id: 'website',
    title: 'Do I get a website on my own custom domain?',
    answer:
      'Yes! You can choose from 20 trade-tested website templates, customize colors and photos, and publish to your own domain (e.g. yourcompany.com) with SSL and Google 5-star review integration included.',
    ctaText: 'Explore Website Templates',
    ctaHref: '/features/website-builder',
  },
];

export default function MarketingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState<CustomAnswer | null>(null);
  const [query, setQuery] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState<number>(20000);
  const drawerRef = useRef<HTMLDivElement>(null);
  const faqRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const customAnswerRef = useRef<HTMLDivElement>(null);

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
    setCustomAnswer(null);

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

    const lower = clean.toLowerCase();

    // Match FAQ by keyword or title
    let match = KNOWLEDGE_BASE.find(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.answer.toLowerCase().includes(lower) ||
        item.id.toLowerCase().includes(lower)
    );

    if (!match) {
      if (/jobber|housecall|switch|migrate|import|csv|competitor/i.test(lower)) {
        match = KNOWLEDGE_BASE.find((k) => k.id === 'switching');
      } else if (/pricing|price|cost|flex|monthly|fee|commission|percentage|free|plan/i.test(lower)) {
        match = KNOWLEDGE_BASE.find((k) => k.id === 'flex-plan');
      } else if (/quick\s*stop|route|proximity|emergency|lead|radius|dispatch/i.test(lower)) {
        match = KNOWLEDGE_BASE.find((k) => k.id === 'quick-stops');
      } else if (/quickbooks|qbo|stripe|sync|accounting|payout|bank|ach|apple\s*pay/i.test(lower)) {
        match = KNOWLEDGE_BASE.find((k) => k.id === 'integrations');
      } else if (/website|domain|url|template|design|theme|builder|google\s*review/i.test(lower)) {
        match = KNOWLEDGE_BASE.find((k) => k.id === 'website');
      }
    }

    if (match) {
      setExpandedFaqId(match.id);
      setCustomAnswer(null);
      setTimeout(() => {
        const el = faqRefs.current[match!.id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    } else {
      setExpandedFaqId(null);
      setCustomAnswer({
        question: clean,
        answer:
          'Let’s Get Quoted gives trade contractors a free custom website, 24/7 AI lead qualification, instant quotes with deposits, and complete scheduling starting at $0/mo. All plans include QuickBooks sync and Stripe payouts.',
        ctaText: 'Start Free on Flex',
        ctaHref: SIGNUP_URL,
      });
      setTimeout(() => {
        if (customAnswerRef.current) {
          customAnswerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }

    setQuery('');
  };

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

            {/* In-Place Accordion Questions */}
            <div className={styles.quickPillsSection}>
              <span className={styles.quickPillsLabel}>Common Contractor Questions</span>
              <div className={styles.accordionList}>
                {KNOWLEDGE_BASE.map((faq) => {
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
                      >
                        <span>{faq.title}</span>
                        <span className={`${styles.accordionArrow} ${isExpanded ? styles.accordionArrowOpen : ''}`}>
                          &rarr;
                        </span>
                      </button>

                      {isExpanded && (
                        <div className={styles.accordionBody}>
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

            {/* Custom Search Answer Display */}
            {customAnswer && (
              <div ref={customAnswerRef} className={styles.customResultCard}>
                <div className={styles.customResultTitle}>
                  <span>✦ Answer for &ldquo;{customAnswer.question}&rdquo;</span>
                </div>
                <p className={styles.customResultText}>{customAnswer.answer}</p>
                {customAnswer.ctaText && customAnswer.ctaHref && (
                  <div>
                    <Link href={customAnswer.ctaHref} className={styles.accordionCta}>
                      {customAnswer.ctaText} &rarr;
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Input + Conversion Link */}
          <div className={styles.drawerFooter}>
            <form onSubmit={handleSearchSubmit} className={styles.inputForm}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about pricing, QuickBooks, Stripe..."
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
