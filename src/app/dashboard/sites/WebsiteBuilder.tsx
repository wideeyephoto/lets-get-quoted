'use client';

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import type { Site, TemplateType } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getSiteContent, mergeSiteContent, HERO_BADGE_PRESETS, HERO_BADGE_STYLES, IMAGE_SLOT_LABELS, MAX_EXTRA_HERO_IMAGES, REORDERABLE_SECTIONS, STOCK_SHOWCASE_TITLE, STOCK_SHOWCASE_INTRO, PROJECT_SHOWCASE_STYLES, MAX_PROJECT_SHOWCASE_ITEMS, slugifyBlogTitle, type NormalizedSiteContent, type SiteProjectShowcaseContent, type SiteBlogContent, type SiteAnnouncementContent, type SiteBeforeAfterContent, type SiteServicesContent, type SiteHowItWorksContent, type SiteCertificationsContent, type SiteEstimateRangesContent, type SiteFaqContent, type SiteFinancingContent, type SiteQuoteFormContent, type SiteRatingBadgeContent, type SiteServiceAreasContent, type SiteShowcaseContent, type SiteShowcaseItem, type SiteStatsContent, type SiteStickyCallBarContent, type SiteLeadFiltersContent, type SiteTestimonialsContent, type SiteTrustBadgesContent, type SiteWhyUsContent } from '@/lib/site-content';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import ServiceIcon, { SERVICE_ICON_KEYS } from '@/lib/templates/ServiceIcon';
import { checkSubdomainAvailableAction, generateSiteTextAction, generateBlogPostAction, importJobPhotoToSiteImageAction, listCompletedJobPhotoOptionsAction, publishSiteAction, regenerateSeoCopyAction, regenerateStockImagesAction, updateSiteAction, uploadSiteImageAction, verifyCustomDomainAction, type JobPhotoImportOption } from './actions';
import { SEO_TITLE_MAX as SEO_TITLE_LIMIT, SEO_DESC_MAX as SEO_DESC_LIMIT } from '@/lib/seo/seo-copy';
import type { PexelsPickPhoto, StockImageResult, WebsiteImageAssignment } from '@/lib/stock/types';
import { compressImage } from '@/lib/client-images';
import ImagePickerModal from './ImagePickerModal';
import DomainConnector from './DomainConnector';
import GoogleReviewImport from './GoogleReviewImport';
import LivePreview from './LivePreview';
import SectionCard from './SectionCard';
import ThemeIcon from './ThemeIcon';
import styles from './SiteEditor.module.css';

type BuilderTab = 'business' | 'page' | 'design' | 'publish';

type WebsiteBuilderProps = {
  site: Site;
  uploadedImages: SiteImage[];
};

// Heading font choices. The webfont options reuse faces the app already loads
// globally (see src/app/layout.tsx), so picking any of them adds zero page
// weight; the last three are the original system-font stacks, kept so sites
// that saved one still match an option.
const HEADING_FONT_OPTIONS = [
  { label: 'Space Grotesk — modern grotesk', value: 'var(--font-display), "Segoe UI", sans-serif' },
  { label: 'Anton — bold poster', value: 'var(--font-forge-display), Impact, sans-serif' },
  { label: 'Fraunces — elegant serif', value: 'var(--font-guild-display), Georgia, serif' },
  { label: 'Poppins — rounded & friendly', value: 'var(--font-care), "Segoe UI", sans-serif' },
  { label: 'Barlow — clean workshop sans', value: 'var(--font-forge-body), Arial, sans-serif' },
  { label: 'Work Sans — simple & warm', value: 'var(--font-guild-body), Arial, sans-serif' },
  { label: 'Inter — neutral modern', value: 'var(--font-vista-body), Helvetica, sans-serif' },
  { label: 'IBM Plex Sans — technical clean', value: 'var(--font-body), Arial, sans-serif' },
  { label: 'JetBrains Mono — typewriter tech', value: 'var(--font-mono), Consolas, monospace' },
  { label: 'Classic serif (Georgia)', value: 'Georgia, Times New Roman, serif' },
  { label: 'Bold sans (Arial Black)', value: 'Arial Black, Helvetica, sans-serif' },
  { label: 'Humanist sans (Trebuchet)', value: 'Trebuchet MS, sans-serif' },
];

// Curated accent presets for the Design tab. Button/badge text color is derived
// automatically for contrast (see readableOnAccent), so every one of these stays
// legible on any template — no more dark-on-dark buttons from a custom hex.
const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Ocean blue', hex: '#2563eb' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Lime', hex: '#65a30d' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Charcoal', hex: '#1f2937' },
];

const TABS: { id: BuilderTab; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'design', label: 'Design' },
  { id: 'page', label: 'Your page' },
  { id: 'publish', label: 'Publish' },
];

// Card that opens when a tab is entered by clicking its tab (or arrow-keying to
// it). Only Business and Design have a natural "start here" card; Your page and
// Publish keep whatever was open. Click-to-edit and checklist deep-links set
// their own target card and bypass this.
const TAB_DEFAULT_SECTION: Partial<Record<BuilderTab, string>> = {
  business: 'basics',
  design: 'theme',
};

function createContentId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

