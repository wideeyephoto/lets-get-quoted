'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { submitSparkySupportTicket } from '@/app/actions/sparky-ticket';
import styles from './sparky-copilot.module.css';

type QuickQuestion = {
  id: string;
  q: string;
  a: string;
  actionLabel?: string;
  actionHref?: string;
};

type PageContextInfo = {
  pageLabel: string;
  questions: QuickQuestion[];
};

// Curated 3 questions per page category
const PAGE_QUESTIONS: Record<string, PageContextInfo> = {
  pricing: {
    pageLabel: 'Pricing & Plans',
    questions: [
      {
        id: 'pricing-flex',
        q: 'How does the $0/month Flex plan work?',
        a: 'Flex has no monthly software fee. You can build your custom website, use 24/7 AI intake, and send unlimited quotes for free. A 1.25% platform fee applies only when you collect customer payments through Stripe.',
        actionLabel: 'Compare Plan Details →',
        actionHref: '/pricing',
      },
      {
        id: 'pricing-hidden-fees',
        q: 'Are there any hidden fees or contracts?',
        a: 'Never. No setup fees, no lock-in contracts, and no per-user seat penalties. You can cancel anytime from Settings or upgrade to Pro ($99/mo) to drop your platform fee to 0.75%.',
        actionLabel: 'View Pricing Transparency →',
        actionHref: '/pricing',
      },
      {
        id: 'pricing-payout-speed',
        q: 'How fast do customer payments reach my bank?',
        a: 'Customer payments clear directly into your own Stripe connected account and transfer directly to your bank on Stripe’s rolling 2-day payout schedule. We never hold your funds.',
        actionLabel: 'See Payment Terms →',
        actionHref: '/pricing',
      },
    ],
  },
  compare: {
    pageLabel: 'Software Comparisons',
    questions: [
      {
        id: 'compare-switch',
        q: 'How hard is it to switch from Jobber or Housecall Pro?',
        a: 'Switching takes under 10 minutes. You can import your clients, job history, and price list via CSV without formatting headaches. There are no annual lock-ins.',
        actionLabel: 'Compare Switch Details →',
        actionHref: '/compare',
      },
      {
        id: 'compare-import',
        q: 'Can you import my existing clients and price book?',
        a: 'Yes! Our automated import matches your customer contact details, past job notes, and service catalogs so you don’t have to re-type existing data.',
        actionLabel: 'Explore Migration →',
        actionHref: '/compare',
      },
      {
        id: 'compare-per-seat',
        q: 'Why don’t you charge per-user monthly subscriptions?',
        a: 'Traditional SaaS penalizes growing contractors by charging $50–$100 per crew member per month. We believe you shouldn’t pay extra just because you hired another helper or sub.',
        actionLabel: 'Calculate Your Savings →',
        actionHref: '/pricing',
      },
    ],
  },
  features_ai: {
    pageLabel: 'Text-to-Job & AI Field Tools',
    questions: [
      {
        id: 'ai-walkup',
        q: 'How does the Walk-Up Estimate Brain Dump work?',
        a: 'When you arrive at a job site, open your voice memo or text Sparky. Dictate measurements, labor hours, and add-on options. Sparky calculates line items and builds a send-ready quote before you leave the driveway.',
        actionLabel: 'Explore Text-to-Job →',
        actionHref: '/features/text-to-job',
      },
      {
        id: 'ai-photo-ocr',
        q: 'How does photo OCR equipment estimating work?',
        a: 'Snap or text photos of equipment rating plates, panels, or plumbing fixtures. Sparky reads model specifications via OCR, assesses job risks, and pre-fills your draft estimate.',
        actionLabel: 'Try Sparky AI Demos →',
        actionHref: '/features/sparky',
      },
      {
        id: 'ai-voice-receptionist',
        q: 'What happens when a customer calls my business number?',
        a: 'Your 24/7 AI receptionist answers in 2 rings, qualifies caller needs, captures addresses, and drafts booking requests directly onto your schedule so you never lose emergency calls while working.',
        actionLabel: 'See 24/7 Voice Receptionist →',
        actionHref: '/features',
      },
    ],
  },
  features_general: {
    pageLabel: 'Features & Capabilities',
    questions: [
      {
        id: 'feat-quotes',
        q: 'How do instant quotes and online deposits work?',
        a: 'Send good/better/best quote tiers with optional upsells. Customers e-sign on mobile and pay deposits via Apple Pay or credit card—automatically moving the quote to your booked calendar.',
        actionLabel: 'Explore Quotes & E-Sign →',
        actionHref: '/features/quotes',
      },
      {
        id: 'feat-client-portal',
        q: 'Do customers need to download an app to text and pay?',
        a: 'No app download is ever required. Customers receive a branded SMS link to view on-my-way tracking, sign change orders, and pay balances directly on their phone browser.',
        actionLabel: 'Explore Client Portal →',
        actionHref: '/features/client-portal',
      },
      {
        id: 'feat-sync',
        q: 'Does it sync with QuickBooks and Google Calendar?',
        a: 'Yes. Invoices, client records, and payments sync two-way with QuickBooks Online. Booked jobs sync smoothly with Google Calendar and Apple Calendar.',
        actionLabel: 'Browse All 56 Capabilities →',
        actionHref: '/features',
      },
    ],
  },
  how_it_works: {
    pageLabel: 'How It Works',
    questions: [
      {
        id: 'how-flow',
        q: 'What is the full contractor workflow from lead to payout?',
        a: 'Homeowner requests a quote on your website or calls in → Sparky captures inquiry → you send a quote via SMS → customer signs & pays deposit → crew dispatches with route & checklist → final payment clears to your bank.',
        actionLabel: 'See The Full Flow →',
        actionHref: '/how-it-works',
      },
      {
        id: 'how-dispatch',
        q: 'How does morning crew dispatch and route planning work?',
        a: 'Each morning, dispatch maps out optimal routes for your trucks and sends crew members their tool lists and job notes directly to their phones without cluttered back-and-forth calls.',
        actionLabel: 'Explore Scheduling →',
        actionHref: '/features/scheduling',
      },
      {
        id: 'how-website',
        q: 'How quickly does the free contractor website go live?',
        a: 'Your website publishes instantly in under 60 seconds on a free .letsgetquoted.com subdomain with SEO tags pre-configured. You can connect your existing custom domain anytime.',
        actionLabel: 'Explore Website Builder →',
        actionHref: '/features/website-builder',
      },
    ],
  },
  tools: {
    pageLabel: 'Free Contractor Calculators',
    questions: [
      {
        id: 'tools-free',
        q: 'Are these contractor calculators completely free?',
        a: 'Yes! Our 1-page PDF estimate generator, true hourly rate calculator, and change order leakage tools are 100% free with no credit card or account required.',
        actionLabel: 'Open Estimate Generator →',
        actionHref: '/tools/estimate-generator',
      },
      {
        id: 'tools-convert',
        q: 'Can I convert an estimate into a live bookable quote?',
        a: 'Yes. When you create a free account, your calculator estimates can be saved, texted to clients, and upgraded to e-signed quotes with deposit collection.',
        actionLabel: 'Start Free on Flex →',
        actionHref: 'https://app.letsgetquoted.com/start?goal=build_site&source=sparky_tools',
      },
      {
        id: 'tools-rate',
        q: 'How do you calculate true billable hourly rates?',
        a: 'Our calculator accounts for your overhead (vehicle, insurance, tools), employer labor burden (FICA, workers comp), and target gross margin so you never underbid a job.',
        actionLabel: 'Use Hourly Rate Calculator →',
        actionHref: '/tools/hourly-rate-calculator',
      },
    ],
  },
  trade_pages: {
    pageLabel: 'For Your Trade',
    questions: [
      {
        id: 'trade-templates',
        q: 'Do you have templates built for my specific trade?',
        a: 'Yes! We have custom templates and pre-built price books tailored for Electricians, Plumbers, HVAC, Roofers, Carpenters, Landscapers, Painters, and General Contractors.',
        actionLabel: 'Explore Trade Playbooks →',
        actionHref: '/for',
      },
      {
        id: 'trade-domain',
        q: 'Can I keep my existing company domain name?',
        a: 'Absolutely. You publish instantly on our free subdomain and point your custom domain (e.g. smithplumbing.com) with one simple CNAME record whenever you are ready.',
        actionLabel: 'Website Builder Details →',
        actionHref: '/features/website-builder',
      },
      {
        id: 'trade-quick-stops',
        q: 'What is Quick Stops route monetization?',
        a: 'Quick Stops flags nearby emergency repair requests along your crew’s live driving route, allowing homeowners to pay an expedited fee to be fitted into your day.',
        actionLabel: 'Explore Quick Stops →',
        actionHref: '/features/quick-stops',
      },
    ],
  },
  support_legal: {
    pageLabel: 'Help & Platform Trust',
    questions: [
      {
        id: 'support-data-ownership',
        q: 'Who owns my customer data and website domain?',
        a: 'You do 100%. You own your customer database, photos, job history, and domain name. You can export your full records via CSV at any time without fees.',
        actionLabel: 'Review Security Policy →',
        actionHref: '/security',
      },
      {
        id: 'support-stripe-connect',
        q: 'How does Stripe Connected accounts keep money safe?',
        a: 'We use Stripe Connect with direct charges. Let’s Get Quoted never touches or holds your funds; payments clear straight into your own bank account.',
        actionLabel: 'View Payment Terms →',
        actionHref: '/pricing',
      },
      {
        id: 'support-contact-human',
        q: 'How do I speak with a human support specialist?',
        a: 'You can create a support ticket directly right here in Sparky Copilot, or reach out through our contact page. Our team replies promptly with zero bots.',
        actionLabel: 'Visit Contact Page →',
        actionHref: '/contact',
      },

    ],
  },
  default_home: {
    pageLabel: 'Let’s Get Quoted Overview',
    questions: [
      {
        id: 'home-quotes',
        q: 'How do instant quotes and online deposits work?',
        a: 'You or Sparky can draft quotes in under 60 seconds from voice or text. Clients receive a branded SMS link, pick optional add-ons, sign on mobile, and pay deposits directly.',
        actionLabel: 'Explore Quotes & E-Sign →',
        actionHref: '/features/quotes',
      },
      {
        id: 'home-cost',
        q: 'How much does Let’s Get Quoted cost?',
        a: 'Flex starts at $0/month with no subscription fee—you only pay a 1.25% platform fee when you get paid via Stripe. Paid plans start at $99/month and reduce fees to 0.75%.',
        actionLabel: 'Compare Pricing Plans →',
        actionHref: '/pricing',
      },
      {
        id: 'home-website',
        q: 'How does the free contractor website work?',
        a: 'Pick your trade and get a professional website pre-filled with local SEO, estimate request forms, and photo galleries in under 60 seconds—included free with every account.',
        actionLabel: 'Explore Website Builder →',
        actionHref: '/features/website-builder',
      },
    ],
  },
};

