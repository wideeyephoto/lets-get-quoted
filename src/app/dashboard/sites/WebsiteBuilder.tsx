'use client';

import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import type { Site, TemplateType } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getSiteContent, getTradeGlyphOptions, getUnreviewedGeneratedSections, glyphForContent, mergeSiteContent, COLOR_SCHEMES, getActiveColorSchemes, getColorScheme, HEADER_STYLES,
  MENU_BUTTON_STYLES,
  BLOG_STYLES, BUTTON_STYLES, HEADER_BUTTON_STYLES, WORDMARK_STYLES, HERO_TEXT_SHADOW_STYLES, QUOTE_FORM_STYLES, QUOTE_FORM_FIELD_BGS, QUOTE_FORM_RADII, QUOTE_FORM_STEPPERS, QUOTE_FORM_BADGES, QUOTE_FORM_WIDTHS, QUOTE_FORM_TRUST_CUES, DEFAULT_QUOTE_FORM_TRUST_ITEMS, HERO_BADGE_PRESETS, HERO_BADGE_STYLES, IMAGE_SLOT_LABELS, MAX_EXTRA_HERO_IMAGES, PROJECT_SHOWCASE_STYLES, MAX_PROJECT_SHOWCASE_ITEMS, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS, DEFAULT_PROJECT_SHOWCASE_EYEBROW, DEFAULT_PROJECT_SHOWCASE_TITLE, STOCK_PROJECT_SHOWCASE_EYEBROW, STOCK_PROJECT_SHOWCASE_TITLE, QUICK_STOP_SECTION_STYLES, VIDEO_SECTION_STYLES, videoStyleCapacity, videoSectionKey, MAX_VIDEO_SECTIONS, DEFAULT_VIDEOS_NAV_LABEL, type NormalizedSiteContent, type SiteHeroTextShadowStyle, type SiteProjectShowcaseContent, type SiteVideoSectionContent, type SiteBlogContent, type SiteAnnouncementContent, type SiteBeforeAfterContent, type SiteServicesContent, type SiteQuickStopContent, type SiteQuickStopStyle, type SiteHowItWorksContent, type SiteFaqContent, type SiteQuoteFormContent, type SiteRatingBadgeContent, type SiteServiceAreasContent, type SiteShowcaseContent, type SiteShowcaseItem, type SiteStatItem, type SiteStatsContent, type SiteTestimonialItem, type SiteStickyCallBarContent, type SiteChatButtonContent, type SiteAnalyticsContent, type SiteTestimonialsContent, type SiteTrustBadgesContent, type SiteWhyUsContent, type SiteLegalContent, type QuoteFormRadius, type QuoteFormWidth, type QuoteFormStepper, type QuoteFormBadge, type PendingAiLogo } from '@/lib/site-content';
import { generatePrivacyPolicy, generateTermsOfService } from '@/lib/legal/legal-copy';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import ServiceIcon, { SERVICE_ICON_KEYS } from '@/lib/templates/ServiceIcon';
import { checkSubdomainAvailableAction, generateSiteTextAction, getAvailableAiCreditsAction, getAiLogosAction, importJobPhotoToSiteImageAction, listCompletedJobPhotoOptionsAction, listCompletedJobReviewsAction, publishSiteAction, regenerateSeoCopyAction, regenerateStockImagesAction, syncClientReviewsToSiteAction, syncCompletedJobsToSiteAction, updateSiteAction, uploadSiteImageAction, verifyCustomDomainAction, type JobPhotoImportOption, type CompletedJobReviewOption, type GeneratedAiLogo } from './actions';
import { SEO_TITLE_MAX as SEO_TITLE_LIMIT, SEO_DESC_MAX as SEO_DESC_LIMIT } from '@/lib/seo/seo-copy';
import { parseVerificationToken, verificationTokenProblem } from '@/lib/seo/search-console';
// Shared with the first-run seed (lib/site-seed) so "Generate" here and the
// automatic build after signup can never produce different sites.
import { applyGeneratedSiteText, applyStockImages, siteIsUnwritten } from '@/lib/site-seed';
import type { PexelsPickPhoto } from '@/lib/stock/types';
import { compressImage } from '@/lib/client-images';
import ImagePickerModal from './ImagePickerModal';
import DomainConnector from './DomainConnector';
import GoogleReviewImport from './GoogleReviewImport';
import IntroVideoField from './IntroVideoField';
import HeroVideoField from './HeroVideoField';
import LivePreview from './LivePreview';
import BuilderTabStrip from './BuilderTabStrip';
import SectionCard from './SectionCard';
import SocialsField from './SocialsField';
import ChatButtonField from './ChatButtonField';
import type { MessagingSetup } from '@/lib/owner-sms';
import { displayPhone } from '@/lib/phone';
import { phoneDigits } from '@/lib/chat-button';
import AnalyticsField from './AnalyticsField';
import ThemeIcon from './ThemeIcon';
import VideoStudio from './VideoStudio';
import AiLogoCreatorModal from './AiLogoCreatorModal';
import ServiceAreasField from './ServiceAreasField';
import styles from './SiteEditor.module.css';

type BuilderTab = 'business' | 'page' | 'design' | 'publish';

type WebsiteBuilderProps = {
  site: Site;
  uploadedImages: SiteImage[];
  messagingSetup?: MessagingSetup;
  // Arriving straight from first run, on a site that was just written from the
  // business name, trade and ZIP. Opens with an explanation rather than letting
  // the owner wonder who wrote all this.
  justBuilt?: boolean;
  /** `?open=<key>` — a card to open on arrival, for links from elsewhere. */
  openTarget?: string | null;
  /** Real-time AI credit balance (Smart Intake & writing drafts combined). */
  aiCredits?: number | null;
};

function AiCreditIndicator({
  credits,
  cost,
}: {
  credits: number | null | undefined;
  cost?: number;
}) {
  if (typeof credits !== 'number') return null;
  const isLow = credits <= 25;
  return (
    <span className={`${styles.aiCreditChip}${isLow ? ` ${styles.aiCreditChipLow}` : ''}`}>
      <span>⚡ {credits.toLocaleString('en-US')} AI {credits === 1 ? 'credit' : 'credits'} available</span>
      {cost ? <span>· {cost} credit per generation</span> : null}
      {isLow ? (
        <a href="/dashboard/settings#buy-credits" className={styles.aiCreditChipTopUp} title="Add more AI credits">
          + Top up
        </a>
      ) : null}
    </span>
  );
}

// Where an `?open=` key lands: the tab that holds that card, and the card
// itself. Deliberately a short allow-list rather than "open whatever the query
// string says" — an unknown key would set openSection to something no card
// matches, closing every card on a tab that normally has one open.
const OPEN_TARGETS: Record<string, { tab: BuilderTab; card: string }> = {
  intake: { tab: 'page', card: 'estimate' },
  reviews: { tab: 'page', card: 'testimonials' },
  google: { tab: 'publish', card: 'found' },
  logo: { tab: 'design', card: 'logo' },
  typography: { tab: 'design', card: 'typography' },
  theme: { tab: 'design', card: 'theme' },
  quoteFormStyle: { tab: 'design', card: 'quoteFormStyle' },
  intakeStyle: { tab: 'page', card: 'estimate' },
  quickStop: { tab: 'page', card: 'quickStop' },
  areas: { tab: 'page', card: 'serviceAreas' },
  serviceAreas: { tab: 'page', card: 'serviceAreas' },
};

// Heading font choices. The webfont options reuse faces the app already loads
// globally (see src/app/layout.tsx), so picking any of them adds zero page
// weight; the last three are the original system-font stacks, kept so sites
// that saved one still match an option.
const HEADING_FONT_OPTIONS = [
  { label: 'Manrope', value: 'var(--font-manrope), system-ui, sans-serif' },
  { label: 'Plus Jakarta Sans', value: 'var(--font-jakarta), system-ui, sans-serif' },
  { label: 'DM Sans', value: 'var(--font-dmsans), system-ui, sans-serif' },
  { label: 'Inter', value: 'var(--font-vista-body), system-ui, sans-serif' },
  { label: 'Geist', value: 'var(--font-geist-sans), system-ui, sans-serif' },
  { label: 'Instrument Sans', value: 'var(--font-instrument), system-ui, sans-serif' },
  { label: 'Outfit', value: 'var(--font-outfit), system-ui, sans-serif' },
  { label: 'Space Grotesk', value: 'var(--font-display), system-ui, sans-serif' },
  { label: 'Sora', value: 'var(--font-sora), system-ui, sans-serif' },
  { label: 'Urbanist', value: 'var(--font-urbanist), system-ui, sans-serif' },
  { label: 'Montserrat', value: 'var(--font-montserrat), system-ui, sans-serif' },
  { label: 'Oswald', value: 'var(--font-oswald), system-ui, sans-serif' },
  { label: 'Bebas Neue', value: 'var(--font-bebas), Impact, sans-serif' },
  { label: 'Poppins', value: 'var(--font-care), system-ui, sans-serif' },
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
  { id: 'business', label: 'Setup' },
  { id: 'design', label: 'Brand' },
  { id: 'page', label: 'Page' },
  { id: 'publish', label: 'Publish' },
];

type PageSectionCategory = 'all' | 'top' | 'work' | 'trust' | 'conversion';

const PAGE_CATEGORIES: { id: PageSectionCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'top', label: 'Top of page' },
  { id: 'work', label: 'Work & media' },
  { id: 'trust', label: 'Trust & proof' },
  { id: 'conversion', label: 'Lead capture & bottom' },
];

const SECTION_CATEGORY_MAP: Record<string, PageSectionCategory> = {
  header: 'top',
  hero: 'top',
  announcement: 'top',
  services: 'work',
  quickStop: 'work',
  showcase: 'work',
  beforeAfter: 'work',
  video: 'work',
  blog: 'work',
  projectShowcase: 'work',
  testimonials: 'trust',
  faqs: 'trust',
  stats: 'trust',
  rating: 'trust',
  trustBadges: 'trust',
  whyUs: 'trust',
  howItWorks: 'trust',
  leadCapture: 'conversion',
  estimate: 'conversion',
  serviceAreas: 'conversion',
  stickyBar: 'conversion',
  chatButton: 'conversion',
  footer: 'conversion',
};

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

// Friendly nouns for the trade-glyph keys getTradeGlyph can return, so the logo
// card can say exactly which mark was picked ("a paint roller icon").
const TRADE_GLYPH_NOUNS: Record<string, string> = {
  wrench: 'wrench',
  bolt: 'lightning bolt',
  roller: 'paint roller',
  sparkles: 'sparkle',
  spray: 'spray can',
  leaf: 'leaf',
  tree: 'tree',
  truck: 'truck',
  shield: 'shield',
  home: 'house',
  droplet: 'water drop',
  wind: 'fan',
  bug: 'bug',
  hardhat: 'hard hat',
  hammer: 'hammer',
  grid: 'tile grid',
  faucet: 'faucet',
  drip: 'water drip',
  treestump: 'tree stump',
  cactus: 'cactus',
  bulldozer: 'bulldozer',
  chainsaw: 'chainsaw',
  toolscross: 'crossed tools',
  palm: 'palm tree',
  shrub: 'shrub',
  leafyGreen: 'leafy plant',
  pickaxe: 'pickaxe',
  tractor: 'tractor',
  fence: 'fence',
  rat: 'rodent',
  recycle: 'recycle',
  thermometerSnow: 'thermometer',
};

// Footer layouts offered in Brand → Footer. Shared across every theme via
// <SiteFooter>; the key is stored on content.footerStyle.
const FOOTER_STYLES: { key: string; label: string; desc: string }[] = [
  { key: 'columns', label: 'Columns', desc: 'Brand, links, and contact side by side.' },
  { key: 'cta', label: 'Quote band', desc: 'A “get a quote” strip above the footer.' },
  { key: 'centered', label: 'Centered', desc: 'Everything stacked down the middle.' },
  { key: 'grid', label: 'Info grid', desc: 'Four labeled columns of details.' },
];

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