// Header hint for a section card: item count when there's content, a warning
// when the section is On but empty (it renders nothing publicly until filled —
// which otherwise reads as "checked but not showing").
// Collapsible list item: collapsed it's a one-line summary row (title + Edit/
// Remove); expanded it shows the fields with a Save button that collapses it
// and persists the site. Kills the wall-of-open-forms feeling in item lists.
function StackItem({ title, meta, editing, onEdit, onSave, onRemove, children }: {
  title: string;
  meta?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={styles.stackItem}>
      <div className={styles.itemHeader}>
        <button type="button" className={styles.itemTitleBtn} onClick={editing ? onSave : onEdit} aria-expanded={editing}>
          <strong>{title}</strong>
          {meta && <small>{meta}</small>}
        </button>
        <div className={styles.itemActions}>
          {editing
            ? <button type="button" className={styles.itemSaveBtn} onClick={onSave}>Save</button>
            : <button type="button" className={styles.itemEditBtn} onClick={onEdit}>Edit</button>}
          <button type="button" onClick={onRemove}>Remove</button>
        </div>
      </div>
      {editing && children}
    </div>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function isStockUrl(stockImages: WebsiteImageAssignment[], url: string | null | undefined): boolean {
  return Boolean(url) && stockImages.some((item) => item.provider === 'pexels' && item.imageUrl === url);
}

// The default Pexels search for the "Replace photo" popup, based on which slot
// is being edited plus the contractor's trade — so opening the hero picker
// lands on trade-relevant hero shots, the About picker on worker shots, etc.
function pexelsQueryFor(picker: { kind: string; slot?: string }, trade: string): string {
  const t = (trade || '').trim() || 'home services';
  switch (picker.kind) {
    case 'logo': return '';
    case 'showcase': return `${t} completed work`;
    case 'project': return `${t} finished project`;
    case 'beforeAfter': return `${t} home`;
    case 'slot':
      if (picker.slot === 'heroBackground') return `${t} house exterior wide`;
      if (picker.slot === 'heroSecondary') return `${t} detail close up`;
      if (picker.slot === 'about') return `${t} worker at work`;
      if (picker.slot === 'stats') return `${t} finished residential result`;
      return t;
    default: return `${t} home exterior`; // hero, heroExtra
  }
}

// Apply auto-selected stock photos to the site, preserving the owner's uploads
// and any image they've already set (an existing image is only replaced if it's
// currently a stock photo or empty). Returns the changed hero + a content
// patch, or null when there's nothing to apply (Pexels was unavailable).
function applyStockImages(current: Site, images: StockImageResult): { heroUrl: string | null; contentUpdates: Partial<NormalizedSiteContent> } | null {
  if (!images.ok) return null;
  const content = getSiteContent(current.content);
  const stock = content.stockImages;
  const replaceHero = !current.hero_url || isStockUrl(stock, current.hero_url);

  const filledSlots: Record<string, string> = {};
  for (const [slot, url] of Object.entries(images.slots)) {
    const currentUrl = content.images[slot];
    if (!currentUrl || isStockUrl(stock, currentUrl)) filledSlots[slot] = url;
  }

  const contentUpdates: Partial<NormalizedSiteContent> = {
    images: { ...content.images, ...filledSlots },
  };

  if (images.gallery.length > 0) {
    // Keep the owner's own photos — uploads AND any non-stock photo they picked
    // (e.g. Unsplash from the old library) — only refreshing previously
    // auto-applied stock tiles.
    const keptItems = content.showcase.items.filter((item) => item.source === 'upload' || !isStockUrl(stock, item.url));
    const wasEmpty = content.showcase.items.length === 0;
    contentUpdates.showcase = {
      ...content.showcase,
      enabled: true,
      // Only apply the honest "representative photos" label to a fresh gallery;
      // don't relabel a showcase the owner has already customized.
      title: wasEmpty ? STOCK_SHOWCASE_TITLE : content.showcase.title,
      intro: wasEmpty ? STOCK_SHOWCASE_INTRO : content.showcase.intro,
      items: [...keptItems, ...images.gallery],
    };
  }

  // Keep attribution accurate: only record assignments we actually applied, and
  // replace any prior record for the same role/id.
  const applied = images.assignments.filter((assignment) => {
    if (assignment.role === 'hero') return replaceHero;
    if (assignment.role === 'gallery') return images.gallery.length > 0;
    if (assignment.slot) return Boolean(filledSlots[assignment.slot]);
    return false;
  });
  const appliedIds = new Set(applied.map((assignment) => assignment.id));
  contentUpdates.stockImages = [...stock.filter((item) => !appliedIds.has(item.id)), ...applied];

  return {
    heroUrl: replaceHero ? (images.heroUrl || current.hero_url) : current.hero_url,
    contentUpdates,
  };
}

function contentHint(enabled: boolean, count: number, noun: string, plural?: string): { hint?: string; hintTone?: 'ok' | 'warn' } {
  if (enabled && count === 0) return { hint: "empty — won't show yet", hintTone: 'warn' };
  if (count > 0) return { hint: `${count} ${count === 1 ? noun : plural || `${noun}s`}`, hintTone: 'ok' };
  return {};
}

function siteUpdates(site: Site) {
  return {
    template: site.template,
    header_font: site.header_font,
    button_style: site.button_style,
    accent_override: site.accent_override,
    company_name: site.company_name,
    headline: site.headline,
    tagline: site.tagline,
    phone: site.phone,
    license: site.license,
    hours: site.hours,
    service_area: site.service_area,
    logo_url: site.logo_url,
    hero_url: site.hero_url,
    subdomain: site.subdomain,
    custom_domain: site.custom_domain,
    portal_mode: site.portal_mode,
    content: site.content,
    seo_title: site.seo_title,
    seo_description: site.seo_description,
  };
}

export default function WebsiteBuilder({ site: initialSite, uploadedImages }: WebsiteBuilderProps) {
  const [site, setSite] = useState(initialSite);
  const [siteImages, setSiteImages] = useState(uploadedImages);
  const [jobPhotoOptions, setJobPhotoOptions] = useState<JobPhotoImportOption[]>([]);
  const [jobPhotosLoaded, setJobPhotosLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>('business');
  // 'basics' so the first Business card (name + trade + AI quick-start) is open
  // on arrival — the natural starting point for a new site.
  const [openSection, setOpenSection] = useState<string | null>('basics');
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [domainStatus, setDomainStatus] = useState<'idle' | 'checking' | 'verified' | 'unverified'>(site.custom_domain_verified_at ? 'verified' : 'idle');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isRegeneratingSeo, setIsRegeneratingSeo] = useState(false);
  const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
  // Rotates each time "Regenerate SEO copy" is clicked so the deterministic
  // generator returns a different valid variation without changing the inputs.
  const seoVariantRef = useRef(0);
  // Rotates the stock-image selection for "Regenerate all stock images".
  const imageNonceRef = useRef(0);
  const [isGeneratingBlog, setIsGeneratingBlog] = useState(false);
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const [blogTopic, setBlogTopic] = useState('');
  // Local string state for the free-numeric rating fields so decimal typing
  // (e.g. "4.9") isn't clobbered by re-normalization on every keystroke.
  const [ratingInput, setRatingInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.rating));
  const [reviewCountInput, setReviewCountInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.reviewCount));
  const [monthlyFromInput, setMonthlyFromInput] = useState(() => String(getSiteContent(initialSite.content).financing.monthlyFrom));
  // Same decimal/clear-clobber guard for the per-stat Value fields: keep the
  // raw string while a stat is being edited so clearing doesn't snap to 0.
  const [statValueInputs, setStatValueInputs] = useState<Record<string, string>>({});
  const [uploadingTestimonialId, setUploadingTestimonialId] = useState<string | null>(null);
  // One list item is editable at a time; new items open for editing right away.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Briefly highlights a Design-tab field jumped to from the preview (e.g. the
  // hero badge control).
  const [flashField, setFlashField] = useState<string | null>(null);
  // Session undo/redo over `site` snapshots (works across saves — undoing to a
  // pre-save state marks the builder dirty so Save can persist the recovery).
  // Rapid keystrokes coalesce into one entry: a snapshot is only pushed when an
  // edit lands after a quiet gap, so undo steps feel like "one change", not one
  // character. Refs hold the stacks; the version counter re-renders the buttons.
  const historyRef = useRef<{ past: Site[]; future: Site[] }>({ past: [], future: [] });
  const prevSiteRef = useRef(initialSite);
  const historyNavRef = useRef(false);
  const lastEditAtRef = useRef(0);
  const [, setHistoryVersion] = useState(0);
  // The "Replace photo" popup: which image is being replaced. Opened by clicking
  // any photo in the preview or an inline Replace-photo button; the chosen image
  // is routed by `kind` (site hero/logo, content.images slot, a before/after
  // side, or a showcase tile — scItemId null appends a new showcase image).
  const [picker, setPicker] = useState<
    | { label: string; kind: 'hero' | 'logo' | 'slot' | 'beforeAfter' | 'showcase' | 'project' | 'heroExtra'; slot?: string; baItemId?: string; baSide?: 'before' | 'after'; scItemId?: string | null; pjItemId?: string | null; heroExtraIndex?: number }
    | null
  >(null);
  // The section key currently being dragged in the "Page order" reorder list.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const galleryImages = getSiteGallery(site.content);
  const siteContent = getSiteContent(site.content);
  const selectableImages = [...siteImages, ...STOCK_SITE_IMAGES];

  // What a stock gallery tile's overlay says when its title is blank — mirrors
  // the public-page fallback (service names round-robin, then the trade).
  const galleryAdTitles = siteContent.services.items.map((svc) => svc.title.trim()).filter(Boolean);
  const galleryTrade = siteContent.trade.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
  const galleryAutoTitle = (index: number): string => (galleryAdTitles.length ? galleryAdTitles[index % galleryAdTitles.length] : galleryTrade ? `Expert ${galleryTrade}` : '');

  // Blog card hint: live-post count, or a warning when it's enabled with only
  // drafts (the section renders nothing publicly until a post is published).
  const publishedPostCount = siteContent.blog.posts.filter((post) => post.status === 'published' && post.title.trim() && post.body.trim()).length;
  const blogHint: { hint?: string; hintTone?: 'ok' | 'warn' } = publishedPostCount > 0
    ? { hint: `${publishedPostCount} live ${publishedPostCount === 1 ? 'post' : 'posts'}`, hintTone: 'ok' }
    : siteContent.blog.posts.length > 0
      ? siteContent.blog.enabled
        ? { hint: 'drafts only — publish one to go live', hintTone: 'warn' }
        : { hint: `${siteContent.blog.posts.length} ${siteContent.blog.posts.length === 1 ? 'draft' : 'drafts'}`, hintTone: 'ok' }
      : contentHint(siteContent.blog.enabled, 0, 'post');

  // Review count for hints — mirrors getPublishedTestimonials exactly: manual
  // quotes are dropped in 'google' mode, Google reviews in 'manual' mode, and
  // empty-text Google reviews never render. Counting anything the public page
  // wouldn't show would defeat the "empty — won't show yet" warning.
  const reviewCount =
    (siteContent.testimonials.sourceMode === 'google' ? 0 : siteContent.testimonials.items.filter((item) => item.text.trim()).length)
    + (siteContent.testimonials.sourceMode === 'manual' ? 0 : siteContent.testimonials.googleReviews.filter((review) => review.text.trim()).length);

  // Per-section enabled state + content hints, shared by the section cards and
  // the Page order jump list.
  const sectionEnabled: Record<string, boolean> = {
    services: siteContent.services.enabled,
    howItWorks: siteContent.howItWorks.enabled,
    showcase: siteContent.showcase.enabled,
    testimonials: siteContent.testimonials.enabled,
    faqs: siteContent.faqs.enabled,
    serviceAreas: siteContent.serviceAreas.enabled,
    stats: siteContent.stats.enabled,
    beforeAfter: siteContent.beforeAfter.enabled,
    blog: siteContent.blog.enabled,
    certifications: siteContent.certifications.enabled,
  };
  const sectionHints: Record<string, { hint?: string; hintTone?: 'ok' | 'warn' }> = {
    services: contentHint(siteContent.services.enabled, siteContent.services.items.filter((svc) => svc.title.trim()).length, 'service'),
    howItWorks: contentHint(siteContent.howItWorks.enabled, siteContent.howItWorks.steps.filter((step) => step.title.trim()).length, 'step'),
    showcase: contentHint(siteContent.showcase.enabled, siteContent.showcase.items.length, 'image'),
    testimonials: contentHint(siteContent.testimonials.enabled, reviewCount, 'review'),
    faqs: contentHint(siteContent.faqs.enabled, siteContent.faqs.items.filter((faq) => faq.question.trim() && faq.answer.trim()).length, 'question'),
    serviceAreas: contentHint(siteContent.serviceAreas.enabled, siteContent.serviceAreas.cities.filter((city) => city.trim()).length, 'city', 'cities'),
    stats: contentHint(siteContent.stats.enabled, siteContent.stats.items.filter((item) => item.label.trim()).length, 'stat'),
    beforeAfter: contentHint(siteContent.beforeAfter.enabled, siteContent.beforeAfter.items.filter((pair) => pair.beforeUrl && pair.afterUrl).length, 'pair'),
    blog: blogHint,
    certifications: contentHint(siteContent.certifications.enabled, siteContent.certifications.items.filter((item) => item.label.trim()).length, 'item'),
  };

  // Jump to a tab, open a card, and optionally focus a field — powers the
  // launch-checklist deep-links. Double rAF: the target tab's panel must render
  // before the element exists to scroll to.
  const jumpTo = useCallback((tab: BuilderTab, card: string | null, fieldId?: string) => {
    setActiveTab(tab);
    if (card) setOpenSection(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = (fieldId ? document.getElementById(fieldId) : document.querySelector(`.${styles.sectionCardOpen}`)) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (fieldId) el?.focus({ preventScroll: true });
    }));
  }, []);

  // Launch checklist — mirrors the publish gates so first-time owners can see
  // what's missing before they hit Publish (instead of error-by-error). Each
  // unmet item deep-links to the tab/card/field where it gets fixed.
  const hasLiveSection =
    (siteContent.services.enabled && siteContent.services.items.some((svc) => svc.title.trim())) ||
    (siteContent.howItWorks.enabled && siteContent.howItWorks.steps.some((step) => step.title.trim())) ||
    (siteContent.showcase.enabled && siteContent.showcase.items.length > 0) ||
    (siteContent.faqs.enabled && siteContent.faqs.items.some((faq) => faq.question.trim() && faq.answer.trim())) ||
    (siteContent.testimonials.enabled && siteContent.testimonials.items.some((item) => item.text.trim())) ||
    (siteContent.serviceAreas.enabled && siteContent.serviceAreas.cities.some((city) => city.trim())) ||
    (siteContent.certifications.enabled && siteContent.certifications.items.some((item) => item.label.trim())) ||
    (siteContent.stats.enabled && siteContent.stats.items.some((item) => item.label.trim())) ||
    (siteContent.beforeAfter.enabled && siteContent.beforeAfter.items.some((pair) => pair.beforeUrl && pair.afterUrl)) ||
    (siteContent.blog.enabled && publishedPostCount > 0);

  const launchChecklist = [
    { label: 'Company name', done: Boolean(site.company_name.trim()), hint: 'Business tab — Business basics', go: () => jumpTo('business', 'basics', 'bf-company') },
    { label: 'Phone number', done: Boolean(site.phone), hint: 'Business tab — powers the call buttons', go: () => jumpTo('business', 'contactInfo', 'bf-phone') },
    { label: 'Hero image', done: Boolean(site.hero_url), hint: 'Design tab — Hero photos', go: () => jumpTo('design', 'heroPhotos') },
    { label: 'Web address', done: Boolean(site.subdomain) || Boolean(site.custom_domain && domainStatus === 'verified'), hint: 'Add a subdomain below, or verify a custom domain', go: () => jumpTo('publish', null, 'pub-subdomain') },
    { label: 'At least one content section', done: hasLiveSection, hint: 'Your page tab — e.g. Services or FAQs', go: () => jumpTo('page', 'services') },
    { label: 'Google listing filled in', done: Boolean((site.seo_title || '').trim() || (site.seo_description || '').trim()), hint: 'Business tab — How you show up on Google', go: () => jumpTo('business', 'seo', 'bf-seo-title') },
  ];

  const handleChange = useCallback((field: keyof Site, value: Site[keyof Site]) => {
    setSite((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
    setMessage(null);
    if (field === 'subdomain') setSubdomainStatus('idle');
    if (field === 'custom_domain') setDomainStatus('idle');
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  }, []);

  // Manual tab navigation (tab click / arrow keys): switch tabs and open that
  // tab's default card so users land on something actionable (Design → Theme,
  // Business → Business basics) instead of a wall of collapsed cards.
  const goToTab = useCallback((id: BuilderTab) => {
    setActiveTab(id);
    const defaultSection = TAB_DEFAULT_SECTION[id];
    if (defaultSection) setOpenSection(defaultSection);
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    function confirmLinkNavigation(event: MouseEvent) {
      if (!isDirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const link = target?.closest('a');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.href === window.location.href || nextUrl.hash && nextUrl.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved website changes. Leave without saving?')) event.preventDefault();
    }
    document.addEventListener('click', confirmLinkNavigation, true);
    return () => document.removeEventListener('click', confirmLinkNavigation, true);
  }, [isDirty]);

  // Record history on every site change (except ones applied by undo/redo).
  // Runs post-commit, so prevSiteRef always holds the state BEFORE this change.
  useEffect(() => {
    if (site === prevSiteRef.current) return;
    if (historyNavRef.current) {
      historyNavRef.current = false;
      prevSiteRef.current = site;
      return;
    }
    const history = historyRef.current;
    const now = Date.now();
    if (now - lastEditAtRef.current > 800) {
      history.past.push(prevSiteRef.current);
      if (history.past.length > 50) history.past.shift();
      setHistoryVersion((version) => version + 1);
    }
    if (history.future.length) history.future = [];
    lastEditAtRef.current = now;
    prevSiteRef.current = site;
  }, [site]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(prevSiteRef.current);
    historyNavRef.current = true;
    lastEditAtRef.current = 0;
    setSite(previous);
    setIsDirty(true);
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past.push(prevSiteRef.current);
    historyNavRef.current = true;
    lastEditAtRef.current = 0;
    setSite(next);
    setIsDirty(true);
    setHistoryVersion((version) => version + 1);
  }, []);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      try {
        const updated = await updateSiteAction(siteUpdates(site));
        setSite(updated);
        setIsDirty(false);
        setMessage({ type: 'success', text: 'Website changes saved.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save changes.' });
      }
    });
  }, [site]);

  // Per-item Save: collapse the editor and persist the whole draft.
  const saveItem = useCallback(() => {
    setEditingItemId(null);
    handleSave();
  }, [handleSave]);

  // Ctrl/Cmd+S saves instead of triggering the browser's save-page dialog;
  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) step the builder history.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (isDirty && !isPending) handleSave();
      } else if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isDirty, isPending, handleSave, undo, redo]);

  // Click-to-edit: the preview iframe posts which region was clicked; jump to
  // the matching tab, open the matching section card, and focus the field.
  useEffect(() => {
    const SECTION_TARGETS: Record<string, string> = {
      'our-services': 'services',
      'how-it-works': 'howItWorks',
      showcase: 'showcase',
      reviews: 'testimonials',
      faqs: 'faqs',
      blog: 'blog',
      areas: 'serviceAreas',
      certifications: 'certifications',
      stats: 'stats',
      'before-after': 'beforeAfter',
      announcement: 'announcement',
      quoteForm: 'quoteForm',
      estimate: 'estimate',
      contact: 'quoteForm',
      whyUs: 'whyUs',
      workGallery: 'workGallery',
      projectShowcase: 'projectShowcase',
    };

    function onEditRequest(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'lgq:edit-request') return;
      const target = String(event.data.target || '');

      const focusField = (id: string) => {
        // Double rAF: the tab's panel must render before the field exists.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = document.getElementById(id) as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus({ preventScroll: true });
        }));
      };

      const flashCard = (fieldKey: string, scrollId: string) => {
        setFlashField(fieldKey);
        setTimeout(() => setFlashField((current) => (current === fieldKey ? null : current)), 1600);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
      };

      // Business fields live inside collapsible cards, so the owning card must
      // open before focusField can find the input.
      if (target === 'hero') { setActiveTab('business'); setOpenSection('message'); focusField('bf-headline'); return; }
      if (target === 'identity') { setActiveTab('business'); setOpenSection('basics'); focusField('bf-company'); return; }
      if (target === 'heroBadge') { setActiveTab('design'); setOpenSection('heroBadges'); flashCard('heroBadge', 'design-hero-badge'); return; }
      // Every photo opens the "Replace photo" popup, routed by what was clicked.
      if (target === 'heroImage') { setPicker({ label: 'the hero image', kind: 'hero' }); return; }
      if (target === 'logo') { setPicker({ label: 'your logo', kind: 'logo' }); return; }
      if (target.startsWith('image-')) {
        const slot = target.slice('image-'.length);
        setPicker({ label: IMAGE_SLOT_LABELS[slot] || 'this photo', kind: 'slot', slot });
        return;
      }
      if (target.startsWith('baimg-')) {
        const rest = target.slice('baimg-'.length);
        const side = rest.endsWith('-before') ? 'before' : 'after';
        const baItemId = rest.slice(0, rest.length - side.length - 1);
        setPicker({ label: side === 'before' ? 'the before photo' : 'the after photo', kind: 'beforeAfter', baItemId, baSide: side });
        return;
      }
      if (target.startsWith('showcase-')) {
        setPicker({ label: 'this showcase photo', kind: 'showcase', scItemId: target.slice('showcase-'.length) });
        return;
      }
      const section = SECTION_TARGETS[target];
      if (section) {
        // Every SECTION_TARGETS card lives on the "Your page" tab. If a card
        // ever moves to another tab, route it explicitly above instead.
        setActiveTab('page');
        setOpenSection(section);
        requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`.${styles.sectionCardOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
      }
    }

    window.addEventListener('message', onEditRequest);
    return () => window.removeEventListener('message', onEditRequest);
  }, []);


  const handleTestimonialImageUpload = useCallback((testimonialId: string, file: File) => {
    setUploadingTestimonialId(testimonialId);
    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressImage(file, 1400, 0.82);
        const formData = new FormData();
        formData.set('image', compressed);
        const image = await uploadSiteImageAction(formData);
        setSiteImages((current) => [image, ...current]);
        setSite((current) => {
          const content = getSiteContent(current.content);
          return { ...current, content: mergeSiteContent(current.content, { testimonials: { ...content.testimonials, items: content.testimonials.items.map((t) => t.id === testimonialId ? { ...t, imageUrl: image.url, imageAlt: t.imageAlt || t.author || 'Customer review image' } : t) } }) };
        });
        setIsDirty(true);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not upload that image. Please try another.' });
      } finally {
        setUploadingTestimonialId(null);
      }
    });
  }, []);

  const handleBlogCoverUpload = useCallback((postId: string, file: File) => {
    setUploadingCoverId(postId);
    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressImage(file, 1600, 0.82);
        const formData = new FormData();
        formData.set('image', compressed);
        const image = await uploadSiteImageAction(formData);
        setSiteImages((current) => [image, ...current]);
        setSite((current) => {
          const content = getSiteContent(current.content);
          return { ...current, content: mergeSiteContent(current.content, { blog: { ...content.blog, posts: content.blog.posts.map((p) => p.id === postId ? { ...p, coverImage: image.url } : p) } }) };
        });
        setIsDirty(true);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not upload that image. Please try another.' });
      } finally {
        setUploadingCoverId(null);
      }
    });
  }, []);

  const handleGenerateBlogDraft = useCallback(() => {
    setIsGeneratingBlog(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const draft = await generateBlogPostAction(blogTopic.trim() || undefined);
        setSite((current) => {
          const content = getSiteContent(current.content);
          // Unique slug among existing posts so /blog/[slug] never collides.
          const slugBase = slugifyBlogTitle(draft.title) || 'post';
          const existing = new Set(content.blog.posts.map((p) => p.slug));
          let slug = slugBase;
          let n = 2;
          while (existing.has(slug)) slug = `${slugBase}-${n++}`;
          const post = {
            id: createContentId('post'),
            slug,
            title: draft.title,
            excerpt: draft.excerpt,
            body: draft.body,
            coverImage: '',
            status: 'draft' as const,
            date: new Date().toISOString().slice(0, 10),
          };
          return { ...current, content: mergeSiteContent(current.content, { blog: { ...content.blog, enabled: true, posts: [post, ...content.blog.posts] } }) };
        });
        setIsDirty(true);
        setBlogTopic('');
        setMessage({ type: 'success', text: 'Draft created — review and edit it, then flip it to Published when you’re happy. Nothing goes live until you publish.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to generate a draft.' });
      } finally {
        setIsGeneratingBlog(false);
      }
    });
  }, [blogTopic]);

  const handleGenerateText = useCallback(() => {
    const hasExistingText = Boolean(site.headline || site.tagline || site.seo_title || site.seo_description);
    if (hasExistingText && !window.confirm('This replaces your headline, tagline, SEO, hours, and service area, and fills the Services, FAQs, and Service-area sections with fresh AI examples. Testimonials and stats are generated too but left OFF until you replace them with real ones. Continue?')) {
      return;
    }
    setIsGeneratingText(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const generated = await generateSiteTextAction({ trade: getSiteContent(site.content).trade, companyName: site.company_name, serviceArea: site.service_area ?? undefined });
        setSite((current) => {
          const content = getSiteContent(current.content);
          const contentUpdates: Partial<NormalizedSiteContent> = {};
          if (generated.services.length) {
            contentUpdates.services = { enabled: true, title: content.services.title || 'Our services', intro: '', items: generated.services.map((s, i) => ({ id: `svc-${i + 1}`, icon: s.icon, title: s.title, description: s.description })) };
          }
          if (generated.faqs.length) {
            contentUpdates.faqs = { enabled: true, title: content.faqs.title || 'Frequently asked questions', items: generated.faqs.map((f, i) => ({ id: `faq-${i + 1}`, question: f.question, answer: f.answer })) };
          }
          if (generated.cities.length) {
            contentUpdates.serviceAreas = { enabled: true, title: content.serviceAreas.title || 'Areas we serve', intro: content.serviceAreas.intro, cities: generated.cities };
          }
          // Testimonials + stats seeded but left OFF — no fabricated review/number
          // publishes until the contractor swaps in real ones and enables them.
          if (generated.testimonials.length) {
            contentUpdates.testimonials = { ...content.testimonials, enabled: false, title: content.testimonials.title || 'What homeowners say', sourceMode: 'manual', items: generated.testimonials.map((t, i) => ({ id: `tst-${i + 1}`, author: t.author, text: t.text, rating: t.rating, label: t.label, imageUrl: '', imageAlt: '' })) };
          }
          if (generated.stats.length) {
            contentUpdates.stats = { enabled: false, title: content.stats.title || 'By the numbers', items: generated.stats.map((s, i) => ({ id: `stat-${i + 1}`, value: s.value, prefix: '', suffix: s.suffix, label: s.label })) };
          }
          // Fold in auto-selected stock photos (hero, slots, gallery), preserving
          // any images the owner already set.
          const stock = applyStockImages(current, generated.images);
          if (stock) Object.assign(contentUpdates, stock.contentUpdates);
          return {
            ...current,
            headline: generated.headline || current.headline,
            tagline: generated.tagline || current.tagline,
            seo_title: generated.seo_title || current.seo_title,
            seo_description: generated.seo_description || current.seo_description,
            hours: generated.hours || current.hours,
            service_area: generated.service_area || current.service_area,
            hero_url: stock ? stock.heroUrl : current.hero_url,
            content: mergeSiteContent(current.content, contentUpdates),
          };
        });
        setIsDirty(true);
        const imagesNote = generated.images.ok
          ? ' Trade-relevant stock photos are added — replace any with your own anytime.'
          : generated.images.configured
            ? ' We couldn’t load stock photos right now — add your own, or use “Regenerate stock images” to retry.'
            : '';
        setMessage({ type: 'success', text: `Full example site generated — headline, services, FAQs, and your Google listing (SEO) are all filled in.${imagesNote} Testimonials & stats stay off until you add real ones. Then publish!` });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to generate example content.' });
      } finally {
        setIsGeneratingText(false);
      }
    });
  }, [site.headline, site.tagline, site.seo_title, site.seo_description, site.content, site.company_name, site.service_area]);

  // Regenerate only the SEO title + description from the contractor's real data
  // (no AI/API needed). Each click rotates to a different valid variation and
  // leaves every other field untouched, so manual edits elsewhere are kept.
  const handleRegenerateSeo = useCallback(() => {
    setIsRegeneratingSeo(true);
    setMessage(null);
    startTransition(async () => {
      try {
        seoVariantRef.current += 1;
        const { seo_title, seo_description } = await regenerateSeoCopyAction(seoVariantRef.current);
        setSite((current) => ({ ...current, seo_title, seo_description }));
        setIsDirty(true);
        setMessage({ type: 'success', text: 'Fresh SEO title and description written from your business details. Edit them anytime, then save.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not regenerate SEO text right now.' });
      } finally {
        setIsRegeneratingSeo(false);
      }
    });
  }, []);

  // Re-pick trade-relevant stock photos for every image role. Confirms first
  // (it changes several visible sections), keeps the owner's uploads, and only
  // replaces images that are currently stock or empty.
  const handleRegenerateStockImages = useCallback(() => {
    if (!window.confirm('Replace the automatically chosen stock photos across your site with a fresh set? Your own uploaded photos are kept.')) return;
    setIsRegeneratingImages(true);
    setMessage(null);
    startTransition(async () => {
      try {
        imageNonceRef.current += 1;
        const images = await regenerateStockImagesAction(imageNonceRef.current);
        if (!images.ok) {
          setMessage({ type: 'error', text: images.configured ? 'Couldn’t load stock photos right now. Please try again in a moment.' : 'Stock photos aren’t set up yet. Add a PEXELS_API_KEY to enable them.' });
          return;
        }
        setSite((current) => {
          const stock = applyStockImages(current, images);
          if (!stock) return current;
          return { ...current, hero_url: stock.heroUrl, content: mergeSiteContent(current.content, stock.contentUpdates) };
        });
        setIsDirty(true);
        setMessage({ type: 'success', text: 'Fresh stock photos selected across your site. Your uploaded photos were kept. Save to publish the changes.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not regenerate stock images right now.' });
      } finally {
        setIsRegeneratingImages(false);
      }
    });
  }, []);

  // When a photo is picked from the "Replace photo" popup, keep content.stockImages
  // in sync so attribution stays accurate: record a Pexels pick (with credit),
  // or drop a single-slot's prior attribution when it's replaced by an upload.
  const recordPickedStock = useCallback((ctx: { kind: string; slot?: string }, image: SiteImage, pexels?: PexelsPickPhoto) => {
    setSite((current) => {
      const content = getSiteContent(current.content);
      const slot = ctx.kind === 'hero' ? 'hero' : ctx.kind === 'slot' ? ctx.slot : undefined;
      let next = content.stockImages;
      if (pexels) {
        next = next.filter((item) => (slot ? item.slot !== slot : true) && item.imageUrl !== pexels.url);
        const role = ctx.kind === 'hero' ? 'hero' : ctx.kind === 'slot' ? (ctx.slot || 'slot') : (ctx.kind === 'showcase' || ctx.kind === 'project') ? 'gallery' : ctx.kind;
        next = [...next, {
          id: slot ? `pick-${slot}` : `pick-${pexels.providerImageId}`,
          role,
          ...(slot ? { slot } : {}),
          provider: 'pexels' as const,
          providerImageId: pexels.providerImageId,
          sourceUrl: pexels.sourceUrl,
          imageUrl: pexels.url,
          thumbnailUrl: pexels.thumbnailUrl,
          alt: image.alt || pexels.alt,
          photographerName: pexels.photographerName,
          photographerUrl: pexels.photographerUrl,
          width: pexels.width,
          height: pexels.height,
          selectedAutomatically: false,
          selectedAt: new Date().toISOString(),
        }];
      } else if (slot) {
        next = next.filter((item) => item.slot !== slot);
      }
      if (next === content.stockImages) return current;
      return { ...current, content: mergeSiteContent(current.content, { stockImages: next }) };
    });
  }, []);

  const selectHeroImage = useCallback((image: SiteImage) => {
    handleChange('hero_url', image.url);
  }, [handleChange]);

  const toggleGalleryImage = useCallback((image: SiteImage) => {
    const gallery = getSiteGallery(site.content);
    const selected = gallery.some((item) => item.id === image.id);

    if (!selected && gallery.length >= 5) {
      setMessage({ type: 'error', text: 'Choose up to five gallery images.' });
      return;
    }

    const nextGallery = selected
      ? gallery.filter((item) => item.id !== image.id)
      : [...gallery, image];
    handleChange('content', { ...site.content, gallery: nextGallery });
  }, [handleChange, site.content]);

  const updateSiteContent = useCallback((updates: Partial<NormalizedSiteContent>) => {
    handleChange('content', mergeSiteContent(site.content, updates));
  }, [handleChange, site.content]);

  const assignSlotImage = useCallback((slot: string, image: SiteImage) => {
    updateSiteContent({ images: { ...siteContent.images, [slot]: image.url } });
  }, [siteContent.images, updateSiteContent]);

  const resetSlotImage = useCallback((slot: string) => {
    const nextImages = { ...siteContent.images };
    delete nextImages[slot];
    updateSiteContent({ images: nextImages });
  }, [siteContent.images, updateSiteContent]);

  const openPicker = useCallback((label: string, kind: 'hero' | 'logo' | 'slot', slot?: string) => {
    setPicker({ label, kind, slot });
  }, []);

  const addHeroExtraImage = useCallback((image: SiteImage) => {
    updateSiteContent({ heroImages: [...siteContent.heroImages, image.url].slice(0, MAX_EXTRA_HERO_IMAGES) });
  }, [siteContent.heroImages, updateSiteContent]);

  const replaceHeroExtraImage = useCallback((index: number, image: SiteImage) => {
    updateSiteContent({ heroImages: siteContent.heroImages.map((url, itemIndex) => (itemIndex === index ? image.url : url)) });
  }, [siteContent.heroImages, updateSiteContent]);

  const removeHeroExtraImage = useCallback((index: number) => {
    updateSiteContent({ heroImages: siteContent.heroImages.filter((_, itemIndex) => itemIndex !== index) });
  }, [siteContent.heroImages, updateSiteContent]);

  // Move `fromKey` so it lands just before `toKey` in the page order.
  const reorderSections = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const order = siteContent.sectionOrder.filter((key) => key !== fromKey);
    const target = order.indexOf(toKey);
    order.splice(target === -1 ? order.length : target, 0, fromKey);
    updateSiteContent({ sectionOrder: order });
  }, [siteContent.sectionOrder, updateSiteContent]);

  const moveSectionBy = useCallback((key: string, delta: number) => {
    const order = siteContent.sectionOrder.slice();
    const from = order.indexOf(key);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    updateSiteContent({ sectionOrder: order });
  }, [siteContent.sectionOrder, updateSiteContent]);

  const updateShowcase = useCallback((showcase: SiteShowcaseContent) => {
    updateSiteContent({ showcase });
  }, [updateSiteContent]);

  const updateQuoteForm = useCallback((quoteForm: SiteQuoteFormContent) => {
    updateSiteContent({ quoteForm });
  }, [updateSiteContent]);

  const updateEstimateRanges = useCallback((estimateRanges: SiteEstimateRangesContent) => {
    updateSiteContent({ estimateRanges });
  }, [updateSiteContent]);

  const updateLeadFilters = useCallback((leadFilters: SiteLeadFiltersContent) => {
    updateSiteContent({ leadFilters });
  }, [updateSiteContent]);

  const loadJobPhotoOptions = useCallback(() => {
    startTransition(async () => {
      try {
        const photos = await listCompletedJobPhotoOptionsAction();
        setJobPhotoOptions(photos);
        setJobPhotosLoaded(true);
        if (photos.length === 0) setMessage({ type: 'success', text: 'No completed jobs with photos yet.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load completed job photos.' });
      }
    });
  }, []);

  const importJobPhoto = useCallback((photo: JobPhotoImportOption) => {
    startTransition(async () => {
      try {
        const image = await importJobPhotoToSiteImageAction(photo.path, photo.label);
        setSiteImages((current) => [image, ...current]);
        updateShowcase({ ...siteContent.showcase, enabled: true, items: [...siteContent.showcase.items, { ...image, caption: image.alt }] });
        setMessage({ type: 'success', text: 'Job photo imported into your showcase.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import this job photo.' });
      }
    });
  }, [siteContent.showcase, updateShowcase]);

  const updateFaqs = useCallback((faqs: SiteFaqContent) => {
    updateSiteContent({ faqs });
  }, [updateSiteContent]);

  const updateTestimonials = useCallback((testimonials: SiteTestimonialsContent) => {
    updateSiteContent({ testimonials });
  }, [updateSiteContent]);

  const updateStickyCallBar = useCallback((stickyCallBar: SiteStickyCallBarContent) => {
    updateSiteContent({ stickyCallBar });
  }, [updateSiteContent]);

  const updateRatingBadge = useCallback((ratingBadge: SiteRatingBadgeContent) => {
    updateSiteContent({ ratingBadge });
  }, [updateSiteContent]);

  const updateTrustBadges = useCallback((trustBadges: SiteTrustBadgesContent) => {
    updateSiteContent({ trustBadges });
  }, [updateSiteContent]);

  const updateFinancing = useCallback((financing: SiteFinancingContent) => {
    updateSiteContent({ financing });
  }, [updateSiteContent]);

  const updateServiceAreas = useCallback((serviceAreas: SiteServiceAreasContent) => {
    updateSiteContent({ serviceAreas });
  }, [updateSiteContent]);

  const updateCertifications = useCallback((certifications: SiteCertificationsContent) => {
    updateSiteContent({ certifications });
  }, [updateSiteContent]);

  const updateStats = useCallback((stats: SiteStatsContent) => {
    updateSiteContent({ stats });
  }, [updateSiteContent]);

  const updateBeforeAfter = useCallback((beforeAfter: SiteBeforeAfterContent) => {
    updateSiteContent({ beforeAfter });
  }, [updateSiteContent]);

  const setBeforeAfterImage = useCallback((itemId: string, side: 'before' | 'after', image: SiteImage) => {
    updateBeforeAfter({
      ...siteContent.beforeAfter,
      items: siteContent.beforeAfter.items.map((pair) => pair.id !== itemId
        ? pair
        : side === 'before'
          ? { ...pair, beforeUrl: image.url, beforeAlt: image.alt || pair.beforeAlt || 'Before' }
          : { ...pair, afterUrl: image.url, afterAlt: image.alt || pair.afterAlt || 'After' }),
    });
  }, [siteContent.beforeAfter, updateBeforeAfter]);

  const updateAnnouncement = useCallback((announcement: SiteAnnouncementContent) => {
    updateSiteContent({ announcement });
  }, [updateSiteContent]);

  const updateWhyUs = useCallback((whyUs: SiteWhyUsContent) => {
    updateSiteContent({ whyUs });
  }, [updateSiteContent]);


  const updateServices = useCallback((services: SiteServicesContent) => {
    updateSiteContent({ services });
  }, [updateSiteContent]);

  const updateHowItWorks = useCallback((howItWorks: SiteHowItWorksContent) => {
    updateSiteContent({ howItWorks });
  }, [updateSiteContent]);

  const updateBlog = useCallback((blog: SiteBlogContent) => {
    updateSiteContent({ blog });
  }, [updateSiteContent]);

  const replaceShowcaseImage = useCallback((itemId: string | null, image: SiteImage) => {
    const current = siteContent.showcase.items;
    // itemId null → append (the "Add photo" flow); otherwise swap that tile in
    // place, keeping its position and dropping any other copy of the picked image.
    if (!itemId) {
      if (current.length >= 9) {
        setMessage({ type: 'error', text: 'Choose up to nine showcase images.' });
        return;
      }
      updateShowcase({ ...siteContent.showcase, enabled: true, items: [...current, { ...image, caption: image.alt }] });
      return;
    }
    const index = current.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const next = current.slice();
    next[index] = { ...image, caption: image.alt };
    const items = next.filter((item, itemIndex) => itemIndex === index || item.id !== image.id);
    updateShowcase({ ...siteContent.showcase, items });
  }, [siteContent.showcase, updateShowcase]);

  const updateProjectShowcase = useCallback((projectShowcase: SiteProjectShowcaseContent) => {
    updateSiteContent({ projectShowcase });
  }, [updateSiteContent]);

  // The editable project photos: the owner's own set once they've touched it,
  // otherwise the SAME gallery fallback the template shows (so every photo on
  // screen is an editable tile — Replace via upload/stock, caption). The first
  // edit materializes this fallback into projectShowcase.items.
  const projectBase = useCallback((): SiteShowcaseItem[] => {
    const items = siteContent.projectShowcase.items;
    if (items.length > 0) return items;
    const source = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);
    return source.slice(0, MAX_PROJECT_SHOWCASE_ITEMS).map((img) => ({ id: img.id, url: img.url, alt: img.alt, category: img.category, source: img.source, caption: '' }));
  }, [siteContent.projectShowcase, galleryImages]);

  const replaceProjectImage = useCallback((itemId: string | null, image: SiteImage) => {
    const current = projectBase();
    if (!itemId) {
      if (current.length >= MAX_PROJECT_SHOWCASE_ITEMS) {
        setMessage({ type: 'error', text: `Choose up to ${MAX_PROJECT_SHOWCASE_ITEMS} project photos.` });
        return;
      }
      updateProjectShowcase({ ...siteContent.projectShowcase, enabled: true, items: [...current, { ...image, caption: image.alt }] });
      return;
    }
    const index = current.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const next = current.slice();
    next[index] = { ...image, caption: image.alt };
    const items = next.filter((item, itemIndex) => itemIndex === index || item.id !== image.id);
    updateProjectShowcase({ ...siteContent.projectShowcase, enabled: true, items });
  }, [siteContent.projectShowcase, projectBase, updateProjectShowcase]);

  const importJobPhotoToProject = useCallback((photo: JobPhotoImportOption) => {
    const base = projectBase();
    if (base.length >= MAX_PROJECT_SHOWCASE_ITEMS) {
      setMessage({ type: 'error', text: `Choose up to ${MAX_PROJECT_SHOWCASE_ITEMS} project photos.` });
      return;
    }
    startTransition(async () => {
      try {
        const image = await importJobPhotoToSiteImageAction(photo.path, photo.label);
        setSiteImages((current) => [image, ...current]);
        updateProjectShowcase({ ...siteContent.projectShowcase, enabled: true, items: [...projectBase(), { ...image, caption: image.alt }] });
        setMessage({ type: 'success', text: 'Job photo imported into your project showcase.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import this job photo.' });
      }
    });
  }, [siteContent.projectShowcase, projectBase, updateProjectShowcase]);

  // The tiles the Project-showcase editor renders — real items or the gallery
  // fallback shown as editable placeholders (see projectBase).
  const projectPhotos = projectBase();

  const checkSubdomain = useCallback(() => {
    const subdomain = site.subdomain?.trim().toLowerCase();
    if (!subdomain || !/^[a-z0-9-]{3,32}$/.test(subdomain)) {
      setMessage({ type: 'error', text: 'Use 3-32 lowercase letters, numbers, or hyphens.' });
      return;
    }

    startTransition(async () => {
      try {
        const available = await checkSubdomainAvailableAction(subdomain);
        setSubdomainStatus(available ? 'available' : 'taken');
        setMessage(available
          ? { type: 'success', text: `${subdomain}.${ROOT_DOMAIN} is available.` }
          : { type: 'error', text: 'That subdomain is already in use.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to check this subdomain.' });
      }
    });
  }, [site.subdomain]);

  const handlePublish = useCallback(() => {
    const nextPublished = !site.published;
    if (nextPublished && !site.company_name.trim()) {
      setActiveTab('business');
      setOpenSection('basics');
      setMessage({ type: 'error', text: 'Add a company name on the Business tab before publishing.' });
      return;
    }
    if (nextPublished && !site.subdomain && (!site.custom_domain || domainStatus !== 'verified')) {
      setMessage({ type: 'error', text: 'Add a letsgetquoted.com subdomain or verify your custom domain before publishing.' });
      return;
    }

    startTransition(async () => {
      try {
        const saved = await updateSiteAction(siteUpdates(site));
        await publishSiteAction(nextPublished);
        setSite({ ...saved, published: nextPublished });
        setIsDirty(false);
        setMessage({ type: 'success', text: nextPublished ? 'Your website is live.' : 'Your website is now private.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update publishing.' });
      }
    });
  }, [domainStatus, site]);

  const verifyCustomDomain = useCallback(() => {
    if (!site.custom_domain) {
      setMessage({ type: 'error', text: 'Enter a custom domain first.' });
      return;
    }
    setDomainStatus('checking');
    startTransition(async () => {
      try {
        const saved = await updateSiteAction(siteUpdates(site));
        const result = await verifyCustomDomainAction(site.custom_domain!);
        setSite(saved);
        if (result.verified) {
          setDomainStatus('verified');
          setIsDirty(false);
          setMessage({ type: 'success', text: 'Custom domain verified and connected.' });
        } else {
          setDomainStatus('unverified');
          setMessage({ type: 'error', text: result.records.length ? `DNS currently points to ${result.records.join(', ')}.` : 'No matching DNS record found yet. DNS changes can take up to 48 hours.' });
        }
      } catch (error) {
        setDomainStatus('unverified');
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to verify this domain.' });
      }
    });
  }, [site]);

  const rootDomain = ROOT_DOMAIN;
  const liveDomain =
    site.custom_domain && domainStatus === 'verified'
      ? site.custom_domain
      : site.subdomain
        ? `${site.subdomain}.${rootDomain}`
        : null;
  const liveUrl =
    site.custom_domain && domainStatus === 'verified'
      ? `https://${site.custom_domain}`
      : site.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null;

  return (
    <main className={styles.builderShell}>
      {isGeneratingText && (
        <div className={styles.generatingOverlay} role="alert" aria-busy="true">
          <div className={styles.generatingCard}>
            <span className={styles.generatingSpinner} aria-hidden="true" />
            <strong>Creating your tailored Website…</strong>
            <small>Writing your headline, services, and FAQs, then picking photos for your trade. This takes about 10 seconds.</small>
          </div>
        </div>
      )}
      <header className={styles.builderHeader}>
        <div>
          <p className={styles.builderEyebrow}>Website builder</p>
          <h1>{site.company_name || 'Your contractor website'}</h1>
          <span className={styles.saveStatus}>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
          {site.published && liveUrl && liveDomain ? (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={styles.liveStatusLink}>
              <span className={styles.liveStatusDot} aria-hidden="true" />
              Website LIVE @ {liveDomain}
            </a>
          ) : null}
        </div>
        <div className={styles.builderActions}>
          <button type="button" className="btn secondary" onClick={undo} disabled={historyRef.current.past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo last change">↩ Undo</button>
          <button type="button" className="btn secondary" onClick={redo} disabled={historyRef.current.future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo change">↪ Redo</button>
          <a href="/dashboard/sites/preview" target="_blank" rel="noopener noreferrer" className="btn secondary">Open full preview</a>
          <button type="button" className="btn primary" onClick={handleSave} disabled={isPending || !isDirty}>{isPending ? 'Saving...' : 'Save changes'}</button>
        </div>
      </header>

      {message && <div className={`${styles.notice} ${message.type === 'error' ? styles.errorNotice : styles.successNotice}`} role="status">{message.text}</div>}

      <div className={styles.builderGrid}>
        <section className={styles.editorPanel}>
          <div
            className={styles.builderTabs}
            role="tablist"
            aria-label="Website settings"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = TABS.findIndex((tab) => tab.id === activeTab);
              const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
              goToTab(next.id);
              document.getElementById(`builder-tab-${next.id}`)?.focus();
            }}
          >
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                id={`builder-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="builder-tabpanel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? styles.activeBuilderTab : undefined}
                onClick={() => goToTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent} id="builder-tabpanel" role="tabpanel" aria-labelledby={`builder-tab-${activeTab}`}>
            {activeTab === 'business' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}>
                  <h2>Business information</h2>
                  <p>Who you are — the facts and words your whole website pulls from.</p>
                </div>

                <SectionCard title="Business basics" description="Your company name and trade power everything else — including the AI quick-start below." open={openSection === 'basics'} onToggleOpen={() => toggleSection('basics')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Company name</span><input id="bf-company" value={site.company_name} onChange={(event) => handleChange('company_name', event.target.value)} /></label>
                    <label className={styles.formField}><span>Field of work / trade</span><input value={siteContent.trade} onChange={(event) => updateSiteContent({ trade: event.target.value })} placeholder="e.g. Window cleaning, roofing, HVAC" /></label>
                  </div>
                  <button type="button" className="btn secondary" onClick={handleGenerateText} disabled={isGeneratingText}>
                    {isGeneratingText ? 'Creating your tailored Website...' : '✨ Generate a full example site with AI'}
                  </button>
                  <small className={styles.fieldHint}>Fills in your whole site — headline, services, FAQs, Google listing, and more — from these two fields. Watch it appear in the preview. Testimonials and stats are generated too, but left off until you swap in your real ones.</small>
                </SectionCard>

                <SectionCard title="Your message" description="The big text visitors see first at the top of your page." hint={site.headline ? `“${site.headline.length > 46 ? `${site.headline.slice(0, 46).trimEnd()}…` : site.headline}”` : undefined} open={openSection === 'message'} onToggleOpen={() => toggleSection('message')}>
                  <label className={styles.formField}><span>Headline</span><textarea id="bf-headline" rows={2} value={site.headline || ''} onChange={(event) => handleChange('headline', event.target.value || null)} placeholder="Built with purpose. Finished with care." /></label>
                  <label className={styles.formField}><span>Tagline</span><textarea id="bf-tagline" rows={3} value={site.tagline || ''} onChange={(event) => handleChange('tagline', event.target.value || null)} placeholder="Tell homeowners what makes your business different." /></label>
                </SectionCard>

                <SectionCard title="Contact & credentials" description="How homeowners reach you, and the license that backs your work." open={openSection === 'contactInfo'} onToggleOpen={() => toggleSection('contactInfo')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Phone</span><input id="bf-phone" type="tel" value={site.phone || ''} onChange={(event) => handleChange('phone', event.target.value || null)} placeholder="(555) 123-4567" /></label>
                    <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.phonePublic} onChange={(event) => updateSiteContent({ phonePublic: event.target.checked })} /><span><strong>Show my phone number on my website</strong><small>Off = your number stays private and every call button disappears — visitors reach you through the forms instead. Texting still works either way.</small></span></label>
                    <label className={styles.formField}><span>License</span><input value={site.license || ''} onChange={(event) => handleChange('license', event.target.value || null)} placeholder="LIC #123456" /></label>
                  </div>
                </SectionCard>

                <SectionCard title="Where & when" description="The area you cover and the hours you work." open={openSection === 'whereWhen'} onToggleOpen={() => toggleSection('whereWhen')}>
                  <label className={styles.formField}><span>Service area</span><input value={site.service_area || ''} onChange={(event) => handleChange('service_area', event.target.value || null)} placeholder="City and surrounding communities" /></label>
                  <label className={styles.formField}><span>Business hours</span><input value={site.hours || ''} onChange={(event) => handleChange('hours', event.target.value || null)} placeholder="Monday-Friday, 7am-5pm" /></label>
                </SectionCard>

                <SectionCard title="How you show up on Google" description="The page title and description searchers see before they click. Your hero image is used when your site is shared on social." open={openSection === 'seo'} onToggleOpen={() => toggleSection('seo')}>
                  <div className={styles.googleSnippet}>
                    <span className={styles.googleSnippetUrl}>{liveDomain || `${site.subdomain || 'your-business'}.${ROOT_DOMAIN}`}</span>
                    <strong className={styles.googleSnippetTitle}>{site.seo_title || site.company_name || 'Your company name'}</strong>
                    <p className={styles.googleSnippetDesc}>{site.seo_description || site.tagline || 'Your description appears here — one sentence on what you do and where.'}</p>
                  </div>
                  <div className={styles.seoActions}>
                    <small className={styles.fieldHint}>A live preview of how your site can appear in Google. Edit either field, or let us write it from your business details.</small>
                    <button type="button" className={styles.secondaryAction} onClick={handleRegenerateSeo} disabled={isRegeneratingSeo}>{isRegeneratingSeo ? 'Writing…' : '✨ Regenerate SEO text'}</button>
                  </div>
                  <label className={styles.formField}>
                    <span>SEO page title</span>
                    <input id="bf-seo-title" maxLength={SEO_TITLE_LIMIT + 20} value={site.seo_title || ''} onChange={(event) => handleChange('seo_title', event.target.value || null)} placeholder={site.company_name || 'Your business, service and city'} />
                    <small className={(site.seo_title || '').length > SEO_TITLE_LIMIT ? styles.counterOver : undefined}>{(site.seo_title || '').length}/{SEO_TITLE_LIMIT} characters{(site.seo_title || '').length > SEO_TITLE_LIMIT ? ' — a bit long; Google may trim it' : ''}</small>
                  </label>
                  <label className={styles.formField}>
                    <span>Meta description</span>
                    <textarea id="bf-seo-description" rows={3} maxLength={SEO_DESC_LIMIT + 40} value={site.seo_description || ''} onChange={(event) => handleChange('seo_description', event.target.value || null)} placeholder={site.tagline || 'One sentence on what you do, where, and how customers book.'} />
                    <small className={(site.seo_description || '').length > SEO_DESC_LIMIT ? styles.counterOver : undefined}>{(site.seo_description || '').length}/{SEO_DESC_LIMIT} characters{(site.seo_description || '').length > SEO_DESC_LIMIT ? ' — a bit long; Google may trim it' : ''}</small>
                  </label>
                </SectionCard>
              </div>
            )}

            {activeTab === 'design' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}>
                  <h2>Design</h2>
                  <p>How your website looks, site-wide — theme, colors, logo, and hero photos.</p>
                </div>

                <SectionCard title="Theme" description="Pick the overall look your website is built on. Everything you've filled in carries over when you switch." open={openSection === 'theme'} onToggleOpen={() => toggleSection('theme')}>
                  <div className={styles.themeGrid}>
                    {AVAILABLE_TEMPLATES.map((template) => (
                      <button type="button" key={template.id} className={`${styles.themeOption}${site.template === template.id ? ` ${styles.selectedTheme}` : ''}`} onClick={() => handleChange('template', template.id as TemplateType)} aria-pressed={site.template === template.id}>
                        <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} />
                        <span className={styles.themeOptionInfo}><strong>{template.name}</strong></span>
                      </button>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Colors & fonts" description="Accent color, light or dark mode, headings, and button style." open={openSection === 'colors'} onToggleOpen={() => toggleSection('colors')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Accent color</span><div className={styles.colorControl}><input type="color" value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /><input value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /></div></label>
                    <label className={styles.formField}><span>Color mode</span><select value={site.portal_mode} onChange={(event) => handleChange('portal_mode', event.target.value as Site['portal_mode'])}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                  </div>
                  <div className={styles.formField}>
                    <span>Preset color schemes</span>
                    <div className={styles.accentSwatches} role="group" aria-label="Preset accent colors">
                      {ACCENT_PRESETS.map((preset) => {
                        const selected = (site.accent_override || '').toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            type="button"
                            className={`${styles.accentSwatch}${selected ? ` ${styles.accentSwatchActive}` : ''}`}
                            style={{ background: preset.hex }}
                            onClick={() => handleChange('accent_override', preset.hex)}
                            title={preset.name}
                            aria-label={`${preset.name}${selected ? ' (selected)' : ''}`}
                            aria-pressed={selected}
                          />
                        );
                      })}
                    </div>
                    <small className={styles.fieldHint}>Pick a scheme or a custom color above — button and badge text auto-adjusts to stay readable on any accent.</small>
                  </div>
                  <label className={styles.formField}><span>Heading font</span><select value={site.header_font || ''} onChange={(event) => handleChange('header_font', event.target.value || null)}>
                    <option value="">Theme default</option>
                    {HEADING_FONT_OPTIONS.map((font) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
                  </select></label>
                  <label className={styles.formField}><span>Button style</span><select value={site.button_style || 'solid'} onChange={(event) => handleChange('button_style', event.target.value)}><option value="solid">Solid</option><option value="outline">Outline</option><option value="ghost">Minimal</option></select></label>
                </SectionCard>

                <SectionCard title="Hero badges" description="The floating trust chips on and beside your hero photo." open={openSection === 'heroBadges'} onToggleOpen={() => toggleSection('heroBadges')}>
                  <div className={`${styles.formField}${flashField === 'heroBadge' ? ` ${styles.fieldFlash}` : ''}`} id="design-hero-badge">
                    <span>Hero badge</span>
                    <select value={siteContent.heroBadge.preset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, preset: event.target.value } })}>{HERO_BADGE_PRESETS.map((badge) => <option key={badge.key} value={badge.key}>{badge.title}</option>)}<option value="custom">Custom badge…</option><option value="none">No badge</option></select>
                    <small className={styles.fieldHint}>The floating trust chip on your hero photo (Fixit, Shine, Coat &amp; more).</small>
                    {siteContent.heroBadge.preset === 'custom' && (
                      <input value={siteContent.heroBadge.customLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customLabel: event.target.value } })} placeholder="e.g. Clear Quotes. Quality Work." />
                    )}
                  </div>
                  <label className={styles.formField}><span>Badge style</span><select value={siteContent.heroBadge.style} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, style: event.target.value } })}>{HERO_BADGE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                  <div className={styles.formField}>
                    <span>Extra floating badge</span>
                    <select value={siteContent.heroBadge.secondPreset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondPreset: event.target.value } })}>
                      <option value="default">Template default (e.g. &ldquo;500+ customers&rdquo;)</option>
                      {HERO_BADGE_PRESETS.map((badge) => <option key={`second-${badge.key}`} value={badge.key}>{badge.title}</option>)}
                      <option value="custom">Custom badge…</option>
                      <option value="none">No extra badge</option>
                    </select>
                    <small className={styles.fieldHint}>The second chip beside your hero photo (Shine, Fixit &amp; Guild).</small>
                    {siteContent.heroBadge.secondPreset === 'custom' && (
                      <input value={siteContent.heroBadge.secondCustomLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomLabel: event.target.value } })} placeholder="e.g. Family Owned" />
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Your logo" description="Shown small in your header and footer." open={openSection === 'logo'} onToggleOpen={() => toggleSection('logo')}>
                  <div className={styles.imageSlot}>
                    {site.logo_url
                      ? <div className={styles.logoPreviews}><div className={styles.logoPreview}><img src={site.logo_url} alt="Logo on a light header" data-logo-style={siteContent.logoStyle} /><em>Light</em></div><div className={styles.logoPreviewDark}><img src={site.logo_url} alt="Logo on a dark header" data-logo-style={siteContent.logoStyle} /><em>Dark</em></div></div>
                      : <div className={styles.imageSlotEmpty}>No logo yet</div>}
                    <div className={styles.imageSlotActions}>
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('your logo', 'logo')}>{site.logo_url ? 'Replace photo' : 'Add a logo'}</button>
                      {site.logo_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('logo_url', null)}>Remove</button>}
                    </div>
                    <label className={styles.formField}><span>Logo shape</span><select value={siteContent.logoStyle} onChange={(event) => updateSiteContent({ logoStyle: event.target.value })}><option value="plain">Plain (no frame)</option><option value="rounded">Rounded corners</option><option value="framed">Framed chip (padding + border)</option><option value="circle">Circle</option></select><small className={styles.fieldHint}>Add a rounded frame or chip so a boxy logo blends into the header.</small></label>
                    <small className={styles.fieldHint}>Best as a <strong>PNG or SVG with a transparent background</strong> — wide and simple. Aim for ~400×120px; it&apos;s shown up to 70px tall.</small>
                  </div>
                </SectionCard>

                <SectionCard title="Hero photos" description="The big photo at the top of your homepage, plus optional extras that cross-fade and reappear further down the page." open={openSection === 'heroPhotos'} onToggleOpen={() => toggleSection('heroPhotos')}>
                  <div className={styles.imageSlot}>
                    <div className={styles.imageSlotHead}><strong>Hero image</strong><small>The big photo at the top of your homepage.</small></div>
                    {site.hero_url
                      ? <div className={styles.heroSlotPreview}><img src={site.hero_url} alt="Current hero image" /></div>
                      : <div className={styles.imageSlotEmpty}>No hero image yet</div>}
                    <div className={styles.imageSlotActions}>
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('the hero image', 'hero')}>{site.hero_url ? 'Replace photo' : 'Add a hero image'}</button>
                      {site.hero_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('hero_url', null)}>Remove</button>}
                    </div>
                  </div>
                  <div className={styles.formField}>
                    <span>Extra hero photos <em className={styles.fieldOptional}>optional</em></span>
                    {siteContent.heroImages.length > 0 && (
                      <div className={styles.imageSlots}>
                        {siteContent.heroImages.map((url, index) => (
                          <div key={`${index}-${url}`} className={styles.imageSlot}>
                            <div className={styles.heroSlotPreview}><img src={url} alt={`Extra hero photo ${index + 2}`} /></div>
                            <div className={styles.imageSlotActions}>
                              <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: `hero photo ${index + 2}`, kind: 'heroExtra', heroExtraIndex: index })}>Replace</button>
                              <button type="button" className={styles.secondaryAction} onClick={() => removeHeroExtraImage(index)}>Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {siteContent.heroImages.length < MAX_EXTRA_HERO_IMAGES && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'an extra hero photo', kind: 'heroExtra' })}>Add hero photo</button>}
                    <small className={styles.fieldHint}>Add up to {MAX_EXTRA_HERO_IMAGES} more. They cross-fade with your hero image and reappear as parallax bands further down the page.</small>
                  </div>
                  <div className={styles.stockBlock}>
                    <div>
                      <strong>Stock photos</strong>
                      <p className={styles.fieldHint}>Representative stock photos from Pexels. Replace any one with a photo of your own work anytime. This picks a fresh set for every image on your site and keeps your uploads.</p>
                    </div>
                    <button type="button" className={styles.secondaryAction} onClick={handleRegenerateStockImages} disabled={isRegeneratingImages}>{isRegeneratingImages ? 'Finding photos…' : '✨ Regenerate all stock images'}</button>
                  </div>
                </SectionCard>

                <p className={styles.movedNote}>Looking for your page&apos;s sections? They moved to <strong>Your page</strong>.</p>
              </div>
            )}

            {activeTab === 'page' && (
              <div className={styles.formSection}>
                <div className={styles.cardGroupLabel}>Get you leads</div>
                <p className={styles.cardGroupHint}>Pick ONE way to capture a job — Smart Intake (recommended) or the classic quote form below. Running both means visitors fill out both and you get doubled-up requests.</p>

                <div className={styles.aiSuite}>
                <SectionCard variant="featured" title="Smart Intake with Instant Estimates via AI (Recommended)" description="Gives visitors an automatic ballpark price, no waiting — our AI asks a couple of questions to scope the job, then prices it for your trade and shows a realistic $ range. Every request still reaches you as a lead, with the shown range included." evidence="Instant online estimates capture 2–3× more leads than a plain contact form — most homeowners are price-shopping, and the ones who see a number stop searching. Answering while they're still on the page beats a next-day callback every time." enabled={siteContent.estimateRanges.enabled} onToggleEnabled={(value) => updateEstimateRanges({ ...siteContent.estimateRanges, enabled: value })} open={openSection === 'estimate'} onToggleOpen={() => toggleSection('estimate')}>
                  <label className={styles.formField}><span>Email on the AI intake</span><select value={siteContent.estimateRanges.emailField} onChange={(event) => updateEstimateRanges({ ...siteContent.estimateRanges, emailField: event.target.value as SiteEstimateRangesContent['emailField'] })}><option value="optional">Optional — ask, but don&apos;t require it</option><option value="required">Required</option><option value="off">Don&apos;t ask for email</option></select><small>A phone number is always required here — the follow-up promised to visitors is a text or call.</small></label>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.phonePublic} onChange={(event) => updateSiteContent({ phonePublic: event.target.checked })} /><span><strong>Show my phone number on my website</strong><small>Off = no call buttons anywhere (including &quot;Call now to lock it in&quot;) — visitors reach you through the intake and forms. Same setting as on the Business tab.</small></span></label>
                </SectionCard>

                <div className={styles.aiSuiteLink} aria-hidden="true"><span>⚡ Tuned by</span></div>

                <SectionCard variant="linked" title="Lead quality filters" description="These filters tune the Smart Intake above — flag out-of-area and too-small jobs, catch work you don't do, and sort 'just researching' to the bottom, before anything reaches your phone. Flagged leads still come in — they're just marked and ranked low, never lost." open={openSection === 'leadFilters'} onToggleOpen={() => toggleSection('leadFilters')}>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.leadFilters.askTimeline} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, askTimeline: event.target.checked })} /><span><strong>Ask &quot;when do you need this done?&quot;</strong><small>ASAP jobs rank Hot; &quot;just researching&quot; sinks to the bottom of your leads.</small></span></label>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.leadFilters.serviceAreaGate} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, serviceAreaGate: event.target.checked })} /><span><strong>Check the visitor&apos;s service area</strong><small>Asks for their ZIP or town and flags leads outside your &quot;Cities you serve&quot; list.{siteContent.serviceAreas.cities.filter((city) => city.trim()).length === 0 ? ' Add cities to that section to activate this.' : ''}</small></span></label>
                  <label className={styles.formField}><span>Minimum job size ($ — 0 for none)</span><input type="number" min={0} value={siteContent.leadFilters.minJobAmount} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, minJobAmount: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /><small>Estimates that top out below this get flagged &quot;Below minimum&quot;.</small></label>
                  <div className={styles.contentSubhead}><strong>Jobs you don&apos;t take on</strong><small>the AI flags matching requests</small></div>
                  <div className={styles.badgeList}>
                    {siteContent.leadFilters.exclusions.map((item, index) => (
                      <div className={styles.badgeRow} key={index}>
                        <input className={styles.badgeInput} value={item} maxLength={80} aria-label={`Exclusion ${index + 1}`} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, exclusions: siteContent.leadFilters.exclusions.map((other, otherIndex) => otherIndex === index ? event.target.value : other) })} placeholder="e.g. mobile homes, window AC units" />
                        <button type="button" className={styles.badgeRemove} onClick={() => updateLeadFilters({ ...siteContent.leadFilters, exclusions: siteContent.leadFilters.exclusions.filter((_, otherIndex) => otherIndex !== index) })} aria-label={`Remove ${item || 'exclusion'}`}>×</button>
                      </div>
                    ))}
                  </div>
                  {siteContent.leadFilters.exclusions.length < 10 && <button type="button" className={styles.secondaryAction} onClick={() => updateLeadFilters({ ...siteContent.leadFilters, exclusions: [...siteContent.leadFilters.exclusions, ''] })}>Add exclusion</button>}
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.leadFilters.fullyBooked.enabled} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, fullyBooked: { ...siteContent.leadFilters.fullyBooked, enabled: event.target.checked } })} /><span><strong>Fully booked mode</strong><small>Tells visitors up front that you&apos;re booked — leads still collect, expectations set.</small></span></label>
                  {siteContent.leadFilters.fullyBooked.enabled && (
                    <div className={styles.formColumns}>
                      <label className={styles.formField}><span>Booked until (optional)</span><input type="date" value={siteContent.leadFilters.fullyBooked.until} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, fullyBooked: { ...siteContent.leadFilters.fullyBooked, until: event.target.value } })} /><small>The banner turns itself off after this date — no date means it runs until you switch it off.</small></label>
                      <label className={styles.formField}><span>Message (optional)</span><input maxLength={140} value={siteContent.leadFilters.fullyBooked.message} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, fullyBooked: { ...siteContent.leadFilters.fullyBooked, message: event.target.value } })} placeholder="We're currently booked up — send your request and we'll reach out as soon as a spot opens." /></label>
                    </div>
                  )}
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.leadFilters.phoneVerification} onChange={(event) => updateLeadFilters({ ...siteContent.leadFilters, phoneVerification: event.target.checked })} /><span><strong>Verify phone numbers with a text code</strong><small>The strongest junk filter — visitors confirm a 6-digit code before the AI intake submits. Verified leads get a green badge. Skipped automatically if texting isn&apos;t configured.</small></span></label>
                </SectionCard>
                </div>

                <SectionCard title="Quote request form (old school)" description="The classic multi-field form where visitors type out their job details and wait for you to reply with a price. Recommended: run Smart Intake above OR this form — not both, or visitors will fill out both and you'll get doubled-up requests. When this is off, the smart-intake capture takes its place at #contact." enabled={siteContent.quoteForm.enabled} onToggleEnabled={(value) => updateQuoteForm({ ...siteContent.quoteForm, enabled: value })} open={openSection === 'quoteForm'} onToggleOpen={() => toggleSection('quoteForm')}>
                  {siteContent.quoteForm.enabled && siteContent.estimateRanges.enabled && <p className={styles.emptyHelper}>Heads up: Smart Intake is also on — visitors may fill out both forms. Consider turning one off.</p>}
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.quoteForm.emailRequired} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, emailRequired: event.target.checked })} /><span><strong>Require email on quote form</strong><small>Ask homeowners for an email address on every request so future email campaigns have clean contact data.</small></span></label>
                  <label className={styles.formField}><span>Form title shown on your page</span><select value={siteContent.quoteForm.estimateLabel} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, estimateLabel: event.target.value as SiteQuoteFormContent['estimateLabel'] })}><option value="quick">&quot;Quick Estimate&quot;</option><option value="instant">&quot;Instant Estimate&quot;</option></select><small>This only changes the form&apos;s title — the automatic AI estimator is the Smart Intake card above.</small></label>
                </SectionCard>

                <div className={styles.cardGroupLabel}>Main sections</div>

                <SectionCard title="Services" description="Icon cards for the work you do — the first thing most home-services visitors scan for. Add a few with an icon, name, and one-line description." evidence="A clear service grid lets a visitor confirm 'they do what I need' in seconds — the fastest way to hold a home-services visitor's attention." enabled={siteContent.services.enabled} onToggleEnabled={(value) => updateServices({ ...siteContent.services, enabled: value })} {...contentHint(siteContent.services.enabled, siteContent.services.items.filter((svc) => svc.title.trim()).length, 'service')} open={openSection === 'services'} onToggleOpen={() => toggleSection('services')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.services.title} onChange={(event) => updateServices({ ...siteContent.services, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.services.intro} onChange={(event) => updateServices({ ...siteContent.services, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.services.items.map((item, index) => (
                      <StackItem key={item.id} title={item.title.trim() || `Service ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateServices({ ...siteContent.services, items: siteContent.services.items.filter((svc) => svc.id !== item.id) })}>
                        <div className={styles.formField}><span>Icon</span><div className={styles.iconPicker}>{SERVICE_ICON_KEYS.map((key) => (<button type="button" key={`${item.id}-${key}`} className={`${styles.iconPickerBtn}${item.icon === key ? ` ${styles.iconPickerBtnOn}` : ''}`} aria-label={`Icon: ${key}`} aria-pressed={item.icon === key} onClick={() => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, icon: key } : svc) })}><ServiceIcon name={key} /></button>))}</div></div>
                        <label className={styles.formField}><span>Service name</span><input value={item.title} maxLength={60} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, title: event.target.value } : svc) })} placeholder="Interior painting" /></label>
                        <label className={styles.formField}><span>Short description</span><input value={item.description} maxLength={140} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, description: event.target.value } : svc) })} placeholder="Walls, ceilings, and trim — clean lines, on schedule." /></label>
                      </StackItem>
                    ))}
                  </div>
                  {siteContent.services.items.length < 8 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('svc'); updateServices({ ...siteContent.services, enabled: true, items: [...siteContent.services.items, { id, icon: 'spark', title: '', description: '' }] }); setEditingItemId(id); }}>Add service</button>}
                </SectionCard>

                <SectionCard title="Photo gallery" description="Highlight finished work, project details, and job photos." evidence="Real project photos alongside reviews produced 55% more leads in one study — genuine work outperforms stock." enabled={siteContent.showcase.enabled} onToggleEnabled={(value) => updateShowcase({ ...siteContent.showcase, enabled: value })} {...contentHint(siteContent.showcase.enabled, siteContent.showcase.items.length, 'image')} open={openSection === 'showcase'} onToggleOpen={() => toggleSection('showcase')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.showcase.title} onChange={(event) => updateShowcase({ ...siteContent.showcase, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro</span><textarea rows={2} value={siteContent.showcase.intro} onChange={(event) => updateShowcase({ ...siteContent.showcase, intro: event.target.value })} /></label>
                  <label className={styles.formField}><span>Gallery layout</span><select value={siteContent.showcase.layout} onChange={(event) => updateShowcase({ ...siteContent.showcase, layout: event.target.value as SiteShowcaseContent['layout'] })}><option value="featured">Featured — one big photo</option><option value="grid">Uniform grid — even tiles</option><option value="filmstrip">Filmstrip — swipeable row</option></select></label>
                  <div className={styles.contentSubhead}><strong>Gallery Images</strong><small>{siteContent.showcase.items.length}/9 · shown in this order</small></div>
                  {siteContent.showcase.items.length > 0 && (
                    <div className={styles.showcaseSelected} aria-label="Showcase images, in order">
                      {siteContent.showcase.items.map((item, index) => (
                        <div key={item.id} className={styles.showcaseSelectedTile}>
                          <div className={styles.showcaseThumbBox}>
                            <img src={item.url} alt={item.alt} />
                            <div className={styles.showcaseSelectedActions}>
                              <button type="button" onClick={() => setPicker({ label: 'this showcase photo', kind: 'showcase', scItemId: item.id })}>Replace</button>
                              <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateShowcase({ ...siteContent.showcase, items: siteContent.showcase.items.filter((other) => other.id !== item.id) })}>✕</button>
                            </div>
                          </div>
                          <input
                            className={styles.showcaseCaptionInput}
                            value={item.caption ?? ''}
                            maxLength={60}
                            placeholder={item.source === 'stock' ? galleryAutoTitle(index) || 'Title overlay' : 'Title overlay (optional)'}
                            aria-label="Photo title overlay"
                            onChange={(event) => updateShowcase({ ...siteContent.showcase, items: siteContent.showcase.items.map((other) => (other.id === item.id ? { ...other, caption: event.target.value } : other)) })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {siteContent.showcase.items.length < 9 && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'a showcase photo', kind: 'showcase', scItemId: null })}>Add photo</button>}
                  <div className={styles.jobPhotoImport}>
                    <div><strong>Completed job photos</strong><small>Import private job photos into public site images for the showcase.</small></div>
                    <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                  </div>
                  {jobPhotosLoaded && (
                    jobPhotoOptions.length > 0 ? (
                      <div className={styles.compactImageGrid}>
                        {jobPhotoOptions.map((photo) => (
                          <button type="button" key={photo.path} className={styles.compactImageTile} onClick={() => importJobPhoto(photo)} disabled={isPending}>
                            <img src={photo.url} alt={photo.label} />
                            <span>Import</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                  )}
                </SectionCard>

                <SectionCard title="Before &amp; after" description="Drag-to-reveal comparison sliders — the most shared element on a remodeler's site. Each pair needs both a before and an after image to appear on your site." evidence="Before/after galleries paired with reviews produced 55% more leads — for trades, the transformation is the product." enabled={siteContent.beforeAfter.enabled} onToggleEnabled={(value) => updateBeforeAfter({ ...siteContent.beforeAfter, enabled: value })} {...contentHint(siteContent.beforeAfter.enabled, siteContent.beforeAfter.items.filter((pair) => pair.beforeUrl && pair.afterUrl).length, 'pair')} open={openSection === 'beforeAfter'} onToggleOpen={() => toggleSection('beforeAfter')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.beforeAfter.title} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro</span><input value={siteContent.beforeAfter.intro} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.beforeAfter.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Pair ${index + 1}`} meta={item.beforeUrl && item.afterUrl ? 'complete' : 'needs images'} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateBeforeAfter({ ...siteContent.beforeAfter, items: siteContent.beforeAfter.items.filter((pair) => pair.id !== item.id) })}>
                        <div className={styles.imageSlots}>
                          <div className={styles.imageSlot}>
                            <div className={styles.imageSlotHead}><strong>Before</strong></div>
                            {item.beforeUrl
                              ? <div className={styles.heroSlotPreview}><img src={item.beforeUrl} alt="Before preview" /></div>
                              : <div className={styles.imageSlotEmpty}>No before photo</div>}
                            <div className={styles.imageSlotActions}>
                              <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'the before photo', kind: 'beforeAfter', baItemId: item.id, baSide: 'before' })}>{item.beforeUrl ? 'Replace photo' : 'Add photo'}</button>
                            </div>
                          </div>
                          <div className={styles.imageSlot}>
                            <div className={styles.imageSlotHead}><strong>After</strong></div>
                            {item.afterUrl
                              ? <div className={styles.heroSlotPreview}><img src={item.afterUrl} alt="After preview" /></div>
                              : <div className={styles.imageSlotEmpty}>No after photo</div>}
                            <div className={styles.imageSlotActions}>
                              <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'the after photo', kind: 'beforeAfter', baItemId: item.id, baSide: 'after' })}>{item.afterUrl ? 'Replace photo' : 'Add photo'}</button>
                            </div>
                          </div>
                        </div>
                        <label className={styles.formField}><span>Caption (optional)</span><input value={item.label} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, items: siteContent.beforeAfter.items.map((pair) => pair.id === item.id ? { ...pair, label: event.target.value } : pair) })} placeholder="Kitchen remodel, roof replacement..." /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('ba'); updateBeforeAfter({ ...siteContent.beforeAfter, enabled: true, items: [...siteContent.beforeAfter.items, { id, beforeUrl: '', beforeAlt: '', afterUrl: '', afterAlt: '', label: '' }] }); setEditingItemId(id); }}>Add pair</button>
                </SectionCard>

                <SectionCard title="Customer reviews" description="Show quotes from real customers on your public site." evidence="97% of homeowners read reviews before hiring a local pro, and the first few weigh the most." enabled={siteContent.testimonials.enabled} onToggleEnabled={(value) => updateTestimonials({ ...siteContent.testimonials, enabled: value })} {...contentHint(siteContent.testimonials.enabled, reviewCount, 'review')} open={openSection === 'testimonials'} onToggleOpen={() => toggleSection('testimonials')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.testimonials.title} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, title: event.target.value })} /></label>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Source mode</span><select value={siteContent.testimonials.sourceMode} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, sourceMode: event.target.value as SiteTestimonialsContent['sourceMode'] })}><option value="manual">Manual testimonials</option><option value="mixed">Manual + Google</option><option value="google">Google reviews only</option></select></label>
                    <label className={styles.formField}><span>Display style</span><select value={siteContent.testimonials.displayStyle} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, displayStyle: event.target.value as SiteTestimonialsContent['displayStyle'] })}><option value="grid">Grid — static cards</option><option value="carousel">Carousel — auto-sliding</option><option value="spotlight">Spotlight — one at a time</option></select></label>
                  </div>
                  {siteContent.testimonials.sourceMode !== 'manual' && (
                    <div className={styles.formField}>
                      <span>Google reviews</span>
                      <GoogleReviewImport
                        placeId={siteContent.testimonials.googlePlaceId}
                        name={siteContent.testimonials.googleName}
                        reviewCount={siteContent.testimonials.googleReviewCount}
                        importedCount={siteContent.testimonials.googleReviews.length}
                        importedAt={siteContent.testimonials.googleImportedAt}
                        onImport={(data) => updateTestimonials({ ...siteContent.testimonials, enabled: true, googlePlaceId: data.placeId, googleName: data.name, googleUrl: data.url, googleRating: data.rating, googleReviewCount: data.reviewCount, googleReviews: data.reviews, googleImportedAt: new Date().toISOString().slice(0, 10) })}
                        onClear={() => updateTestimonials({ ...siteContent.testimonials, googlePlaceId: '', googleName: '', googleUrl: '', googleRating: 0, googleReviewCount: 0, googleReviews: [], googleImportedAt: '' })}
                      />
                      {siteContent.testimonials.googleReviews.length > 0 && (
                        <div className={styles.googleReviewPreview}>
                          {siteContent.testimonials.googleReviews.map((review) => (
                            <div key={review.id} className={styles.googleReviewPreviewItem}>
                              <div>{'★'.repeat(Math.round(review.rating))}<strong> {review.author}</strong></div>
                              <p>{review.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={styles.stackList}>
                    {siteContent.testimonials.items.map((item, index) => (
                      <StackItem key={item.id} title={item.author.trim() || `Testimonial ${index + 1}`} meta={`${item.rating}★`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.filter((testimonial) => testimonial.id !== item.id) })}>
                        <div className={styles.formColumns}>
                          <label className={styles.formField}><span>Customer</span><input value={item.author} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, author: event.target.value } : testimonial) })} /></label>
                          <label className={styles.formField}><span>Rating</span><select value={item.rating} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, rating: Number(event.target.value) } : testimonial) })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                        </div>
                        <label className={styles.formField}><span>Project label</span><input value={item.label} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, label: event.target.value } : testimonial) })} placeholder="Kitchen remodel, deck build, emergency repair..." /></label>
                        <div className={styles.formColumns}>
                          <div className={styles.formField}>
                            <span>Photo (optional)</span>
                            <label className={styles.blogCoverUpload}>
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingTestimonialId === item.id} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) handleTestimonialImageUpload(item.id, file); }} />
                              <span>{uploadingTestimonialId === item.id ? 'Uploading…' : item.imageUrl ? 'Replace photo' : 'Upload a photo'}</span>
                            </label>
                          </div>
                          <label className={styles.formField}><span>Choose image</span><select value={item.imageUrl} onChange={(event) => {
                            const image = selectableImages.find((candidate) => candidate.url === event.target.value);
                            updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, imageUrl: event.target.value, imageAlt: image?.alt || testimonial.imageAlt || testimonial.author || 'Customer review image' } : testimonial) });
                          }}><option value="">No image</option>{selectableImages.map((image) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                        </div>
                        {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.author || 'Review image preview'} /></div>}
                        <label className={styles.formField}><span>Review text</span><textarea rows={4} value={item.text} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, text: event.target.value } : testimonial) })} /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('testimonial'); updateTestimonials({ ...siteContent.testimonials, enabled: true, items: [...siteContent.testimonials.items, { id, author: '', text: '', rating: 5, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add testimonial</button>
                </SectionCard>

                <SectionCard title="How it works" description="A simple 3–4 step walkthrough of what happens after they reach out — book, we arrive, job done. Removes the 'what do I have to do?' hesitation." evidence="Showing the process upfront lowers the perceived effort of reaching out — people act when they can see exactly what happens next." enabled={siteContent.howItWorks.enabled} onToggleEnabled={(value) => updateHowItWorks({ ...siteContent.howItWorks, enabled: value })} {...contentHint(siteContent.howItWorks.enabled, siteContent.howItWorks.steps.filter((step) => step.title.trim()).length, 'step')} open={openSection === 'howItWorks'} onToggleOpen={() => toggleSection('howItWorks')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.howItWorks.title} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.howItWorks.intro} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.howItWorks.steps.map((step, index) => (
                      <StackItem key={step.id} title={step.title.trim() || `Step ${index + 1}`} editing={editingItemId === step.id} onEdit={() => setEditingItemId(step.id)} onSave={saveItem} onRemove={() => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.filter((s) => s.id !== step.id) })}>
                        <label className={styles.formField}><span>Step title</span><input value={step.title} maxLength={60} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s) => s.id === step.id ? { ...s, title: event.target.value } : s) })} placeholder="Book online or call" /></label>
                        <label className={styles.formField}><span>Description</span><input value={step.description} maxLength={160} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s) => s.id === step.id ? { ...s, description: event.target.value } : s) })} placeholder="Tell us what you need and pick a time that works." /></label>
                      </StackItem>
                    ))}
                  </div>
                  {siteContent.howItWorks.steps.length < 5 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('step'); updateHowItWorks({ ...siteContent.howItWorks, enabled: true, steps: [...siteContent.howItWorks.steps, { id, title: '', description: '' }] }); setEditingItemId(id); }}>Add step</button>}
                </SectionCard>

                <SectionCard title="Common questions (FAQ)" description="Answer common homeowner questions before they request a quote." enabled={siteContent.faqs.enabled} onToggleEnabled={(value) => updateFaqs({ ...siteContent.faqs, enabled: value })} {...contentHint(siteContent.faqs.enabled, siteContent.faqs.items.filter((faq) => faq.question.trim() && faq.answer.trim()).length, 'question')} open={openSection === 'faqs'} onToggleOpen={() => toggleSection('faqs')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.faqs.title} onChange={(event) => updateFaqs({ ...siteContent.faqs, title: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.faqs.items.map((item, index) => (
                      <StackItem key={item.id} title={item.question.trim() || `Question ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.filter((faq) => faq.id !== item.id) })}>
                        <label className={styles.formField}><span>Question</span><input value={item.question} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq) => faq.id === item.id ? { ...faq, question: event.target.value } : faq) })} /></label>
                        <label className={styles.formField}><span>Answer</span><textarea rows={3} value={item.answer} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq) => faq.id === item.id ? { ...faq, answer: event.target.value } : faq) })} /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('faq'); updateFaqs({ ...siteContent.faqs, enabled: true, items: [...siteContent.faqs.items, { id, question: '', answer: '' }] }); setEditingItemId(id); }}>Add FAQ</button>
                </SectionCard>

                <SectionCard title="Animated stats" description="A band of big numbers that count up as visitors scroll — jobs completed, years in business, % satisfaction. Instant credibility." evidence="Concrete numbers — jobs done, years in business, response time — are instant, scannable credibility next to your work." enabled={siteContent.stats.enabled} onToggleEnabled={(value) => updateStats({ ...siteContent.stats, enabled: value })} {...contentHint(siteContent.stats.enabled, siteContent.stats.items.filter((item) => item.label.trim()).length, 'stat')} open={openSection === 'stats'} onToggleOpen={() => toggleSection('stats')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.stats.title} onChange={(event) => updateStats({ ...siteContent.stats, title: event.target.value })} /></label>
                  <div className={styles.imageSlot}>
                    <div className={styles.imageSlotHead}><strong>Section photo</strong><small>The photo behind the numbers.</small></div>
                    <div className={styles.heroSlotPreview}><img src={siteContent.images.stats || site.hero_url || STOCK_SITE_IMAGES[2].url} alt="Stats section photo" /></div>
                    <div className={styles.imageSlotActions}>
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('the stats photo', 'slot', 'stats')}>Replace photo</button>
                      {siteContent.images.stats && <button type="button" className={styles.secondaryAction} onClick={() => resetSlotImage('stats')}>Reset to default</button>}
                    </div>
                  </div>
                  <div className={styles.stackList}>
                    {siteContent.stats.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Stat ${index + 1}`} meta={`${item.prefix}${item.value.toLocaleString('en-US')}${item.suffix}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateStats({ ...siteContent.stats, items: siteContent.stats.items.filter((stat) => stat.id !== item.id) })}>
                        <div className={styles.formColumns}>
                          <label className={styles.formField}><span>Prefix</span><input value={item.prefix} maxLength={4} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, prefix: event.target.value } : stat) })} placeholder="$" /></label>
                          <label className={styles.formField}><span>Value</span><input type="number" min={0} value={statValueInputs[item.id] ?? String(item.value)} onChange={(event) => { const raw = event.target.value; setStatValueInputs((current) => ({ ...current, [item.id]: raw })); if (raw !== '') updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, value: Number(raw) } : stat) }); }} onBlur={() => setStatValueInputs((current) => { const next = { ...current }; delete next[item.id]; return next; })} /></label>
                          <label className={styles.formField}><span>Suffix</span><input value={item.suffix} maxLength={4} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, suffix: event.target.value } : stat) })} placeholder="+ / %" /></label>
                        </div>
                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, label: event.target.value } : stat) })} placeholder="Jobs completed" /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('stat'); updateStats({ ...siteContent.stats, enabled: true, items: [...siteContent.stats.items, { id, value: 0, prefix: '', suffix: '', label: '' }] }); setEditingItemId(id); }}>Add stat</button>
                </SectionCard>

                <SectionCard title="Blog" description="Helpful articles for homeowners — maintenance tips, seasonal advice, and what to know before hiring. AI can draft them; you review and publish." evidence="Fresh, useful posts give Google more local pages to rank and give past customers a reason to return — search visibility that compounds over time." enabled={siteContent.blog.enabled} onToggleEnabled={(value) => updateBlog({ ...siteContent.blog, enabled: value })} {...blogHint} open={openSection === 'blog'} onToggleOpen={() => toggleSection('blog')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.blog.title} onChange={(event) => updateBlog({ ...siteContent.blog, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.blog.intro} onChange={(event) => updateBlog({ ...siteContent.blog, intro: event.target.value })} /></label>
                  <label className={styles.formField}><span>What should the next post be about? (optional)</span><input value={blogTopic} maxLength={200} onChange={(event) => setBlogTopic(event.target.value)} placeholder="e.g. Fall gutter maintenance checklist — leave blank and AI picks a seasonal topic" /></label>
                  <button type="button" className="btn secondary" onClick={handleGenerateBlogDraft} disabled={isGeneratingBlog}>{isGeneratingBlog ? 'Writing a draft…' : '✨ Generate a draft with AI'}</button>
                  <p className={styles.fieldHint}>Drafts are saved unpublished — nothing goes live until you flip a post to Published.</p>
                  <div className={styles.stackList}>
                    {siteContent.blog.posts.map((post, index) => (
                      <StackItem key={post.id} title={post.title.trim() || `Post ${index + 1}`} meta={post.status === 'published' ? 'Live' : 'Draft'} editing={editingItemId === post.id} onEdit={() => setEditingItemId(post.id)} onSave={saveItem} onRemove={() => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.filter((p) => p.id !== post.id) })}>
                        <label className={styles.toggleRow}><input type="checkbox" checked={post.status === 'published'} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, status: event.target.checked ? 'published' : 'draft' } : p) })} /><span><strong>Published</strong><small>{post.status === 'published' ? 'Live on your site.' : 'Draft — only you can see it until you publish.'}</small></span></label>
                        <label className={styles.formField}><span>Title</span><input value={post.title} maxLength={120} onChange={(event) => { const title = event.target.value; updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, title, slug: (!p.slug || /^post-\d+$/.test(p.slug)) ? slugifyBlogTitle(title) : p.slug } : p) }); }} placeholder="5 signs it’s time to reseal your deck" /></label>
                        <label className={styles.formField}><span>Excerpt</span><input value={post.excerpt} maxLength={200} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, excerpt: event.target.value } : p) })} placeholder="One sentence that makes someone want to read." /></label>
                        <div className={styles.formField}>
                          <span>Cover photo (optional)</span>
                          {post.coverImage && (
                            <div className={styles.blogCoverPreview}>
                              <img src={post.coverImage} alt="Cover preview" />
                              <button type="button" onClick={() => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, coverImage: '' } : p) })}>Remove</button>
                            </div>
                          )}
                          <label className={styles.blogCoverUpload}>
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingCoverId === post.id} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) handleBlogCoverUpload(post.id, file); }} />
                            <span>{uploadingCoverId === post.id ? 'Uploading…' : post.coverImage ? 'Replace photo' : 'Upload a cover photo'}</span>
                          </label>
                        </div>
                        <label className={styles.formField}><span>Body</span><textarea rows={10} value={post.body} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, body: event.target.value } : p) })} placeholder="Write in short paragraphs separated by a blank line." /><small>{wordCount(post.body)} words · ~{Math.max(1, Math.round(wordCount(post.body) / 220))} min read{wordCount(post.body) > 0 && wordCount(post.body) < 300 ? ' — aim for 400+ words so the post feels substantial' : ''}</small></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('post'); updateBlog({ ...siteContent.blog, enabled: true, posts: [{ id, slug: '', title: '', excerpt: '', body: '', coverImage: '', status: 'draft', date: new Date().toISOString().slice(0, 10) }, ...siteContent.blog.posts] }); setEditingItemId(id); }}>Add post manually</button>
                </SectionCard>

                <div className={styles.cardGroupLabel}>Trust boosters</div>

                <SectionCard title="Star-rating badge" description={'Shows a "4.9 ★ from 37 reviews" trust badge near your reviews. Enter your real average rating and review count — only enable this if the numbers are accurate.'} evidence="97% of buyers check reviews first — a rating shown right beside your form is what turns that trust into a call." enabled={siteContent.ratingBadge.enabled} onToggleEnabled={(value) => updateRatingBadge({ ...siteContent.ratingBadge, enabled: value })} open={openSection === 'rating'} onToggleOpen={() => toggleSection('rating')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Average rating (1–5)</span><input type="number" min={1} max={5} step={0.1} value={ratingInput} onChange={(event) => { const raw = event.target.value; setRatingInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, rating: Number(raw) }); }} onBlur={() => setRatingInput(String(siteContent.ratingBadge.rating))} /></label>
                    <label className={styles.formField}><span>Number of reviews</span><input type="number" min={0} step={1} value={reviewCountInput} onChange={(event) => { const raw = event.target.value; setReviewCountInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, reviewCount: Number(raw) }); }} onBlur={() => setReviewCountInput(String(siteContent.ratingBadge.reviewCount))} /></label>
                  </div>
                  <label className={styles.formField}><span>Source label</span><input value={siteContent.ratingBadge.sourceLabel} onChange={(event) => updateRatingBadge({ ...siteContent.ratingBadge, sourceLabel: event.target.value })} placeholder="Google reviews" /></label>
                </SectionCard>

                <SectionCard title="Trust badges" description="A row of reassurance chips (Licensed, Insured, Bonded…) on your public site. Toggle the ones that apply and edit the labels." evidence="Licensed / insured / bonded pros are seen ~5× more likely to finish the job; these chips lower the risk of reaching out." enabled={siteContent.trustBadges.enabled} onToggleEnabled={(value) => updateTrustBadges({ ...siteContent.trustBadges, enabled: value })} open={openSection === 'trustBadges'} onToggleOpen={() => toggleSection('trustBadges')}>
                  <p className={styles.fieldHint}>Check to show, uncheck to hide. Edit the label inline.</p>
                  <div className={styles.badgeList}>
                    {siteContent.trustBadges.badges.map((badge) => (
                      <div className={styles.badgeRow} key={badge.id}>
                        <input type="checkbox" checked={badge.enabled} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item) => item.id === badge.id ? { ...item, enabled: event.target.checked } : item) })} aria-label={`Show ${badge.label || 'badge'}`} />
                        <input className={`${styles.badgeInput}${badge.enabled ? '' : ` ${styles.badgeInputOff}`}`} value={badge.label} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item) => item.id === badge.id ? { ...item, label: event.target.value } : item) })} placeholder="Badge label" />
                        <button type="button" className={styles.badgeRemove} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.filter((item) => item.id !== badge.id) })} aria-label={`Remove ${badge.label || 'badge'}`}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, enabled: true, badges: [...siteContent.trustBadges.badges, { id: createContentId('badge'), label: '', enabled: true }] })}>Add badge</button>
                </SectionCard>

                <SectionCard title="Certifications & awards" description={'A strip of recognizable credentials — BBB A+, EPA Lead-Safe, manufacturer certifications, "Best of" awards. Add a label and optionally a logo from your images.'} evidence="Recognizable third-party credentials (BBB A+, EPA, manufacturer certs) shortcut trust faster than anything you can say about yourself." enabled={siteContent.certifications.enabled} onToggleEnabled={(value) => updateCertifications({ ...siteContent.certifications, enabled: value })} {...contentHint(siteContent.certifications.enabled, siteContent.certifications.items.filter((item) => item.label.trim()).length, 'item')} open={openSection === 'certifications'} onToggleOpen={() => toggleSection('certifications')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.certifications.title} onChange={(event) => updateCertifications({ ...siteContent.certifications, title: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.certifications.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Item ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.filter((cert) => cert.id !== item.id) })}>
                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.map((cert) => cert.id === item.id ? { ...cert, label: event.target.value } : cert) })} placeholder="EPA Lead-Safe Certified" /></label>
                        <label className={styles.formField}><span>Logo image (optional)</span><select value={item.imageUrl} onChange={(event) => {
                          const image = selectableImages.find((candidate) => candidate.url === event.target.value);
                          updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.map((cert) => cert.id === item.id ? { ...cert, imageUrl: event.target.value, imageAlt: image?.alt || cert.imageAlt || cert.label || 'Certification' } : cert) });
                        }}><option value="">No image</option>{selectableImages.map((image) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                        {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.label || 'Certification preview'} /></div>}
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('cert'); updateCertifications({ ...siteContent.certifications, enabled: true, items: [...siteContent.certifications.items, { id, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add certification</button>
                </SectionCard>

                <SectionCard title="Cities you serve" description={'List the towns and neighborhoods you cover. The names become on-page keywords that help you rank for "[trade] in [city]" searches — and reassure homeowners you serve their area.'} evidence={'Visitors decide "do they even serve me?" in ~3 seconds — naming their town reassures them and matches local search.'} enabled={siteContent.serviceAreas.enabled} onToggleEnabled={(value) => updateServiceAreas({ ...siteContent.serviceAreas, enabled: value })} {...contentHint(siteContent.serviceAreas.enabled, siteContent.serviceAreas.cities.filter((city) => city.trim()).length, 'city', 'cities')} open={openSection === 'serviceAreas'} onToggleOpen={() => toggleSection('serviceAreas')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.serviceAreas.title} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro</span><input value={siteContent.serviceAreas.intro} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, intro: event.target.value })} /></label>
                  <div className={styles.badgeList}>
                    {siteContent.serviceAreas.cities.map((city, index) => (
                      <div className={styles.badgeRow} key={index}>
                        <input className={styles.badgeInput} value={city} aria-label={`City ${index + 1}`} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, cities: siteContent.serviceAreas.cities.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder="e.g. Riverton" />
                        <button type="button" className={styles.badgeRemove} onClick={() => updateServiceAreas({ ...siteContent.serviceAreas, cities: siteContent.serviceAreas.cities.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${city || 'city'}`}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => updateServiceAreas({ ...siteContent.serviceAreas, enabled: true, cities: [...siteContent.serviceAreas.cities, ''] })}>Add city</button>
                </SectionCard>

                <SectionCard title="Financing offer" description={'Reframe the price — show "Projects from $X/mo" so sticker shock doesn\'t kill the lead. Only appears once the monthly amount is set.'} evidence={'Sticker shock is a top silent reason a lead never calls — reframing price as "$X/mo" keeps them in the conversation.'} enabled={siteContent.financing.enabled} onToggleEnabled={(value) => updateFinancing({ ...siteContent.financing, enabled: value })} open={openSection === 'financing'} onToggleOpen={() => toggleSection('financing')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>From ($/month)</span><input type="number" min={0} step={1} value={monthlyFromInput} onChange={(event) => { const raw = event.target.value; setMonthlyFromInput(raw); if (raw !== '') updateFinancing({ ...siteContent.financing, monthlyFrom: Number(raw) }); }} onBlur={() => setMonthlyFromInput(String(siteContent.financing.monthlyFrom))} /></label>
                    <label className={styles.formField}><span>Apply link (optional)</span><input type="url" value={siteContent.financing.applyUrl} onChange={(event) => updateFinancing({ ...siteContent.financing, applyUrl: event.target.value })} placeholder="https://..." /></label>
                  </div>
                  <label className={styles.formField}><span>Supporting line</span><input value={siteContent.financing.blurb} onChange={(event) => updateFinancing({ ...siteContent.financing, blurb: event.target.value })} placeholder="Flexible financing available on approved credit." /></label>
                </SectionCard>

                <div className={styles.cardGroupLabel}>Bars &amp; banners</div>

                <SectionCard title="Announcement bar" description={'A strip across the top of your site for one timely line — e.g. "Now booking for August". You type the message, so it never invents urgency; it only appears once filled in.'} evidence={'Urgency converts — emergency-ready trades close highest (12–16%); a "same-day" or "now booking" line cuts hesitation.'} enabled={siteContent.announcement.enabled} onToggleEnabled={(value) => updateAnnouncement({ ...siteContent.announcement, enabled: value })} open={openSection === 'announcement'} onToggleOpen={() => toggleSection('announcement')}>
                  <label className={styles.formField}><span>Message</span><input value={siteContent.announcement.message} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, message: event.target.value })} placeholder="Now booking August installs" /></label>
                  <label className={styles.formField}><span>Second line (optional)</span><input value={siteContent.announcement.subtext} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, subtext: event.target.value })} placeholder="Same-day estimates · Licensed &amp; insured" /></label>
                  <label className={styles.formField}><span>Last day to show (optional)</span><input type="date" value={siteContent.announcement.endDate} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, endDate: event.target.value })} /><small>The bar hides itself automatically after this date — great for limited-time promos.</small></label>
                  {siteContent.announcement.enabled && !siteContent.announcement.message.trim() && <p className={styles.emptyHelper}>Add a message above for the bar to appear on your site.</p>}
                </SectionCard>

                <SectionCard title="Tap-to-call bar (mobile)" description="Pins a tap-to-call button to the bottom of every phone screen, so homeowners can reach you in one tap. Needs a phone number on the Business tab." evidence="For home services the phone closes 25–55× better than a form; a one-tap bar that follows the visitor keeps it in reach (sticky CTAs lift conversions 15–40%)." enabled={siteContent.stickyCallBar.enabled} onToggleEnabled={(value) => updateStickyCallBar({ ...siteContent.stickyCallBar, enabled: value })} open={openSection === 'stickyBar'} onToggleOpen={() => toggleSection('stickyBar')}>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.stickyCallBar.showQuote} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, showQuote: event.target.checked })} /><span><strong>Add a &quot;Free quote&quot; button</strong><small>Adds a second button beside Call that jumps straight to your quote form.</small></span></label>
                  {siteContent.stickyCallBar.enabled && !site.phone && <p className={styles.emptyHelper}>Add a phone number on the Business tab to make this bar appear.</p>}
                  {siteContent.stickyCallBar.enabled && site.phone && !siteContent.phonePublic && <p className={styles.emptyHelper}>Your phone number is set to hidden — this bar won&apos;t appear until you turn &quot;Show my phone number&quot; back on.</p>}
                </SectionCard>

                {site.template === 'handy' && (
                  <>
                    <div className={styles.cardGroupLabel}>Care template sections</div>

                    <SectionCard title="Why choose us" description="The checklist card beside your team photo — your promise points, in your words." enabled={siteContent.whyUs.enabled} onToggleEnabled={(value) => updateWhyUs({ ...siteContent.whyUs, enabled: value })} open={openSection === 'whyUs'} onToggleOpen={() => toggleSection('whyUs')}>
                      <label className={styles.formField}><span>Heading</span><input value={siteContent.whyUs.title} maxLength={80} onChange={(event) => updateWhyUs({ ...siteContent.whyUs, title: event.target.value })} /></label>
                      <div className={styles.badgeList}>
                        {siteContent.whyUs.points.map((point, index) => (
                          <div className={styles.badgeRow} key={index}>
                            <input className={styles.badgeInput} value={point} maxLength={80} aria-label={`Point ${index + 1}`} onChange={(event) => updateWhyUs({ ...siteContent.whyUs, points: siteContent.whyUs.points.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder="e.g. Upfront, honest pricing" />
                            <button type="button" className={styles.badgeRemove} onClick={() => updateWhyUs({ ...siteContent.whyUs, points: siteContent.whyUs.points.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${point || 'point'}`}>×</button>
                          </div>
                        ))}
                      </div>
                      {siteContent.whyUs.points.length < 6 && <button type="button" className={styles.secondaryAction} onClick={() => updateWhyUs({ ...siteContent.whyUs, points: [...siteContent.whyUs.points, ''] })}>Add point</button>}
                    </SectionCard>

                    <SectionCard title="Project showcase" description="An animated band of 3-5 of your best project photos. Add your own photos here (or import from completed jobs); until you do, it shows your gallery photos." enabled={siteContent.projectShowcase.enabled} onToggleEnabled={(value) => updateProjectShowcase({ ...siteContent.projectShowcase, enabled: value })} hint={siteContent.projectShowcase.items.length > 0 ? `${siteContent.projectShowcase.items.length} ${siteContent.projectShowcase.items.length === 1 ? 'photo' : 'photos'}` : 'using gallery photos'} hintTone="ok" open={openSection === 'projectShowcase'} onToggleOpen={() => toggleSection('projectShowcase')}>
                      <label className={styles.formField}><span>Small line above</span><input value={siteContent.projectShowcase.eyebrow} maxLength={40} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, eyebrow: event.target.value })} placeholder="Project showcase" /></label>
                      <label className={styles.formField}><span>Heading</span><input value={siteContent.projectShowcase.title} maxLength={80} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, title: event.target.value })} placeholder="Our recent projects" /></label>
                      <label className={styles.formField}><span>Showcase style</span><select value={siteContent.projectShowcase.style} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, style: event.target.value as SiteProjectShowcaseContent['style'] })}>{PROJECT_SHOWCASE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                      <div className={styles.contentSubhead}><strong>Project photos</strong><small>{projectPhotos.length}/{MAX_PROJECT_SHOWCASE_ITEMS} · shown in this order</small></div>
                      {siteContent.projectShowcase.items.length === 0 && <p className={styles.fieldHint}>These are your gallery photos. Replace any (upload or stock), edit its headline, or add your own — your first edit makes them your project set.</p>}
                      <div className={styles.showcaseSelected} aria-label="Project photos, in order">
                        {projectPhotos.map((item) => (
                          <div key={item.id} className={styles.showcaseSelectedTile}>
                            <div className={styles.showcaseThumbBox}>
                              <img src={item.url} alt={item.alt} />
                              <div className={styles.showcaseSelectedActions}>
                                <button type="button" onClick={() => setPicker({ label: 'this project photo', kind: 'project', pjItemId: item.id })}>Replace</button>
                                <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateProjectShowcase({ ...siteContent.projectShowcase, enabled: true, items: projectPhotos.filter((other) => other.id !== item.id) })}>✕</button>
                              </div>
                            </div>
                            <input
                              className={styles.showcaseCaptionInput}
                              value={item.caption ?? ''}
                              maxLength={60}
                              placeholder="Headline (optional)"
                              aria-label="Photo headline"
                              onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, enabled: true, items: projectPhotos.map((other) => (other.id === item.id ? { ...other, caption: event.target.value } : other)) })}
                            />
                          </div>
                        ))}
                      </div>
                      {projectPhotos.length < MAX_PROJECT_SHOWCASE_ITEMS && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'a project photo', kind: 'project', pjItemId: null })}>Add photo</button>}
                      <div className={styles.jobPhotoImport}>
                        <div><strong>Completed job photos</strong><small>Import private job photos into your project showcase.</small></div>
                        <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                      </div>
                      {jobPhotosLoaded && (
                        jobPhotoOptions.length > 0 ? (
                          <div className={styles.compactImageGrid}>
                            {jobPhotoOptions.map((photo) => (
                              <button type="button" key={photo.path} className={styles.compactImageTile} onClick={() => importJobPhotoToProject(photo)} disabled={isPending}>
                                <img src={photo.url} alt={photo.label} />
                                <span>Import</span>
                              </button>
                            ))}
                          </div>
                        ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                      )}
                    </SectionCard>
                  </>
                )}

                <SectionCard title="Rearrange Sections" description="Drag to reorder the sections on your public page; click one to open its card above. Off sections keep their spot but stay hidden until you turn them on." open={openSection === 'sectionOrder'} onToggleOpen={() => toggleSection('sectionOrder')}>
                  <ul className={styles.sectionOrderList}>
                    {siteContent.sectionOrder.map((key, index) => {
                      const meta = REORDERABLE_SECTIONS.find((section) => section.key === key);
                      if (!meta) return null;
                      return (
                        <li
                          key={key}
                          draggable
                          onDragStart={(event) => { setDragKey(key); event.dataTransfer.effectAllowed = 'move'; }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => { event.preventDefault(); if (dragKey) reorderSections(dragKey, key); setDragKey(null); }}
                          onDragEnd={() => setDragKey(null)}
                          className={`${styles.sectionOrderItem}${dragKey === key ? ` ${styles.sectionOrderDragging}` : ''}`}
                        >
                          <span className={styles.sectionOrderGrip} aria-hidden="true">⠿</span>
                          <button type="button" className={styles.sectionOrderJump} onClick={() => jumpTo('page', key)}>
                            {meta.label}
                            {!sectionEnabled[key] && <em className={styles.sectionOrderOff}>off</em>}
                            {sectionHints[key]?.hint && <em className={styles.sectionOrderHint} data-tone={sectionHints[key].hintTone || 'ok'}>{sectionHints[key].hint}</em>}
                          </button>
                          <span className={styles.sectionOrderMove}>
                            <button type="button" aria-label={`Move ${meta.label} up`} disabled={index === 0} onClick={() => moveSectionBy(key, -1)}>↑</button>
                            <button type="button" aria-label={`Move ${meta.label} down`} disabled={index === siteContent.sectionOrder.length - 1} onClick={() => moveSectionBy(key, 1)}>↓</button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </SectionCard>
              </div>
            )}

            {activeTab === 'publish' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Publish</h2><p>Go live — put your website on the internet, then fine-tune your web address below.</p></div>

                <div className={`${styles.publishHero}${site.published ? ` ${styles.publishHeroLive}` : ''}`}>
                  <div className={styles.publishHeroInfo}>
                    <span className={`${styles.statusDot} ${site.published ? styles.liveDot : ''}`} aria-hidden="true" />
                    <div>
                      <strong>{site.published ? '🎉 Your website is live!' : 'Ready to go live?'}</strong>
                      <p>{site.published ? 'Homeowners can visit your website right now.' : 'Publishing puts your site on the internet for anyone to visit. You can switch it back to private anytime.'}</p>
                    </div>
                  </div>
                  <button type="button" className={styles.publishHeroBtn} onClick={handlePublish} disabled={isPending}>{isPending ? 'Working…' : site.published ? 'Unpublish' : '🚀 Publish my website'}</button>
                </div>
                {!site.published && !site.company_name.trim() && <p className={styles.publishRequirement}>A company name is required to publish. Add one on the Business tab.</p>}
                {site.published && liveUrl && <a className={styles.publicLink} href={liveUrl} target="_blank" rel="noopener noreferrer">Open live website ↗</a>}

                <div className={styles.checklistCard}>
                  <strong>Launch checklist</strong>
                  <ul>
                    {launchChecklist.map((item) => (
                      <li key={item.label} data-done={item.done ? 'true' : 'false'}>
                        <span className={styles.checklistMark} aria-hidden="true">{item.done ? '✓' : '○'}</span>
                        {item.done
                          ? <span>{item.label}</span>
                          : <button type="button" className={styles.checklistGo} onClick={item.go}><span>{item.label}</span><small>{item.hint}</small></button>}
                      </li>
                    ))}
                  </ul>
                </div>
                <label className={styles.formField}><span>Free letsgetquoted.com subdomain</span>
                  <div className={styles.domainControl}>
                    <div className={styles.subdomainInput}>
                      <input id="pub-subdomain" value={site.subdomain || ''} onChange={(event) => handleChange('subdomain', event.target.value.toLowerCase() || null)} placeholder="northline-builders" aria-label="Subdomain" />
                      <span className={styles.subdomainSuffix} aria-hidden="true">.{ROOT_DOMAIN}</span>
                    </div>
                    <button type="button" onClick={checkSubdomain} disabled={isPending}>Check</button>
                  </div>
                  <small>{subdomainStatus === 'available' ? `✓ ${site.subdomain}.${ROOT_DOMAIN} is available` : subdomainStatus === 'taken' ? '✕ That subdomain is already taken — try another' : 'Lowercase letters, numbers, and hyphens.'}</small>
                </label>
                <label className={styles.formField}><span>Custom domain</span><div className={styles.domainControl}><input value={site.custom_domain || ''} onChange={(event) => handleChange('custom_domain', event.target.value || null)} placeholder="www.yourbusiness.com" /><button type="button" onClick={verifyCustomDomain} disabled={isPending}>{domainStatus === 'checking' ? 'Checking...' : 'Verify DNS'}</button></div><small>{domainStatus === 'verified' ? 'Verified and connected.' : 'Add a CNAME record pointing to domains.letsgetquoted.com.'}</small></label>
                <DomainConnector domain={site.custom_domain} target="domains.letsgetquoted.com" />
                <p className={styles.movedNote}>Google title &amp; description moved to <strong>Business → How you show up on Google</strong>.</p>
              </div>
            )}
          </div>
        </section>

        <LivePreview site={site} />
      </div>

      {isDirty && (
        <div className={styles.savePill}>
          <span>Unsaved changes</span>
          <button type="button" onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : 'Save now'}</button>
        </div>
      )}

      {picker && (
        <ImagePickerModal
          label={picker.label}
          uploads={siteImages}
          galleryImages={galleryImages}
          heroUrl={site.hero_url}
          pexelsQuery={pexelsQueryFor(picker, siteContent.trade)}
          onSelectHero={selectHeroImage}
          onToggleGallery={toggleGalleryImage}
          onUpload={(image) => setSiteImages((current) => [image, ...current])}
          onClose={() => setPicker(null)}
          onReset={picker.kind === 'slot' && picker.slot && siteContent.images[picker.slot]
            ? () => { resetSlotImage(picker.slot as string); setPicker(null); }
            : undefined}
          onPick={(image, pexels) => {
            if (picker.kind === 'hero') selectHeroImage(image);
            else if (picker.kind === 'logo') handleChange('logo_url', image.url);
            else if (picker.kind === 'beforeAfter' && picker.baItemId && picker.baSide) setBeforeAfterImage(picker.baItemId, picker.baSide, image);
            else if (picker.kind === 'showcase') replaceShowcaseImage(picker.scItemId ?? null, image);
            else if (picker.kind === 'project') replaceProjectImage(picker.pjItemId ?? null, image);
            else if (picker.kind === 'heroExtra') { if (typeof picker.heroExtraIndex === 'number') replaceHeroExtraImage(picker.heroExtraIndex, image); else addHeroExtraImage(image); }
            else if (picker.slot) assignSlotImage(picker.slot, image);
            // Logos aren't stock photos; don't record attribution for them.
            if (picker.kind !== 'logo') recordPickedStock(picker, image, pexels);
            setPicker(null);
          }}
        />
      )}
    </main>
  );
}