function getPageContext(pathname: string): PageContextInfo {
  if (!pathname || pathname === '/') {
    return PAGE_QUESTIONS.default_home;
  }
  if (pathname.startsWith('/pricing')) {
    return PAGE_QUESTIONS.pricing;
  }
  if (pathname.startsWith('/compare')) {
    return PAGE_QUESTIONS.compare;
  }
  if (pathname.startsWith('/features/text-to-job') || pathname.startsWith('/features/sparky') || pathname.startsWith('/features/ai-')) {
    return PAGE_QUESTIONS.features_ai;
  }
  if (pathname.startsWith('/features')) {
    return PAGE_QUESTIONS.features_general;
  }
  if (pathname.startsWith('/how-it-works')) {
    return PAGE_QUESTIONS.how_it_works;
  }
  if (pathname.startsWith('/tools')) {
    return PAGE_QUESTIONS.tools;
  }
  if (pathname.startsWith('/for')) {
    return PAGE_QUESTIONS.trade_pages;
  }
  if (
    pathname.startsWith('/faq') ||
    pathname.startsWith('/help') ||
    pathname.startsWith('/contact') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/sms-terms')
  ) {
    return PAGE_QUESTIONS.support_legal;
  }
  return PAGE_QUESTIONS.default_home;
}

export default function SparkyCopilot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<QuickQuestion | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [query, setQuery] = useState('');
  const [searchAnswer, setSearchAnswer] = useState<{ query: string; answer: string; href?: string; cta?: string } | null>(null);

  // Support ticket form view
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketName, setTicketName] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketPhone, setTicketPhone] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketHoneypot, setTicketHoneypot] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ ok: boolean; caseId?: string; error?: string } | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const pageContext = useMemo(() => getPageContext(pathname || '/'), [pathname]);

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

  const handleSelectQuestion = (q: QuickQuestion) => {
    setShowTicketForm(false);
    setSearchAnswer(null);
    setIsTyping(true);
    setTimeout(() => {
      setActiveQuestion(q);
      setIsTyping(false);
    }, 220);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setActiveQuestion(null);
    setShowTicketForm(false);
    setIsTyping(true);

    // Look for best match across all page questions
    setTimeout(() => {
      const lower = cleanQuery.toLowerCase();
      const allQuestions: QuickQuestion[] = Object.values(PAGE_QUESTIONS).flatMap((ctx) => ctx.questions);
      const match = allQuestions.find((item) =>
        item.q.toLowerCase().includes(lower) ||
        lower.split(' ').some((word) => word.length > 3 && item.q.toLowerCase().includes(word))
      );

      if (match) {
        setSearchAnswer({
          query: cleanQuery,
          answer: match.a,
          href: match.actionHref,
          cta: match.actionLabel,
        });
      } else {
        setSearchAnswer({
          query: cleanQuery,
          answer:
            "I couldn't find an exact pre-built answer for that question, but our contractor support team can answer it directly! You can create a quick support ticket below, and we'll reply right away.",
        });
      }
      setIsTyping(false);
      setQuery('');
    }, 250);
  };

  const handleOpenTicketForm = (prefillMessage?: string) => {
    setShowTicketForm(true);
    setTicketResult(null);
    if (prefillMessage) {
      setTicketMessage(prefillMessage);
    } else if (activeQuestion) {
      setTicketMessage(`Question regarding: "${activeQuestion.q}"\n\nI need more information about...`);
    } else if (searchAnswer) {
      setTicketMessage(`Question: "${searchAnswer.query}"\n\n`);
    }
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketName.trim() || !ticketEmail.trim() || !ticketMessage.trim()) return;

    setIsSubmittingTicket(true);
    setTicketResult(null);

    const res = await submitSparkySupportTicket({
      name: ticketName,
      email: ticketEmail,
      phone: ticketPhone,
      message: ticketMessage,
      pageUrl: typeof window !== 'undefined' ? window.location.href : pathname,
      questionContext: activeQuestion ? activeQuestion.q : searchAnswer ? searchAnswer.query : undefined,
      company: ticketHoneypot,
    });

    setIsSubmittingTicket(false);
    setTicketResult(res);
    if (res.ok) {
      setTicketMessage('');
      setTicketPhone('');
    }
  };

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
        {/* Floating Trigger Capsule */}
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={styles.floatingTrigger}
            aria-label="Ask Sparky Copilot"
            aria-expanded={isOpen}
            aria-controls="sparky-copilot-drawer"
          >
            <div className={styles.triggerAvatarWrap}>
              <Image
                src="/brand/sparky/sparky-avatar.jpg"
                alt="Sparky Copilot"
                width={38}
                height={38}
                className={styles.triggerAvatarImg}
              />
              <span className={styles.triggerOnlineDot} aria-hidden="true" />
            </div>
            <div className={styles.triggerText}>
              <span className={styles.triggerTitle}>
                Ask Sparky <span aria-hidden="true">⚡</span>
              </span>
              <span className={styles.triggerSub}>24/7 AI Copilot</span>
            </div>
          </button>
        )}

        {/* Slide-Up Chat & Help Drawer */}
        {isOpen && (
          <aside
            id="sparky-copilot-drawer"
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-label="Sparky Copilot Assistant"
          >
            {/* Header */}
            <div className={styles.drawerHeader}>
              <div className={styles.headerLeft}>
                <div className={styles.headerAvatar}>
                  <Image
                    src="/brand/sparky/sparky-avatar.jpg"
                    alt="Sparky Copilot Mascot"
                    width={36}
                    height={36}
                  />
                  <span className={styles.triggerOnlineDot} aria-hidden="true" />
                </div>
                <div className={styles.botInfo}>
                  <span className={styles.botName}>Sparky Copilot</span>
                  <span className={styles.botStatus}>
                    <span className={styles.statusDot} aria-hidden="true" /> Online · Contractor AI Assistant
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={styles.closeBtn}
                aria-label="Close Sparky Copilot"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className={styles.drawerBody}>
              {/* Sparky Greeting Card */}
              <div className={styles.sparkyGreetingCard}>
                <div className={styles.greetingMascotWrap}>
                  <Image
                    src="/brand/sparky/sparky-avatar.jpg"
                    alt="Sparky"
                    width={38}
                    height={38}
                  />
                </div>
                <div className={styles.greetingTextWrap}>
                  <div className={styles.greetingTitle}>Contractor Copilot</div>
                  <p className={styles.greetingSpeech}>
                    Hi! I&apos;m Sparky, your 24/7 AI contractor copilot. What can I help you with today?
                  </p>
                </div>
              </div>

              {/* Typing Animation State */}
              {isTyping && (
                <div className={styles.typingIndicator} aria-live="polite">
                  <span>Sparky is thinking</span>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              )}

              {/* Active Answer Display for Selected Question */}
              {activeQuestion && !isTyping && !showTicketForm && (
                <div className={styles.answerCard} role="region" aria-label="Sparky Answer">
                  <div className={styles.answerHeader}>
                    <p className={styles.answerQuestionText}>&ldquo;{activeQuestion.q}&rdquo;</p>
                    <button
                      type="button"
                      onClick={() => setActiveQuestion(null)}
                      className={styles.answerDismissBtn}
                      aria-label="Back to questions"
                    >
                      ✕
                    </button>
                  </div>
                  <p className={styles.answerBodyText}>{activeQuestion.a}</p>
                  <div className={styles.answerActionRow}>
                    {activeQuestion.actionHref && (
                      <Link href={activeQuestion.actionHref} className={styles.answerCtaLink}>
                        {activeQuestion.actionLabel || 'Learn more →'}
                      </Link>
                    )}
                    <div className={styles.answerTicketPrompt}>
                      <span>Need more detail?</span>
                      <button
                        type="button"
                        onClick={() => handleOpenTicketForm()}
                        className={styles.answerTicketLink}
                      >
                        Create support ticket
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Search Result Display */}
              {searchAnswer && !isTyping && !showTicketForm && (
                <div className={styles.answerCard} role="region" aria-label="Search Result">
                  <div className={styles.answerHeader}>
                    <p className={styles.answerQuestionText}>Answer for &ldquo;{searchAnswer.query}&rdquo;</p>
                    <button
                      type="button"
                      onClick={() => setSearchAnswer(null)}
                      className={styles.answerDismissBtn}
                      aria-label="Dismiss answer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className={styles.answerBodyText}>{searchAnswer.answer}</p>
                  <div className={styles.answerActionRow}>
                    {searchAnswer.href && (
                      <Link href={searchAnswer.href} className={styles.answerCtaLink}>
                        {searchAnswer.cta || 'Learn more →'}
                      </Link>
                    )}
                    <div className={styles.answerTicketPrompt}>
                      <span>Still have questions?</span>
                      <button
                        type="button"
                        onClick={() => handleOpenTicketForm()}
                        className={styles.answerTicketLink}
                      >
                        Create support ticket
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Support Ticket Creation View */}
              {showTicketForm && (
                <div className={styles.ticketFormCard} role="region" aria-label="Support Ticket Form">
                  <div className={styles.ticketFormHeader}>
                    <span className={styles.ticketFormTitle}>
                      💬 Create a Support Ticket
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTicketForm(false)}
                      className={styles.answerDismissBtn}
                      aria-label="Close ticket form"
                    >
                      ✕
                    </button>
                  </div>

                  {!ticketResult?.ok ? (
                    <form onSubmit={handleTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p className={styles.ticketFormDesc}>
                        Have a specific question or need custom assistance? Our support team will review and reply directly.
                      </p>

                      {/* Hidden Honeypot */}
                      <input
                        type="text"
                        name="company"
                        value={ticketHoneypot}
                        onChange={(e) => setTicketHoneypot(e.target.value)}
                        style={{ display: 'none' }}
                        tabIndex={-1}
                        autoComplete="off"
                      />

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="ticket-name">Your Name *</label>
                        <input
                          id="ticket-name"
                          type="text"
                          required
                          value={ticketName}
                          onChange={(e) => setTicketName(e.target.value)}
                          placeholder="John Smith"
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="ticket-email">Your Email *</label>
                        <input
                          id="ticket-email"
                          type="email"
                          required
                          value={ticketEmail}
                          onChange={(e) => setTicketEmail(e.target.value)}
                          placeholder="john@smithplumbing.com"
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="ticket-phone">Mobile Phone (optional, for SMS reply)</label>
                        <input
                          id="ticket-phone"
                          type="tel"
                          value={ticketPhone}
                          onChange={(e) => setTicketPhone(e.target.value)}
                          placeholder="(555) 000-0000"
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="ticket-message">How can we help? *</label>
                        <textarea
                          id="ticket-message"
                          required
                          value={ticketMessage}
                          onChange={(e) => setTicketMessage(e.target.value)}
                          placeholder="Describe what you need help with..."
                          className={styles.formTextarea}
                          rows={3}
                        />
                      </div>

                      {ticketResult?.error && (
                        <p className={styles.ticketErrorText}>{ticketResult.error}</p>
                      )}

                      <div className={styles.ticketActionRow}>
                        <button
                          type="button"
                          onClick={() => setShowTicketForm(false)}
                          className={styles.ticketCancelBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingTicket}
                          className={styles.ticketSubmitBtn}
                        >
                          {isSubmittingTicket ? 'Submitting...' : 'Submit Support Ticket →'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className={styles.ticketSuccessCard}>
                      <span className={styles.ticketSuccessIcon}>✓</span>
                      <h4 className={styles.ticketSuccessTitle}>Ticket Submitted!</h4>
                      <p className={styles.ticketSuccessText}>
                        Thanks {ticketName}! We’ve logged your request in our system
                        {ticketResult.caseId ? ` (Ref: #${ticketResult.caseId.slice(0, 8)})` : ''}.
                        Our team will email you at <strong>{ticketEmail}</strong> shortly.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTicketForm(false);
                          setTicketResult(null);
                        }}
                        className={styles.ticketSuccessBtn}
                      >
                        Back to Sparky
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 3 Quick Questions for Current Page */}
              {!showTicketForm && (
                <>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionLabel}>Quick Questions</span>
                    <span className={styles.pagePill}>{pageContext.pageLabel}</span>
                  </div>

                  <div className={styles.quickQuestionsList} role="list">
                    {pageContext.questions.map((qItem) => (
                      <button
                        key={qItem.id}
                        type="button"
                        onClick={() => handleSelectQuestion(qItem)}
                        className={styles.questionButton}
                      >
                        <span className={styles.questionIcon}>✦</span>
                        <span style={{ flex: 1 }}>{qItem.q}</span>
                        <span className={styles.questionArrow}>→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer with Search Form & Ticket Escalation */}
            <div className={styles.drawerFooter}>
              <form onSubmit={handleSearchSubmit} className={styles.inputForm}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask Sparky anything about Let's Get Quoted..."
                  className={styles.textInput}
                  aria-label="Ask Sparky a question"
                />
                <button type="submit" className={styles.sendBtn}>
                  Ask
                </button>
              </form>

              <div className={styles.footerActionsRow}>
                <button
                  type="button"
                  onClick={() => handleOpenTicketForm()}
                  className={styles.createTicketBtn}
                >
                  💬 Create Support Ticket
                </button>
                <Link
                  href="https://app.letsgetquoted.com/start?goal=build_site&source=sparky_copilot"
                  className={styles.signupFooterLink}
                >
                  Start Free on Flex ($0/mo) →
                </Link>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
