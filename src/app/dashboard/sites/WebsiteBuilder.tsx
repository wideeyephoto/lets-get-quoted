'use client';
import { WebsiteBuilderContext } from './WebsiteBuilderContext';
import { BuilderBusinessTab } from './tabs/BuilderBusinessTab';
import { BuilderDesignTab } from './tabs/BuilderDesignTab';
import { BuilderPageTab } from './tabs/BuilderPageTab';
import { BuilderPublishTab } from './tabs/BuilderPublishTab';


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
  const [domainVerification, setDomainVerification] = useState<Awaited<ReturnType<typeof verifyCustomDomainAction>> | null>(null);
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
    if (field === 'custom_domain') {
      setDomainStatus('idle');
      setDomainVerification(null);
    }
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
        setSite({ ...saved, custom_domain_verified_at: result.verifiedAt });
        setDomainVerification(result);
        setIsDirty(false);
        if (result.verified) {
          setDomainStatus('verified');
          setMessage({ type: 'success', text: result.message });
        } else {
          setDomainStatus('unverified');
          setMessage({ type: 'error', text: result.message });
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
            {activeTab === 'business' && <BuilderBusinessTab />}

            {activeTab === 'design' && <BuilderDesignTab />}

            {activeTab === 'page' && <BuilderPageTab />}

            {activeTab === 'publish' && <BuilderPublishTab />}
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