export default function WebsiteBuilder({ site: initialSite, uploadedImages, messagingSetup, justBuilt = false, openTarget = null, aiCredits = null }: WebsiteBuilderProps) {
  const [site, setSite] = useState(initialSite);
  const [siteImages, setSiteImages] = useState(uploadedImages);
  const [availableAiCredits, setAvailableAiCredits] = useState<number | null>(aiCredits);
  const [jobPhotoOptions, setJobPhotoOptions] = useState<JobPhotoImportOption[]>([]);
  const [jobPhotosLoaded, setJobPhotosLoaded] = useState(false);
  const [internalReviewOptions, setInternalReviewOptions] = useState<CompletedJobReviewOption[]>([]);
  const [internalReviewsLoaded, setInternalReviewsLoaded] = useState(false);
  const [isLoadingInternalReviews, setIsLoadingInternalReviews] = useState(false);
  // Seeded rather than set in an effect: a deep link that switched tabs after
  // the first paint would show the Setup tab for a frame and then jump.
  const deepLink = openTarget ? OPEN_TARGETS[openTarget] ?? null : null;
  const [activeTab, setActiveTab] = useState<BuilderTab>(deepLink?.tab ?? 'business');

  const refreshAiCredits = useCallback(async () => {
    try {
      const credits = await getAvailableAiCreditsAction();
      if (typeof credits === 'number') {
        setAvailableAiCredits(credits);
      }
    } catch {
      // Graceful fallback
    }
  }, []);

  // The Page tab opens with everything collapsed, deliberately.
  //
  // It used to prime step 1 ("Customer intake setup") the first time the tab was
  // shown, on the theory that a guided 1-2-3 needs an obvious starting point.
  // But the tab is a LIST of ~20 sections, and landing with one expanded pushes
  // the rest off-screen and hides the shape of the page you're editing. Someone
  // arriving to change the footer had to scroll past an open card they never
  // asked for and then close it.
  //
  // Clicking a region in the live preview still opens its card — see the
  // edit-request handler below. That's navigation the owner asked for, which is
  // a different thing from an auto-open.
  const [openSection, setOpenSection] = useState<string | null>(deepLink?.card ?? 'basics');
  const [isDirty, setIsDirty] = useState(false);
  // Seeded from justBuilt so a contractor arriving from first run is told, in
  // the builder's own message slot, where all this text came from and what to do
  // with it — rather than meeting a finished website nobody explained.
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    justBuilt
      ? { type: 'success', text: 'Your site is written and saved — services, FAQs, the towns you serve and your Google listing, all from your trade and ZIP. The reviews and stats are AI examples, so they are switched OFF: replace them with real ones to turn them on. Change anything here, then hit Publish.' }
      : null,
  );
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
  // Mini search for the brand-icon picker: empty = the trade-suggested marks,
  // typed = filter the whole baked icon set by key or friendly noun.
  const [iconSearch, setIconSearch] = useState('');
  // Local string state for the free-numeric rating fields so decimal typing
  // (e.g. "4.9") isn't clobbered by re-normalization on every keystroke.
  const [ratingInput, setRatingInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.rating));
  const [reviewCountInput, setReviewCountInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.reviewCount));
  // Same decimal/clear-clobber guard for the per-stat Value fields: keep the
  // raw string while a stat is being edited so clearing doesn't snap to 0.
  const [uploadingTestimonialId, setUploadingTestimonialId] = useState<string | null>(null);
  // One list item is editable at a time; new items open for editing right away.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Briefly highlights a Design-tab field jumped to from the preview (e.g. the
  // hero badge control).
  const [flashField, setFlashField] = useState<string | null>(null);
  const [showLogoStudio, setShowLogoStudio] = useState(false);
  const [aiLogos, setAiLogos] = useState<GeneratedAiLogo[]>(() => ((initialSite.content as Record<string, unknown> | null)?.ai_logos as GeneratedAiLogo[]) || []);
  const [pendingAiLogo, setPendingAiLogo] = useState<PendingAiLogo | null>(() => ((initialSite.content as Record<string, unknown> | null)?.pending_ai_logo as PendingAiLogo) || null);

  // Poll for background AI logo completion if a generation is pending
  useEffect(() => {
    if (!pendingAiLogo || pendingAiLogo.status !== 'pending') return;

    const poller = setInterval(async () => {
      try {
        const res = await getAiLogosAction();
        if (res.logos && res.logos.length > 0) {
          setAiLogos(res.logos);
        }
        if (!res.pending || res.pending.status !== 'pending') {
          setPendingAiLogo(res.pending ?? null);
          refreshAiCredits();
        }
      } catch {
        // Keep polling
      }
    }, 2500);

    return () => clearInterval(poller);
  }, [pendingAiLogo, refreshAiCredits]);
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
  // The video studio popup — the section's style, videos and behavior all live
  // in there because a layout choice can't be judged from a 480px rail.
  // Which band the studio is editing, or null. An id rather than a boolean —
  // with several bands, "open" is no longer a complete answer.
  const [videoStudioId, setVideoStudioId] = useState<string | null>(null);
  // The section key currently being dragged in the "Page order" reorder list.
  const [dragKey, setDragKey] = useState<string | null>(null);
  // The card the pointer is currently over — shows the "lands here" indicator.
  const [overKey, setOverKey] = useState<string | null>(null);
  const dragGroupRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pageCategory, setPageCategory] = useState<PageSectionCategory>('all');
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const galleryImages = getSiteGallery(site.content);
  const siteContent = getSiteContent(site.content);
  const selectableImages = [...siteImages, ...STOCK_SITE_IMAGES];

  const dedicatedNumber =
    messagingSetup?.registration.kind === 'ok' && messagingSetup.registration.status === 'approved' && messagingSetup.registration.assignedNumber
      ? messagingSetup.registration.assignedNumber
      : null;

  const alertPhone =
    messagingSetup?.alerts.kind === 'ok' && messagingSetup.alerts.phone
      ? messagingSetup.alerts.phone
      : null;

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

  // AI-written examples nobody has reviewed yet. The flag is set at generation
  // and cleared the moment the owner edits the words, so these counts mean
  // "still in the model's voice", not "generated at some point".
  const generatedReviewCount = siteContent.testimonials.items.filter((item) => item.generated).length;
  const generatedStatCount = siteContent.stats.items.filter((item) => item.generated).length;
  // The publish gate, asked of the draft in the browser so the Publish tab can
  // say what is wrong before the round trip. publishSiteAction enforces it, and
  // updateSiteAction enforces it too once the site is live.
  const unreviewedSections = getUnreviewedGeneratedSections(site.content);
  // Which press the gate stops depends on whether the site is already up. On a
  // live site the save IS the deploy, so "can't publish" was false in exactly
  // the state this warning exists for — the owner has published, come back, and
  // switched a seeded section on.
  const gateSentence = site.published
    ? 'Your live site won’t update while this section is on and an example is still in it.'
    : 'Your site can’t publish while this section is on and an example is still in it.';

  // Review count for hints — mirrors getPublishedTestimonials exactly: manual
  // quotes are dropped in 'google' mode, Google reviews in 'manual' mode, and
  // empty-text Google reviews never render. Counting anything the public page
  // wouldn't show would defeat the "empty — won't show yet" warning.
  const reviewCount =
    (siteContent.testimonials.sourceMode === 'google' ? 0 : siteContent.testimonials.items.filter((item) => item.text.trim()).length)
    + (siteContent.testimonials.sourceMode === 'manual' ? 0 : siteContent.testimonials.googleReviews.filter((review) => review.text.trim()).length);

  // A count of unreviewed AI examples beats a count of reviews: "6 reviews" on
  // a collapsed card reads as six customers, which is the impression these two
  // sections must never give before somebody has looked at them.
  const reviewHint: { hint?: string; hintTone?: 'ok' | 'warn' } = generatedReviewCount > 0
    ? { hint: `${generatedReviewCount} AI ${generatedReviewCount === 1 ? 'example' : 'examples'}`, hintTone: 'warn' }
    : contentHint(siteContent.testimonials.enabled, reviewCount, 'review');
  const statsHint: { hint?: string; hintTone?: 'ok' | 'warn' } = generatedStatCount > 0
    ? { hint: `${generatedStatCount} AI ${generatedStatCount === 1 ? 'example' : 'examples'}`, hintTone: 'warn' }
    : contentHint(siteContent.stats.enabled, siteContent.stats.items.filter((item) => item.label.trim()).length, 'stat');

  // What to look their Business Profile up as, before they've typed anything.
  // Google's autocomplete wants a locality — the same company name in two towns
  // is two listings — so the first service-area city, or the free-text area,
  // comes along. Empty when there's nothing to go on, and the box just waits.
  const googleSearchGuess = [
    site.company_name.trim(),
    siteContent.serviceAreas.cities.map((city) => city.trim()).find(Boolean) || (site.service_area || '').trim(),
  ].filter(Boolean).join(' ');

  // Jump to a tab, open a card, and optionally focus a field — powers the
  // launch-checklist deep-links. Double rAF: the target tab's panel must render
  // before the element exists to scroll to.
  const jumpTo = useCallback((tab: BuilderTab, card: string | null, fieldId?: string) => {
    setActiveTab(tab);
    if (card) setOpenSection(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = (fieldId ? document.getElementById(fieldId) : document.querySelector(`.${styles.sectionCardOpen}`)) as HTMLElement | null;
      // A field is centred; a whole card goes to its top so you can see what
      // you opened. Centring a tall card leaves its heading off-screen above.
      el?.scrollIntoView({ behavior: 'smooth', block: fieldId ? 'center' : 'start' });
      if (fieldId) el?.focus({ preventScroll: true });
    }));
  }, []);

  // A deep link already opened its tab and card through the seeded state; this
  // only brings the card on screen. Worth doing: the Page tab is a list of ~20
  // sections and the one you were sent to can be well below the fold, which
  // reads as the link having done nothing.
  useEffect(() => {
    if (!deepLink) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelector(`.${styles.sectionCardOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Launch checklist — mirrors the publish gates so first-time owners can see
  // what's missing before they hit Publish (instead of error-by-error). Each
  // unmet item deep-links to the tab/card/field where it gets fixed.
  //
  // Generated examples do NOT count toward "your site has content": an invented
  // review is not a section the owner has filled in, and ticking the box for it
  // told them they were done when they were one click from publishing it.
  const hasLiveSection =
    (siteContent.services.enabled && siteContent.services.items.length > 0) ||
    (siteContent.howItWorks.enabled && siteContent.howItWorks.steps.some((step) => step.title.trim())) ||
    (siteContent.quickStop.enabled && siteContent.quickStop.items.length > 0) ||
    (siteContent.showcase.enabled && siteContent.showcase.items.length > 0) ||
    (siteContent.projectShowcase.enabled && siteContent.projectShowcase.items.length > 0) ||
    (siteContent.faqs.enabled && siteContent.faqs.items.some((faq) => faq.question.trim() && faq.answer.trim())) ||
    // Mirrors getPublishedTestimonials, like reviewCount above: sourceMode
    // decides which of the two lists renders, and an empty-text Google review
    // never does. "At least one content section" ticking green over reviews the
    // public page drops is the same false all-clear the generated-example
    // exclusion is here to prevent.
    (siteContent.testimonials.enabled && (
      (siteContent.testimonials.sourceMode !== 'google' && siteContent.testimonials.items.some((item) => item.text.trim() && !item.generated))
      || (siteContent.testimonials.sourceMode !== 'manual' && siteContent.testimonials.googleReviews.some((review) => review.text.trim()))
    )) ||
    (siteContent.serviceAreas.enabled && siteContent.serviceAreas.cities.some((city) => city.trim())) ||
    (siteContent.stats.enabled && siteContent.stats.items.some((item) => item.label.trim() && !item.generated)) ||
    (siteContent.beforeAfter.enabled && siteContent.beforeAfter.items.some((pair) => pair.beforeUrl && pair.afterUrl)) ||
    (siteContent.blog.enabled && publishedPostCount > 0);

  // "Get found on Google" — the two things that live OUTSIDE the website.
  const googleBusinessLinked = siteContent.socials.some((link) => link.platform === 'google');
  const verificationToken = parseVerificationToken(siteContent.googleSiteVerification);
  const verificationProblem = verificationTokenProblem(siteContent.googleSiteVerification);

  const launchChecklist = [
    { label: 'Company name', done: Boolean(site.company_name.trim()), hint: 'Setup tab — Business basics', go: () => jumpTo('business', 'basics', 'bf-company') },
    { label: 'Phone number', done: Boolean(site.phone), hint: 'Page tab — powers the call buttons', go: () => jumpTo('page', 'estimate', 'bf-phone') },
    { label: 'Hero image', done: Boolean(site.hero_url), hint: 'Page tab — Your hero', go: () => jumpTo('page', 'hero') },
    { label: 'Web address', done: Boolean(site.subdomain) || Boolean(site.custom_domain && domainStatus === 'verified'), hint: 'Add a subdomain below, or verify a custom domain', go: () => jumpTo('publish', null, 'pub-subdomain') },
    { label: 'At least one content section', done: hasLiveSection, hint: 'Page tab — e.g. Services or FAQs', go: () => jumpTo('page', 'services') },
    { label: 'Google listing filled in', done: Boolean((site.seo_title || '').trim() || (site.seo_description || '').trim()), hint: 'Publish tab — How you show up on Google', go: () => jumpTo('publish', 'seo', 'bf-seo-title') },
    // Not a publish gate — nothing here can create the listing for them. It sits
    // on the checklist because a finished website and no Business Profile is the
    // most common way a contractor ends up invisible for "<trade> near me", and
    // the builder is the one place they will definitely look.
    { label: 'Google Business Profile linked', done: googleBusinessLinked, hint: 'Publish tab — Get found on Google (the map results)', go: () => jumpTo('publish', 'found') },
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
    // On a live site the save is the deploy, so the publish gate applies to it
    // and updateSiteAction will refuse. Asked here too, for the same reason
    // handlePublish asks it here: the server can only throw a sentence, and
    // what an owner needs is to be standing in front of the card it is about.
    if (site.published && unreviewedSections.length > 0) {
      jumpTo('page', unreviewedSections[0] === 'Customer reviews' ? 'testimonials' : 'stats');
      setMessage({ type: 'error', text: `${unreviewedSections.join(' and ')} still contain AI-written examples — reviews from customers who never said them, numbers nobody counted. Replace them with your real ones, delete them, or switch those sections off before updating your live site.` });
      return;
    }
    startTransition(async () => {
      try {
        const updated = await updateSiteAction(siteUpdates(site));
        setSite(updated);
        setIsDirty(false);
        // On a published site the save IS the deploy — sites.ts writes to the
        // same row the public page reads. Say so rather than "saved", which
        // suggests something still has to be pushed.
        setMessage({ type: 'success', text: site.published ? 'Saved — your live site is updated.' : 'Website changes saved.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save changes.' });
      }
    });
  }, [site, unreviewedSections, jumpTo]);

  const handleRevert = useCallback(() => {
    setSite(initialSite);
    setIsDirty(false);
    historyRef.current = { past: [], future: [] };
    setHistoryVersion((v) => v + 1);
    setMessage({ type: 'success', text: 'All unsaved changes reverted.' });
  }, [initialSite]);

  const isSectionVisible = useCallback((key: string, searchTerms: string) => {
    if (pageCategory !== 'all') {
      const category = SECTION_CATEGORY_MAP[key];
      if (category !== pageCategory) return false;
    }
    if (pageSearchQuery.trim()) {
      const query = pageSearchQuery.trim().toLowerCase();
      return searchTerms.toLowerCase().includes(query);
    }
    return true;
  }, [pageCategory, pageSearchQuery]);

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
      header: 'header',
      'our-services': 'services',
      'quick-stop': 'quickStop',
      quickStop: 'quickStop',
      'how-it-works': 'howItWorks',
      showcase: 'showcase',
      reviews: 'testimonials',
      faqs: 'faqs',
      blog: 'blog',
      areas: 'serviceAreas',
      stats: 'stats',
      'before-after': 'beforeAfter',
      announcement: 'announcement',
      quoteForm: 'quoteForm',
      estimate: 'estimate',
      contact: 'quoteForm',
      whyUs: 'whyUs',
      trustBadges: 'trustBadges',
      ratingBadge: 'rating',
      projectShowcase: 'projectShowcase',
      video: 'video',
      chatButton: 'chatButton',
      footer: 'footer',
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

      // Cards scroll to their TOP, not their middle.
      //
      // These are tall — the Header card runs well past a screen — so
      // block:'center' put the card's midpoint at the viewport's midpoint and
      // pushed its heading off above. Clicking "Edit header" landed you in the
      // middle of the header controls with no title in sight, which reads as
      // having been dropped somewhere random rather than taken somewhere.
      //
      // Fields keep block:'center' (see focusField): one input can sit anywhere
      // inside a long card, and centring it is exactly right.
      const scrollCardToTop = () => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.querySelector(`.${styles.sectionCardOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      };

      const flashCard = (fieldKey: string, scrollId: string) => {
        setFlashField(fieldKey);
        setTimeout(() => setFlashField((current) => (current === fieldKey ? null : current)), 1600);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
      };

      // Business fields live inside collapsible cards, so the owning card must
      // open before focusField can find the input.
      if (target === 'hero') { setActiveTab('page'); setOpenSection('hero'); focusField('bf-headline'); return; }
      if (target === 'heroEyebrow') { setActiveTab('page'); setOpenSection('hero'); focusField('bf-hero-eyebrow'); return; }
      if (target === 'heroShadow') { setActiveTab('page'); setOpenSection('hero'); focusField('bf-hero-shadow-select'); return; }
      if (target === 'identity') { setActiveTab('design'); setOpenSection('typography'); focusField('bf-name-style'); return; }
      if (target === 'bizTagline') { setActiveTab('page'); setOpenSection('hero'); focusField('bf-tagline'); return; }
      if (target === 'bizArea') { setActiveTab('page'); setOpenSection('serviceAreas'); focusField('bf-area-intro'); return; }
      if (target === 'bizHours') { setActiveTab('page'); setOpenSection('footer'); focusField('bf-hours'); return; }
      if (target === 'bizPhone') { setActiveTab('page'); setOpenSection('estimate'); focusField('bf-phone'); return; }
      if (target === 'bizLicense') { setActiveTab('page'); setOpenSection('footer'); focusField('bf-license'); return; }
      if (target === 'legal') { setActiveTab('business'); setOpenSection('legal'); scrollCardToTop(); return; }
      // The customer-login link isn't edited here — it belongs to the portal,
      // which is an account setting. A new tab rather than a navigation: this
      // page can be holding unsaved website changes.
      if (target === 'clientPortal') { window.open('/dashboard/settings#client-portal', '_blank', 'noopener'); return; }
      // Socials live on Setup, not Page — so they're routed here rather than
      // falling through to SECTION_TARGETS, which assumes the Page tab.
      if (target === 'socials') { setActiveTab('business'); setOpenSection('socials'); scrollCardToTop(); return; }
      if (target === 'heroBadge') { setActiveTab('page'); setOpenSection('hero'); flashCard('heroBadge', 'design-hero-badge'); return; }
      if (target === 'headerTagline') { setActiveTab('design'); setOpenSection('logo'); focusField('bf-header-tagline'); return; }
      // The logo + auto trade-icon jump to the Brand tab's "Logo & brand icon" card
      if (target === 'brandIcon' || target === 'logo') { setActiveTab('design'); setOpenSection('logo'); scrollCardToTop(); return; }
      // Every photo opens the "Replace photo" popup, routed by what was clicked.
      if (target === 'heroImage') { setPicker({ label: 'the hero image', kind: 'hero' }); return; }
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
        scrollCardToTop();
      }
    }

    window.addEventListener('message', onEditRequest);
    return () => window.removeEventListener('message', onEditRequest);
  }, []);

  // An old ?topic= link — from a bookmark, or a dashboard reminder served
  // before the blog moved. Writing posts lives on Marketing → Blog now, so send
  // the topic there rather than dropping it and leaving somebody on a page with
  // no field to type it into.
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get('topic');
    if (!topic) return;
    window.location.replace(`/dashboard/marketing/blog?topic=${encodeURIComponent(topic.slice(0, 200))}`);
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

  const handleGenerateText = useCallback(() => {
    // siteIsUnwritten, not "are the four text fields empty". An owner with
    // fifteen hand-written services, six FAQs and six real reviews but a blank
    // headline was getting no confirmation at all before one click overwrote
    // every one of them.
    if (!siteIsUnwritten(site) && !window.confirm(
      'Generate a new example site?\n\n'
      + 'REPLACED: your headline, tagline, SEO title and description, hours, service area, photo gallery heading, and everything currently in your Services, FAQs and Cities-you-serve sections.\n\n'
      + 'KEPT: your uploaded photos, your own reviews and stats, and everything else on the page.\n\n'
      + 'Undo (Ctrl+Z) puts it back, until you save.',
    )) {
      return;
    }
    setIsGeneratingText(true);
    setMessage(null);
    startTransition(async () => {
      try {
        // A ZIP is the source of truth for location, so don't also send the saved
        // service_area (an earlier AI guess) — it would override the ZIP server-side.
        const genZip = getSiteContent(site.content).zip;
        const generated = await generateSiteTextAction({ trade: getSiteContent(site.content).trade, companyName: site.company_name, serviceArea: genZip ? undefined : (site.service_area ?? undefined), zip: genZip });
        // Same function the first-run seed uses, so the two can never diverge.
        const applied = applyGeneratedSiteText(site, generated);
        setSite(applied);
        setIsDirty(true);
        const imagesNote = generated.images.ok
          ? ' Trade-relevant stock photos are added — replace any with your own anytime.'
          : generated.images.configured
            ? ' We couldn’t load stock photos right now — add your own, or use “Regenerate stock images” to retry.'
            : '';
        // Read off what was actually seeded, not off what Generate usually does.
        // Both branches are skipped once the owner has reviews or numbers of
        // their own, so an owner with an imported Google feed was being told
        // their reviews had just been switched off — untouched, and still live.
        const appliedContent = getSiteContent(applied.content);
        const seededReviews = !appliedContent.testimonials.enabled && appliedContent.testimonials.items.some((item) => item.generated);
        const seededStats = !appliedContent.stats.enabled && appliedContent.stats.items.some((item) => item.generated);
        const examplesNote = seededReviews && seededStats
          ? ' Example reviews and stats are written but left switched OFF — invented customers, invented numbers. Replace them with real ones to turn them on.'
          : seededReviews
            ? ' Example reviews are written but left switched OFF: they name customers who never said anything. Replace them with real ones to turn them on.'
            : seededStats
              ? ' Example stats are written but left switched OFF: nobody counted those numbers. Replace them with real ones to turn them on.'
              : ' Your own reviews and stats were left exactly as they are.';
        setMessage({ type: 'success', text: `Full example site generated — headline, services, FAQs, and your Google listing (SEO) are all filled in.${imagesNote}${examplesNote}` });
        refreshAiCredits();
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to generate example content.' });
      } finally {
        setIsGeneratingText(false);
      }
    });
  }, [site, refreshAiCredits]);

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
        refreshAiCredits();
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not regenerate SEO text right now.' });
      } finally {
        setIsRegeneratingSeo(false);
      }
    });
  }, [refreshAiCredits]);

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
        refreshAiCredits();
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not regenerate stock images right now.' });
      } finally {
        setIsRegeneratingImages(false);
      }
    });
  }, [refreshAiCredits]);

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

  // Which reorderable card sits under a given viewport Y — used to resolve the
  // drop target during a pointer drag. Reads visual position (getBoundingClientRect
  // honors CSS `order`); skips any card not in sectionOrder (e.g. the pinned Hero).
  const cardKeyAtY = (y: number): string | null => {
    const container = dragGroupRef.current;
    if (!container) return null;
    const order = siteContent.sectionOrder;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-section-key]'))) {
      const k = el.getAttribute('data-section-key');
      if (!k || !order.includes(k)) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return k;
    }
    return null;
  };

  // The drag-to-reorder wiring for one Page-tab section card. Dragging runs on
  // Pointer Events off the GRIP (one path for mouse + touch), so the card's own
  // inputs are never draggable. While a drag is live the picked-up card pops, the
  // rest dim, and the card under the pointer shows a "lands here" line. ↑/↓ are a
  // keyboard/assistive fallback.
  const reorderProps = (key: string, label: string) => {
    const index = siteContent.sectionOrder.indexOf(key);
    const grip = (
      <>
        <span
          className={styles.sectionGrip}
          role="button"
          aria-label={`Drag to reorder ${label}`}
          onPointerDown={(event) => {
            event.preventDefault();
            try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch {}
            draggingRef.current = true;
            setDragKey(key);
            setOverKey(key);
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return;
            const over = cardKeyAtY(event.clientY);
            if (over) setOverKey(over);
          }}
          onPointerUp={(event) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
            const target = cardKeyAtY(event.clientY);
            if (target && target !== key) reorderSections(key, target);
            setDragKey(null);
            setOverKey(null);
          }}
          onPointerCancel={() => { draggingRef.current = false; setDragKey(null); setOverKey(null); }}
        >⠿</span>
        <span className={styles.sectionGripArrows}>
          <button type="button" aria-label={`Move ${label} up`} disabled={index <= 0} onClick={() => moveSectionBy(key, -1)}>↑</button>
          <button type="button" aria-label={`Move ${label} down`} disabled={index < 0 || index >= siteContent.sectionOrder.length - 1} onClick={() => moveSectionBy(key, 1)}>↓</button>
        </span>
      </>
    );
    return {
      grip,
      sectionKey: key,
      orderIndex: index < 0 ? 999 : index,
      active: dragKey === key,
      dimmed: dragKey !== null && dragKey !== key,
      over: overKey === key && dragKey !== null && dragKey !== key,
    };
  };

  // The Hero is pinned to the very top of the section list — always the top of the
  // page, so it's locked (no grip) and never a drop target. It only dims when a
  // real drag is happening elsewhere.
  const pinnedHeroReorder = () => ({
    grip: null,
    sectionKey: 'hero',
    orderIndex: -1,
    active: false,
    dimmed: dragKey !== null,
    over: false,
  });

  // The Header is pinned to the very top of the section list (above the Hero) —
  // it's the nav bar, always the first thing on the page, so it's locked (no
  // grip) and never a drop target. A lower order index than the Hero keeps it on
  // top.
  const pinnedHeaderReorder = () => ({
    grip: null,
    sectionKey: 'header',
    orderIndex: -2,
    active: false,
    dimmed: dragKey !== null,
    over: false,
  });

  // The Footer is pinned to the very bottom of the section list (a high CSS
  // order), so it's locked (no grip) and never a drop target — mirror of the
  // pinned Hero at the top.
  const pinnedFooterReorder = () => ({
    grip: null,
    sectionKey: 'footer',
    orderIndex: 900,
    active: false,
    dimmed: dragKey !== null,
    over: false,
  });

  const updateShowcase = useCallback((showcase: SiteShowcaseContent) => {
    updateSiteContent({ showcase });
  }, [updateSiteContent]);

  const updateQuoteForm = useCallback((quoteForm: SiteQuoteFormContent) => {
    updateSiteContent({ quoteForm });
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

  const loadInternalReviews = useCallback(() => {
    setIsLoadingInternalReviews(true);
    startTransition(async () => {
      try {
        const reviews = await listCompletedJobReviewsAction();
        setInternalReviewOptions(reviews);
        setInternalReviewsLoaded(true);
        if (reviews.length === 0) {
          setMessage({ type: 'success', text: 'No verified job reviews found yet. When customers rate your completed jobs on Let’s Get Quoted, they will appear here.' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load job reviews.' });
      } finally {
        setIsLoadingInternalReviews(false);
      }
    });
  }, []);

  const autoSyncCompletedJobs = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await syncCompletedJobsToSiteAction();
        if (res.addedItems > 0) {
          setMessage({ type: 'success', text: `Auto-synced ${res.addedItems} project photo(s) from completed jobs into your portfolio.` });
        } else {
          setMessage({ type: 'success', text: 'Portfolio is already up to date with completed jobs.' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to sync completed jobs.' });
      }
    });
  }, []);

  const autoSyncClientReviews = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await syncClientReviewsToSiteAction();
        if (res.addedTestimonials > 0) {
          setMessage({ type: 'success', text: `Auto-synced ${res.addedTestimonials} verified client review(s) to your testimonials section.` });
        } else {
          setMessage({ type: 'success', text: 'Testimonials are already up to date with verified reviews.' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to sync client reviews.' });
      }
    });
  }, []);


  const importInternalReview = useCallback((rev: CompletedJobReviewOption) => {
    const id = createContentId('rev');
    const newTestimonial: SiteTestimonialItem = {
      id,
      author: rev.clientName,
      text: rev.feedback,
      rating: rev.rating,
      label: rev.jobRef || 'Verified Homeowner',
      imageUrl: '',
      imageAlt: '',
      generated: undefined,
    };
    updateTestimonials({
      ...siteContent.testimonials,
      enabled: true,
      items: [newTestimonial, ...siteContent.testimonials.items],
    });
    setInternalReviewOptions((current) => current.filter((item) => item.id !== rev.id));
    setMessage({ type: 'success', text: `Imported review from ${rev.clientName}.` });
  }, [siteContent.testimonials, updateTestimonials]);

  // Edit one review in place. Rewriting the WORDS or the customer's name is the
  // owner taking authorship of the quote, so it clears the `generated` flag —
  // which is also how they get past the publish gate without a button that just
  // means "publish it anyway". Changing the star rating or the project label
  // isn't; the sentence is still the model's.
  const editTestimonial = useCallback((id: string, patch: Partial<SiteTestimonialItem>) => {
    const authored = typeof patch.text === 'string' || typeof patch.author === 'string';
    updateTestimonials({
      ...siteContent.testimonials,
      items: siteContent.testimonials.items.map((item) => (
        item.id === id ? { ...item, ...patch, generated: authored ? undefined : item.generated } : item
      )),
    });
  }, [siteContent.testimonials, updateTestimonials]);

  // Drop every unreviewed example at once — the answer for an owner who wants
  // none of them, rather than deleting six invented reviews one at a time.
  const removeGeneratedTestimonials = useCallback(() => {
    updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.filter((item) => !item.generated) });
  }, [siteContent.testimonials, updateTestimonials]);

  const updateAnalytics = useCallback((analytics: SiteAnalyticsContent) => {
    updateSiteContent({ analytics });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSiteContent]);

  const updateChatButton = useCallback((chatButton: SiteChatButtonContent) => {
    updateSiteContent({ chatButton });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const updateServiceAreas = useCallback((serviceAreas: SiteServiceAreasContent) => {
    updateSiteContent({ serviceAreas });
  }, [updateSiteContent]);

  const updateStats = useCallback((stats: SiteStatsContent) => {
    updateSiteContent({ stats });
  }, [updateSiteContent]);

  // Same contract as editTestimonial: typing over the figure or its label makes
  // the number the owner's, and clears the generated flag.
  const editStat = useCallback((id: string, patch: Partial<SiteStatItem>) => {
    const authored = typeof patch.value === 'string' || typeof patch.label === 'string';
    updateStats({
      ...siteContent.stats,
      items: siteContent.stats.items.map((item) => (
        item.id === id ? { ...item, ...patch, generated: authored ? undefined : item.generated } : item
      )),
    });
  }, [siteContent.stats, updateStats]);

  const removeGeneratedStats = useCallback(() => {
    updateStats({ ...siteContent.stats, items: siteContent.stats.items.filter((item) => !item.generated) });
  }, [siteContent.stats, updateStats]);

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

  const importJobPhotoToBeforeAfter = useCallback((photo: JobPhotoImportOption, side: 'before' | 'after') => {
    startTransition(async () => {
      try {
        const image = await importJobPhotoToSiteImageAction(photo.path, photo.label);
        setSiteImages((current) => [image, ...current]);
        const existing = siteContent.beforeAfter.items[0];
        const id = existing?.id || createContentId('ba');
        const updatedItem = existing
          ? {
              ...existing,
              ...(side === 'before' ? { beforeUrl: image.url, beforeAlt: image.alt } : { afterUrl: image.url, afterAlt: image.alt }),
            }
          : {
              id,
              beforeUrl: side === 'before' ? image.url : '',
              beforeAlt: side === 'before' ? image.alt : '',
              afterUrl: side === 'after' ? image.url : '',
              afterAlt: side === 'after' ? image.alt : '',
              label: '',
            };
        updateBeforeAfter({ ...siteContent.beforeAfter, enabled: true, items: [updatedItem] });
        setMessage({ type: 'success', text: `Job photo imported as ${side} photo.` });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import this job photo.' });
      }
    });
  }, [siteContent.beforeAfter, updateBeforeAfter]);

  const updateAnnouncement = useCallback((announcement: SiteAnnouncementContent) => {
    updateSiteContent({ announcement });
  }, [updateSiteContent]);

  const updateWhyUs = useCallback((whyUs: SiteWhyUsContent) => {
    updateSiteContent({ whyUs });
  }, [updateSiteContent]);

  const updateLegal = useCallback((legal: SiteLegalContent) => {
    updateSiteContent({ legal });
  }, [updateSiteContent]);


  // Forge, Guild and Vista are the three templates with their own built-in
  // editorial sections — an intro block and a work band that renders the Photo
  // gallery in place. They therefore get the "Intro section" and "Recent work
  // heading" cards, and skip the gallery layout picker + the Photo gallery drag
  // row, neither of which applies when the band owns the layout and position.

  // Themes migrated to the full color-scheme token system. For these the scheme
  // picker replaces the light/dark toggle (a scheme IS a light or dark palette).
  // Expands as the remaining themes are migrated; once all are, portal_mode's UI
  // can be retired entirely. Note: 'shine' is the template id for Lustre.

  // The wording each template shows in its hero eyebrow when the owner leaves the
  // field blank — surfaced as the input placeholder so they see what they'd override.
  const heroEyebrowPlaceholder = ((): string => {
    switch (site.template) {
      case 'carbon': return 'Done right. Every time.';
      case 'professional': return 'Work you can count on';
      case 'modern': return 'Diagnose / Repair / Deliver';
      case 'handy': return site.service_area ? `Serving ${site.service_area}` : 'Trusted home services';
      case 'coat': return 'Brushing dreams to life';
      case 'fixit': return 'Professional handyman services';
      case 'reno': return 'Professional renovation & repair';
      default: return 'e.g. Trusted local pros';
    }
  })();


  const updateServices = useCallback((services: SiteServicesContent) => {
    updateSiteContent({ services });
  }, [updateSiteContent]);

  const updateQuickStop = useCallback((quickStop: SiteQuickStopContent) => {
    updateSiteContent({ quickStop });
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

  const updateVideoSectionsList = useCallback((videoSections: SiteVideoSectionContent[]) => {
    const keys = new Set(videoSections.map((section) => videoSectionKey(section.id)));
    updateSiteContent({
      videoSections,
      // Drop the keys of bands that no longer exist and let parseSectionOrder
      // slot any new one in; leaving a dead key behind would silently reserve a
      // position on the page for something that is gone.
      sectionOrder: siteContent.sectionOrder.filter((key) => !key.startsWith('video') || keys.has(key)),
    });
  }, [siteContent.sectionOrder, updateSiteContent]);

  // Bands are addressed by id, never by index: the "Page order" list can move
  // them past each other, so a position is not a stable way to name one.
  const updateVideoSection = useCallback((section: SiteVideoSectionContent) => {
    updateSiteContent({
      videoSections: siteContent.videoSections.map((item) => (item.id === section.id ? section : item)),
    });
  }, [siteContent.videoSections, updateSiteContent]);

  const addVideoSection = useCallback(() => {
    if (siteContent.videoSections.length >= MAX_VIDEO_SECTIONS) return;
    // Highest existing number + 1, not length + 1: deleting the middle band of
    // three and adding one back would otherwise reuse a live id, and ids are
    // what sectionOrder holds.
    const highest = siteContent.videoSections.reduce((max, item) => {
      const n = Number(/^video-(\d+)$/.exec(item.id)?.[1] ?? 0);
      return n > max ? n : max;
    }, 0);
    const id = `video-${highest + 1}`;
    // Seeded off the first band so a second one inherits the site's voice, then
    // cleared of its clips — inheriting those would publish the same video twice.
    const seed = siteContent.videoSections[0];
    updateVideoSectionsList([...siteContent.videoSections, { ...seed, id, videos: [], style: 'split' }]);
  }, [siteContent.videoSections, updateVideoSectionsList]);

  const removeVideoSection = useCallback((id: string) => {
    if (siteContent.videoSections.length <= 1) return;
    updateVideoSectionsList(siteContent.videoSections.filter((item) => item.id !== id));
  }, [siteContent.videoSections, updateVideoSectionsList]);

  // The editable project photos: the owner's own set once they've touched it,
  // otherwise the SAME gallery fallback the template shows (so every photo on
  // screen is an editable tile — Replace via upload/stock, caption). The first
  // edit materializes this fallback into projectShowcase.items.
  // The owner's real project photos only. This deliberately does NOT seed the
  // placeholder tiles Care falls back to on its public page: editing one would
  // materialise all five stock shots into items, and they would then read as the
  // contractor's genuine completed work — on Care, and on any theme they later
  // switch to. Care's fallback stays a render-time detail, never saved content.
  const projectBase = useCallback((): SiteShowcaseItem[] => siteContent.projectShowcase.items, [siteContent.projectShowcase]);

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
        setMessage({ type: 'success', text: 'Job photo imported into your image gallery.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import this job photo.' });
      }
    });
  }, [siteContent.projectShowcase, projectBase, updateProjectShowcase]);

  // The tiles the Project-showcase editor renders — real items or the gallery
  // fallback shown as editable placeholders (see projectBase).
  const projectPhotos = projectBase();
  // Whether the band, AS THE PUBLIC PAGE WILL DRAW IT, is showing the owner's
  // own photos — which decides whether it keeps the "Recent Jobs / See Our
  // Work" heading. Mirrors SiteContentSections: with the card empty, Haven
  // falls back to the image library, so an owner who uploaded eight photos of
  // their finished jobs there has earned the heading without ever opening this
  // card. Asking the card alone told exactly that owner their work was stock.
  const projectBandOwnPhotos = (() => {
    const saved = siteContent.projectShowcase.items.filter((item) => item.url && item.alt);
    if (saved.length > 0) return saved.some((item) => item.source === 'upload');
    if (site.template !== 'handy') return false;
    // Only the photos that fit in the band — the same slice the template takes.
    return galleryImages.slice(0, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS).some((item) => item.source === 'upload');
  })();
  // Mirrors contentHint's contract, which the inline version ignored: a section
  // that is OFF makes no promise about showing, so it must not warn that photos
  // are missing. Care still falls back to placeholders when empty, so it never warns.
  const projectShowcaseHint: { hint?: string; hintTone?: 'ok' | 'warn' } = (() => {
    const { enabled, items } = siteContent.projectShowcase;
    if (items.length > 0) return { hint: `${items.length} ${items.length === 1 ? 'photo' : 'photos'}`, hintTone: 'ok' };
    if (!enabled) return {};
    return site.template === 'handy'
      ? { hint: 'using placeholder photos', hintTone: 'ok' }
      : { hint: "empty — won't show yet", hintTone: 'warn' };
  })();

  // Video card hint. A section switched on with nothing to play publishes
  // nothing, so it says so rather than showing a confident "On".
  // Every clip across every section — what decides whether offering a link to
  // the /videos page makes sense at all.
  const allVideoClipCount = siteContent.videoSections.reduce(
    (total, section) => total + section.videos.filter((clip) => clip.url.trim()).length, 0,
  );

  const videoCards = siteContent.videoSections.map((section, index) => {
    const clips = section.videos.filter((item) => item.url.trim());
    return {
      section,
      clips,
      styleLabel: VIDEO_SECTION_STYLES.find((style) => style.key === section.style)?.label ?? 'Video',
      shown: Math.min(clips.length, videoStyleCapacity(section.style)),
      hint: contentHint(section.enabled, clips.length, 'video') as { hint?: string; hintTone?: 'ok' | 'warn' },
      // Numbered only once there is more than one, matching reorderableSectionsFor.
      label: siteContent.videoSections.length === 1 ? 'Video Section' : `Video Section ${index + 1}`,
      key: videoSectionKey(section.id),
    };
  });

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
    // A block, not a warning, and the same one publishSiteAction enforces —
    // this only gets to it first, and can point at the card that fixes it.
    // There is a way through that isn't a "publish anyway" button: replace the
    // words, delete the examples, or switch the section off.
    if (nextPublished && unreviewedSections.length > 0) {
      jumpTo('page', unreviewedSections[0] === 'Customer reviews' ? 'testimonials' : 'stats');
      setMessage({ type: 'error', text: `${unreviewedSections.join(' and ')} still contain AI-written examples — reviews from customers who never said them, numbers nobody counted. Replace them with your real ones, delete them, or switch those sections off.` });
      return;
    }

    startTransition(async () => {
      try {
        // Taking the site DOWN happens first, because updateSiteAction applies
        // the same gate to a live site — and being unable to unpublish is the
        // one way this block must never fail. Going up keeps the old order: the
        // save has to land before the row is served.
        if (!nextPublished) await publishSiteAction(false);
        const saved = await updateSiteAction(siteUpdates(site));
        if (nextPublished) await publishSiteAction(true);
        setSite({ ...saved, published: nextPublished });
        setIsDirty(false);
        setMessage({ type: 'success', text: nextPublished ? 'Your website is live.' : 'Your website is now private.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update publishing.' });
      }
    });
  }, [domainStatus, site, unreviewedSections, jumpTo]);

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
          if (result.sslStatus === 'issued') {
            setMessage({ type: 'success', text: 'Custom domain verified and connected with active SSL.' });
          } else if (result.sslStatus === 'pending') {
            setMessage({ type: 'success', text: 'DNS verified. SSL certificate provisioning is in progress (usually takes 1–5 minutes).' });
          } else {
            setMessage({ type: 'success', text: 'Custom domain verified and connected.' });
          }
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
    <main className={styles.builderShell} data-tour-id="website:builder">
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
          {/* On a published site there is no draft to hold changes back: a save
              writes straight to the page homeowners are looking at. Saying "All
              changes saved" describes a filing cabinet; this says what actually
              happened. */}
          <span className={styles.saveStatus}>{isDirty ? (site.published ? 'Unsaved changes — your live site still shows the last save' : 'Unsaved changes') : site.published ? 'Your live site is up to date' : 'All changes saved'}</span>
          {site.published && liveUrl && liveDomain ? (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={styles.liveStatusLink}>
              <span className={styles.liveStatusDot} aria-hidden="true" />
              Website LIVE @ {liveDomain}
            </a>
          ) : null}
        </div>
        <div className={styles.builderActions}>
          {typeof availableAiCredits === 'number' ? (
            <div className={`${styles.headerCreditBadge}${availableAiCredits <= 25 ? ` ${styles.headerCreditBadgeLow}` : ''}`}>
              <span>⚡ {availableAiCredits.toLocaleString('en-US')} AI {availableAiCredits === 1 ? 'credit' : 'credits'}</span>
              {availableAiCredits <= 25 ? (
                <a href="/dashboard/settings#buy-credits" className={styles.aiCreditChipTopUp}>
                  + Top up
                </a>
              ) : null}
            </div>
          ) : null}
          <button type="button" className="btn secondary" onClick={undo} disabled={historyRef.current.past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo last change">↩ Undo</button>
          <button type="button" className="btn secondary" onClick={redo} disabled={historyRef.current.future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo change">↪ Redo</button>
          <a href="/dashboard/sites/preview" target="_blank" rel="noopener noreferrer" className="btn secondary">Site Preview</a>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setShowLogoStudio(true)}
            title="Open AI Logo & Brand Studio"
            style={{ borderColor: 'rgba(168, 85, 247, 0.4)', color: '#a855f7', fontWeight: 700 }}
          >
            🎨 Brand Studio
          </button>
          <Link
            href="/dashboard/merchandise"
            className="btn secondary"
            title="Order matching crew uniforms, business cards & truck signs"
            style={{ textDecoration: 'none' }}
          >
            👕 Merch
          </Link>
          {/* Only rendered when there is something to save. A disabled primary
              button beside "your live site is up to date" was one state drawn
              twice, and the disabled style only fades it enough to look like a
              button somebody could still press.
              `isDirty` alone, not `isDirty || isPending`: `isPending` is the one
              shared transition, so the subdomain availability check, the SEO
              regenerate, an image upload and Publish all set it, and a clean
              site got a primary button reading "Saving..." popping into the
              header for something that was not a save. It buys nothing on the
              save path either — isDirty is not cleared until the action has
              returned, so the button stays mounted for the whole round trip. */}
          {isDirty && (
            <button
              type="button"
              className={styles.revertBtn}
              onClick={handleRevert}
              disabled={isPending}
              title="Discard all unsaved edits"
            >
              ✕ Discard
            </button>
          )}
          {isDirty && (
            <button type="button" className="btn primary" onClick={handleSave} disabled={isPending || !isDirty}>
              {isPending ? 'Saving...' : site.published ? 'Save & update live site' : 'Save changes'}
            </button>
          )}
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
                  <h2>Setup</h2>
                  <p>Who you are — the business facts your whole website pulls from.</p>
                </div>

                <SectionCard title="Business basics" description="Your company name and trade power everything else — including the AI quick-start below." open={openSection === 'basics'} onToggleOpen={() => toggleSection('basics')}>
                  <div className={styles.drivers}>
                    <p className={styles.driversKicker}>✦ These power your whole site</p>
                    <div className={styles.formColumns}>
                      <label className={styles.formField}><span>Company name</span><input id="bf-company" value={site.company_name} onChange={(event) => handleChange('company_name', event.target.value)} /></label>
                      <label className={styles.formField}><span>Field of work / trade</span><input value={siteContent.trade} onChange={(event) => updateSiteContent({ trade: event.target.value })} placeholder="e.g. Window cleaning, roofing, HVAC" /></label>
                    </div>
                    <label className={styles.formField}><span>ZIP code</span><input value={siteContent.zip} maxLength={12} inputMode="numeric" onChange={(event) => updateSiteContent({ zip: event.target.value })} placeholder="e.g. 48226" /><small className={styles.fieldHint}>Sets your service area — the AI names the real nearby cities and towns you serve.</small></label>
                    <p className={styles.fieldHint} style={{ marginTop: '0.4rem' }}>Also editable under <a href="/dashboard/settings#business-basics">Settings &rarr; Business</a> — both stay in sync.</p>
                    <p className={styles.driversCaption}>Your headline, services, FAQs, service area, and Google listing are all generated from these.</p>
                  </div>
                  <div className={styles.aiButtonGroup}>
                    <button type="button" className={`btn primary ${styles.aiButton}`} onClick={handleGenerateText} disabled={isGeneratingText}>
                      {isGeneratingText ? 'Creating your tailored Website...' : '✨ Generate a full example site with AI'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <AiCreditIndicator credits={availableAiCredits} cost={1} />
                      <small className={styles.fieldHint} style={{ margin: 0 }}>Instant full website generation</small>
                    </div>
                  </div>
                  <small className={styles.fieldHint}>Fills in your whole site — headline, services, FAQs, Google listing, and more — from these two fields. Watch it appear in the preview. Reviews and stats are filled with examples — swap in your real ones before you publish.</small>

                  {/* Brand Identity & Jobsite Gear Quick-Launch Card */}
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1.1rem',
                      borderRadius: '12px',
                      background: 'radial-gradient(ellipse at 88% 12%, rgba(168, 85, 247, 0.12), transparent 55%), rgba(var(--tint), 0.03)',
                      border: '1.5px solid rgba(168, 85, 247, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#a855f7',
                            marginBottom: '0.15rem',
                          }}
                        >
                          ✦ Step 2: Brand Identity &amp; Jobsite Gear
                        </span>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text)' }}>
                          {site.logo_url ? 'Your Company Brand & Merch' : 'Give Your Website a Custom Brand Logo'}
                        </h3>
                      </div>
                      {site.logo_url && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'rgba(var(--tint), 0.06)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(var(--tint), 0.12)',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={site.logo_url} alt="Active brand logo" style={{ height: '22px', maxWidth: '44px', objectFit: 'contain' }} />
                          <span style={{ fontSize: '0.72rem', color: 'var(--good)', fontWeight: 700 }}>Active Logo</span>
                        </div>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                      {site.logo_url
                        ? 'Your custom logo is active in your website header. Open Brand Studio to generate new vector variations, or outfit your crew with matching uniforms and truck signs.'
                        : 'A custom logo replaces the plain text header on your website and establishes your visual identity. Generate bespoke vector concepts in seconds or order matching real-world swag.'}
                    </p>

                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowLogoStudio(true)}
                        style={{
                          flex: '1 1 180px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 0.9rem',
                          borderRadius: '8px',
                          border: '1.5px solid #a855f7',
                          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(99, 102, 241, 0.18))',
                          color: '#c084fc',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🎨 {site.logo_url ? 'Open AI Brand Studio' : '✨ Generate AI Logo Now'}
                      </button>

                      <Link
                        href="/dashboard/merchandise"
                        style={{
                          flex: '1 1 200px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 0.9rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(var(--tint), 0.12)',
                          background: 'rgba(var(--tint), 0.05)',
                          color: 'var(--text)',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        👕 Order Uniforms &amp; Merch &rarr;
                      </Link>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Socials &amp; listings"
                  description="Link your Facebook, Instagram, Google Business Profile and review listings."
                  evidence="Homeowners check your reviews before they call — linking the listings you already have is the cheapest trust you can add."
                  hint={siteContent.socials.length > 0 ? `${siteContent.socials.length} linked` : undefined}
                  open={openSection === 'socials'}
                  onToggleOpen={() => toggleSection('socials')}
                >
                  <SocialsField
                    socials={siteContent.socials}
                    socialsInHeader={siteContent.socialsInHeader}
                    onChange={(socials) => updateSiteContent({ socials })}
                    onHeaderChange={(socialsInHeader) => updateSiteContent({ socialsInHeader })}
                  />
                </SectionCard>

                <SectionCard
                  title="Visitor tracking"
                  description="Connect your own Google Analytics or Facebook pixel, with a consent banner that actually waits for a yes."
                  hint={siteContent.analytics.ga4.trim() || siteContent.analytics.metaPixel.trim() ? 'Connected' : undefined}
                  open={openSection === 'analytics'}
                  onToggleOpen={() => toggleSection('analytics')}
                >
                  <AnalyticsField analytics={siteContent.analytics} onChange={updateAnalytics} />
                </SectionCard>

              </div>
            )}

            {activeTab === 'design' && (
              <div className={styles.formSection}>
                <SectionCard title="Theme &amp; colors" open={openSection === 'theme'} onToggleOpen={() => toggleSection('theme')}>
                  <div className={styles.cardGroupLabel}>Theme</div>
                  <div className={styles.themeGrid}>
                    {AVAILABLE_TEMPLATES.map((template) => (
                      <button type="button" key={template.id} className={`${styles.themeOption}${site.template === template.id ? ` ${styles.selectedTheme}` : ''}`} onClick={() => handleChange('template', template.id as TemplateType)} aria-pressed={site.template === template.id}>
                        <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} abbr={template.abbr} />
                        <span className={styles.themeOptionInfo}><strong>{template.name}</strong></span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.cardGroupLabel}>Color</div>
                  <div className={styles.formField}>
                    <span>Color scheme</span>
                    {(() => {
                      const currentTemplateConfig = AVAILABLE_TEMPLATES.find((t) => t.id === site.template) || AVAILABLE_TEMPLATES[0];
                      const activeSchemes = getActiveColorSchemes();
                      const currentKey = siteContent.colorScheme;
                      const isLegacy = COLOR_SCHEMES.some((s) => s.key === currentKey && s.status === 'legacy');
                      const shownSchemes = isLegacy
                        ? [...activeSchemes, COLOR_SCHEMES.find((s) => s.key === currentKey)!]
                        : activeSchemes;

                      return (
                        <>
                          <div className={styles.schemeSwatches} role="group" aria-label="Full color schemes">
                            <button
                              type="button"
                              className={`${styles.schemeSwatch}${!siteContent.colorScheme ? ` ${styles.schemeSwatchActive}` : ''}`}
                              onClick={() => updateSiteContent({ colorScheme: '' })}
                              aria-pressed={!siteContent.colorScheme}
                              aria-label="Theme default — template built-in palette"
                            >
                              <div className={styles.schemeMockup} style={{ background: '#0f1319' }}>
                                <div className={styles.mockHeader} style={{ background: '#080a0d' }}>
                                  <span style={{ width: 12, height: 2, background: '#eef2f7', borderRadius: 1, display: 'inline-block' }} />
                                </div>
                                <div className={styles.mockBody}>
                                  <div className={styles.mockCard} style={{ background: '#171c24', border: '1px solid #252c37' }}>
                                    <div>
                                      <div className={styles.mockLineTitle} style={{ background: '#eef2f7' }} />
                                      <div className={styles.mockLineBody} style={{ background: '#94a1b2' }} />
                                    </div>
                                    <span className={styles.mockCta} style={{ background: currentTemplateConfig.accent || '#f0b429' }} />
                                  </div>
                                </div>
                              </div>
                              <div className={styles.schemeMeta}>
                                <span className={styles.schemeTitle}>Theme default</span>
                                <span className={styles.schemeMood}>Template built-in</span>
                              </div>
                            </button>

                            {shownSchemes.map((scheme) => {
                              const selected = siteContent.colorScheme === scheme.key;
                              const isLegacyScheme = scheme.status === 'legacy';
                              return (
                                <button
                                  key={scheme.key}
                                  type="button"
                                  className={`${styles.schemeSwatch}${selected ? ` ${styles.schemeSwatchActive}` : ''}`}
                                  onClick={() => updateSiteContent({ colorScheme: scheme.key })}
                                  title={scheme.label}
                                  aria-label={`${scheme.label}${isLegacyScheme ? ' (Legacy palette)' : ''}${selected ? ' (selected)' : ''}`}
                                  aria-pressed={selected}
                                >
                                  {isLegacyScheme && <span className={styles.legacyBadge}>Legacy</span>}
                                  <div className={styles.schemeMockup} style={{ background: scheme.bg }}>
                                    <div className={styles.mockHeader} style={{ background: scheme.deep }}>
                                      <span style={{ width: 12, height: 2, background: scheme.onDeep, borderRadius: 1, display: 'inline-block' }} />
                                    </div>
                                    <div className={styles.mockBody}>
                                      <div className={styles.mockCard} style={{ background: scheme.surface, border: `1px solid ${scheme.line}` }}>
                                        <div>
                                          <div className={styles.mockLineTitle} style={{ background: scheme.surfaceInk || scheme.ink }} />
                                          <div className={styles.mockLineBody} style={{ background: scheme.surfaceMuted || scheme.muted }} />
                                        </div>
                                        <span className={styles.mockCta} style={{ background: scheme.accent }} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className={styles.schemeMeta}>
                                    <span className={styles.schemeTitle}>{scheme.label.split(' — ')[0]}</span>
                                    <span className={styles.schemeMood}>{scheme.mood || (scheme.tone === 'dark' ? 'Dark' : 'Light')}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {isLegacy && (
                            <div className={styles.legacyCallout}>
                              <div>
                                <strong>Legacy palette in use:</strong> Site is using <em>{getColorScheme(currentKey)?.label.split(' — ')[0]}</em>. We recommend upgrading to <strong>{currentKey === 'slate' ? 'Harbor' : 'Evergreen'}</strong> for enhanced contrast.
                              </div>
                              <button
                                type="button"
                                className={styles.legacySwitchBtn}
                                onClick={() => updateSiteContent({ colorScheme: currentKey === 'slate' ? 'harbor' : 'evergreen' })}
                              >
                                Switch to {currentKey === 'slate' ? 'Harbor' : 'Evergreen'}
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {(() => {
                    const currentTemplateConfig = AVAILABLE_TEMPLATES.find((t) => t.id === site.template) || AVAILABLE_TEMPLATES[0];
                    const activeScheme = getColorScheme(siteContent.colorScheme);
                    const schemeDefaultAccent = activeScheme?.accent || currentTemplateConfig?.accent || '#f0b429';
                    const hasCustomAccent = Boolean(site.accent_override && site.accent_override.trim() && site.accent_override.toLowerCase() !== schemeDefaultAccent.toLowerCase());
                    const effectiveAccent = site.accent_override || schemeDefaultAccent;
                    const baseName = activeScheme ? activeScheme.label.split(' — ')[0] : `${currentTemplateConfig.name} default`;

                    return (
                      <div className={styles.formField}>
                        <div className={styles.accentHeaderRow}>
                          <div className={styles.accentStatusRow}>
                            <span>Accent color</span>
                            <span className={styles.accentStatusBadge} data-custom={hasCustomAccent}>
                              <span className={styles.accentDot} style={{ background: effectiveAccent }} />
                              {hasCustomAccent ? `${baseName} base · Custom accent` : 'Matching scheme'}
                            </span>
                          </div>
                          {hasCustomAccent && (
                            <button
                              type="button"
                              className={styles.accentResetBtn}
                              onClick={() => handleChange('accent_override', null)}
                              title="Reset accent color to match the selected color scheme"
                            >
                              Use scheme default
                            </button>
                          )}
                        </div>
                        <div className={styles.colorControl}>
                          <input
                            type="color"
                            value={effectiveAccent}
                            onChange={(event) => handleChange('accent_override', event.target.value)}
                            aria-label="Custom accent color picker"
                          />
                          <input
                            value={site.accent_override || ''}
                            placeholder={`Scheme default: ${schemeDefaultAccent}`}
                            onChange={(event) => handleChange('accent_override', event.target.value || null)}
                            aria-label="Custom accent hex value"
                          />
                        </div>
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
                        <small className={styles.fieldHint}>
                          {hasCustomAccent
                            ? `Custom accent is active and colors buttons, badges, and highlights independently of the ${baseName} color scheme.`
                            : `Using ${activeScheme ? `${activeScheme.label.split(' — ')[0]} scheme` : `${currentTemplateConfig.name} theme`} default accent (${schemeDefaultAccent}). Tap any swatch or color picker to set an independent custom override.`}
                        </small>
                      </div>
                    );
                  })()}

                </SectionCard>

                <SectionCard title="Logo &amp; brand icon" description="Your business logo or trade icon — shown in the header, footer, and browser tab." open={openSection === 'logo'} onToggleOpen={() => toggleSection('logo')}>
                  <div className={styles.imageSlot}>
                    {site.logo_url
                      ? <div className={styles.logoPreviews}><div className={styles.logoPreview}><img src={site.logo_url} alt="Logo on a light header" data-logo-style={siteContent.logoStyle} /><em>Light</em></div><div className={styles.logoPreviewDark}><img src={site.logo_url} alt="Logo on a dark header" data-logo-style={siteContent.logoStyle} /><em>Dark</em></div></div>
                      : (() => {
                          const glyphOptions = getTradeGlyphOptions(siteContent.trade);
                          const glyph = glyphForContent(siteContent);
                          const accent = site.accent_override || '#ff7a21';
                          const query = iconSearch.trim().toLowerCase();
                          const shownGlyphs = query
                            ? SERVICE_ICON_KEYS.filter((key) => key.toLowerCase().includes(query) || (TRADE_GLYPH_NOUNS[key] ?? '').toLowerCase().includes(query))
                            : glyphOptions;
                          return (
                            <div className={styles.autoLogoWrap}>
                              <div className={styles.autoLogo}>
                                <span className={styles.autoLogoChip} data-logo-style={siteContent.logoStyle} style={{ color: accent }}>
                                  <ServiceIcon name={glyph} className={styles.autoLogoGlyph} />
                                </span>
                                <div className={styles.autoLogoMeta}>
                                  <strong>Auto icon for your trade</strong>
                                  <small>Pick the mark that fits best — it’s your header, footer, and browser-tab icon until you add your own logo.</small>
                                </div>
                              </div>
                              <input
                                type="search"
                                className={styles.glyphSearch}
                                value={iconSearch}
                                onChange={(event) => setIconSearch(event.target.value)}
                                placeholder="Search all icons — e.g. wrench, leaf, truck, drill"
                                aria-label="Search brand icons"
                              />
                              {shownGlyphs.length > 0 ? (
                                <div className={styles.glyphPicker} role="group" aria-label="Choose your brand icon">
                                  {shownGlyphs.map((key) => (
                                    <button
                                      type="button"
                                      key={key}
                                      className={`${styles.glyphPickerBtn}${glyph === key ? ` ${styles.glyphPickerBtnOn}` : ''}`}
                                      style={{ color: accent }}
                                      aria-pressed={glyph === key}
                                      aria-label={`Use the ${TRADE_GLYPH_NOUNS[key] ?? key} icon`}
                                      onClick={() => updateSiteContent({ brandGlyph: key })}
                                    >
                                      <ServiceIcon name={key} className={styles.glyphPickerGlyph} />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className={styles.glyphSearchEmpty}>No icons match “{iconSearch.trim()}”. Try another word.</p>
                              )}
                              <label className={styles.autoLogoTransparent}>
                                <input
                                  type="checkbox"
                                  checked={siteContent.logoStyle === 'transparent'}
                                  onChange={(event) => updateSiteContent({ logoStyle: event.target.checked ? 'transparent' : 'rounded' })}
                                />
                                <span><strong>Transparent background</strong><small>Show just the icon on your site — drop the tile behind it.</small></span>
                              </label>
                            </div>
                          );
                        })()}
                    <hr className={styles.logoDivider} />
                    <div className={styles.imageSlotActions} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className={`${styles.secondaryAction} btn primary`} onClick={() => setShowLogoStudio(true)} style={{ background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700 }}>
                        ✨ AI Logo Studio
                      </button>
                      {pendingAiLogo?.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setShowLogoStudio(true)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.45rem 0.8rem',
                            borderRadius: '8px',
                            background: '#f3e8ff',
                            border: '1.5px solid #a855f7',
                            color: '#6d28d9',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'inline-block', animation: 'aiBuilderSpin 3s linear infinite' }}>✦</span>
                          <span>AI Art Director is building your logo…</span>
                        </button>
                      )}
                      <AiCreditIndicator credits={availableAiCredits} />
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('your logo', 'logo')}>{site.logo_url ? 'Replace photo' : 'Upload custom file'}</button>
                      {site.logo_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('logo_url', null)}>Remove</button>}
                    </div>
                    <div className={styles.formColumns}>
                      <label className={styles.formField}><span>Logo style</span><select value={siteContent.logoStyle} onChange={(event) => updateSiteContent({ logoStyle: event.target.value })}><option value="plain">Plain (no frame)</option><option value="transparent">Transparent (no background)</option><option value="rounded">Rounded corners</option><option value="squircle">Squircle</option><option value="circle">Circle</option><option value="framed">Framed chip (padding + border)</option></select></label>
                      <label className={styles.formField}><span>Logo size</span><select value={siteContent.logoSize} onChange={(event) => updateSiteContent({ logoSize: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
                    </div>
                    <label className={styles.toggleRow} style={{ marginTop: '.65rem', marginBottom: '.35rem' }}>
                      <input
                        type="checkbox"
                        checked={!siteContent.hideHeaderCompanyName}
                        onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                      />
                      <span>
                        <strong>Show text company name in header</strong>
                        <small>Turn off if your logo already includes your company name, so it doesn&apos;t appear twice.</small>
                      </span>
                    </label>
                    <label className={styles.formField} style={{ marginTop: '.65rem' }}>
                      <span>Header tagline / slogan</span>
                      <input
                        id="bf-header-tagline"
                        type="text"
                        value={siteContent.headerTagline}
                        maxLength={100}
                        placeholder="e.g. 24/7 Emergency Service • Licensed & Insured"
                        onChange={(event) => updateSiteContent({ headerTagline: event.target.value })}
                      />
                      <small className={styles.fieldHint}>Displayed in the website header next to your logo. Perfect for a catchy trade slogan or trust badge.</small>
                    </label>
                    <small className={styles.fieldHint}>Best as a <strong>PNG or SVG with a transparent background</strong> — wide and simple. Aim for ~400×120px; it&apos;s shown up to 70px tall.</small>
                  </div>
                </SectionCard>

                <SectionCard title="Typography &amp; buttons" description="Select typography and button styles that define your brand across the entire site." open={openSection === 'typography'} onToggleOpen={() => toggleSection('typography')}>
                  <label className={styles.formField}><span>Heading font</span><select value={site.header_font || ''} onChange={(event) => handleChange('header_font', event.target.value || null)}>
                    <option value="">Theme default</option>
                    {HEADING_FONT_OPTIONS.map((font) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
                  </select></label>

                  <label className={styles.formField} id="bf-brand-font"><span>Company name font</span>
                    <select value={siteContent.brandFont} onChange={(event) => updateSiteContent({ brandFont: event.target.value })} style={{ fontFamily: siteContent.brandFont && siteContent.brandFont !== 'var(--theme-display)' ? siteContent.brandFont : undefined }}>
                      <option value="">Theme default</option>
                      <option value="var(--theme-display)">Match heading font</option>
                      {HEADING_FONT_OPTIONS.map((font) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
                    </select>
                  </label>

                  <label className={styles.toggleRow} style={{ marginTop: '.65rem', marginBottom: '.75rem' }}>
                    <input
                      type="checkbox"
                      checked={!siteContent.hideHeaderCompanyName}
                      onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                    />
                    <span>
                      <strong>Show company name in header</strong>
                      <small>Display your text business name next to your logo in the header. Turn off if your logo already includes your name.</small>
                    </span>
                  </label>

                  <div className={styles.formField} id="bf-name-style">
                    <span>Company name style</span>
                    {(() => {
                      const nm = site.company_name.trim() || 'Your Company';
                      const parts = nm.split(/\s+/);
                      const renderName = () => parts.length <= 1
                        ? <span className={`${styles.wmPreviewFirst} ${styles.wmPreviewLast}`}>{nm}</span>
                        : parts.map((word, i) => <span key={i}>{i > 0 ? ' ' : ''}<span className={i === 0 ? styles.wmPreviewFirst : i === parts.length - 1 ? styles.wmPreviewLast : styles.wmPreviewMid}>{word}</span></span>);
                      const previewFont = siteContent.brandFont && siteContent.brandFont !== 'var(--theme-display)' ? siteContent.brandFont : undefined;
                      const options = [{ key: '', label: 'Standard' }, ...WORDMARK_STYLES];
                      return (
                        <div className={styles.namePicker} role="radiogroup" aria-label="Company name style" style={{ '--wm-accent': site.accent_override || '#ff7a21', fontFamily: previewFont, opacity: siteContent.hideHeaderCompanyName ? 0.65 : 1 } as CSSProperties}>
                          {options.map((style) => {
                            const selected = (siteContent.wordmarkStyle || '') === style.key;
                            return (
                              <button type="button" key={style.key || 'standard'} role="radio" aria-checked={selected} className={`${styles.namePickerTile}${selected ? ` ${styles.namePickerTileOn}` : ''}`} onClick={() => updateSiteContent({ wordmarkStyle: style.key })}>
                                <span className={styles.namePickerMark} data-wm={style.key || 'plain'}>{renderName()}</span>
                                <small>{style.label}</small>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  <small className={styles.fieldHint}>
                    {siteContent.hideHeaderCompanyName
                      ? 'Text company name is currently hidden in the header. Turn it back on above if you want your name displayed next to your logo.'
                      : 'Your business name in the header — shown exactly as you type. Tap a style to layer a treatment on top; the accent color follows your theme.'}
                  </small>

                  <hr className={styles.logoDivider} />
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Page buttons</span><select value={site.button_style === 'ghost' ? 'solid' : (site.button_style || 'solid')} onChange={(event) => handleChange('button_style', event.target.value)}>{BUTTON_STYLES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select><small className={styles.fieldHint}>Hero, contact &amp; footer call-to-action buttons.</small></label>
                    <label className={styles.formField}><span>Header button</span><select value={siteContent.headerButtonStyle} onChange={(event) => updateSiteContent({ headerButtonStyle: event.target.value })}><option value="">Match page buttons</option>{HEADER_BUTTON_STYLES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select><small className={styles.fieldHint}>The &ldquo;Instant Estimate&rdquo; button in your header.</small></label>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Instant quote form appearance"
                  description="Choose the visual framing and style for your instant estimate card."
                  open={openSection === 'quoteFormStyle'}
                  onToggleOpen={() => toggleSection('quoteFormStyle')}
                >
                  <div className={styles.contentSubhead}><strong>Framing style</strong><small>Card border, glow, and backdrop treatment.</small></div>
                  <div className={styles.formStylePicker} role="radiogroup" aria-label="Instant quote form appearance">
                    {QUOTE_FORM_STYLES.map((st) => {
                      const selected = (siteContent.quoteFormStyle || 'clean') === st.key;
                      return (
                        <button
                          type="button"
                          key={st.key}
                          role="radio"
                          aria-checked={selected}
                          className={`${styles.formStyleTile}${selected ? ` ${styles.formStyleTileOn}` : ''}`}
                          onClick={() => updateSiteContent({ quoteFormStyle: st.key })}
                        >
                          <div className={styles.formStyleMiniCard} data-preview-style={st.key}>
                            <div className={styles.formStyleMiniBar} />
                            <div className={styles.formStyleMiniLine} />
                            <div className={styles.formStyleMiniInput} />
                            <div className={styles.formStyleMiniBtn} />
                          </div>
                          <div className={styles.formStyleInfo}>
                            <strong>
                              {st.label}
                              {st.badge && <span className={styles.formStyleBadge}>{st.badge}</span>}
                            </strong>
                            <small>{st.desc}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Field background</strong><small>Light, dark, or theme default input fields.</small></div>
                  <div className={styles.segmented} role="radiogroup" aria-label="Field background" style={{ width: '100%', display: 'flex' }}>
                    {QUOTE_FORM_FIELD_BGS.map((bg) => {
                      const selected = (siteContent.quoteFormFieldBg || 'auto') === bg.key;
                      return (
                        <button
                          type="button"
                          key={bg.key}
                          role="radio"
                          aria-checked={selected}
                          style={{ flex: 1, textAlign: 'center', fontSize: '.8rem', fontWeight: 600 }}
                          className={selected ? styles.activeSegment : ''}
                          onClick={() => updateSiteContent({ quoteFormFieldBg: bg.key })}
                        >
                          {bg.key === 'light' ? '⚪ Light / White' : bg.key === 'dark' ? '⚫ Dark / Subtle' : '🪄 Theme default'}
                        </button>
                      );
                    })}
                  </div>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Fine-tune layout &amp; styling</strong><small>Corner curves, card width, and progress indicators.</small></div>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}>
                      <span>Card corners</span>
                      <select
                        value={siteContent.quoteFormRadius || 'default'}
                        onChange={(event) => updateSiteContent({ quoteFormRadius: event.target.value as QuoteFormRadius })}
                      >
                        {QUOTE_FORM_RADII.map((r) => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>Card width</span>
                      <select
                        value={siteContent.quoteFormWidth || 'standard'}
                        onChange={(event) => updateSiteContent({ quoteFormWidth: event.target.value as QuoteFormWidth })}
                      >
                        {QUOTE_FORM_WIDTHS.map((w) => (
                          <option key={w.key} value={w.key}>{w.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.formColumns} style={{ marginTop: '.4rem' }}>
                    <label className={styles.formField}>
                      <span>Progress indicator</span>
                      <select
                        value={siteContent.quoteFormStepper || 'badges'}
                        onChange={(event) => updateSiteContent({ quoteFormStepper: event.target.value as QuoteFormStepper })}
                      >
                        {QUOTE_FORM_STEPPERS.map((st) => (
                          <option key={st.key} value={st.key}>{st.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>Eyebrow badge</span>
                      <select
                        value={siteContent.quoteFormBadge || 'sparkle'}
                        onChange={(event) => updateSiteContent({ quoteFormBadge: event.target.value as QuoteFormBadge })}
                      >
                        {QUOTE_FORM_BADGES.map((b) => (
                          <option key={b.key} value={b.key}>
                            {b.icon ? `${b.icon} ` : ''}{b.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {siteContent.quoteFormBadge === 'custom' && (
                    <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                      <span>Custom badge text</span>
                      <input
                        type="text"
                        maxLength={50}
                        value={siteContent.quoteFormBadgeText || ''}
                        onChange={(event) => updateSiteContent({ quoteFormBadgeText: event.target.value })}
                        placeholder="e.g. ⚡ Fast Estimate in 60s"
                      />
                    </label>
                  )}

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Wording &amp; Call-to-Action</strong><small>Customize the form headings and button text.</small></div>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}>
                      <span>Form heading</span>
                      <input
                        type="text"
                        maxLength={40}
                        value={siteContent.quoteForm.formHeading || ''}
                        onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, formHeading: event.target.value })}
                        placeholder="Get a ballpark estimate"
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Submit button label</span>
                      <input
                        type="text"
                        maxLength={40}
                        value={siteContent.quoteFormButtonText || ''}
                        onChange={(event) => updateSiteContent({ quoteFormButtonText: event.target.value })}
                        placeholder="Start my estimate"
                      />
                    </label>
                  </div>
                  <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                    <span>Subtitle / Explainer note</span>
                    <input
                      type="text"
                      maxLength={200}
                      value={siteContent.quoteFormSubtitle || ''}
                      onChange={(event) => updateSiteContent({ quoteFormSubtitle: event.target.value })}
                      placeholder="Tell us what you need. We’ll ask up to 3 quick questions..."
                    />
                  </label>
                  <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                    <span>Project description placeholder</span>
                    <input
                      type="text"
                      maxLength={200}
                      value={siteContent.quoteFormPlaceholder || ''}
                      onChange={(event) => updateSiteContent({ quoteFormPlaceholder: event.target.value })}
                      placeholder={
                        siteContent.services.items.map((item) => item.title.trim()).filter(Boolean).length >= 2
                          ? `e.g. ${siteContent.services.items.map((item) => item.title.trim().toLowerCase()).filter(Boolean).slice(0, 3).join(', ')}...`
                          : siteContent.trade.trim()
                            ? `Describe your ${siteContent.trade.trim().toLowerCase()} job — what's going on?`
                            : 'e.g. drain cleaning, leak detection, pipe replacement...'
                      }
                    />
                    <small className={styles.fieldHint}>Replaces the default placeholder inside the project description textarea. Leave blank to automatically use your services list.</small>
                  </label>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Features &amp; Trust</strong><small>Reassurance cues and photo attachments.</small></div>
                  <div className={styles.toggleGroup}>
                    <label className={styles.toggleRow}>
                      <input
                        type="checkbox"
                        checked={siteContent.quoteFormTrust !== false}
                        onChange={(event) => updateSiteContent({ quoteFormTrust: event.target.checked })}
                      />
                      <span>
                        <strong>Show trust reassurance strip</strong>
                        <small>Displays confidence cues directly under the submit button.</small>
                      </span>
                    </label>

                    {siteContent.quoteFormTrust !== false && (
                      <div className={styles.trustCuesList}>
                        {QUOTE_FORM_TRUST_CUES.map((cue) => {
                          const currentItems = siteContent.quoteFormTrustItems ?? [...DEFAULT_QUOTE_FORM_TRUST_ITEMS];
                          const isChecked = currentItems.includes(cue.key);
                          return (
                            <label key={cue.key} className={styles.trustCueItem}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...currentItems, cue.key]
                                    : currentItems.filter((k) => k !== cue.key);
                                  updateSiteContent({ quoteFormTrustItems: next });
                                }}
                              />
                              <span>{cue.icon} {cue.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <label className={styles.toggleRow} style={{ marginTop: '.5rem' }}>
                      <input
                        type="checkbox"
                        checked={siteContent.quoteFormStep1Photos === true}
                        onChange={(event) => updateSiteContent({ quoteFormStep1Photos: event.target.checked })}
                      />
                      <span>
                        <strong>Let customers attach photos upfront</strong>
                        <small>Adds a photo upload button to the first screen so customers can show their problem immediately.</small>
                      </span>
                    </label>
                  </div>

                  <small className={styles.fieldHint} style={{ marginTop: '.75rem' }}>Full real-time preview of your instant estimate card and all adjustments is shown live on the right.</small>
                </SectionCard>

              </div>
            )}

            {activeTab === 'page' && (
              <div className={styles.formSection}>
                <div className={styles.pageFilterBar}>
                  <div className={styles.pageSearchWrapper}>
                    <span className={styles.pageSearchIcon} aria-hidden="true">🔍</span>
                    <input
                      type="search"
                      className={styles.pageSearchInput}
                      value={pageSearchQuery}
                      onChange={(event) => setPageSearchQuery(event.target.value)}
                      placeholder="Filter sections (e.g. reviews, photos, services, phone)..."
                      aria-label="Filter page sections"
                    />
                    {pageSearchQuery && (
                      <button
                        type="button"
                        className={styles.pageSearchClear}
                        onClick={() => setPageSearchQuery('')}
                        aria-label="Clear filter search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className={styles.pageFilterChips} role="group" aria-label="Section category filter">
                    {PAGE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`${styles.pageFilterChip}${pageCategory === cat.id ? ` ${styles.pageFilterChipActive}` : ''}`}
                        onClick={() => setPageCategory(cat.id)}
                        aria-pressed={pageCategory === cat.id}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isSectionVisible('estimate', 'lead capture quote form smart intake contact thank you video phone') && (
                  <>
                    <div className={styles.cardGroupLabel}>Lead capture</div>
                    <p className={styles.cardGroupHint}>One intake runs at a time — pick which, then set it up below.</p>

                    <div className={styles.intakePicker} role="radiogroup" aria-label="How visitors reach you">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!siteContent.quoteForm.enabled}
                        className={`${styles.intakeChoice}${!siteContent.quoteForm.enabled ? ` ${styles.intakeChoiceOn}` : ''}`}
                        onClick={() => updateQuoteForm({ ...siteContent.quoteForm, enabled: false })}
                      >
                        <span className={styles.intakeChoiceMark} aria-hidden="true" />
                        <span className={styles.intakeChoiceCopy}>
                          <strong>Smart Intake <em>Recommended</em></strong>
                          <small>AI asks a couple of questions and shows an instant ballpark price.</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={siteContent.quoteForm.enabled}
                        className={`${styles.intakeChoice}${siteContent.quoteForm.enabled ? ` ${styles.intakeChoiceOn}` : ''}`}
                        onClick={() => updateQuoteForm({ ...siteContent.quoteForm, enabled: true })}
                      >
                        <span className={styles.intakeChoiceMark} aria-hidden="true" />
                        <span className={styles.intakeChoiceCopy}>
                          <strong>Classic quote form</strong>
                          <small>Visitors type out the job and wait for you to reply with a price.</small>
                        </span>
                      </button>
                    </div>

                    <SectionCard
                      variant="featured"
                      title="Contact & thank-you video"
                      description="The number on your call buttons, and what plays after somebody submits."
                      open={openSection === 'estimate'}
                      onToggleOpen={() => toggleSection('estimate')}
                    >
                      <label className={styles.formField}>
                        <span>Phone</span>
                        <input
                          id="bf-phone"
                          type="tel"
                          value={site.phone || ''}
                          onChange={(event) => handleChange('phone', event.target.value || null)}
                          placeholder={dedicatedNumber ? displayPhone(dedicatedNumber) : alertPhone ? displayPhone(alertPhone) : '(555) 123-4567'}
                        />
                        {(dedicatedNumber || alertPhone) && (
                          <div className={styles.chatNumberChips} style={{ marginTop: '0.4rem', marginBottom: '0.2rem' }}>
                            {dedicatedNumber && (
                              <button
                                type="button"
                                className={`${styles.chatNumberChip} ${site.phone && phoneDigits(site.phone) === phoneDigits(dedicatedNumber) ? styles.chatNumberChipActive : ''}`}
                                onClick={() => handleChange('phone', dedicatedNumber)}
                              >
                                💬 Use Dedicated Business Number ({displayPhone(dedicatedNumber)})
                              </button>
                            )}
                            {alertPhone && (!dedicatedNumber || phoneDigits(alertPhone) !== phoneDigits(dedicatedNumber)) && (
                              <button
                                type="button"
                                className={`${styles.chatNumberChip} ${site.phone && phoneDigits(site.phone) === phoneDigits(alertPhone) ? styles.chatNumberChipActive : ''}`}
                                onClick={() => handleChange('phone', alertPhone)}
                              >
                                📱 Use Account Mobile ({displayPhone(alertPhone)})
                              </button>
                            )}
                          </div>
                        )}
                        <small className={styles.fieldHint}>Powers your call buttons and the text/call follow-up on leads.</small>
                      </label>
                      <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.phonePublic} onChange={(event) => updateSiteContent({ phonePublic: event.target.checked })} /><span><strong>Show phone number</strong><small>This controls whether your phone number and call buttons appear anywhere on your website.</small></span></label>
                      {siteContent.quoteForm.enabled && (
                        <label className={styles.formField}><span>What visitors see the form called</span><input type="text" maxLength={40} value={siteContent.quoteForm.formHeading} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, formHeading: event.target.value })} placeholder="Request an Estimate" /><small className={styles.fieldHint}>The heading on the hero capture and the button in your header. The classic form replies later rather than pricing on the spot, so avoid wording that promises an instant number.</small></label>
                      )}
                      <div className={styles.formField} id="bf-quote-form-style">
                        <span>Instant quote form appearance</span>
                        <div className={styles.formStyleLinkCard}>
                          <div>
                            <strong>
                              {QUOTE_FORM_STYLES.find((s) => s.key === (siteContent.quoteFormStyle || 'clean'))?.label || 'Clean & Crisp'}
                              {' · '}
                              {QUOTE_FORM_FIELD_BGS.find((s) => s.key === (siteContent.quoteFormFieldBg || 'auto'))?.label || 'Theme default'}
                              {QUOTE_FORM_STYLES.find((s) => s.key === (siteContent.quoteFormStyle || 'clean'))?.badge && (
                                <span className={styles.formStyleBadge}>
                                  {QUOTE_FORM_STYLES.find((s) => s.key === (siteContent.quoteFormStyle || 'clean'))?.badge}
                                </span>
                              )}
                            </strong>
                            <small>{QUOTE_FORM_STYLES.find((s) => s.key === (siteContent.quoteFormStyle || 'clean'))?.desc || 'Clear and trustworthy — best for most businesses'}</small>
                          </div>
                          <button
                            type="button"
                            className={styles.formStyleLinkBtn}
                            onClick={() => {
                              setActiveTab('design');
                              setOpenSection('quoteFormStyle');
                            }}
                          >
                            Customize in Design →
                          </button>
                        </div>
                        <small className={styles.fieldHint}>Visual styling, framing, and field backgrounds for the estimate card are configured under Brand &amp; Design.</small>
                      </div>
                      <div className={styles.contentSubhead}><strong>Thank-you video</strong><small>optional</small></div>
                      <IntroVideoField
                        video={siteContent.introVideo}
                        onChange={(introVideo) => updateSiteContent({ introVideo })}
                      />
                    </SectionCard>

                    <a className={styles.intakeSettingsLink} href="/dashboard/automations#intake-ai">
                      <span>
                        <strong>Configure Smart Intake</strong>
                        <small>
                          {siteContent.quoteForm.enabled
                            ? 'Set up its questions, qualification, pricing posture, alerts, and live preview.'
                            : 'Questions, qualification, pricing posture, alerts — and a live preview.'}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </>
                )}

                {(() => {
                  const mainDefs = [
                    { key: 'header', terms: 'header navigation menu bar style cta button mobile logo' },
                    { key: 'hero', terms: 'hero headline tagline photo video floating badges first impression' },
                    { key: 'services', terms: 'services work icon cards what we do list' },
                    { key: 'showcase', terms: 'photo gallery showcase images portfolio pictures completed jobs' },
                    { key: 'beforeAfter', terms: 'before after comparison sliders transformations' },
                    { key: 'video', terms: 'video sections clips youtube phone studio' },
                    { key: 'testimonials', terms: 'customer reviews testimonials google ratings feedback' },
                    { key: 'howItWorks', terms: 'how it works steps process walkthrough book' },
                    { key: 'faqs', terms: 'common questions faqs answers questions faq' },
                    { key: 'stats', terms: 'animated stats numbers counter jobs completed years in business' },
                    { key: 'blog', terms: 'blog posts articles news stories marketing' },
                    { key: 'serviceAreas', terms: 'cities you serve service areas towns locations coverage map' },
                    { key: 'projectShowcase', terms: 'project carousel showcase slider coverflow spotlight photos' },
                    { key: 'footer', terms: 'footer hours license copyright bottom' },
                  ];
                  const trustDefs = [
                    { key: 'rating', terms: 'star rating badge average reviews google trust' },
                    { key: 'trustBadges', terms: 'trust badges licensed insured bonded chips reassurance' },
                  ];
                  const barDefs = [
                    { key: 'announcement', terms: 'announcement bar banner top message urgent booking promo' },
                    { key: 'stickyBar', terms: 'sticky button mobile call tap to call quote bar bottom' },
                    { key: 'chatButton', terms: 'message button chat sms whatsapp texting number floating' },
                  ];
                  const careDefs = [
                    { key: 'whyUs', terms: 'why choose us points checklist promises care' },
                  ];

                  const hasEstimate = isSectionVisible('estimate', 'lead capture quote form smart intake contact thank you video phone');
                  const hasMain = mainDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasTrust = trustDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasBars = barDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasCare = site.template === 'handy' && careDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasAny = hasEstimate || hasMain || hasTrust || hasBars || hasCare;

                  if (!hasAny) {
                    return (
                      <div className={styles.pageSearchEmpty}>
                        <span>No sections match &ldquo;{pageSearchQuery || pageCategory}&rdquo;</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPageSearchQuery('');
                            setPageCategory('all');
                          }}
                        >
                          Show all sections
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      {hasMain && (
                        <>
                          <div className={styles.cardGroupLabel}>Main sections</div>
                          <p className={styles.cardGroupHint}>Drag a section by its ⠿ handle to reorder it on your live page. Turned-off sections keep their spot but stay hidden until you switch them on.</p>
                          <div ref={dragGroupRef} className={`${styles.sectionDragGroup}${dragKey ? ` ${styles.sectionDragGroupActive}` : ''}`}>
                            {isSectionVisible('header', 'header navigation menu bar style cta button mobile logo') && (
                              <SectionCard reorder={pinnedHeaderReorder()} title="Header" description="Your navigation bar — the logo, business name, and menu at the very top of every page." open={openSection === 'header'} onToggleOpen={() => toggleSection('header')}>
                                <div className={styles.contentSubhead}><strong>Header style</strong><small>Adapts to your theme and accent color.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Header style">
                                  <button type="button" className={`${styles.footerPickerBtn}${siteContent.headerStyle === '' ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.headerStyle === ''} onClick={() => updateSiteContent({ headerStyle: '' })}>
                                    <strong>Theme default</strong><small>Each theme&apos;s own built-in header.</small>
                                  </button>
                                  {HEADER_STYLES.map((h) => (
                                    <button type="button" key={h.key} className={`${styles.footerPickerBtn}${siteContent.headerStyle === h.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.headerStyle === h.key} onClick={() => updateSiteContent({ headerStyle: h.key })}>
                                      <strong>{h.label}</strong><small>{h.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.headerCta} onChange={(event) => updateSiteContent({ headerCta: event.target.checked })} /><span><strong>Show the button in the header</strong><small>The call-to-action at the top-right of every page. Off = just your logo and menu. (Always hidden on phones — the menu carries the action there.)</small></span></label>
                                <label className={styles.toggleRow} style={{ marginTop: '.65rem' }}>
                                   <input
                                     type="checkbox"
                                     checked={!siteContent.hideHeaderCompanyName}
                                     onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                                   />
                                   <span>
                                     <strong>Show company name in header</strong>
                                     <small>Display your text business name next to your logo or icon. Turn off if your logo already includes your name.</small>
                                   </span>
                                 </label>
                                 <label className={styles.formField} style={{ marginTop: '.65rem' }}>
                                   <span>Header tagline / slogan</span>
                                   <input
                                     type="text"
                                     value={siteContent.headerTagline || ''}
                                     maxLength={100}
                                     placeholder="e.g. 24/7 Emergency Service • Licensed & Insured"
                                     onChange={(event) => updateSiteContent({ headerTagline: event.target.value })}
                                   />
                                   <small className={styles.fieldHint}>Displayed in the website header next to your logo or company name.</small>
                                 </label>

                                <hr className={styles.logoDivider} />
                                <div className={styles.contentSubhead}><strong>Mobile menu button</strong><small>The hamburger shown on phones.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Mobile menu button style">
                                  {MENU_BUTTON_STYLES.map((m) => (
                                    <button type="button" key={m.key} className={`${styles.footerPickerBtn}${siteContent.menuButton === m.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.menuButton === m.key} onClick={() => updateSiteContent({ menuButton: m.key })}>
                                      <strong>{m.label}</strong><small>{m.desc}</small>
                                    </button>
                                  ))}
                                </div>

                                <hr className={styles.logoDivider} />
                                <div className={styles.chatNumberChips} style={{ marginTop: '0.6rem' }}>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('design', 'logo')}>
                                    🎨 Logo &amp; Brand Icon (on Brand tab) →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('design', 'typography')}>
                                    ✏️ Typography &amp; Buttons (on Brand tab) →
                                  </button>
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('hero', 'hero headline tagline photo video floating badges first impression') && (
                              <SectionCard reorder={pinnedHeroReorder()} title="Hero" description="The whole top-of-page first impression — your headline, photo, and floating badges, in one place." hint={site.headline ? `“${site.headline.length > 46 ? `${site.headline.slice(0, 46).trimEnd()}…` : site.headline}”` : undefined} open={openSection === 'hero'} onToggleOpen={() => toggleSection('hero')}>
                                <div className={styles.contentSubhead}><strong>Headline &amp; message</strong></div>
                                <label className={styles.formField}><span>Small line above headline</span><input id="bf-hero-eyebrow" value={siteContent.heroEyebrow} maxLength={50} onChange={(event) => updateSiteContent({ heroEyebrow: event.target.value })} placeholder={heroEyebrowPlaceholder} /><small className={styles.fieldHint}>{site.template === 'shine' ? 'Optional — Shine shows this only if you add one.' : 'Leave empty to keep your template’s own wording.'}</small></label>
                                <label className={styles.formField}><span>Headline</span><textarea id="bf-headline" rows={2} value={site.headline || ''} onChange={(event) => handleChange('headline', event.target.value || null)} placeholder="Built with purpose. Finished with care." /></label>
                                <label className={styles.formField}><span>Tagline</span><textarea id="bf-tagline" rows={3} value={site.tagline || ''} onChange={(event) => handleChange('tagline', event.target.value || null)} placeholder="Tell homeowners what makes your business different." /></label>
                                <label className={styles.formField} id="bf-hero-shadow">
                                  <span>Headline readability &amp; text glow</span>
                                  <select
                                    id="bf-hero-shadow-select"
                                    value={siteContent.heroTextShadow || 'none'}
                                    onChange={(event) => updateSiteContent({ heroTextShadow: event.target.value as SiteHeroTextShadowStyle })}
                                  >
                                    {HERO_TEXT_SHADOW_STYLES.map((style) => (
                                      <option key={style.key} value={style.key}>{style.label}</option>
                                    ))}
                                  </select>
                                  <small className={styles.fieldHint}>
                                    Adds a dark glow, dropshadow, or backdrop behind your headline to ensure light text is easily readable over bright or busy photos.
                                  </small>
                                </label>
                                <div className={styles.contentSubhead}><strong>Hero photos</strong></div>
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
                                <HeroVideoField
                                  video={siteContent.heroVideo}
                                  heroImage={site.hero_url}
                                  onChange={(heroVideo) => updateSiteContent({ heroVideo })}
                                />
                                <div className={styles.stockBlock}>
                                  <div>
                                    <strong>Stock photos</strong>
                                    <p className={styles.fieldHint}>Representative stock photos from Pexels. Replace any one with a photo of your own work anytime. This picks a fresh set for every image on your site and keeps your uploads.</p>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                    <button type="button" className={styles.secondaryAction} onClick={handleRegenerateStockImages} disabled={isRegeneratingImages}>{isRegeneratingImages ? 'Finding photos…' : '✨ Regenerate all stock images'}</button>
                                    <AiCreditIndicator credits={availableAiCredits} />
                                  </div>
                                </div>
                                <div className={styles.contentSubhead}><strong>Floating badges</strong></div>
                                <div className={`${styles.formField}${flashField === 'heroBadge' ? ` ${styles.fieldFlash}` : ''}`} id="design-hero-badge">
                                  <label htmlFor="hero-badge-preset">Hero badge</label>
                                  <select id="hero-badge-preset" value={siteContent.heroBadge.preset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, preset: event.target.value } })}>{HERO_BADGE_PRESETS.map((badge) => <option key={badge.key} value={badge.key}>{badge.title}</option>)}<option value="custom">Custom badge…</option><option value="none">No badge</option></select>
                                  <small className={styles.fieldHint}>The floating trust chip on your hero photo (Fixit, Shine, Coat &amp; more).</small>
                                  {siteContent.heroBadge.preset === 'custom' && (
                                    <div className={styles.customBadgeFields}>
                                      <div className={styles.customBadgeRow}>
                                        <input value={siteContent.heroBadge.customIcon || ''} maxLength={4} className={styles.customBadgeIconInput} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customIcon: event.target.value } })} placeholder="Icon (e.g. ✓, ★, 🏆, 🛡️)" title="Badge icon" aria-label="Custom badge icon" />
                                        <input value={siteContent.heroBadge.customLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customLabel: event.target.value } })} placeholder="Badge title (e.g. Veteran Owned)" aria-label="Custom badge title" />
                                      </div>
                                      <input value={siteContent.heroBadge.customSubtitle || ''} maxLength={50} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customSubtitle: event.target.value } })} placeholder="Subtitle (optional, e.g. 10% Military Discount)" aria-label="Custom badge subtitle" />
                                    </div>
                                  )}
                                </div>
                                <label className={styles.formField}><span>Badge style</span><select value={siteContent.heroBadge.style} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, style: event.target.value } })}>{HERO_BADGE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                                <div className={styles.formField}>
                                  <label htmlFor="hero-badge-second">Extra floating badge</label>
                                  <select id="hero-badge-second" value={siteContent.heroBadge.secondPreset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondPreset: event.target.value } })}>
                                    <option value="default">Template default (e.g. &ldquo;500+ customers&rdquo;)</option>
                                    {HERO_BADGE_PRESETS.map((badge) => <option key={`second-${badge.key}`} value={badge.key}>{badge.title}</option>)}
                                    <option value="custom">Custom badge…</option>
                                    <option value="none">No extra badge</option>
                                  </select>
                                  <small className={styles.fieldHint}>The second chip beside your hero photo (Shine, Fixit &amp; Guild).</small>
                                  {siteContent.heroBadge.secondPreset === 'custom' && (
                                    <div className={styles.customBadgeFields}>
                                      <div className={styles.customBadgeRow}>
                                        <input value={siteContent.heroBadge.secondCustomIcon || ''} maxLength={4} className={styles.customBadgeIconInput} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomIcon: event.target.value } })} placeholder="Icon (e.g. ★, ⚡, 🛡️)" title="Second badge icon" aria-label="Custom second badge icon" />
                                        <input value={siteContent.heroBadge.secondCustomLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomLabel: event.target.value } })} placeholder="Badge title (e.g. Family Owned)" aria-label="Custom second badge title" />
                                      </div>
                                      <input value={siteContent.heroBadge.secondCustomSubtitle || ''} maxLength={50} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomSubtitle: event.target.value } })} placeholder="Subtitle (optional, e.g. 3 Generations)" aria-label="Custom second badge subtitle" />
                                    </div>
                                  )}
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('services', 'services work icon cards what we do list') && (
                              <SectionCard reorder={reorderProps('services', 'Services')} title="Services" description="Icon cards for the work you do — the first thing most home-services visitors scan for. Add a few with an icon, name, and one-line description." evidence="A clear service grid lets a visitor confirm 'they do what I need' in seconds — the fastest way to hold a home-services visitor's attention." enabled={siteContent.services.enabled} onToggleEnabled={(value) => updateServices({ ...siteContent.services, enabled: value })} {...contentHint(siteContent.services.enabled, siteContent.services.items.filter((svc) => svc.title.trim()).length, 'service')} open={openSection === 'services'} onToggleOpen={() => toggleSection('services')}>
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
                                {siteContent.services.items.length < 15 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('svc'); updateServices({ ...siteContent.services, enabled: true, items: [...siteContent.services.items, { id, icon: 'spark', title: '', description: '' }] }); setEditingItemId(id); }}>Add service</button>}
                              </SectionCard>
                            )}

                            {isSectionVisible('quickStop', 'quick stop priority visits same day next day route gap small fixes repairs diagnostics micro visits') && (
                              <SectionCard
                                reorder={reorderProps('quickStop', 'Quick Stop priority visits')}
                                title="Quick Stop priority visits"
                                description="Explain your fast route-gap visit service for small fixes, diagnostics, and quick repairs with fixed upfront fees."
                                evidence="Surfacing same-day and next-day route-gap slots captures high-intent homeowners with urgent small tasks who can't wait weeks."
                                enabled={siteContent.quickStop.enabled}
                                onToggleEnabled={(value) => updateQuickStop({ ...siteContent.quickStop, enabled: value })}
                                {...contentHint(siteContent.quickStop.enabled, siteContent.quickStop.items.length, 'feature', 'features')}
                                open={openSection === 'quickStop'}
                                onToggleOpen={() => toggleSection('quickStop')}
                              >
                                <label className={styles.formField}>
                                  <span>Presentation style</span>
                                  <select
                                    value={siteContent.quickStop.style}
                                    onChange={(event) =>
                                      updateQuickStop({
                                        ...siteContent.quickStop,
                                        style: event.target.value as SiteQuickStopStyle,
                                      })
                                    }
                                  >
                                    {QUICK_STOP_SECTION_STYLES.map((st) => (
                                      <option key={st.key} value={st.key}>
                                        {st.label} — {st.desc}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.formField}>
                                  <span>Top badge / banner pill</span>
                                  <input
                                    value={siteContent.quickStop.badgeText}
                                    maxLength={50}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, badgeText: event.target.value })
                                    }
                                    placeholder="⚡ 15–45 min priority visits"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Eyebrow tag</span>
                                  <input
                                    value={siteContent.quickStop.eyebrow}
                                    maxLength={60}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, eyebrow: event.target.value })
                                    }
                                    placeholder="⚡ Same-Day & Next-Day Route Gaps"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Section headline</span>
                                  <input
                                    value={siteContent.quickStop.title}
                                    maxLength={120}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, title: event.target.value })
                                    }
                                    placeholder="Need a Quick Fix? We Squeeze Small Jobs into Our Route"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Explanation text</span>
                                  <textarea
                                    rows={2}
                                    value={siteContent.quickStop.intro}
                                    maxLength={400}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, intro: event.target.value })
                                    }
                                    placeholder="Have a small repair or quick diagnostic? Quick Stops let us swing by between scheduled jobs for a flat priority visit fee."
                                  />
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <label className={styles.formField}>
                                    <span>Flat fee note</span>
                                    <input
                                      value={siteContent.quickStop.feeNote}
                                      maxLength={80}
                                      onChange={(event) =>
                                        updateQuickStop({ ...siteContent.quickStop, feeNote: event.target.value })
                                      }
                                      placeholder="Flat priority visit fee · Fixed upfront"
                                    />
                                  </label>
                                  <label className={styles.formField}>
                                    <span>CTA button label</span>
                                    <input
                                      value={siteContent.quickStop.ctaLabel}
                                      maxLength={40}
                                      onChange={(event) =>
                                        updateQuickStop({ ...siteContent.quickStop, ctaLabel: event.target.value })
                                      }
                                      placeholder="Request a Quick Stop"
                                    />
                                  </label>
                                </div>
                                <label className={styles.formField}>
                                  <span>CTA button link target</span>
                                  <input
                                    value={siteContent.quickStop.ctaHref}
                                    maxLength={120}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, ctaHref: event.target.value })
                                    }
                                    placeholder="#contact"
                                  />
                                </label>

                                <div className={styles.contentSubhead}>
                                  <strong>Quick Stop Features &amp; Steps</strong>
                                  <small>{siteContent.quickStop.items.length}/6</small>
                                </div>

                                <div className={styles.stackList}>
                                  {siteContent.quickStop.items.map((item, index) => (
                                    <StackItem
                                      key={item.id}
                                      title={item.title.trim() || `Item ${index + 1}`}
                                      meta={item.badge}
                                      editing={editingItemId === item.id}
                                      onEdit={() => setEditingItemId(item.id)}
                                      onSave={saveItem}
                                      onRemove={() =>
                                        updateQuickStop({
                                          ...siteContent.quickStop,
                                          items: siteContent.quickStop.items.filter((qs) => qs.id !== item.id),
                                        })
                                      }
                                    >
                                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.75rem' }}>
                                        <label className={styles.formField}>
                                          <span>Icon</span>
                                          <input
                                            value={item.icon}
                                            maxLength={6}
                                            onChange={(event) =>
                                              updateQuickStop({
                                                ...siteContent.quickStop,
                                                items: siteContent.quickStop.items.map((qs) =>
                                                  qs.id === item.id ? { ...qs, icon: event.target.value } : qs
                                                ),
                                              })
                                            }
                                            placeholder="⚡"
                                          />
                                        </label>
                                        <label className={styles.formField}>
                                          <span>Badge tag</span>
                                          <input
                                            value={item.badge ?? ''}
                                            maxLength={30}
                                            onChange={(event) =>
                                              updateQuickStop({
                                                ...siteContent.quickStop,
                                                items: siteContent.quickStop.items.map((qs) =>
                                                  qs.id === item.id ? { ...qs, badge: event.target.value } : qs
                                                ),
                                              })
                                            }
                                            placeholder="Fast Arrival"
                                          />
                                        </label>
                                      </div>
                                      <label className={styles.formField}>
                                        <span>Feature title</span>
                                        <input
                                          value={item.title}
                                          maxLength={80}
                                          onChange={(event) =>
                                            updateQuickStop({
                                              ...siteContent.quickStop,
                                              items: siteContent.quickStop.items.map((qs) =>
                                                qs.id === item.id ? { ...qs, title: event.target.value } : qs
                                              ),
                                            })
                                          }
                                          placeholder="Route-Gap Scheduling"
                                        />
                                      </label>
                                      <label className={styles.formField}>
                                        <span>Feature description</span>
                                        <input
                                          value={item.description}
                                          maxLength={200}
                                          onChange={(event) =>
                                            updateQuickStop({
                                              ...siteContent.quickStop,
                                              items: siteContent.quickStop.items.map((qs) =>
                                                qs.id === item.id ? { ...qs, description: event.target.value } : qs
                                              ),
                                            })
                                          }
                                          placeholder="We fit you into existing route gaps today or tomorrow."
                                        />
                                      </label>
                                    </StackItem>
                                  ))}
                                </div>

                                {siteContent.quickStop.items.length < 6 && (
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => {
                                      const id = createContentId('qs');
                                      updateQuickStop({
                                        ...siteContent.quickStop,
                                        enabled: true,
                                        items: [
                                          ...siteContent.quickStop.items,
                                          { id, icon: '⚡', title: '', description: '', badge: '' },
                                        ],
                                      });
                                      setEditingItemId(id);
                                    }}
                                  >
                                    Add item
                                  </button>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('showcase', 'photo gallery showcase images portfolio pictures completed jobs') && (
                              <SectionCard reorder={reorderProps('showcase', 'Photo gallery')} title="Photo gallery" description="Highlight finished work, project details, and job photos." evidence="Real project photos alongside reviews produced 55% more leads in one study — genuine work outperforms stock." enabled={siteContent.showcase.enabled} onToggleEnabled={(value) => updateShowcase({ ...siteContent.showcase, enabled: value })} {...contentHint(siteContent.showcase.enabled, siteContent.showcase.items.length, 'image')} open={openSection === 'showcase'} onToggleOpen={() => toggleSection('showcase')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.showcase.title} onChange={(event) => updateShowcase({ ...siteContent.showcase, title: event.target.value })} placeholder="Featured Projects" /></label>
                                <label className={styles.formField}><span>Intro</span><textarea rows={2} value={siteContent.showcase.intro} onChange={(event) => updateShowcase({ ...siteContent.showcase, intro: event.target.value })} placeholder="Whether it's a small job or big one, we've got you covered!" /></label>
                                <label className={styles.formField}><span>Menu link label</span><input value={siteContent.showcase.navLabel} maxLength={24} onChange={(event) => updateShowcase({ ...siteContent.showcase, navLabel: event.target.value })} placeholder="Gallery" /><small className={styles.fieldHint}>What this section is called in your header menu — e.g. &ldquo;Our work&rdquo;, &ldquo;Portfolio&rdquo;, &ldquo;Gallery&rdquo;.</small></label>
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
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Sync real finished projects and milestone photos into your showcase.</small></div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={autoSyncCompletedJobs} disabled={isPending}>⚡ Auto-sync portfolio</button>
                                    <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh' : 'Pick photos'}</button>
                                  </div>
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
                            )}

                            {isSectionVisible('beforeAfter', 'before after comparison sliders transformations') && (
                              <SectionCard reorder={reorderProps('beforeAfter', 'Before & after')} title="Before &amp; after" description="Drag-to-reveal comparison sliders — the most shared element on a remodeler's site. Each pair needs both a before and an after image to appear on your site." evidence="Before/after galleries paired with reviews produced 55% more leads — for trades, the transformation is the product." enabled={siteContent.beforeAfter.enabled} onToggleEnabled={(value) => updateBeforeAfter({ ...siteContent.beforeAfter, enabled: value })} {...contentHint(siteContent.beforeAfter.enabled, siteContent.beforeAfter.items.filter((pair) => pair.beforeUrl && pair.afterUrl).length, 'pair')} open={openSection === 'beforeAfter'} onToggleOpen={() => toggleSection('beforeAfter')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.beforeAfter.title} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, title: event.target.value })} placeholder="Before & After" /></label>
                                <label className={styles.formField}><span>Description</span><input value={siteContent.beforeAfter.intro} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, intro: event.target.value })} placeholder="See the transformation" /></label>
                                {(() => {
                                  const pair = siteContent.beforeAfter.items[0];
                                  const openPhotoPicker = (side: 'before' | 'after') => {
                                    let id = pair?.id;
                                    if (!id) {
                                      id = createContentId('ba');
                                      updateBeforeAfter({ ...siteContent.beforeAfter, enabled: true, items: [{ id, beforeUrl: '', beforeAlt: '', afterUrl: '', afterAlt: '', label: '' }] });
                                    }
                                    setPicker({ label: side === 'before' ? 'the before photo' : 'the after photo', kind: 'beforeAfter', baItemId: id, baSide: side });
                                  };
                                  return (
                                    <div className={styles.imageSlots}>
                                      <div className={styles.imageSlot}>
                                        <div className={styles.imageSlotHead}><strong>Before</strong></div>
                                        {pair?.beforeUrl
                                          ? <div className={styles.heroSlotPreview}><img src={pair.beforeUrl} alt="Before preview" /></div>
                                          : <div className={styles.imageSlotEmpty}>No before photo</div>}
                                        <div className={styles.imageSlotActions}>
                                          <button type="button" className={styles.secondaryAction} onClick={() => openPhotoPicker('before')}>{pair?.beforeUrl ? 'Replace photo' : 'Add photo'}</button>
                                        </div>
                                      </div>
                                      <div className={styles.imageSlot}>
                                        <div className={styles.imageSlotHead}><strong>After</strong></div>
                                        {pair?.afterUrl
                                          ? <div className={styles.heroSlotPreview}><img src={pair.afterUrl} alt="After preview" /></div>
                                          : <div className={styles.imageSlotEmpty}>No after photo</div>}
                                        <div className={styles.imageSlotActions}>
                                          <button type="button" className={styles.secondaryAction} onClick={() => openPhotoPicker('after')}>{pair?.afterUrl ? 'Replace photo' : 'Add photo'}</button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Import completed job photos directly into your before/after slider.</small></div>
                                  <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                                </div>
                                {jobPhotosLoaded && (
                                  jobPhotoOptions.length > 0 ? (
                                    <div className={styles.compactImageGrid}>
                                      {jobPhotoOptions.map((photo) => (
                                        <div key={photo.path} className={styles.compactImageTile}>
                                          <img src={photo.url} alt={photo.label} />
                                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                            <button type="button" onClick={() => importJobPhotoToBeforeAfter(photo, 'before')} disabled={isPending} style={{ flex: 1, padding: '2px 4px', fontSize: '0.75rem' }}>+ Before</button>
                                            <button type="button" onClick={() => importJobPhotoToBeforeAfter(photo, 'after')} disabled={isPending} style={{ flex: 1, padding: '2px 4px', fontSize: '0.75rem' }}>+ After</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('video', 'video sections clips youtube phone studio') && videoCards.map((card, cardIndex) => (
                              <SectionCard
                                key={card.key}
                                reorder={reorderProps(card.key, card.label)}
                                title={card.label}
                                description="A section of video on your page. Pick one of six arrangements — a full-width backdrop, a video beside your message, a project story, a row of phone clips, a customer on camera, or your process."
                                evidence="A homeowner who watches you speak has already met you. Video on a service page is the closest thing to a first visit before the first visit."
                                enabled={card.section.enabled}
                                onToggleEnabled={(value) => updateVideoSection({ ...card.section, enabled: value })}
                                {...card.hint}
                                open={openSection === card.key}
                                onToggleOpen={() => toggleSection(card.key)}
                              >
                                <div className={styles.vsSummary}>
                                  <span>{card.styleLabel}</span>
                                  <span>{card.clips.length === 0 ? 'No video yet' : `${card.shown} showing`}</span>
                                  <span>{card.section.autoplay ? 'Autoplay muted' : 'Tap to play'}</span>
                                  {card.section.loop && <span>Loops</span>}
                                  {card.section.controls && <span>Controls on</span>}
                                </div>
                                <button type="button" className={styles.vsOpenBtn} onClick={() => setVideoStudioId(card.section.id)}>
                                  🎬 {card.clips.length === 0 ? 'Add a video' : 'Open the video studio'}
                                </button>
                                <p className={styles.fieldHint}>
                                  Upload a clip (up to 50 MB — about 45 seconds of phone video) or paste a YouTube link. Switching arrangements never loses what you&apos;ve written: every layout reads the same headline, description, and button.
                                </p>
                                {siteContent.videoSections.length > 1 && (
                                  <button type="button" className={styles.dangerAction} onClick={() => removeVideoSection(card.section.id)}>
                                    Remove this section
                                  </button>
                                )}

                                {allVideoClipCount > 0 && cardIndex === videoCards.length - 1 && (
                                  <div className={styles.videosNavBlock}>
                                    <label className={styles.toggleRow}>
                                      <input
                                        type="checkbox"
                                        checked={siteContent.videosPage.navEnabled}
                                        onChange={(event) => updateSiteContent({ videosPage: { ...siteContent.videosPage, navEnabled: event.target.checked } })}
                                      />
                                      <span>
                                        <strong>Add a video gallery page to your menu</strong>
                                        <small>
                                          Your clips already have their own page — this puts a link to it in your
                                          header menu. Off by default, because a menu is short and this is your call.
                                        </small>
                                      </span>
                                    </label>
                                    {siteContent.videosPage.navEnabled && (
                                      <label className={styles.formField}>
                                        <span>Link Label</span>
                                        <input
                                          value={siteContent.videosPage.navLabel}
                                          maxLength={24}
                                          placeholder={DEFAULT_VIDEOS_NAV_LABEL}
                                          onChange={(event) => updateSiteContent({ videosPage: { ...siteContent.videosPage, navLabel: event.target.value } })}
                                        />
                                        <small className={styles.fieldHint}>
                                          What the link is called in your header menu — e.g. &ldquo;Our work on
                                          video&rdquo;, &ldquo;Watch&rdquo;, &ldquo;See the job&rdquo;.
                                        </small>
                                      </label>
                                    )}
                                  </div>
                                )}
                              </SectionCard>
                            ))}

                            {isSectionVisible('video', 'video sections clips youtube phone studio') && siteContent.videoSections.length < MAX_VIDEO_SECTIONS && (
                              <button
                                type="button"
                                className={styles.secondaryAction}
                                style={{ order: 9999 }}
                                onClick={addVideoSection}
                              >
                                + Add another Video Section
                              </button>
                            )}

                            {isSectionVisible('testimonials', 'customer reviews testimonials google ratings feedback') && (
                              <SectionCard reorder={reorderProps('testimonials', 'Customer reviews')} title="Customer reviews" description="Show quotes from real customers on your public site." evidence="97% of homeowners read reviews before hiring a local pro, and the first few weigh the most." enabled={siteContent.testimonials.enabled} onToggleEnabled={(value) => updateTestimonials({ ...siteContent.testimonials, enabled: value })} {...reviewHint} open={openSection === 'testimonials'} onToggleOpen={() => toggleSection('testimonials')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.testimonials.title} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, title: event.target.value })} /></label>
                                {generatedReviewCount > 0 && (
                                  <div className={styles.warnNotice}>
                                    <strong>{generatedReviewCount === 1 ? 'One of these reviews was' : `${generatedReviewCount} of these reviews were`} written by AI as {generatedReviewCount === 1 ? 'an example' : 'examples'}.</strong>{' '}
                                    The names and the words are invented — no customer said them. Rewrite each one with a real customer&apos;s words, or delete them. {gateSentence}
                                    <div className={styles.imageSlotActions}>
                                      <button type="button" className={styles.secondaryAction} onClick={removeGeneratedTestimonials}>Delete the {generatedReviewCount === 1 ? 'example' : `${generatedReviewCount} examples`}</button>
                                    </div>
                                  </div>
                                )}
                                {reviewCount === 0 && (
                                  <div className={styles.reviewsPrompt}>
                                    <strong>Fill this with real reviews.</strong> Connect your Google Business Profile below to pull in verified reviews automatically — the honest, one-click way. Never post reviews you didn&apos;t receive.
                                  </div>
                                )}
                                <div className={styles.formField} id="google-business-profile">
                                  <span>Your Google Business Profile</span>
                                  <GoogleReviewImport
                                    placeId={siteContent.testimonials.googlePlaceId}
                                    name={siteContent.testimonials.googleName}
                                    reviewCount={siteContent.testimonials.googleReviewCount}
                                    importedCount={siteContent.testimonials.googleReviews.length}
                                    importedAt={siteContent.testimonials.googleImportedAt}
                                    defaultQuery={googleSearchGuess}
                                    trade={siteContent.trade}
                                    city={siteContent.serviceAreas?.cities?.[0] || ''}
                                    phone={site?.phone ?? ''}
                                    websiteUrl={site?.custom_domain || (site?.subdomain ? `https://${site.subdomain}.onrender.com` : '')}
                                    importedReviews={siteContent.testimonials.googleReviews}
                                    onImport={(data) => updateTestimonials({ ...siteContent.testimonials, enabled: true, sourceMode: 'mixed', googlePlaceId: data.placeId, googleName: data.name, googleUrl: data.url, googleRating: data.rating, googleReviewCount: data.reviewCount, googleReviews: data.reviews, googleImportedAt: new Date().toISOString().slice(0, 10) })}
                                    onClear={() => updateTestimonials({ ...siteContent.testimonials, sourceMode: 'manual', googlePlaceId: '', googleName: '', googleUrl: '', googleRating: 0, googleReviewCount: 0, googleReviews: [], googleImportedAt: '' })}
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
                                <div className={styles.jobPhotoImport}>
                                  <div>
                                    <strong>Verified Let&apos;s Get Quoted reviews</strong>
                                    <small>Sync homeowner ratings and feedback from completed jobs into your testimonials.</small>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={autoSyncClientReviews} disabled={isLoadingInternalReviews || isPending}>⚡ Auto-sync reviews</button>
                                    <button type="button" onClick={loadInternalReviews} disabled={isLoadingInternalReviews || isPending}>
                                      {internalReviewsLoaded ? 'Refresh' : 'Pick reviews'}
                                    </button>
                                  </div>
                                </div>
                                {internalReviewsLoaded && (
                                  internalReviewOptions.length > 0 ? (
                                    <div className={styles.stackList}>
                                      {internalReviewOptions.map((rev) => (
                                        <div key={rev.id} className={styles.stackItem}>
                                          <div className={styles.itemHeader}>
                                            <div className={styles.itemTitleBtn}>
                                              <strong>{rev.clientName} ({'★'.repeat(rev.rating)})</strong>
                                              <small>{rev.jobRef ? `${rev.jobRef} · ` : ''}{rev.date}</small>
                                              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'inherit' }}>&ldquo;{rev.feedback}&rdquo;</p>
                                            </div>
                                            <div className={styles.itemActions}>
                                              <button type="button" className={styles.itemSaveBtn} onClick={() => importInternalReview(rev)}>
                                                + Import to site
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>No additional verified job reviews available to import.</p>
                                )}
                                <div className={styles.contentSubhead}><strong>Display style</strong><small>How your reviews are laid out on the page.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Review display style">
                                  {([
                                    { key: 'grid', label: 'Grid', desc: 'Static cards in a tidy grid.' },
                                    { key: 'carousel', label: 'Carousel', desc: 'Cards auto-slide in a loop.' },
                                    { key: 'spotlight', label: 'Spotlight', desc: 'One review at a time, cross-fading.' },
                                  ] as const).map((s) => (
                                    <button type="button" key={s.key} className={`${styles.footerPickerBtn}${siteContent.testimonials.displayStyle === s.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.testimonials.displayStyle === s.key} onClick={() => updateTestimonials({ ...siteContent.testimonials, displayStyle: s.key })}>
                                      <strong>{s.label}</strong><small>{s.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <div className={styles.stackList}>
                                  {siteContent.testimonials.items.map((item, index) => (
                                    <StackItem key={item.id} title={item.author.trim() || `Testimonial ${index + 1}`} meta={item.generated ? `${item.rating}★ · AI example` : `${item.rating}★`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.filter((testimonial) => testimonial.id !== item.id) })}>
                                      <div className={styles.formColumns}>
                                        <label className={styles.formField}><span>Customer</span><input value={item.author} onChange={(event) => editTestimonial(item.id, { author: event.target.value })} /></label>
                                        <label className={styles.formField}><span>Rating</span><select value={item.rating} onChange={(event) => editTestimonial(item.id, { rating: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                                      </div>
                                      <label className={styles.formField}><span>Project label</span><input value={item.label} onChange={(event) => editTestimonial(item.id, { label: event.target.value })} placeholder="Kitchen remodel, deck build, emergency repair..." /></label>
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
                                          editTestimonial(item.id, { imageUrl: event.target.value, imageAlt: image?.alt || item.imageAlt || item.author || 'Customer review image' });
                                        }}><option value="">No image</option>{selectableImages.map((image) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                                      </div>
                                      {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.author || 'Review image preview'} /></div>}
                                      <label className={styles.formField}><span>Review text</span><textarea rows={4} value={item.text} onChange={(event) => editTestimonial(item.id, { text: event.target.value })} /></label>
                                    </StackItem>
                                  ))}
                                </div>
                                <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('testimonial'); updateTestimonials({ ...siteContent.testimonials, enabled: true, items: [...siteContent.testimonials.items, { id, author: '', text: '', rating: 5, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add testimonial</button>
                              </SectionCard>
                            )}

                            {isSectionVisible('howItWorks', 'how it works steps process walkthrough book') && (
                              <SectionCard reorder={reorderProps('howItWorks', 'How it works')} title="How it works" description="A simple 3–4 step walkthrough of what happens after they reach out — book, we arrive, job done. Removes the 'what do I have to do?' hesitation." evidence="Showing the process upfront lowers the perceived effort of reaching out — people act when they can see exactly what happens next." enabled={siteContent.howItWorks.enabled} onToggleEnabled={(value) => updateHowItWorks({ ...siteContent.howItWorks, enabled: value })} {...contentHint(siteContent.howItWorks.enabled, siteContent.howItWorks.steps.filter((step) => step.title.trim()).length, 'step')} open={openSection === 'howItWorks'} onToggleOpen={() => toggleSection('howItWorks')}>
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
                            )}

                            {isSectionVisible('faqs', 'common questions faqs answers questions faq') && (
                              <SectionCard reorder={reorderProps('faqs', 'Common questions')} title="Common questions (FAQ)" description="Answer common homeowner questions before they request a quote." enabled={siteContent.faqs.enabled} onToggleEnabled={(value) => updateFaqs({ ...siteContent.faqs, enabled: value })} {...contentHint(siteContent.faqs.enabled, siteContent.faqs.items.filter((faq) => faq.question.trim() && faq.answer.trim()).length, 'question')} open={openSection === 'faqs'} onToggleOpen={() => toggleSection('faqs')}>
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
                            )}

                            {isSectionVisible('stats', 'animated stats numbers counter jobs completed years in business') && (
                              <SectionCard reorder={reorderProps('stats', 'Animated stats')} title="Animated stats" description="A band of big numbers that count up as visitors scroll — jobs completed, years in business, % satisfaction. Instant credibility." evidence="Concrete numbers — jobs done, years in business, response time — are instant, scannable credibility next to your work." enabled={siteContent.stats.enabled} onToggleEnabled={(value) => updateStats({ ...siteContent.stats, enabled: value })} {...statsHint} open={openSection === 'stats'} onToggleOpen={() => toggleSection('stats')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.stats.title} onChange={(event) => updateStats({ ...siteContent.stats, title: event.target.value })} /></label>
                                {generatedStatCount > 0 && (
                                  <div className={styles.warnNotice}>
                                    <strong>{generatedStatCount === 1 ? 'One of these numbers was' : `${generatedStatCount} of these numbers were`} made up by AI as {generatedStatCount === 1 ? 'an example' : 'examples'}.</strong>{' '}
                                    Nobody counted them. Type your own figures over them, or delete them. {gateSentence}
                                    <div className={styles.imageSlotActions}>
                                      <button type="button" className={styles.secondaryAction} onClick={removeGeneratedStats}>Delete the {generatedStatCount === 1 ? 'example' : `${generatedStatCount} examples`}</button>
                                    </div>
                                  </div>
                                )}
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
                                    <StackItem key={item.id} title={item.label.trim() || `Stat ${index + 1}`} meta={item.generated ? `${item.value} · AI example` : item.value} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateStats({ ...siteContent.stats, items: siteContent.stats.items.filter((stat) => stat.id !== item.id) })}>
                                      <div className={styles.formColumns}>
                                        <label className={styles.formField}><span>Value</span><input value={item.value} maxLength={12} onChange={(event) => editStat(item.id, { value: event.target.value })} placeholder="100+" /><small className={styles.fieldHint}>A short figure only — &ldquo;100+&rdquo;, &ldquo;$2M&rdquo;, &ldquo;24/7&rdquo;, &ldquo;4.9★&rdquo;. Put any words (like &ldquo;years&rdquo; or &ldquo;sq ft&rdquo;) in the label below, not here. Numbers count up on scroll.</small></label>
                                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => editStat(item.id, { label: event.target.value })} placeholder="Jobs completed" /></label>
                                      </div>
                                    </StackItem>
                                  ))}
                                </div>
                                <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('stat'); updateStats({ ...siteContent.stats, enabled: true, items: [...siteContent.stats.items, { id, value: '', label: '' }] }); setEditingItemId(id); }}>Add stat</button>
                              </SectionCard>
                            )}

                            {isSectionVisible('blog', 'blog posts articles news stories marketing') && (
                              <SectionCard reorder={reorderProps('blog', 'Blog')} title="Blog" description="Helpful articles for homeowners — maintenance tips, seasonal advice, and what to know before hiring. AI can draft them; you review and publish." evidence="Fresh, useful posts give Google more local pages to rank and give past customers a reason to return — search visibility that compounds over time." enabled={siteContent.blog.enabled} onToggleEnabled={(value) => updateBlog({ ...siteContent.blog, enabled: value })} {...blogHint} open={openSection === 'blog'} onToggleOpen={() => toggleSection('blog')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.blog.title} onChange={(event) => updateBlog({ ...siteContent.blog, title: event.target.value })} /></label>
                                <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.blog.intro} onChange={(event) => updateBlog({ ...siteContent.blog, intro: event.target.value })} /></label>

                                <div className={styles.contentSubhead}><strong>Your posts</strong><small>{siteContent.blog.posts.length === 0 ? 'none yet' : `${siteContent.blog.posts.length} total · ${siteContent.blog.posts.filter((p) => p.status === 'published').length} live`}</small></div>
                                {siteContent.blog.posts.length === 0 ? (
                                  <p className={styles.emptyHelper}>No posts yet. Write one on the blog page — AI can draft it for you.</p>
                                ) : (
                                  <ul className={styles.blogPreviewList}>
                                    {siteContent.blog.posts.slice(0, 6).map((post, index) => (
                                      <li key={post.id}>
                                        <span>{((t) => t.length > 46 ? `${t.slice(0, 46).trimEnd()}…` : t)(post.title.trim() || `Untitled post ${index + 1}`)}</span>
                                        <small>{post.status === 'published' ? 'Live' : post.publishAt ? `Scheduled ${post.publishAt}` : 'Draft'}</small>
                                      </li>
                                    ))}
                                    {siteContent.blog.posts.length > 6 ? <li><span>+ {siteContent.blog.posts.length - 6} more</span></li> : null}
                                  </ul>
                                )}
                                <a className={styles.blogGenerateBtn} href="/dashboard/marketing/blog">✍️ Write &amp; edit posts →</a>

                                <div className={styles.contentSubhead}><strong>Layout</strong><small>How posts are arranged on your site.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Blog layout">
                                  {BLOG_STYLES.map((b) => (
                                    <button type="button" key={b.key} className={`${styles.footerPickerBtn}${siteContent.blog.layout === b.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.blog.layout === b.key} onClick={() => updateBlog({ ...siteContent.blog, layout: b.key })}>
                                      <span className={styles.layoutWireframe} aria-hidden="true">
                                        {b.key === 'grid' && (
                                          <span className={styles.wireframeGrid}>
                                            <span className={styles.wireframeGridCard} />
                                            <span className={styles.wireframeGridCard} />
                                            <span className={styles.wireframeGridCard} />
                                          </span>
                                        )}
                                        {b.key === 'featured' && (
                                          <span className={styles.wireframeFeatured}>
                                            <span className={styles.wireframeFeaturedLead} />
                                            <span className={styles.wireframeFeaturedList}>
                                              <span className={styles.wireframeFeaturedRow} />
                                              <span className={styles.wireframeFeaturedRow} />
                                              <span className={styles.wireframeFeaturedRow} />
                                            </span>
                                          </span>
                                        )}
                                        {b.key === 'rows' && (
                                          <span className={styles.wireframeRows}>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                          </span>
                                        )}
                                        {b.key === 'magazine' && (
                                          <span className={styles.wireframeMagazine}>
                                            <span className={styles.wireframeMagazineLead} />
                                            <span className={styles.wireframeMagazineSub}>
                                              <span className={styles.wireframeMagazineCard} />
                                              <span className={styles.wireframeMagazineCard} />
                                            </span>
                                          </span>
                                        )}
                                      </span>
                                      <strong>{b.label}</strong><small>{b.desc}</small>
                                    </button>
                                  ))}
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('serviceAreas', 'cities you serve service areas towns locations coverage map') && (
                              <SectionCard reorder={reorderProps('serviceAreas', 'Cities you serve')} title="Cities you serve" description={'List the towns and neighborhoods you cover. The names become on-page keywords that help you rank for "[trade] in [city]" searches — and reassure homeowners you serve their area.'} evidence={'Visitors decide "do they even serve me?" in ~3 seconds — naming their town reassures them and matches local search.'} enabled={siteContent.serviceAreas.enabled} onToggleEnabled={(value) => updateServiceAreas({ ...siteContent.serviceAreas, enabled: value })} {...contentHint(siteContent.serviceAreas.enabled, siteContent.serviceAreas.cities.filter((city) => city.trim()).length, 'city', 'cities')} open={openSection === 'serviceAreas'} onToggleOpen={() => toggleSection('serviceAreas')}>
                                <ServiceAreasField
                                  content={siteContent.serviceAreas}
                                  defaultZip={siteContent.zip}
                                  defaultServiceArea={site.service_area}
                                  onChange={updateServiceAreas}
                                />
                              </SectionCard>
                            )}

                            {isSectionVisible('projectShowcase', 'project carousel showcase slider coverflow spotlight photos') && (
                              <SectionCard reorder={reorderProps('projectShowcase', 'Project carousel')} title="Project Carousel &amp; Showcase" description="An animated visual band of your best photos — coverflow, spotlight, or auto-sliding carousel. Add your own here, or import them from completed jobs." evidence="An animated visual showcase catches the eye immediately and lets homeowners see multiple finished transformations in motion." enabled={siteContent.projectShowcase.enabled} onToggleEnabled={(value) => updateProjectShowcase({ ...siteContent.projectShowcase, enabled: value })} {...projectShowcaseHint} open={openSection === 'projectShowcase'} onToggleOpen={() => toggleSection('projectShowcase')}>
                                <label className={styles.formField}><span>Title</span><input value={siteContent.projectShowcase.eyebrow} maxLength={40} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, eyebrow: event.target.value })} placeholder="Recent Jobs" /></label>
                                <label className={styles.formField}><span>Heading</span><input value={siteContent.projectShowcase.title} maxLength={80} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, title: event.target.value })} placeholder="See Our Work" /></label>
                                {!projectBandOwnPhotos
                                  && siteContent.projectShowcase.eyebrow === DEFAULT_PROJECT_SHOWCASE_EYEBROW
                                  && siteContent.projectShowcase.title === DEFAULT_PROJECT_SHOWCASE_TITLE && (
                                  <p className={styles.fieldHint}>
                                    These are the default headings, and this band is showing stock photos, so your page currently reads &ldquo;{STOCK_PROJECT_SHOWCASE_EYEBROW} / {STOCK_PROJECT_SHOWCASE_TITLE}&rdquo; instead — those photos aren&apos;t your jobs. Upload one of your own, or write your own heading above, and yours is used.
                                  </p>
                                )}
                                <label className={styles.formField}><span>Showcase style</span><select value={siteContent.projectShowcase.style} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, style: event.target.value as SiteProjectShowcaseContent['style'] })}>{PROJECT_SHOWCASE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                                <div className={styles.contentSubhead}><strong>Project photos</strong><small>{projectPhotos.length}/{MAX_PROJECT_SHOWCASE_ITEMS} · shown in this order</small></div>
                                {siteContent.projectShowcase.items.length === 0 && (
                                  <p className={styles.fieldHint}>
                                    {site.template === 'handy'
                                      ? 'Your site is showing placeholder photos here for now. Add your own project photos (upload, stock, or imported from a completed job) and they take over.'
                                      : 'Add your own project photos to show this section. On this theme it stays hidden until you do, so placeholder photos never go live.'}
                                  </p>
                                )}
                                <div className={styles.showcaseSelected} aria-label="Project photos, in order">
                                  {projectPhotos.map((item) => (
                                    <div key={item.id} className={styles.showcaseSelectedTile}>
                                      <div className={styles.showcaseThumbBox}>
                                        <img src={item.url} alt={item.alt} />
                                        <div className={styles.showcaseSelectedActions}>
                                          <button type="button" onClick={() => setPicker({ label: 'this project photo', kind: 'project', pjItemId: item.id })}>Replace</button>
                                          <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateProjectShowcase({ ...siteContent.projectShowcase, items: projectPhotos.filter((other) => other.id !== item.id) })}>✕</button>
                                        </div>
                                      </div>
                                      <input
                                        className={styles.showcaseCaptionInput}
                                        value={item.caption ?? ''}
                                        maxLength={60}
                                        placeholder="Headline (optional)"
                                        aria-label="Photo headline"
                                        onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, items: projectPhotos.map((other) => (other.id === item.id ? { ...other, caption: event.target.value } : other)) })}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {projectPhotos.length < MAX_PROJECT_SHOWCASE_ITEMS && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'a project photo', kind: 'project', pjItemId: null })}>Add photo</button>}
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Import private job photos into your image gallery.</small></div>
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
                            )}

                            {isSectionVisible('footer', 'footer hours license copyright bottom') && (
                              <SectionCard reorder={pinnedFooterReorder()} title="Footer" description="How the bottom of every page is laid out. Applies to every theme." open={openSection === 'footer'} onToggleOpen={() => toggleSection('footer')}>
                                <div className={styles.footerPicker} role="group" aria-label="Footer layout">
                                  {FOOTER_STYLES.map((f) => (
                                    <button
                                      type="button"
                                      key={f.key}
                                      className={`${styles.footerPickerBtn}${siteContent.footerStyle === f.key ? ` ${styles.footerPickerBtnOn}` : ''}`}
                                      aria-pressed={siteContent.footerStyle === f.key}
                                      onClick={() => updateSiteContent({ footerStyle: f.key })}
                                    >
                                      <strong>{f.label}</strong>
                                      <small>{f.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <label className={styles.formField}><span>Business hours (optional)</span><input id="bf-hours" value={site.hours || ''} onChange={(event) => handleChange('hours', event.target.value || null)} placeholder="Monday-Friday, 7am-5pm" /><small className={styles.fieldHint}>Shown in the footer. Leave blank to hide it.</small></label>
                                <label className={styles.formField}><span>License (optional)</span><input id="bf-license" value={site.license || ''} onChange={(event) => handleChange('license', event.target.value || null)} placeholder="LIC #123456" /><small className={styles.fieldHint}>Shown in the footer to back your work. Leave blank to hide it.</small></label>
                                
                                <hr className={styles.logoDivider} />
                                <div className={styles.contentSubhead}><strong>More footer details</strong><small>These come from other sections of your site.</small></div>
                                <div className={styles.chatNumberChips} style={{ marginTop: '0.6rem' }}>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('page', 'serviceAreas', 'bf-area-intro')}>
                                    📍 Service Areas (Cities you serve) →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('page', 'estimate', 'bf-phone')}>
                                    📞 Phone Number &amp; Call Settings →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('business', 'socials')}>
                                    🌐 Social Media Profiles →
                                  </button>
                                </div>
                              </SectionCard>
                            )}
                          </div>
                        </>
                      )}

                      {hasTrust && (
                        <>
                          <div className={styles.cardGroupLabel}>Trust boosters</div>

                          {isSectionVisible('rating', 'star rating badge average reviews google trust') && (
                            <SectionCard title="Star-rating badge" description={'Shows a "4.9 ★ from 37 reviews" trust badge near your reviews. Enter your real average rating and review count — only enable this if the numbers are accurate.'} evidence="97% of buyers check reviews first — a rating shown right beside your form is what turns that trust into a call." enabled={siteContent.ratingBadge.enabled} onToggleEnabled={(value) => updateRatingBadge({ ...siteContent.ratingBadge, enabled: value })} open={openSection === 'rating'} onToggleOpen={() => toggleSection('rating')}>
                              {siteContent.testimonials.googleRating > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => {
                                      const rating = siteContent.testimonials.googleRating;
                                      const count = siteContent.testimonials.googleReviewCount;
                                      setRatingInput(String(rating));
                                      setReviewCountInput(String(count));
                                      updateRatingBadge({
                                        ...siteContent.ratingBadge,
                                        enabled: true,
                                        rating,
                                        reviewCount: count,
                                        sourceLabel: 'Google reviews',
                                      });
                                    }}
                                  >
                                    ⚡ Auto-sync from connected Google Reviews ({siteContent.testimonials.googleRating}★ · {siteContent.testimonials.googleReviewCount} reviews)
                                  </button>
                                </div>
                              )}
                              <div className={styles.formColumns}>
                                <label className={styles.formField}><span>Average rating (1–5)</span><input type="number" min={1} max={5} step={0.1} value={ratingInput} onChange={(event) => { const raw = event.target.value; setRatingInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, rating: Number(raw) }); }} onBlur={() => setRatingInput(String(siteContent.ratingBadge.rating))} /></label>
                                <label className={styles.formField}><span>Number of reviews</span><input type="number" min={0} step={1} value={reviewCountInput} onChange={(event) => { const raw = event.target.value; setReviewCountInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, reviewCount: Number(raw) }); }} onBlur={() => setReviewCountInput(String(siteContent.ratingBadge.reviewCount))} /></label>
                              </div>
                              <label className={styles.formField}><span>Source label</span><input value={siteContent.ratingBadge.sourceLabel} onChange={(event) => updateRatingBadge({ ...siteContent.ratingBadge, sourceLabel: event.target.value })} placeholder="Google reviews" /></label>
                            </SectionCard>
                          )}

                          {isSectionVisible('trustBadges', 'trust badges licensed insured bonded chips reassurance') && (
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
                          )}
                        </>
                      )}

                      {hasBars && (
                        <>
                          <div className={styles.cardGroupLabel}>Bars &amp; banners</div>

                          {isSectionVisible('announcement', 'announcement bar banner top message urgent booking promo') && (
                            <SectionCard title="Announcement bar" description={'A strip across the top of your site for one timely line — e.g. "Now booking for August". You type the message, so it never invents urgency; it only appears once filled in.'} evidence={'Urgency converts — emergency-ready trades close highest (12–16%); a "same-day" or "now booking" line cuts hesitation.'} enabled={siteContent.announcement.enabled} onToggleEnabled={(value) => updateAnnouncement({ ...siteContent.announcement, enabled: value })} open={openSection === 'announcement'} onToggleOpen={() => toggleSection('announcement')}>
                              <label className={styles.formField}><span>Message</span><input value={siteContent.announcement.message} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, message: event.target.value })} placeholder="Now booking August installs" /></label>
                              <label className={styles.formField}><span>Second line (optional)</span><input value={siteContent.announcement.subtext} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, subtext: event.target.value })} placeholder="Same-day estimates · Licensed &amp; insured" /></label>
                              <label className={styles.formField}><span>Last day to show (optional)</span><input type="date" value={siteContent.announcement.endDate} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, endDate: event.target.value })} /><small>The bar hides itself automatically after this date — great for limited-time promos.</small></label>
                              {siteContent.announcement.enabled && !siteContent.announcement.message.trim() && <p className={styles.emptyHelper}>Add a message above for the bar to appear on your site.</p>}
                            </SectionCard>
                          )}

                          {isSectionVisible('stickyBar', 'sticky button mobile call tap to call quote bar bottom') && (
                            <SectionCard title="Sticky Button (mobile)" description="Pins a tap-to-call button to the bottom of every phone screen, so homeowners can reach you in one tap. Needs a phone number (set in your intake section)." evidence="For home services the phone closes 25–55× better than a form; a one-tap bar that follows the visitor keeps it in reach (sticky CTAs lift conversions 15–40%)." enabled={siteContent.stickyCallBar.enabled} onToggleEnabled={(value) => updateStickyCallBar({ ...siteContent.stickyCallBar, enabled: value })} open={openSection === 'stickyBar'} onToggleOpen={() => toggleSection('stickyBar')}>
                              <label className={styles.formField}><span>Button label</span><input value={siteContent.stickyCallBar.callLabel} maxLength={30} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, callLabel: event.target.value })} placeholder="Call now" /><small className={styles.fieldHint}>The main tap-to-call button. It always dials your number.</small></label>
                              <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.stickyCallBar.showQuote} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, showQuote: event.target.checked })} /><span><strong>Add a second button</strong><small>A second button beside Call that jumps straight to your quote form.</small></span></label>
                              {siteContent.stickyCallBar.showQuote && <label className={styles.formField}><span>Second button label</span><input value={siteContent.stickyCallBar.quoteLabel} maxLength={30} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, quoteLabel: event.target.value })} placeholder="Free quote" /></label>}
                              {siteContent.stickyCallBar.enabled && !site.phone && <p className={styles.emptyHelper}>Add a phone number in your intake section to make this button appear.</p>}
                              {siteContent.stickyCallBar.enabled && site.phone && !siteContent.phonePublic && <p className={styles.emptyHelper}>Your phone number is set to hidden — this button won&apos;t appear until you turn &quot;Show my phone number&quot; back on.</p>}
                            </SectionCard>
                          )}

                          {isSectionVisible('chatButton', 'message button chat sms whatsapp texting number floating') && (
                            <SectionCard
                              title="Message button"
                              description="A floating button that opens a text or WhatsApp message to you, already addressed."
                              evidence="Plenty of homeowners will text about a job they wouldn't phone about — especially outside working hours."
                              enabled={siteContent.chatButton.enabled}
                              onToggleEnabled={(value) => updateChatButton({ ...siteContent.chatButton, enabled: value })}
                              open={openSection === 'chatButton'}
                              onToggleOpen={() => toggleSection('chatButton')}
                            >
                              <ChatButtonField
                                chatButton={siteContent.chatButton}
                                sitePhone={site.phone}
                                companyName={site.company_name}
                                messagingSetup={messagingSetup}
                                onChange={updateChatButton}
                              />
                            </SectionCard>
                          )}
                        </>
                      )}

                      {hasCare && (
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
                        </>
                      )}
                    </>
                  );
                })()}

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
                {!site.published && !site.company_name.trim() && <p className={styles.publishRequirement}>A company name is required to publish. Add one on the Setup tab.</p>}
                {unreviewedSections.length > 0 && <p className={styles.publishRequirement}>{unreviewedSections.join(' and ')} still hold AI-written examples. Replace them with your real ones, delete them, or switch those sections off before {site.published ? 'saving to your live site' : 'publishing'}.</p>}
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
                <div className={styles.subdomainCard}>
                  <div className={styles.subdomainCardHead}>
                    <span className={styles.subdomainBadge}>★ Fastest way to go live</span>
                    <strong>Get your free address</strong>
                    <p>Free, instant, and included — pick a name and you&apos;re live at <span>{ROOT_DOMAIN}</span>. No DNS, no waiting.</p>
                  </div>
                  <label className={styles.formField}>
                    <div className={styles.domainControl}>
                      <div className={styles.subdomainInput}>
                        <input id="pub-subdomain" value={site.subdomain || ''} onChange={(event) => handleChange('subdomain', event.target.value.toLowerCase() || null)} placeholder="northline-builders" aria-label="Subdomain" />
                        <span className={styles.subdomainSuffix} aria-hidden="true">.{ROOT_DOMAIN}</span>
                      </div>
                      <button type="button" onClick={checkSubdomain} disabled={isPending}>Check</button>
                    </div>
                    <small>{subdomainStatus === 'available' ? `✓ ${site.subdomain}.${ROOT_DOMAIN} is available` : subdomainStatus === 'taken' ? '✕ That subdomain is already taken — try another' : 'Lowercase letters, numbers, and hyphens.'}</small>
                  </label>
                </div>
                <DomainConnector domain={site.custom_domain} target="domains.letsgetquoted.com" />
                <label className={styles.formField}><span>Custom domain</span><div className={styles.domainControl}><input value={site.custom_domain || ''} onChange={(event) => handleChange('custom_domain', event.target.value || null)} placeholder="www.yourbusiness.com" /><button type="button" onClick={verifyCustomDomain} disabled={isPending}>{domainStatus === 'checking' ? 'Checking...' : 'Verify DNS'}</button></div><small>{domainStatus === 'verified' ? 'Verified and connected.' : 'Add a CNAME record pointing to domains.letsgetquoted.com.'}</small></label>

                <div className={styles.cardGroupLabel}>Search appearance</div>
                <SectionCard title="How you show up on Google" description="The page title and description searchers see before they click. Your hero image is used when your site is shared on social." open={openSection === 'seo'} onToggleOpen={() => toggleSection('seo')}>
                  <div className={styles.googleSnippet}>
                    <span className={styles.googleSnippetUrl}>{liveDomain || `${site.subdomain || 'your-business'}.${ROOT_DOMAIN}`}</span>
                    <strong className={styles.googleSnippetTitle}>{site.seo_title || site.company_name || 'Your company name'}</strong>
                    <p className={styles.googleSnippetDesc}>{site.seo_description || site.tagline || 'Your description appears here — one sentence on what you do and where.'}</p>
                  </div>
                  <div className={styles.seoActions}>
                    <small className={styles.fieldHint}>A live preview of how your site can appear in Google. Edit either field, or let us write it from your business details.</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <button type="button" className={styles.secondaryAction} onClick={handleRegenerateSeo} disabled={isRegeneratingSeo}>{isRegeneratingSeo ? 'Writing…' : '✨ Regenerate SEO text'}</button>
                      <AiCreditIndicator credits={availableAiCredits} />
                    </div>
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

                <SectionCard
                  title="Get found on Google"
                  description="Two things outside your website that decide whether people find it."
                  hint={googleBusinessLinked && verificationToken ? 'Both done' : googleBusinessLinked || verificationToken ? '1 of 2 done' : undefined}
                  open={openSection === 'found'}
                  onToggleOpen={() => toggleSection('found')}
                >
                  {/* The map pack is three results, it sits above every ordinary
                      search result, and only Business Profiles appear in it. No
                      amount of work on this website can put you there — which is
                      exactly why it belongs in the builder, next to the work
                      people assume is enough. */}
                  <div className={styles.contentSubhead}>
                    <strong>1. Your Google Business Profile</strong>
                    <small>{googleBusinessLinked ? '✅ Linked' : 'Not linked yet'}</small>
                  </div>
                  <p className={styles.fieldHint}>
                    When someone searches “{siteContent.trade || 'plumber'} near me”, the map with three businesses
                    sits above everything else — and only businesses with a Google Business Profile can appear
                    in it. It’s free, and it’s the single biggest thing you can do to get calls.
                  </p>
                  {!googleBusinessLinked && (
                    <p className={styles.fieldHint}>
                      Claim yours at <a href="https://business.google.com" target="_blank" rel="noopener noreferrer">business.google.com</a>,
                      then add the link here so your website and your listing point at each other — Google uses that
                      to confirm they’re the same business.
                    </p>
                  )}
                  <div className={styles.legalEditActions}>
                    <button type="button" className={styles.secondaryAction} onClick={() => jumpTo('business', 'socials')}>
                      {googleBusinessLinked ? 'Edit the link' : 'Add my Business Profile link'}
                    </button>
                  </div>

                  <div className={styles.contentSubhead}>
                    <strong>2. Tell Google your site exists</strong>
                    <small>{verificationToken ? '✅ Verified tag added' : 'Optional'}</small>
                  </div>
                  <p className={styles.fieldHint}>
                    Your site publishes a sitemap at <code>/sitemap.xml</code> listing every page — but nobody has told
                    Google to read it. In <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Search Console</a>,
                    add {liveDomain || `${site.subdomain || 'your-site'}.${ROOT_DOMAIN}`} as a URL prefix property, choose the
                    <strong> HTML tag</strong> method, and paste what it gives you below. Save, publish, then click Verify.
                  </p>
                  <label className={styles.formField}>
                    <span>Google verification tag</span>
                    <input
                      id="bf-google-verification"
                      value={siteContent.googleSiteVerification}
                      onChange={(event) => updateSiteContent({ googleSiteVerification: event.target.value })}
                      placeholder='<meta name="google-site-verification" content="…" />'
                    />
                    {verificationProblem
                      ? <small className={styles.counterOver}>{verificationProblem}</small>
                      : <small className={styles.fieldHint}>Paste the whole tag or just the code — either works. Leave blank if you’d rather not.</small>}
                  </label>
                  <p className={styles.fieldHint}>
                    Once verified, submit <code>sitemap.xml</code> in Search Console. It’s also where you’ll see which
                    searches are finding you.
                  </p>
                </SectionCard>

                <SectionCard title="Legal pages" description="Auto-written Privacy Policy and Terms, linked in your footer at /privacy and /terms." open={openSection === 'legal'} onToggleOpen={() => toggleSection('legal')}>
                  {(() => {
                    const legalInput = { companyName: site.company_name, location: site.service_area || '', phone: siteContent.phonePublic ? (site.phone || '') : '', updated: siteContent.legal.updated };
                    return (
                      <>
                        <p className={styles.legalDisclaimer}>⚠️ These are starter templates tailored to your business — a helpful head start, <strong>not legal advice</strong>. Review them, and check with a lawyer for anything specific to how you operate, before publishing.</p>
                        <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.legal.privacyEnabled} onChange={(event) => updateLegal({ ...siteContent.legal, privacyEnabled: event.target.checked })} /><span><strong>Show a Privacy Policy</strong><small>Recommended — often required when you collect contact info, and by the text-message and payment providers that power your site.</small></span></label>
                        <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.legal.termsEnabled} onChange={(event) => updateLegal({ ...siteContent.legal, termsEnabled: event.target.checked })} /><span><strong>Show Terms of Service</strong><small>Sets expectations that quotes are estimates and covers basic use of your site.</small></span></label>
                        <label className={styles.formField}><span>Effective date (optional)</span><input type="date" value={siteContent.legal.updated} onChange={(event) => updateLegal({ ...siteContent.legal, updated: event.target.value })} /><small className={styles.fieldHint}>Shown at the top of both pages. Leave blank to omit.</small></label>

                        <div className={styles.contentSubhead}><strong>Privacy Policy text</strong><small>{siteContent.legal.privacyBody ? 'Custom' : 'Auto-written'}</small></div>
                        <textarea className={styles.legalTextarea} rows={6} value={siteContent.legal.privacyBody} placeholder="Using the auto-written Privacy Policy. Click “Load the template to edit” to customize it." onChange={(event) => updateLegal({ ...siteContent.legal, privacyBody: event.target.value })} />
                        <div className={styles.legalEditActions}>
                          <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, privacyBody: generatePrivacyPolicy(legalInput) })}>Load the template to edit</button>
                          {siteContent.legal.privacyBody && <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, privacyBody: '' })}>Reset to auto-written</button>}
                        </div>

                        <div className={styles.contentSubhead}><strong>Terms of Service text</strong><small>{siteContent.legal.termsBody ? 'Custom' : 'Auto-written'}</small></div>
                        <textarea className={styles.legalTextarea} rows={6} value={siteContent.legal.termsBody} placeholder="Using the auto-written Terms of Service. Click “Load the template to edit” to customize it." onChange={(event) => updateLegal({ ...siteContent.legal, termsBody: event.target.value })} />
                        <div className={styles.legalEditActions}>
                          <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, termsBody: generateTermsOfService(legalInput) })}>Load the template to edit</button>
                          {siteContent.legal.termsBody && <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, termsBody: '' })}>Reset to auto-written</button>}
                        </div>
                      </>
                    );
                  })()}
                </SectionCard>
              </div>
            )}
          </div>
        </section>

        <LivePreview
          site={site}
          openSection={activeTab === 'page' ? openSection : null}
          // On a phone the tab ROW below is hidden and this strip stands in for
          // it, riding the preview's bottom edge. Same goToTab, so a tab switch
          // still opens that tab's default card exactly as the row does.
          overlaySlot={<BuilderTabStrip tabs={TABS} activeTab={activeTab} onSelect={(id) => goToTab(id as BuilderTab)} />}
        />
      </div>

      {isDirty && (
        <div className={styles.savePill}>
          <span>Unsaved changes</span>
          <button type="button" className={styles.revertBtn} style={{ minHeight: '34px', padding: '0.35rem 0.8rem', borderRadius: '999px' }} onClick={handleRevert} disabled={isPending}>
            Discard
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : site.published ? 'Update live site' : 'Save now'}</button>
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

      <AiLogoCreatorModal
        open={showLogoStudio}
        onClose={() => setShowLogoStudio(false)}
        businessName={site.company_name}
        trade={siteContent.trade}
        accentColor={site.accent_override}
        aiCredits={availableAiCredits}
        onRefreshCredits={refreshAiCredits}
        savedLogos={aiLogos}
        onLogosChange={setAiLogos}
        pendingGeneration={pendingAiLogo}
        onPendingChange={setPendingAiLogo}
        onSelectLogo={(_svg, dataUri) => {
          handleChange('logo_url', dataUri);
          updateSiteContent({ logoStyle: 'transparent' });
        }}
      />

      {pendingAiLogo?.status === 'pending' && !showLogoStudio && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            zIndex: 99,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.65rem 1.1rem',
            background: 'linear-gradient(135deg, #1e1b4b, #31104b)',
            border: '1.5px solid #a855f7',
            borderRadius: '999px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            color: '#ffffff',
            fontSize: '0.82rem',
            fontWeight: 700,
          }}
        >
          <span style={{ display: 'inline-block', animation: 'aiBuilderSpin 2s linear infinite', color: '#c084fc', fontSize: '1rem' }}>✦</span>
          <span>AI Art Director is generating your logo in the background…</span>
          <button
            type="button"
            onClick={() => setShowLogoStudio(true)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              border: 'none',
              background: '#9333ea',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Open Studio
          </button>
        </div>
      )}

      <style>{`
        @keyframes aiBuilderSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {(() => {
        // Resolved from the live list, not captured when it opened: deleting the
        // band being edited must close the studio rather than leave it editing a
        // section that no longer exists.
        const editing = siteContent.videoSections.find((section) => section.id === videoStudioId);
        return editing ? (
          <VideoStudio
            content={editing}
            onChange={updateVideoSection}
            onClose={() => setVideoStudioId(null)}
          />
        ) : null;
      })()}
    </main>
  );
}
