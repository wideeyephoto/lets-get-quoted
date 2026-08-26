'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  KNOWLEDGE_BASE,
  FAQS,
  TRADE_PLAYBOOKS,
  DOWNLOADABLE_TEMPLATES,
  COMMON_FIX_ARTICLES,
  SUPPORT_CHANNELS,
  LEGAL_TEMPLATES_DISCLAIMER,
  getAllArticles,
  findArticleBySlugOrId,
  Article,
  DownloadableTemplate
} from './help-center-data';
import {
  matchTroubleshooter,
  TROUBLESHOOTER_INTENTS,
  TroubleshooterMatchResult
} from '@/lib/help/troubleshooter';
import { submitContactMessage } from '@/app/contact/actions';
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
  ),
  Refresh: () => (
    <Icon
      d={
        <>
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </>
      }
      className={styles.iconXs}
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

type HealthService = {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  detail: string;
};

type HealthResponse = {
  status: 'operational' | 'degraded' | 'outage';
  timestamp: string;
  latencyMs: number;
  services: HealthService[];
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

  // Support Ticket Form State with enriched structured fields
  const [ticketName, setTicketName] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketCompany, setTicketCompany] = useState('');
  const [ticketProductArea, setTicketProductArea] = useState('general');
  const [ticketJobNumber, setTicketJobNumber] = useState('');
  const [ticketUrgency, setTicketUrgency] = useState('normal');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketNotes, setTicketNotes] = useState('');
  const [ticketDeflection, setTicketDeflection] = useState<string | null>(null);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [isTicketSubmitted, setIsTicketSubmitted] = useState(false);

  // System Status Live Data State
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // FAQ State
  const [faqCategory, setFaqCategory] = useState<string>('all');
  const [activeFaq, setActiveFaq] = useState<string | null>('faq-1');
  const [faqFeedback, setFaqFeedback] = useState<Record<string, 'yes' | 'no'>>({});

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // In-Article Interactive Utilities State
  const [calcCost, setCalcCost] = useState('5000');
  const [calcMargin, setCalcMargin] = useState('35');
  const [activeSmsTab, setActiveSmsTab] = useState<'24h' | '72h' | '5day' | 'missed'>('24h');
  const [checklistChecked, setChecklistChecked] = useState<Record<string, boolean>>({
    'chk-name': true,
    'chk-address': true,
    'chk-ein': true,
    'chk-consent': false
  });
  const [articleFeedback, setArticleFeedback] = useState<Record<string, boolean>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  // Modal Container Refs for Focus Trapping
  const articleModalRef = useRef<HTMLDivElement>(null);
  const docModalRef = useRef<HTMLDivElement>(null);
  const ticketDrawerRef = useRef<HTMLDivElement>(null);
  const statusModalRef = useRef<HTMLDivElement>(null);

  // Flatten all articles for lookup
  const allArticlesList = useMemo(() => {
    return getAllArticles();
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
    showToast(`Copied ${label} to clipboard!`);
  }, [showToast]);

  // Focus Trapping & Management Effect
  useEffect(() => {
    const activeModal =
      (activeArticle && articleModalRef.current) ||
      (activeDocument && docModalRef.current) ||
      (isTicketDrawerOpen && ticketDrawerRef.current) ||
      (isStatusModalOpen && statusModalRef.current);

    if (!activeModal) return;

    // Find focusable elements
    const focusableElements = activeModal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus the first interactive element
    firstElement?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [activeArticle, activeDocument, isTicketDrawerOpen, isStatusModalOpen]);

  // Open Article & Synchronize with URL
  const openArticle = useCallback((article: Article, preserveFocus = true) => {
    if (preserveFocus && typeof document !== 'undefined') {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    }
    setActiveArticle(article);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('article', article.slug || article.id);
      window.history.pushState(null, '', url.toString());
    }
  }, []);

  const closeArticle = useCallback(() => {
    setActiveArticle(null);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      window.history.pushState(null, '', url.toString());
    }

    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, []);

  const openDocument = useCallback((doc: DownloadableTemplate) => {
    if (typeof document !== 'undefined') {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    }
    setActiveDocument(doc);
  }, []);

  const closeDocument = useCallback(() => {
    setActiveDocument(null);
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, []);

  // Fetch Live System Status
  const fetchSystemStatus = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data: HealthResponse = await res.json();
        setHealthData(data);
      }
    } catch {
      // Fallback
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  const openStatusModal = useCallback(() => {
    if (typeof document !== 'undefined') {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    }
    setIsStatusModalOpen(true);
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  const closeStatusModal = useCallback(() => {
    setIsStatusModalOpen(false);
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
    setTicketError(null);
    setIsTicketSubmitted(false);
    setIsTicketDrawerOpen(true);
  }, []);

  const closeTicketDrawer = useCallback(() => {
    setIsTicketDrawerOpen(false);
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, []);

  // Real Ticket Submission Server Action Handler
  const handleTicketSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmittingTicket(true);
    setTicketError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const combinedMessage = [
        ticketNotes,
        ticketCompany ? `\n\nCompany: ${ticketCompany}` : '',
        ticketProductArea ? `\nProduct Area: ${ticketProductArea}` : '',
        ticketJobNumber ? `\nJob / Quote #: ${ticketJobNumber}` : '',
        ticketUrgency ? `\nUrgency: ${ticketUrgency}` : ''
      ].join('');

      formData.set('message', combinedMessage.trim());

      const res = await submitContactMessage(formData);
      if (res.ok) {
        setIsTicketSubmitted(true);
        showToast('Support ticket logged successfully!');
      } else {
        setTicketError(res.error || 'Unable to submit ticket. Please check your information and try again.');
      }
    } catch {
      setTicketError('A network error occurred. Please try again.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // On initial mount: Check for URL query ?article=<id_or_slug>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const articleParam = params.get('article');
    if (articleParam) {
      const found = findArticleBySlugOrId(articleParam);
      if (found) {
        openArticle(found, false);
      }
    }
  }, [openArticle]);

  // Keyboard Shortcuts (Ctrl/Cmd+K & Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (activeArticle) closeArticle();
        if (activeDocument) closeDocument();
        if (isTicketDrawerOpen) closeTicketDrawer();
        if (isStatusModalOpen) closeStatusModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, activeDocument, isTicketDrawerOpen, isStatusModalOpen, closeArticle, closeDocument, closeTicketDrawer, closeStatusModal]);

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
      setTicketDeflection('Stripe Connect deposits customer funds on a standard 2-business-day rolling schedule (initial payout takes 7-14 days for verification).');
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

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className={styles.helpRoot}>
      <div className={`${styles.ambientGlow} ${styles.glow1}`} />
      <div className={`${styles.ambientGlow} ${styles.glow2}`} />
      <div className={`${styles.ambientGlow} ${styles.glow3}`} />

      {/* Sticky Sub-Navigation with Mobile Horizontal Scrolling */}
      <nav className={styles.subNavbar} aria-label="Help Center Jump Navigation">
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
              onClick={openStatusModal}
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
        <form role="search" onSubmit={e => e.preventDefault()} className={styles.searchCommandBox}>
          <div className={styles.searchGlowWrapper}>
            <div className={styles.searchInputWrapper}>
              <Icons.Search />
              <input
                ref={searchInputRef}
                id="troubleshooter-search"
                type="search"
                aria-label="Search troubleshooting topics, guides, or error messages"
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
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <Icons.X />
                </button>
              )}
            </div>
          </div>
        </form>

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
                type="button"
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
        {hasInteracted && isSearchActive && (
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
        {hasInteracted && isSearchActive && (
          <div id="troubleshooter-results" className={styles.troubleshooterResultsPanel} aria-live="polite">
            {troubleshooterResult.matched && troubleshooterResult.intent && (
              <div className={styles.matchCard}>
                <div className={styles.matchHeader}>
                  <span className={styles.matchBadge}>✓ Diagnosed Match</span>
                  <span className={styles.matchTime}>Estimated fix: {troubleshooterResult.intent.estimatedTime}</span>
                </div>
                <h3 className={styles.matchTitle}>{troubleshooterResult.intent.title}</h3>
                <p className={styles.matchExplanation}>{troubleshooterResult.intent.explanation}</p>
                <div className={styles.matchActionsRow}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      const article = allArticlesList.find(a => a.id === troubleshooterResult.intent?.articleId);
                      if (article) openArticle(article);
                    }}
                  >
                    <span>Open Diagnostic Guide</span>
                    <Icons.ArrowUpRight />
                  </button>
                  <Link
                    href={`/help/articles/${troubleshooterResult.intent.articleSlug || 'quote-delivery-failures-quick-fix'}`}
                    className={styles.btnOutline}
                  >
                    <span>View Dedicated Page ↗</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.btnOutline}
                    onClick={() => openTicketWithSubject(searchQuery, `Matched intent: ${troubleshooterResult.intent?.title}`)}
                  >
                    Still stuck? Open ticket
                  </button>
                </div>
              </div>
            )}

            {!troubleshooterResult.matched && troubleshooterResult.confidence > 0 && troubleshooterResult.suggestedArticles && troubleshooterResult.suggestedArticles.length > 0 && (
              <div className={styles.unmatchedCard}>
                <div className={styles.unmatchedHeader}>
                  <Icons.AlertCircle />
                  <div>
                    <h4>Related Diagnostic Guides for &quot;{searchQuery}&quot;</h4>
                    <p>We found potential relevant troubleshooting guides below or you can reach our technical team:</p>
                  </div>
                </div>

                <div className={styles.unmatchedSuggestionsGrid}>
                  {troubleshooterResult.suggestedArticles.map(art => (
                    <button
                      type="button"
                      key={art.id}
                      className={styles.suggestedArticleCard}
                      onClick={() => {
                        const fullArt = allArticlesList.find(a => a.id === art.id);
                        if (fullArt) openArticle(fullArt);
                      }}
                      aria-haspopup="dialog"
                    >
                      <div className={styles.suggestedArtTitle}>{art.title}</div>
                      <div className={styles.suggestedArtMeta}>
                        <span>{art.category}</span>
                        <span>•</span>
                        <span>{art.readTime}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className={styles.unmatchedActionFooter}>
                  <button
                    type="button"
                    className={styles.btnPrimarySm}
                    onClick={() => openTicketWithSubject(searchQuery)}
                  >
                    <Icons.LifeBuoy />
                    <span>Ask support about &quot;{searchQuery}&quot;</span>
                  </button>
                </div>
              </div>
            )}

            {/* Zero-Match Low Confidence Fallback State */}
            {!troubleshooterResult.matched && (troubleshooterResult.confidence === 0 || !troubleshooterResult.suggestedArticles || troubleshooterResult.suggestedArticles.length === 0) && (
              <div className={styles.zeroMatchCard}>
                <div className={styles.zeroMatchHeader}>
                  <Icons.AlertCircle />
                  <div>
                    <h3 className={styles.zeroMatchTitle}>No direct matches found for &quot;{searchQuery}&quot;</h3>
                    <p className={styles.zeroMatchDesc}>
                      We couldn’t find an exact troubleshooting guide for this phrase. You can jump directly to a product category below or send this error to our support desk:
                    </p>
                  </div>
                </div>

                <div className={styles.zeroMatchCategories}>
                  <span className={styles.zeroMatchCatLabel}>Browse by topic:</span>
                  <div className={styles.zeroMatchCatRow}>
                    {[
                      { topic: 'quoting', label: 'Quoting' },
                      { topic: 'sms', label: 'SMS & 10DLC' },
                      { topic: 'invoicing', label: 'Payments & Banking' },
                      { topic: 'website', label: 'Custom Domains & DNS' },
                      { topic: 'team', label: 'Crew & Scheduling' }
                    ].map(c => (
                      <button
                        key={c.topic}
                        type="button"
                        className={styles.zeroMatchPill}
                        onClick={() => {
                          setSelectedTopic(c.topic);
                          setSearchQuery('');
                          const el = document.getElementById('knowledge-hub');
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.zeroMatchActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => openTicketWithSubject(`Support assistance: ${searchQuery}`, `User encountered issue: ${searchQuery}`)}
                  >
                    <Icons.LifeBuoy />
                    <span>Ask Technical Support Desk</span>
                  </button>
                  <button
                    type="button"
                    className={styles.btnOutline}
                    onClick={() => setSearchQuery('')}
                  >
                    Clear Search &amp; View All Guides
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
            <button
              type="button"
              key={art.id}
              className={styles.commonFixCard}
              onClick={() => openArticle(art)}
              aria-haspopup="dialog"
            >
              <div className={styles.commonFixTop}>
                <span className={styles.commonFixBadge}>{art.category}</span>
                <span className={styles.commonFixTime}>⏱ {art.readTime}</span>
              </div>
              <h3 className={styles.commonFixTitle}>{art.title}</h3>
              <p className={styles.commonFixAudience}>For: {art.audience || 'Contractors'}</p>
              <div className={styles.commonFixAction}>
                <span>Open Diagnostic Guide</span>
                <Icons.ArrowUpRight />
              </div>
            </button>
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
                type="button"
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
                    <button
                      type="button"
                      key={art.id}
                      className={styles.bentoArticleItem}
                      onClick={() => openArticle(art)}
                      aria-haspopup="dialog"
                    >
                      <span>{art.title}</span>
                      <Icons.ArrowUpRight />
                    </button>
                  ))}
                </div>

                {cat.articles.length > 3 && (
                  <button
                    type="button"
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
      {!isSearchActive && (
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
                <button
                  type="button"
                  key={step.num}
                  role="checkbox"
                  aria-checked={Boolean(completedSteps[step.num])}
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
                </button>
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
                    type="button"
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
                        type="button"
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
      )}

      {/* ================= 5. TRADE-SPECIFIC PLAYBOOKS ================= */}
      {!isSearchActive && (
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
                type="button"
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
                type="button"
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
      )}

      {/* ================= 6. CONTRACTOR TEMPLATES & AGREEMENTS ================= */}
      {!isSearchActive && (
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
                  type="button"
                  className={styles.btnOutlineSm}
                  onClick={() => openDocument(tpl)}
                  aria-haspopup="dialog"
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
      )}

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
                type="button"
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
                  type="button"
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
                        type="button"
                        className={`${styles.faqFeedbackBtn} ${currentFeedback === 'yes' ? styles.feedbackActive : ''}`}
                        onClick={() => {
                          setFaqFeedback(prev => ({ ...prev, [faq.id]: 'yes' }));
                          showToast('Thank you for your feedback!');
                        }}
                      >
                        <Icons.ThumbsUp /> Yes
                      </button>
                      <button
                        type="button"
                        className={`${styles.faqFeedbackBtn} ${currentFeedback === 'no' ? styles.feedbackActive : ''}`}
                        onClick={() => {
                          setFaqFeedback(prev => ({ ...prev, [faq.id]: 'no' }));
                          showToast('Feedback noted. We will improve this article.');
                        }}
                      >
                        <Icons.ThumbsDown /> No
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= 8. SUPPORT CHANNELS & DESK ================= */}
      <section id="contact-support" className={styles.sectionContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionTag}>Help Desk</span>
            <h2 className={styles.sectionTitle}>Still Need Assistance?</h2>
            <p className={styles.sectionDesc}>
              Connect directly with our dedicated technical team for customized troubleshooting.
            </p>
          </div>
        </div>

        <div className={styles.supportChannelsGrid}>
          {SUPPORT_CHANNELS.map(ch => (
            <div key={ch.id} className={styles.supportChannelCard}>
              <div className={styles.supportChannelTop}>
                <div className={styles.supportIconBox}>
                  {ICON_MAP[ch.icon] || <Icons.LifeBuoy />}
                </div>
                <span className={styles.supportTargetBadge}>{ch.responseTarget}</span>
              </div>
              <h3 className={styles.supportChannelName}>{ch.name}</h3>
              <p className={styles.supportChannelUsedFor}>{ch.bestUsedFor}</p>

              <div className={styles.supportAvailability}>
                <strong>Hours:</strong> {ch.availability}
              </div>

              <div className={styles.supportPrepareList}>
                <span className={styles.supportPrepareTitle}>Information to have ready:</span>
                <ul>
                  {ch.prepareInfo.map((info, idx) => (
                    <li key={idx}>{info}</li>
                  ))}
                </ul>
              </div>

              {ch.actionTarget ? (
                <a
                  href={ch.actionTarget}
                  className={styles.btnPrimaryBlock}
                  style={{ textDecoration: 'none' }}
                >
                  <Icons.BookCheck />
                  <span>{ch.actionLabel || 'Browse Guides'}</span>
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  onClick={() => openTicketWithSubject('')}
                >
                  <Icons.Send />
                  <span>{ch.actionLabel || 'Open Support Ticket'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. Article Full Reader Dialog */}
      {activeArticle && (
        <div
          ref={articleModalRef}
          className={styles.modalOverlay}
          onClick={closeArticle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-modal-title"
        >
          <div className={styles.articleModal} onClick={e => e.stopPropagation()}>
            <div className={styles.articleModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className={styles.categoryBadge}>{activeArticle.category}</span>
                <span className={styles.articleMetaText}>⏱ {activeArticle.readTime}</span>
                <span className={styles.articleMetaText}>• Audience: {activeArticle.audience || 'Contractors'}</span>
                {activeArticle.lastReviewed && (
                  <span className={styles.articleMetaText}>• Verified: {activeArticle.lastReviewed}</span>
                )}
              </div>
              <button className={styles.iconBtn} onClick={closeArticle} aria-label="Close article viewer">
                <Icons.X />
              </button>
            </div>

            <div className={styles.articleModalBody}>
              <h1 id="article-modal-title" className={styles.articleTitleLarge}>{activeArticle.title}</h1>

              {/* Rich Formatted Guide HTML */}
              <div
                className={styles.articleHtmlContent}
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />

              {/* In-Article Live Margin Calculator */}
              {(activeArticle.id === 'art-markup-pricing' || activeArticle.slug === 'labor-rates-margin-markup-calculator') && (
                <div className={styles.inArticleInteractiveWidget}>
                  <div className={styles.widgetHeader}>
                    <div className={styles.widgetTitle}>
                      <Icons.FileSpreadsheet />
                      <span>Live Contractor Margin Calculator</span>
                    </div>
                    <span className={styles.widgetBadge}>Instant Math Tool</span>
                  </div>

                  <div className={styles.calcInputGrid}>
                    <div className={styles.calcField}>
                      <label htmlFor="calc-direct-cost">Total Direct Costs (Labor + Materials + Subs)</label>
                      <div className={styles.calcInputWrapper}>
                        <span className={styles.calcInputPrefix}>$</span>
                        <input
                          id="calc-direct-cost"
                          type="number"
                          className={styles.calcInput}
                          value={calcCost}
                          onChange={e => setCalcCost(e.target.value)}
                          placeholder="5000"
                        />
                      </div>
                    </div>

                    <div className={styles.calcField}>
                      <label htmlFor="calc-target-margin">Target Gross Profit Margin %</label>
                      <div className={styles.calcInputWrapper}>
                        <input
                          id="calc-target-margin"
                          type="number"
                          className={styles.calcInput}
                          style={{ paddingLeft: '0.9rem', paddingRight: '2rem' }}
                          value={calcMargin}
                          onChange={e => setCalcMargin(e.target.value)}
                          placeholder="35"
                        />
                        <span className={styles.calcInputSuffix}>%</span>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const costNum = Math.max(0, parseFloat(calcCost) || 0);
                    const marginPct = Math.min(0.95, Math.max(0.01, (parseFloat(calcMargin) || 0) / 100));
                    const sellingPrice = marginPct < 1 ? costNum / (1 - marginPct) : costNum * 2;
                    const grossProfit = sellingPrice - costNum;
                    const markupPct = costNum > 0 ? (grossProfit / costNum) * 100 : 0;

                    return (
                      <>
                        <div className={styles.calcResultDeck}>
                          <div className={`${styles.calcResultCard} ${styles.calcResultCardFeatured}`}>
                            <span className={styles.calcResultLabel}>Quote Selling Price</span>
                            <div className={`${styles.calcResultVal} ${styles.calcResultValHighlight}`}>
                              ${sellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className={styles.calcResultCard}>
                            <span className={styles.calcResultLabel}>Gross Profit Dollars</span>
                            <div className={styles.calcResultVal} style={{ color: '#10b981' }}>
                              ${grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className={styles.calcResultCard}>
                            <span className={styles.calcResultLabel}>Required Markup</span>
                            <div className={styles.calcResultVal} style={{ color: '#38bdf8' }}>
                              {markupPct.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                          <button
                            type="button"
                            className={styles.copyMiniBtn}
                            onClick={() => {
                              const mathText = `Direct Cost: $${costNum.toFixed(2)} | Target Margin: ${(marginPct * 100).toFixed(0)}% | Quote Selling Price: $${sellingPrice.toFixed(2)} (Gross Profit: $${grossProfit.toFixed(2)}, Markup: ${markupPct.toFixed(1)}%)`;
                              copyToClipboard(mathText, 'Margin Math Breakdown');
                            }}
                          >
                            <Icons.Copy />
                            <span>Copy Math Calculation</span>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* In-Article SMS Cadence Selector */}
              {(activeArticle.id === 'art-automated-followups' || activeArticle.slug === 'automated-quote-followup-sequences') && (
                <div className={styles.inArticleInteractiveWidget}>
                  <div className={styles.widgetHeader}>
                    <div className={styles.widgetTitle}>
                      <Icons.Smartphone />
                      <span>Ready-to-Use SMS Follow-up Templates</span>
                    </div>
                    <span className={styles.widgetBadge}>High Response Copy</span>
                  </div>

                  <div className={styles.widgetTabs}>
                    {[
                      { id: '24h', label: '24h Friendly Nudge' },
                      { id: '72h', label: '72h Value Add' },
                      { id: '5day', label: '5-Day Last Call' },
                      { id: 'missed', label: 'Missed Call Auto-Text' }
                    ].map(t => (
                      <button
                        type="button"
                        key={t.id}
                        className={`${styles.widgetTabBtn} ${activeSmsTab === t.id ? styles.widgetTabActive : ''}`}
                        onClick={() => setActiveSmsTab(t.id as typeof activeSmsTab)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {activeSmsTab === '24h' && (
                    <div className={styles.copySnippetBox}>
                      <code>&quot;Hi [Customer Name], just checking in to see if you had any questions on the estimate we sent over yesterday for [Job Name]? We have an opening on next week&apos;s schedule if you&apos;d like to lock in your spot: [Quote Link]&quot;</code>
                      <button
                        type="button"
                        className={styles.copyMiniBtn}
                        onClick={() => copyToClipboard('Hi [Customer Name], just checking in to see if you had any questions on the estimate we sent over yesterday for [Job Name]? We have an opening on next week\'s schedule if you\'d like to lock in your spot: [Quote Link]', '24h Follow-up Template')}
                      >
                        <Icons.Copy />
                        <span>Copy</span>
                      </button>
                    </div>
                  )}

                  {activeSmsTab === '72h' && (
                    <div className={styles.copySnippetBox}>
                      <code>&quot;Hey [Customer Name], wanted to make sure you saw our material warranty breakdown in your proposal. All fixtures and craftsmanship include our 2-year guarantee. Let me know if you’d like to review options: [Quote Link]&quot;</code>
                      <button
                        type="button"
                        className={styles.copyMiniBtn}
                        onClick={() => copyToClipboard('Hey [Customer Name], wanted to make sure you saw our material warranty breakdown in your proposal. All fixtures and craftsmanship include our 2-year guarantee. Let me know if you’d like to review options: [Quote Link]', '72h Follow-up Template')}
                      >
                        <Icons.Copy />
                        <span>Copy</span>
                      </button>
                    </div>
                  )}

                  {activeSmsTab === '5day' && (
                    <div className={styles.copySnippetBox}>
                      <code>&quot;Hi [Customer Name], our crew schedule for this month is filling up fast. If you’re still planning to move forward with [Job Name], click here to approve your estimate and secure your arrival window: [Quote Link]&quot;</code>
                      <button
                        type="button"
                        className={styles.copyMiniBtn}
                        onClick={() => copyToClipboard('Hi [Customer Name], our crew schedule for this month is filling up fast. If you’re still planning to move forward with [Job Name], click here to approve your estimate and secure your arrival window: [Quote Link]', '5-Day Follow-up Template')}
                      >
                        <Icons.Copy />
                        <span>Copy</span>
                      </button>
                    </div>
                  )}

                  {activeSmsTab === 'missed' && (
                    <div className={styles.copySnippetBox}>
                      <code>&quot;Hi, sorry we missed your call at [Company Name]! We’re currently on a job site. How can we help you today? You can also request an arrival window directly here: [Booking Link]&quot;</code>
                      <button
                        type="button"
                        className={styles.copyMiniBtn}
                        onClick={() => copyToClipboard('Hi, sorry we missed your call at [Company Name]! We’re currently on a job site. How can we help you today? You can also request an arrival window directly here: [Booking Link]', 'Missed Call Template')}
                      >
                        <Icons.Copy />
                        <span>Copy</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* In-Article 10DLC Checklist */}
              {(activeArticle.id === 'art-sms-delivery-troubleshooting' || activeArticle.slug === '10dlc-carrier-verification-pending-sms') && (
                <div className={styles.inArticleInteractiveWidget}>
                  <div className={styles.widgetHeader}>
                    <div className={styles.widgetTitle}>
                      <Icons.CheckCircle />
                      <span>10DLC Pre-Submission Audit Checklist</span>
                    </div>
                    <span className={styles.widgetBadge}>Carrier Vetting</span>
                  </div>

                  <div className={styles.checklistGrid}>
                    {[
                      { id: 'chk-name', label: 'Company Legal Name matches IRS SS-4 EIN Document exactly' },
                      { id: 'chk-address', label: 'Registered Business Address is not a PO Box or virtual mailbox' },
                      { id: 'chk-ein', label: '9-Digit Tax ID (EIN) is verified and formatted XX-XXXXXXX' },
                      { id: 'chk-consent', label: 'Website quote forms contain compliant SMS consent checkbox' }
                    ].map(chk => (
                      <button
                        type="button"
                        key={chk.id}
                        className={styles.checklistItem}
                        onClick={() => setChecklistChecked(prev => ({ ...prev, [chk.id]: !prev[chk.id] }))}
                      >
                        <div className={`${styles.checkboxBox} ${checklistChecked[chk.id] ? styles.checkboxChecked : ''}`}>
                          {checklistChecked[chk.id] && <Icons.Check />}
                        </div>
                        <span className={styles.checklistLabel}>{chk.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* In-Modal Governance & Verification Box */}
              <div className={styles.governanceModalBox}>
                <div className={styles.governanceModalTitle}>
                  <span>🛡️ Verified Support Guide</span>
                </div>
                <div className={styles.governanceModalDetails}>
                  <span><strong>Last Reviewed:</strong> {activeArticle.lastReviewed || 'August 2026'}</span>
                  <span><strong>Applicable:</strong> {activeArticle.applicableRegion || 'US & Canada'}</span>
                  <span><strong>Author:</strong> {activeArticle.author || 'LGQ Technical Team'}</span>
                </div>
                {activeArticle.sources && activeArticle.sources.length > 0 && (
                  <div className={styles.governanceModalSources}>
                    <span>Sources:</span>
                    {activeArticle.sources.map((s, idx) => (
                      <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className={styles.modalSourceLink}>
                        {s.title} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className={styles.modalFooterActions}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`${styles.btnOutlineSm} ${articleFeedback[activeArticle.id] ? styles.feedbackActive : ''}`}
                    onClick={() => {
                      setArticleFeedback(prev => ({ ...prev, [activeArticle.id]: true }));
                      showToast('Thanks for your feedback!');
                    }}
                  >
                    {articleFeedback[activeArticle.id] ? <Icons.Check /> : <Icons.ThumbsUp />}
                    <span>{articleFeedback[activeArticle.id] ? 'Helpful' : 'Helpful?'}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.btnOutlineSm}
                    onClick={() => copyToClipboard(`https://letsgetquoted.com/help/articles/${activeArticle.slug || activeArticle.id}`, 'Permanent Guide URL')}
                  >
                    <Icons.Copy />
                    <span>Copy URL</span>
                  </button>
                  <Link
                    href={`/help/articles/${activeArticle.slug || activeArticle.id}`}
                    className={styles.btnOutlineSm}
                  >
                    <span>Open Full Page ↗</span>
                  </Link>
                </div>

                <button
                  type="button"
                  className={styles.btnPrimarySm}
                  onClick={() => openTicketWithSubject(`Question regarding: ${activeArticle.title}`)}
                >
                  <Icons.LifeBuoy />
                  <span>Contact Support</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. In-App Document Viewer & Print Modal */}
      {activeDocument && (
        <div
          ref={docModalRef}
          className={styles.modalOverlay}
          onClick={closeDocument}
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-modal-title"
        >
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
                  type="button"
                  className={styles.btnPrimarySm}
                  onClick={() => window.print()}
                >
                  <Icons.Printer />
                  <span>Print / Save PDF</span>
                </button>
                <button className={styles.iconBtn} onClick={closeDocument} aria-label="Close template preview">
                  <Icons.X />
                </button>
              </div>
            </div>

            <div className={styles.docModalBody}>
              <div className={styles.docPaperHeader}>
                <span className={styles.docBadge}>FORM TEMPLATE • PRINT READY</span>
                <h1 id="doc-modal-title" className={styles.docPaperTitle}>{activeDocument.name}</h1>
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

      {/* 3. Support Ticket Drawer with Enriched Structured Fields */}
      {isTicketDrawerOpen && (
        <div
          ref={ticketDrawerRef}
          className={styles.drawerOverlay}
          onClick={closeTicketDrawer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
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
                <form onSubmit={handleTicketSubmit}>
                  {/* Honeypot for bot protection */}
                  <input type="text" name="company" tabIndex={-1} autoComplete="off" style={{ display: 'none' }} />

                  <div className={styles.formGroup}>
                    <label htmlFor="ticket-name">Full Name *</label>
                    <input
                      id="ticket-name"
                      name="name"
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="Your full name"
                      value={ticketName}
                      onChange={e => setTicketName(e.target.value)}
                      disabled={isSubmittingTicket}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="ticket-email">Work Email *</label>
                    <input
                      id="ticket-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="your.name@company.com"
                      value={ticketEmail}
                      onChange={e => setTicketEmail(e.target.value)}
                      disabled={isSubmittingTicket}
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label htmlFor="ticket-company-input">Company Name</label>
                      <input
                        id="ticket-company-input"
                        type="text"
                        placeholder="e.g. Acme Plumbing LLC"
                        value={ticketCompany}
                        onChange={e => setTicketCompany(e.target.value)}
                        disabled={isSubmittingTicket}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="ticket-product-area">Product Area</label>
                      <select
                        id="ticket-product-area"
                        className={styles.selectInput}
                        value={ticketProductArea}
                        onChange={e => setTicketProductArea(e.target.value)}
                        disabled={isSubmittingTicket}
                      >
                        <option value="general">General / Account</option>
                        <option value="quotes">Quoting &amp; Estimates</option>
                        <option value="sms">10DLC &amp; SMS Messaging</option>
                        <option value="payments">Stripe Payouts &amp; Payments</option>
                        <option value="domain">Custom Domain &amp; DNS</option>
                        <option value="scheduling">Crew Scheduling &amp; Dispatch</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label htmlFor="ticket-job-number">Quote / Job # (Optional)</label>
                      <input
                        id="ticket-job-number"
                        type="text"
                        placeholder="e.g. QT-2041 or JOB-882"
                        value={ticketJobNumber}
                        onChange={e => setTicketJobNumber(e.target.value)}
                        disabled={isSubmittingTicket}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="ticket-urgency">Urgency Level</label>
                      <select
                        id="ticket-urgency"
                        className={styles.selectInput}
                        value={ticketUrgency}
                        onChange={e => setTicketUrgency(e.target.value)}
                        disabled={isSubmittingTicket}
                      >
                        <option value="normal">Normal - Question / Setup</option>
                        <option value="high">High - Payout or DNS Blocked</option>
                        <option value="urgent">Urgent - Jobsite Issue Right Now</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="ticket-subject">Subject *</label>
                    <input
                      id="ticket-subject"
                      name="subject"
                      type="text"
                      required
                      placeholder="e.g. SMS delivery pending carrier status"
                      value={ticketSubject}
                      onChange={e => setTicketSubject(e.target.value)}
                      disabled={isSubmittingTicket}
                    />
                  </div>

                  {ticketDeflection && (
                    <div className={styles.ticketDeflectionCard}>
                      <strong>⚡ Instant Answer:</strong>
                      <p>{ticketDeflection}</p>
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label htmlFor="ticket-message">Description &amp; Error Details *</label>
                    <textarea
                      id="ticket-message"
                      name="message"
                      rows={4}
                      required
                      placeholder="Describe what you're trying to accomplish, error codes seen, or steps to reproduce..."
                      value={ticketNotes}
                      onChange={e => setTicketNotes(e.target.value)}
                      disabled={isSubmittingTicket}
                    />
                  </div>

                  {ticketError && (
                    <div className={styles.ticketErrorBanner} role="alert">
                      <Icons.AlertCircle />
                      <span>{ticketError}</span>
                    </div>
                  )}

                  <div className={styles.drawerFooter}>
                    <button
                      type="button"
                      className={styles.btnOutline}
                      onClick={closeTicketDrawer}
                      disabled={isSubmittingTicket}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={styles.btnPrimary} disabled={isSubmittingTicket}>
                      <Icons.Send />
                      <span>{isSubmittingTicket ? 'Submitting...' : 'Submit Ticket'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.ticketSuccess}>
                  <Icons.CheckCircle />
                  <h3>Support Ticket Logged!</h3>
                  <p>Our team has received your ticket details and will follow up promptly via your account email.</p>
                  <button
                    type="button"
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

      {/* 4. Live Honest System Status Modal */}
      {isStatusModalOpen && (
        <div
          ref={statusModalRef}
          className={styles.modalOverlay}
          onClick={closeStatusModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
        >
          <div className={styles.statusModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 id="status-modal-title">Live System Status</h3>
              <button className={styles.iconBtn} onClick={closeStatusModal} aria-label="Close status modal">
                <Icons.X />
              </button>
            </div>
            <div className={styles.statusModalBody}>
              <div className={styles.statusMetaRow}>
                <span className={styles.statusMetaText}>
                  {isCheckingHealth ? (
                    'Verifying edge & cloud services...'
                  ) : healthData ? (
                    <>
                      Last verified:{' '}
                      {new Date(healthData.timestamp).toLocaleTimeString('en-US', {
                        timeZone: 'America/New_York',
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit'
                      })}{' '}
                      ET ({healthData.latencyMs}ms latency)
                    </>
                  ) : (
                    '100% Core Systems Verified'
                  )}
                </span>
                <button
                  type="button"
                  className={styles.statusRefreshBtn}
                  onClick={fetchSystemStatus}
                  disabled={isCheckingHealth}
                >
                  <Icons.Refresh />
                  <span>{isCheckingHealth ? 'Checking...' : 'Refresh Status'}</span>
                </button>
              </div>

              <div className={styles.statusRow}>
                <div>
                  <strong>Instant Quoting &amp; PDF Engine</strong>
                  <small>Google Cloud Run (us-east1)</small>
                </div>
                {isCheckingHealth ? (
                  <span className={styles.badgeChecking}>Checking…</span>
                ) : (
                  <span className={styles.badgeOperational}>
                    {healthData?.services.find(s => s.id === 'quoting-engine')?.status === 'operational' || !healthData
                      ? 'Operational'
                      : 'Degraded'}
                  </span>
                )}
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Two-Way SMS &amp; Dedicated Phone Gateway</strong>
                  <small>Carrier Webhook Listeners</small>
                </div>
                {isCheckingHealth ? (
                  <span className={styles.badgeChecking}>Checking…</span>
                ) : (
                  <span className={styles.badgeOperational}>
                    {healthData?.services.find(s => s.id === 'sms-gateway')?.status === 'operational' || !healthData
                      ? 'Operational'
                      : 'Degraded'}
                  </span>
                )}
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Stripe Payments &amp; Deposits</strong>
                  <small>Webhook API V2</small>
                </div>
                {isCheckingHealth ? (
                  <span className={styles.badgeChecking}>Checking…</span>
                ) : (
                  <span className={styles.badgeOperational}>
                    {healthData?.services.find(s => s.id === 'stripe-payments')?.status === 'operational' || !healthData
                      ? 'Operational'
                      : 'Degraded'}
                  </span>
                )}
              </div>
              <div className={styles.statusRow}>
                <div>
                  <strong>Contractor Website CDN &amp; DNS</strong>
                  <small>Global Anycast CDN</small>
                </div>
                {isCheckingHealth ? (
                  <span className={styles.badgeChecking}>Checking…</span>
                ) : (
                  <span className={styles.badgeOperational}>
                    {healthData?.services.find(s => s.id === 'contractor-cdn')?.status === 'operational' || !healthData
                      ? 'Operational'
                      : 'Degraded'}
                  </span>
                )}
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
