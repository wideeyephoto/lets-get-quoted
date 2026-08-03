import type { SiteImage } from '@/lib/site-images';
import type { WebsiteImageAssignment } from '@/lib/stock/types';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';
import { parseYouTubeUrl } from '@/lib/youtube';

export type SiteSectionKey = 'showcase' | 'testimonials' | 'faqs';

// Honest labels for a freshly generated site whose gallery holds representative
// STOCK photos (not the contractor's real jobs). Swapped to "Our work" style
// only once real project photos are uploaded.
export const STOCK_SHOWCASE_TITLE = 'Featured Projects';
export const STOCK_SHOWCASE_INTRO = "Whether it's a small job or big one, we've got you covered!";

export type SiteShowcaseItem = SiteImage & {
  caption?: string;
};

export type SiteShowcaseContent = {
  enabled: boolean;
  title: string;
  intro: string;
  // Custom text for this section's header nav link ('' = "Showcase"). The Photo
  // Gallery gets used in many ways (portfolio, our work, before/after), so the
  // menu label is editable.
  navLabel: string;
  layout: 'grid' | 'featured' | 'filmstrip';
  items: SiteShowcaseItem[];
};

export type SiteFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type SiteFaqContent = {
  enabled: boolean;
  title: string;
  items: SiteFaqItem[];
};

export type SiteTestimonialItem = {
  id: string;
  author: string;
  text: string;
  rating: number;
  label: string;
  imageUrl: string;
  imageAlt: string;
};

// A review imported from a Google Business Profile via the Places API. Displayed
// with attribution (author name + photo, star rating, "via Google" link) as
// Google's terms require; never hand-edited (it mirrors the source).
export type SiteGoogleReview = {
  id: string;
  author: string;
  authorPhoto: string;
  rating: number;
  text: string;
  relativeTime: string;
  url: string;
};

export type SiteTestimonialsContent = {
  enabled: boolean;
  title: string;
  sourceMode: 'manual' | 'google' | 'mixed';
  // How the reviews are laid out: a static grid, an auto-sliding carousel, or a
  // one-at-a-time auto-rotating spotlight.
  displayStyle: 'grid' | 'carousel' | 'spotlight';
  items: SiteTestimonialItem[];
  // Google Business Profile import (Places API). Empty until the owner links a
  // business and imports; the API returns at most 5 reviews, chosen by Google.
  googlePlaceId: string;
  googleName: string;
  googleUrl: string;
  googleRating: number;
  googleReviewCount: number;
  googleReviews: SiteGoogleReview[];
  googleImportedAt: string;
};

export type SiteStickyCallBarContent = {
  enabled: boolean;
  showQuote: boolean;
  // Custom button labels for the sticky mobile button.
  callLabel: string;
  quoteLabel: string;
};

export type SiteRatingBadgeContent = {
  // Off by default. When on, renders an on-page aggregate-rating badge AND
  // emits LocalBusiness + aggregateRating/Review JSON-LD for rich results.
  enabled: boolean;
  rating: number;
  reviewCount: number;
  sourceLabel: string;
};

export type SiteTrustBadgeItem = {
  id: string;
  label: string;
  enabled: boolean;
};

export type SiteTrustBadgesContent = {
  enabled: boolean;
  badges: SiteTrustBadgeItem[];
};

export type SiteFinancingContent = {
  enabled: boolean;
  monthlyFrom: number;
  blurb: string;
  applyUrl: string;
};

export type SiteServiceAreasContent = {
  enabled: boolean;
  title: string;
  intro: string;
  cities: string[];
};

export type SiteCertificationItem = {
  id: string;
  label: string;
  imageUrl: string;
  imageAlt: string;
};

export type SiteCertificationsContent = {
  enabled: boolean;
  title: string;
  items: SiteCertificationItem[];
};

export type SiteStatItem = {
  id: string;
  // Free-text value the owner types verbatim — "100+", "$2M", "24/7", "4.9★".
  // The stat band animates the first run of digits and leaves the rest static.
  value: string;
  label: string;
};

export type SiteStatsContent = {
  enabled: boolean;
  title: string;
  items: SiteStatItem[];
};

export type SiteBeforeAfterItem = {
  id: string;
  beforeUrl: string;
  beforeAlt: string;
  afterUrl: string;
  afterAlt: string;
  label: string;
};

export type SiteBeforeAfterContent = {
  enabled: boolean;
  title: string;
  intro: string;
  items: SiteBeforeAfterItem[];
};

// A thin availability/urgency band mounted above the site header (not in the
// mid-page content stack). Contractor-typed so it never fabricates urgency.
export type SiteAnnouncementContent = {
  enabled: boolean;
  message: string;
  subtext: string;
  // 'YYYY-MM-DD' — last day the bar shows; '' runs indefinitely. The public
  // render hides it automatically after this date so promos can expire.
  endDate: string;
};

// Care template's "Why choose us" checklist card.
export type SiteWhyUsContent = {
  enabled: boolean;
  title: string;
  points: string[];
};

// Auto-generated, editable legal pages linked in the footer. Enabled by default
// so every published site ships with a Privacy Policy + Terms; a blank body
// means "use the generated template" (see resolveLegalDoc in lib/legal).
export type SiteLegalContent = {
  privacyEnabled: boolean;
  termsEnabled: boolean;
  privacyBody: string; // '' = use the generated template
  termsBody: string; // '' = use the generated template
  updated: string; // 'YYYY-MM-DD' effective date, '' to omit
};

export const DEFAULT_WHY_US_TITLE = 'Quality work, every single time';
export const DEFAULT_WHY_US_POINTS = [
  'Verified, background-checked pros',
  'Upfront, honest pricing',
  'Fast, friendly response',
  'Quality work, guaranteed',
];

// The short editorial block a template runs between its hero and its work band
// (Forge's "What we bring", Guild's "One team, start to finish", Vista's big
// statement). All three fields are blank until the owner types something: the
// template supplies its own wording as the fallback, so nothing on a live page
// changes and each keeps its voice.
export type SiteIntroBlockContent = {
  eyebrow: string;
  title: string;
  body: string;
};

// Heading over a template's built-in "recent work" photo band, which renders
// the site's image gallery. Forge, Guild and Vista each have one. Both fields
// are blank until the owner types something: the template supplies its own
// wording as the fallback, so each keeps its voice ("Selected work / Made for
// real life." on Forge) instead of collapsing to one shared default.
export type SiteWorkGalleryContent = {
  eyebrow: string;
  title: string;
};

// "Project showcase" band — its OWN editable set of project photos (separate
// from the Photo gallery), presented as an animated slider in one of three
// styles. Falls back to the shared gallery for the render until the owner adds
// their own project photos. `items` reuses SiteShowcaseItem (url/alt/caption).
export type SiteProjectShowcaseStyle = 'slideshow' | 'coverflow' | 'spotlight';

export type SiteProjectShowcaseContent = {
  enabled: boolean;
  eyebrow: string;
  title: string;
  style: SiteProjectShowcaseStyle;
  items: SiteShowcaseItem[];
};

export const DEFAULT_PROJECT_SHOWCASE_EYEBROW = 'Recent Jobs';
export const DEFAULT_PROJECT_SHOWCASE_TITLE = 'See Our Work';
export const PROJECT_SHOWCASE_STYLES: { key: SiteProjectShowcaseStyle; label: string }[] = [
  { key: 'slideshow', label: 'Slideshow — full cross-fade with captions' },
  { key: 'coverflow', label: 'Coverflow — 3D angled carousel' },
  { key: 'spotlight', label: 'Spotlight — big photo + thumbnail strip' },
];
const PROJECT_SHOWCASE_STYLE_KEYS = new Set<string>(PROJECT_SHOWCASE_STYLES.map((style) => style.key));
// The owner can build up to 10 project photos (e.g. imported job photos); a
// site that hasn't added any yet shows 5 placeholders.
export const MAX_PROJECT_SHOWCASE_ITEMS = 10;
export const DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS = 5;

// ── Video section ──────────────────────────────────────────────────────────
//
// One band of video on the page, presented in one of six arrangements. The
// architecture that matters here is the split between the three things an owner
// changes independently:
//
//   CONTENT  — the videos, headline, description, CTA, the testimonial words,
//              the project details. Every style reads from this ONE set.
//   STYLE    — which arrangement renders it (`style`).
//   BEHAVIOR — autoplay / loop / controls / overlay / mobile fallback.
//
// So switching style REARRANGES the same content instead of asking for it
// again, and a field the new style doesn't render is still saved — swap back and
// it's exactly where it was. Nothing an owner typed is ever thrown away by a
// layout choice, which is the whole reason these are three fields and not one
// blob per style.
export type SiteVideoStyle = 'hero' | 'split' | 'story' | 'reel' | 'testimonial' | 'process';

// One video. Every per-item field any style might want lives here, for the same
// reason as above: the reel's tile label and the testimonial's quote sit side by
// side on the same item, so re-styling never drops one of them.
export type SiteVideoItem = {
  id: string;
  /** An uploaded file's public URL, or a YouTube link. See lib/video-source. */
  url: string;
  /** Still frame — captured from the upload, or YouTube's own thumbnail. */
  posterUrl: string;
  /** Tile caption in the reel gallery; the play label elsewhere. */
  label: string;
  /** Seconds, 0 when unknown. Shown as "0:42" on the tile. */
  duration: number;
  /**
   * Why this clip may not play for visitors, or '' when it should play
   * everywhere. Decided at upload from the container's codec plus whether the
   * owner's own browser could decode it — see videoPlaybackWarning.
   *
   * Stored rather than recomputed because it can only be worked out in the
   * browser holding the file. By the time the owner comes back to the studio,
   * all that exists is a URL, and re-downloading every clip to re-check would
   * cost more than the warning is worth. It never blocks publishing.
   */
  playbackWarning: string;
  // Testimonial fields — carried per video so a carousel can hold several
  // customers, each with their own words.
  quote: string;
  author: string;
  authorLabel: string;
};

export type SiteVideoSectionContent = {
  /** Stable per-section id. Also the suffix of its `video:<id>` order key, so
      renaming one would move it in the page order — never regenerate these. */
  id: string;
  enabled: boolean;
  style: SiteVideoStyle;
  // Content — shared by every style.
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  videos: SiteVideoItem[];
  // Project-story details (kept when another style is showing).
  location: string;
  timeline: string;
  service: string;
  // Process steps — title only; the number comes from position.
  steps: SiteProcessStep[];
  // Behavior.
  autoplay: boolean;
  loop: boolean;
  controls: boolean;
  /** 0–100 — how dark the scrim over the video is, for text legibility. */
  overlay: number;
  /** On phones, show the still frame with a play button instead of autoplaying. */
  mobilePoster: boolean;
};

export const VIDEO_SECTION_STYLES: { key: SiteVideoStyle; label: string; desc: string }[] = [
  { key: 'hero', label: 'Hero', desc: 'Full-width background video with your headline over it.' },
  { key: 'split', label: 'Video + text', desc: 'Video beside your message and a button — the safe all-rounder.' },
  { key: 'story', label: 'Project story', desc: 'One finished job as a mini case study: place, timeline, service.' },
  { key: 'reel', label: 'Reel gallery', desc: 'A row of tall phone-shot clips — a browsable portfolio.' },
  { key: 'testimonial', label: 'Testimonial', desc: 'A customer on camera with their words beside them.' },
  { key: 'process', label: 'Process', desc: 'One video plus the numbered steps of what happens next.' },
];
const VIDEO_STYLE_KEYS = new Set<string>(VIDEO_SECTION_STYLES.map((style) => style.key));

export const MAX_VIDEO_ITEMS = 6;
export const MAX_VIDEO_STEPS = 4;

// Bands per page, not videos. Four is enough to open with a hero, break the
// page with a project story and close with a testimonial, and few enough that
// the page is still a page rather than a playlist — the /videos route is where
// a long list belongs.
export const MAX_VIDEO_SECTIONS = 4;

/** A video section's key in `sectionOrder`. The first one keeps the bare
    `video` key so every site saved before this existed keeps its position. */
export function videoSectionKey(id: string): string {
  return id === 'video-1' ? 'video' : `video:${id}`;
}

// How many videos a style actually shows. The rest stay saved — trimming the
// list to fit a style would delete an upload on a layout change.
export function videoStyleCapacity(style: SiteVideoStyle): number {
  return style === 'reel' || style === 'testimonial' ? MAX_VIDEO_ITEMS : 1;
}

export const DEFAULT_VIDEO_EYEBROW = 'Meet the owner';
export const DEFAULT_VIDEO_HEADLINE = 'See what quality craftsmanship looks like.';
export const DEFAULT_VIDEO_BODY = 'A quick hello, what we believe, and what homeowners can expect.';
export const DEFAULT_VIDEO_CTA = 'Get a free estimate';
export const DEFAULT_VIDEO_STEPS: SiteProcessStep[] = [
  { id: 'vstep-1', title: 'Free estimate', description: '' },
  { id: 'vstep-2', title: 'Approve quote', description: '' },
  { id: 'vstep-3', title: 'We get to work', description: '' },
  { id: 'vstep-4', title: 'Final walkthrough', description: '' },
];

// Icon service-card grid — the centerpiece of the home-services aesthetic.
// `icon` is a key into ServiceIcon's set (falls back to a generic mark).
export type SiteServiceItem = {
  id: string;
  icon: string;
  title: string;
  description: string;
};

export type SiteServicesContent = {
  enabled: boolean;
  title: string;
  intro: string;
  items: SiteServiceItem[];
};

// Numbered "how it works" steps — the process a homeowner goes through
// (book → we arrive → job done). Step numbers are derived from order.
export type SiteProcessStep = {
  id: string;
  title: string;
  description: string;
};

export type SiteHowItWorksContent = {
  enabled: boolean;
  title: string;
  intro: string;
  steps: SiteProcessStep[];
};

// Blog posts (AI-drafted, owner-published). Stored in content so there's no
// separate table/migration; a post is public only when status === 'published'.
export type SiteBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImage: string;
  status: 'draft' | 'published';
  date: string;
  // Optional scheduled auto-publish date (YYYY-MM-DD). When set on a draft, the
  // daily cron flips it to published once that date arrives.
  publishAt: string;
};

export type SiteBlogContent = {
  enabled: boolean;
  title: string;
  intro: string;
  // How posts are laid out on the public page. See BLOG_STYLES.
  layout: string;
  // Dashboard reminder cadence in weeks (0 = off, else 2 / 4 / 8) — nudges the
  // owner to publish a fresh post.
  reminderWeeks: number;
  posts: SiteBlogPost[];
};

// Selectable blog-section layouts (data-blog-layout via the render).
export const BLOG_STYLES = [
  { key: 'grid', label: 'Card grid', desc: 'Even cover-photo cards — the scannable default.' },
  { key: 'featured', label: 'Featured + list', desc: 'A big lead post with the rest in a list beside it.' },
  { key: 'rows', label: 'List rows', desc: 'Horizontal thumbnail rows — editorial and compact.' },
] as const;
const BLOG_LAYOUT_KEYS = new Set<string>(BLOG_STYLES.map((style) => style.key));

// Floating hero badge — the small trust chip shown on the hero of photo-badge
// templates (Fixit today). Owners pick one of these presets or hide it; the
// preset key drives the icon/title/subtitle so the template stays declarative.
export type SiteHeroBadgeContent = { preset: string; showStats: boolean; style: string; customLabel: string; secondPreset: string; secondCustomLabel: string };

export const HERO_BADGE_PRESETS = [
  { key: 'estimates', icon: '$', title: 'Free Estimates', subtitle: 'No-obligation quotes', label: 'Free estimates' },
  { key: 'licensed', icon: '✓', title: 'Licensed & Insured', subtitle: 'Fully vetted pros', label: 'Licensed & insured' },
  { key: 'sameday', icon: '⚡', title: 'Same-Day Service', subtitle: 'Fast response', label: 'Same-day service' },
  { key: 'financing', icon: '%', title: 'Financing Available', subtitle: 'Flexible plans', label: 'Financing available' },
  { key: 'guarantee', icon: '♥', title: 'Satisfaction Guaranteed', subtitle: 'Guaranteed work', label: 'Satisfaction guaranteed' },
  { key: 'local', icon: '⌂', title: 'Locally Owned', subtitle: 'In your community', label: 'Locally owned' },
  { key: 'fivestar', icon: '★', title: '5-Star Rated', subtitle: 'Loved by homeowners', label: '5-star rated' },
  { key: 'upfront', icon: '≡', title: 'Upfront Pricing', subtitle: 'No surprises', label: 'Upfront pricing' },
  { key: 'warranty', icon: '◆', title: 'Warranty Included', subtitle: 'Backed in writing', label: 'Warranty included' },
] as const;

export type HeroBadgePreset = { key: string; icon: string; title: string; subtitle: string; label: string };

// The three visual treatments for the floating hero badge.
// Hero badge treatments (data-badge-style). Two light-background + two
// dark-background looks. 'solid'/'soft' are the original light styles (kept so
// existing sites are unchanged); 'dark'/'darkglass' are their dark counterparts.
export const HERO_BADGE_STYLES = [
  { key: 'solid', label: 'Light' },
  { key: 'soft', label: 'Light glass' },
  { key: 'dark', label: 'Dark' },
  { key: 'darkglass', label: 'Dark glass' },
] as const;

// 'outline' is a legacy style kept valid (so older sites keep it) but no longer
// offered in the picker.
const HERO_BADGE_STYLE_KEYS = new Set<string>([...HERO_BADGE_STYLES.map((style) => style.key), 'outline']);

// Selectable header styles, each rendered in the template's own skin via
// data-header on the root. '' = the theme's built-in header (untouched). More
// styles (floating glass, utility bar, centered stack) are planned as a next
// pass — see the header CSS block in themes.module.css.
export const HEADER_STYLES = [
  { key: 'refined', label: 'Refined baseline', desc: 'Nav centered with an accent underline on hover.' },
  { key: 'glass', label: 'Floating glass bar', desc: 'A blurred capsule floating over the hero.' },
  { key: 'editorial', label: 'Editorial uppercase', desc: 'Tracked-out caps and a hairline bottom border.' },
  { key: 'utility', label: 'Utility bar', desc: 'A slim accent strip with phone, hours & licensed.' },
  { key: 'stacked', label: 'Centered stack', desc: 'Logo centered up top, nav in a row beneath.' },
  { key: 'chips', label: 'Segmented chips', desc: 'Each nav link becomes a bordered chip.' },
  { key: 'cta', label: 'CTA edge block', desc: 'Accent action fused to the right edge.' },
] as const;

// Mobile hamburger-button styles, applied via data-menu-btn on the root.
export const MENU_BUTTON_STYLES = [
  { key: 'bars', label: 'Bars', desc: 'The classic three lines.' },
  { key: 'thin', label: 'Thin lines', desc: 'Lighter, wider-spaced lines.' },
  { key: 'pill', label: 'Accent pill', desc: 'Lines in a filled accent button.' },
  { key: 'dots', label: 'Dots', desc: 'Three stacked dots.' },
  { key: 'labeled', label: 'Menu label', desc: 'A bordered "Menu" text button.' },
] as const;
const MENU_BUTTON_STYLE_KEYS = new Set<string>(MENU_BUTTON_STYLES.map((style) => style.key));

// Button treatments for the primary CTAs. PAGE buttons (hero/contact/footer) are
// driven by site.button_style → data-button; the HEADER CTA is driven separately
// by content.headerButtonStyle → data-header-button, so the two can differ.
export const BUTTON_STYLES = [
  { key: 'solid', label: 'Solid' },
  { key: 'outline', label: 'Outline' },
  { key: 'glow', label: 'Glow' },
  { key: 'double', label: 'Double border' },
  { key: 'gloss', label: 'Gloss' },
  { key: 'ring', label: 'Ring' },
  { key: 'sweep', label: 'Fill sweep' },
] as const;
// The header dropdown adds "Match page buttons" ('') and drops "Solid" (which is
// just what "match" gives when the page is solid — a standalone solid header
// override would have to unpick each theme's base CTA, so it isn't offered).
export const HEADER_BUTTON_STYLES = [
  { key: 'outline', label: 'Outline' },
  { key: 'glow', label: 'Glow' },
  { key: 'double', label: 'Double border' },
  { key: 'gloss', label: 'Gloss' },
  { key: 'ring', label: 'Ring' },
  { key: 'sweep', label: 'Fill sweep' },
] as const;
const HEADER_BUTTON_STYLE_KEYS = new Set<string>(HEADER_BUTTON_STYLES.map((style) => style.key));

// Display treatments for the company-name wordmark (header + footer), applied
// via data-wordmark on the root. '' = the plain name. CSS-only, so they layer
// on top of whatever brand font is chosen.
export const WORDMARK_STYLES = [
  { key: 'caps', label: 'All caps — wide tracking' },
  { key: 'initial', label: 'Accent first word' },
  { key: 'middle', label: 'Accent middle word' },
  { key: 'last', label: 'Accent last word' },
  { key: 'underline', label: 'Accent underline' },
  { key: 'box', label: 'Boxed outline' },
  { key: 'brackets', label: 'Corner brackets' },
  { key: 'pill', label: 'Accent pill' },
  { key: 'stamp', label: 'Stamp' },
  { key: 'plate', label: 'Raised plate' },
] as const;

export function getWordmarkStyle(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).wordmarkStyle;
}

// Full-page color schemes. A theme owns layout/type/motion; a scheme owns the
// whole palette through a small shared token set the templates consume
// (--c-bg / --c-surface / --c-ink / --c-muted / --c-line / --c-deep /
// --c-on-deep, plus the accent). Empty colorScheme = the theme's own built-in
// palette (respecting its light/dark mode), so no existing site changes.
// 'deep' is the inverted contrast ground a theme uses for hero/header/footer
// chrome; 'onDeep' is text on it.
export type ColorScheme = {
  key: string; label: string;
  bg: string; surface: string; ink: string; muted: string; line: string;
  deep: string; onDeep: string; accent: string; onAccent: string;
};

export const COLOR_SCHEMES: ColorScheme[] = [
  { key: 'midnight', label: 'Midnight — near-black + soft blue',
    bg: '#0e1116', surface: '#191d25', ink: '#eef1f5', muted: '#99a2b0', line: '#272d38',
    deep: '#080a0d', onDeep: '#eef1f5', accent: '#6ea8ff', onAccent: '#0b0e13' },
  { key: 'porcelain', label: 'Porcelain — warm white + clay',
    bg: '#f7f5f1', surface: '#ffffff', ink: '#1b1d20', muted: '#6c7076', line: '#e7e3db',
    deep: '#1f2124', onDeep: '#f6f4ef', accent: '#c76b4a', onAccent: '#ffffff' },
  { key: 'slate', label: 'Slate — cool grey + teal',
    bg: '#eceff3', surface: '#ffffff', ink: '#1a2230', muted: '#5d6b7e', line: '#dce2ea',
    deep: '#1d2734', onDeep: '#eef2f7', accent: '#2f9e8f', onAccent: '#ffffff' },
  { key: 'forest', label: 'Forest — deep green + lime',
    bg: '#0f1512', surface: '#182019', ink: '#e9f0ea', muted: '#95a79a', line: '#26332a',
    deep: '#0a0f0c', onDeep: '#e9f0ea', accent: '#8fd14f', onAccent: '#0d130a' },
];

export function getColorScheme(key: string | null | undefined): ColorScheme | null {
  return COLOR_SCHEMES.find((scheme) => scheme.key === key) || null;
}

// The header style a site renders. Empty string when the owner hasn't chosen —
// which the CSS treats as "the template's own built-in header," so no existing
// site's header changes. A chosen style (balanced|left|cta) fully overrides the
// layout for that theme. The `template` arg is unused today but kept so a
// per-template default could be introduced without touching call sites.
export function getHeaderStyle(_template: string, content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).headerStyle;
}

// Header CTA button style for data-header-button. '' (unset) resolves to 'match'
// — no override CSS block matches 'match', so the header CTA simply follows the
// page button style (data-button), which is how every existing site behaves.
export function getHeaderButtonStyle(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).headerButtonStyle || 'match';
}

export type SiteQuoteFormContent = {
  // Whether the FULL multi-field quote form renders at #contact. Off by
  // default — the smart-intake capture takes its place so visitors always
  // still have a way to reach out.
  enabled: boolean;
  emailRequired: boolean;
  // Controls the wording used on the quote-request call-to-action ('Quick Estimate'
  // vs 'Instant Estimate') across the hero quick-capture form and the full form.
  estimateLabel: 'quick' | 'instant';
  // Wording for the call-to-action when the CLASSIC quote form is the active
  // intake. Free text, because "Instant Estimate" is a promise the classic form
  // doesn't keep — nobody gets a price on the spot, they get a reply later.
  // Owner-editable; DEFAULT_QUOTE_FORM_HEADING when left blank.
  formHeading: string;
};

export const DEFAULT_QUOTE_FORM_HEADING = 'Request an Estimate';

// The wording on the intake call-to-action, wherever it appears — the hero
// capture's heading, the header CTA, and the "not published yet" notice.
// Mode-aware on purpose: the AI intake really does return a price on the spot,
// so "Instant Estimate" is accurate there; the classic form does not, so it uses
// the owner's own wording instead of inheriting a claim it can't honour.
export function getEstimateButtonLabel(
  quoteForm: Pick<SiteQuoteFormContent, 'estimateLabel' | 'enabled' | 'formHeading'>,
): string {
  if (quoteForm.enabled) return quoteForm.formHeading?.trim() || DEFAULT_QUOTE_FORM_HEADING;
  return quoteForm.estimateLabel === 'instant' ? 'Instant Estimate' : 'Instant Quote';
}

// The smart-intake estimator: the AI scopes the described job and prices it
// directly for the trade — there are no stored price bands to configure.
// Phone is always the intake's required contact (the follow-up is a text or
// call); `emailField` controls whether an email field appears alongside it.
export type SiteEstimateRangesContent = {
  enabled: boolean;
  emailField: 'off' | 'optional' | 'required';
};

// Optional intro video shown on the "request sent" screen, AFTER the lead is in.
// It is deliberately not offered anywhere earlier: a video in front of the
// estimate is a toll gate on the one thing the visitor came for. Here the ask is
// already answered, so the dwell time is a bonus rather than a cost.
//
// Top-level, not under estimateRanges, because it belongs to BOTH intake
// methods — Smart Intake's result screen and the classic form's thank-you.
// Filing a shared setting under the smart-intake config would imply the classic
// form couldn't have one.
export type SiteIntroVideoContent = {
  enabled: boolean;
  /** Whatever the owner pasted; parsed to a video id at render (lib/youtube). */
  url: string;
  /** Heading above the player. */
  title: string;
};

export const DEFAULT_INTRO_VIDEO_TITLE = 'While you wait — a quick hello';

// Switched on AND pointing at something playable. A half-finished setup renders
// nothing rather than an empty frame — the owner is never watching this screen
// themselves, so a broken embed here could sit in front of customers for weeks.
export function isIntroVideoLive(video: SiteIntroVideoContent): boolean {
  return video.enabled && parseYouTubeUrl(video.url) !== null;
}

// Owner controls that prune low-quality website leads before they cost time.
// Gates run on the AI intake; flags land on the lead's triage record so the
// dashboard can sort junk down instead of hiding it entirely.
export type SiteLeadFiltersContent = {
  // Ask visitors for their ZIP/town (only when "Cities you serve" has
  // entries) and flag leads that look outside the service area.
  serviceAreaGate: boolean;
  // 0 = no minimum. Estimates whose top end lands below this get flagged.
  minJobAmount: number;
  // Work the business does NOT take on (≤10 short phrases).
  exclusions: string[];
  // Ask "when do you need this done?" — "just researching" sorts low.
  askTimeline: boolean;
  // Capacity mode: keep collecting leads but set expectations up front.
  fullyBooked: { enabled: boolean; until: string; message: string };
  // Text a one-time code to verify the phone before the intake submits.
  phoneVerification: boolean;
};

export const DEFAULT_FULLY_BOOKED_MESSAGE = 'We’re currently booked up — send your request and we’ll reach out as soon as a spot opens.';

// Fully-booked mode with a "booked until" date expires itself at the end of
// that day — no date means it runs until the owner turns it off.
export function isFullyBookedActive(leadFilters: SiteLeadFiltersContent, now = new Date()): boolean {
  if (!leadFilters.fullyBooked.enabled) return false;
  if (!leadFilters.fullyBooked.until) return true;
  const end = new Date(`${leadFilters.fullyBooked.until}T23:59:59`);
  return Number.isNaN(end.getTime()) || end.getTime() >= now.getTime();
}

export type NormalizedSiteContent = {
  showcase: SiteShowcaseContent;
  faqs: SiteFaqContent;
  testimonials: SiteTestimonialsContent;
  quoteForm: SiteQuoteFormContent;
  estimateRanges: SiteEstimateRangesContent;
  /** Post-submit intro video — applies to whichever intake is active. */
  introVideo: SiteIntroVideoContent;
  leadFilters: SiteLeadFiltersContent;
  // Whether the contractor's phone number appears anywhere on the public site
  // (call buttons, headers, footers, "or call" links). Off = every contact
  // routes through the forms; texting/SMS features still use the real number.
  phonePublic: boolean;
  stickyCallBar: SiteStickyCallBarContent;
  ratingBadge: SiteRatingBadgeContent;
  trustBadges: SiteTrustBadgesContent;
  financing: SiteFinancingContent;
  serviceAreas: SiteServiceAreasContent;
  certifications: SiteCertificationsContent;
  stats: SiteStatsContent;
  beforeAfter: SiteBeforeAfterContent;
  announcement: SiteAnnouncementContent;
  whyUs: SiteWhyUsContent;
  legal: SiteLegalContent;
  workGallery: SiteWorkGalleryContent;
  introBlock: SiteIntroBlockContent;
  // The small label above the hero headline. Blank until the owner types one;
  // each template falls back to its own wording, so no live page changes.
  heroEyebrow: string;
  // Font for the company-name wordmark in the header/footer. Blank = the
  // template's own default; 'var(--theme-display)' = match the heading font;
  // otherwise a specific font-family stack. Resolves via --brand-font.
  brandFont: string;
  // Header layout: '' = the template's natural style, else one of
  // HEADER_STYLES ('balanced' | 'left' | 'cta'). Drives data-header on the root.
  headerStyle: string;
  // Show the CTA button in the header (data-header-cta off = hidden everywhere).
  headerCta: boolean;
  // Mobile hamburger button style (data-menu-btn). See MENU_BUTTON_STYLES.
  menuButton: string;
  // Header CTA button style (data-header-button). '' = match the page button
  // style (site.button_style); otherwise one of HEADER_BUTTON_STYLES so the
  // header "Instant Estimate" can differ from the hero/page buttons.
  headerButtonStyle: string;
  // Full-page color scheme key ('' = the theme's own palette). See COLOR_SCHEMES.
  colorScheme: string;
  // Company-name wordmark display treatment ('' = plain). See WORDMARK_STYLES.
  wordmarkStyle: string;
  projectShowcase: SiteProjectShowcaseContent;
  /** The video bands. One set of content each, six arrangements each. */
  videoSections: SiteVideoSectionContent[];
  services: SiteServicesContent;
  howItWorks: SiteHowItWorksContent;
  blog: SiteBlogContent;
  heroBadge: SiteHeroBadgeContent;
  // Per-slot overrides for the template's secondary/decorative photos (second
  // hero collage shot, stats-section photo, etc.), keyed by slot id. Empty
  // unless the owner has explicitly swapped one; templates fall back to their
  // auto-derived default when a slot is unset. See IMAGE_SLOT_LABELS.
  images: Record<string, string>;
  // The owner-chosen order of the in-flow content sections on the public page.
  // Always a full, deduped permutation of REORDERABLE_SECTIONS keys (missing
  // ones appended in default order) so every section renders and new ones show.
  sectionOrder: string[];
  // Up to 2 EXTRA hero photos (beyond site.hero_url). The full hero set cycles
  // (cross-fade) in the hero; the extras also render as parallax bands further
  // down the page. See getHeroImages / getHeroBandImages.
  heroImages: string[];
  // How the header/footer logo is framed so a boxy logo blends in:
  // 'plain' | 'rounded' | 'framed' | 'circle'. Set on the template root as
  // data-logo-style; one CSS block styles every template's logo.
  logoStyle: string;
  // Header/footer logo scale: 'small' | 'medium' | 'large'. Set on the template
  // root as data-logo-size; drives the shared .logo height.
  logoSize: string;
  // Footer layout, shared across every theme via <SiteFooter>:
  // 'columns' | 'cta' | 'centered' | 'grid'. Drives data-footer on the footer.
  footerStyle: string;
  // The owner's trade / contractor type (e.g. "window cleaning", "roofing"),
  // used together with the business name to generate on-brand AI content.
  trade: string;
  // Business ZIP code — seeds the AI so it can name the real primary city and
  // nearby towns for the service area (not a generic guess).
  zip: string;
  // The owner's chosen brand-mark glyph key (from the trade options). Empty falls
  // back to the trade default. Drives the header/footer logo mark, favicon, and
  // downloadable icon when no logo image is uploaded.
  brandGlyph: string;
  // Provenance + attribution for auto-selected stock photos (Pexels). The
  // render fields (hero_url, images, showcase.items) hold the URLs; this array
  // is the source of truth for who took each photo and which role it fills, so
  // attribution can be shown and "Regenerate all stock images" can tell stock
  // slots from owner uploads. See src/lib/stock/types.ts.
  stockImages: WebsiteImageAssignment[];
};

export const MAX_EXTRA_HERO_IMAGES = 2;

const LOGO_STYLE_KEYS = new Set(['plain', 'transparent', 'rounded', 'squircle', 'framed', 'circle']);
const LOGO_SIZE_KEYS = new Set(['small', 'medium', 'large']);
export const FOOTER_STYLE_KEYS = new Set(['columns', 'cta', 'centered', 'grid']);

export function getLogoStyle(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).logoStyle;
}

export function getFooterStyle(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).footerStyle;
}

export function getLogoSize(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).logoSize;
}

export const DEFAULT_SHOWCASE_TITLE = 'Featured Projects';
export const DEFAULT_FAQ_TITLE = 'Frequently asked questions';
export const DEFAULT_TESTIMONIALS_TITLE = 'What homeowners say';
export const DEFAULT_RATING_SOURCE_LABEL = 'Verified reviews';
export const DEFAULT_FINANCING_BLURB = 'Flexible financing available on approved credit.';
export const DEFAULT_SERVICE_AREAS_TITLE = 'Areas we serve';
export const DEFAULT_SERVICE_AREAS_INTRO = 'Proudly serving homeowners across the region.';
export const DEFAULT_CERTIFICATIONS_TITLE = 'Certifications & awards';
export const DEFAULT_STATS_TITLE = 'By the numbers';
export const DEFAULT_BEFORE_AFTER_TITLE = 'Before & After';
export const DEFAULT_SERVICES_TITLE = 'What we do';
export const DEFAULT_HOW_IT_WORKS_TITLE = 'How it works';
// Starter steps a brand-new site's "How it works" section shows until the owner
// edits them (an explicit steps array — even empty — is respected as-is).
export const DEFAULT_HOW_IT_WORKS_STEPS: SiteProcessStep[] = [
  { id: 'step-1', title: 'Instant Quote with Smart Intake', description: 'We provide instant quotes by asking you a few questions' },
  { id: 'step-2', title: 'Schedule a Free Estimate', description: 'We send you 3 times that would work for us to come assess the jobsite' },
  { id: 'step-3', title: 'Quote for the job at hand', description: 'You will receive a text message to sign-off and be scheduled to start the job. A deposit may be required for larger jobs' },
];
export const DEFAULT_BLOG_TITLE = 'From our blog';
export const DEFAULT_BEFORE_AFTER_INTRO = 'See the transformation';

export const DEFAULT_TRUST_BADGES: SiteTrustBadgeItem[] = [
  { id: 'licensed', label: 'Licensed', enabled: true },
  { id: 'insured', label: 'Insured', enabled: true },
  { id: 'bonded', label: 'Bonded', enabled: true },
  { id: 'free-estimates', label: 'Free estimates', enabled: true },
  { id: 'guaranteed', label: 'Satisfaction guaranteed', enabled: true },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function toRating(value: unknown): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

// Like toRating but keeps one decimal place (e.g. 4.9) for the aggregate badge.
function toRatingValue(value: unknown, fallback = 5): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rating)) return fallback;
  return Math.min(5, Math.max(1, Math.round(rating * 10) / 10));
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function parseShowcaseItems(value: unknown): SiteShowcaseItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is SiteShowcaseItem => {
    if (!isRecord(item)) return false;
    return (
      typeof item.id === 'string' &&
      typeof item.url === 'string' &&
      typeof item.alt === 'string' &&
      typeof item.category === 'string' &&
      (item.source === 'stock' || item.source === 'upload')
    );
  }).map((item) => ({
    id: item.id,
    url: item.url,
    alt: item.alt,
    category: item.category,
    source: item.source,
    storagePath: typeof item.storagePath === 'string' ? item.storagePath : undefined,
    caption: typeof item.caption === 'string' ? item.caption : undefined,
  }));
}

function parseFaqItems(value: unknown): SiteFaqItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `faq-${index + 1}`),
    question: toString(item.question),
    answer: toString(item.answer),
  }));
}

function parseTestimonials(value: unknown): SiteTestimonialItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `testimonial-${index + 1}`),
    author: toString(item.author),
    text: toString(item.text),
    rating: toRating(item.rating),
    label: toString(item.label),
    imageUrl: toString(item.imageUrl),
    imageAlt: toString(item.imageAlt),
  }));
}

function parseGoogleReviews(value: unknown): SiteGoogleReview[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, 5).map((item, index) => ({
    id: toString(item.id, `google-review-${index + 1}`),
    author: toString(item.author),
    authorPhoto: toString(item.authorPhoto),
    rating: toRating(item.rating),
    text: toString(item.text),
    relativeTime: toString(item.relativeTime),
    url: toString(item.url),
  }));
}

function parseTrustBadges(value: unknown): SiteTrustBadgeItem[] {
  if (!Array.isArray(value)) return DEFAULT_TRUST_BADGES.map((badge) => ({ ...badge }));

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `badge-${index + 1}`),
    label: toString(item.label),
    enabled: item.enabled !== false,
  }));
}

function parseWhyPoints(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toString(item).slice(0, 80)).slice(0, max);
}

function parseCities(value: unknown): string[] {
  // Keep empty strings so a just-added blank input survives re-render while
  // editing (getPublishedServiceAreas filters empties for the public site).
  if (!Array.isArray(value)) return [];
  return value.map((item) => toString(item)).slice(0, 80);
}

function parseCertifications(value: unknown): SiteCertificationItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `cert-${index + 1}`),
    label: toString(item.label),
    imageUrl: toString(item.imageUrl),
    imageAlt: toString(item.imageAlt),
  }));
}

function parseStats(value: unknown): SiteStatItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `stat-${index + 1}`),
    value: normalizeStatValue(item),
    label: toString(item.label),
  }));
}

// New model: a single free-text value. Older stats stored a numeric value plus
// separate prefix/suffix strings — fold those into one string ("$" + "100" + "+"
// → "$100+") so existing sites keep the exact number they had.
function normalizeStatValue(item: Record<string, unknown>): string {
  if (typeof item.value === 'string') return item.value.slice(0, 24);
  const prefix = toString(item.prefix);
  const suffix = toString(item.suffix);
  const num = toPositiveNumber(item.value, 0);
  const core = num > 0 ? num.toLocaleString('en-US') : '';
  return `${prefix}${core}${suffix}`.slice(0, 24);
}

function parseBeforeAfter(value: unknown): SiteBeforeAfterItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `ba-${index + 1}`),
    beforeUrl: toString(item.beforeUrl),
    beforeAlt: toString(item.beforeAlt),
    afterUrl: toString(item.afterUrl),
    afterAlt: toString(item.afterAlt),
    label: toString(item.label),
  }));
}

function parseServices(value: unknown): SiteServiceItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, 15).map((item, index) => ({
    id: toString(item.id, `svc-${index + 1}`),
    icon: toString(item.icon, 'spark'),
    title: toString(item.title),
    description: toString(item.description),
  }));
}

function parseVideoItems(value: unknown): SiteVideoItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, MAX_VIDEO_ITEMS).map((item, index) => ({
    id: toString(item.id, `vid-${index + 1}`),
    url: toString(item.url).slice(0, 500),
    posterUrl: toString(item.posterUrl).slice(0, 500),
    label: toString(item.label).slice(0, 60),
    duration: Math.max(0, Math.round(toPositiveNumber(item.duration, 0))),
    // Absent on every clip uploaded before this existed, which reads as '' —
    // "nothing known against it" — rather than a false alarm on old sites.
    playbackWarning: toString(item.playbackWarning).slice(0, 400),
    quote: toString(item.quote).slice(0, 400),
    author: toString(item.author).slice(0, 60),
    authorLabel: toString(item.authorLabel).slice(0, 60),
  }));
}

// One video band. Split out of the content parser so the same shape can be read
// from `videoSections[]` and from the single legacy `videoSection` object.
function parseVideoSection(raw: unknown, index: number): SiteVideoSectionContent {
  const section = isRecord(raw) ? raw : {};
  return {
    id: toString(section.id, `video-${index + 1}`).slice(0, 40),
    // On by default, but it publishes nothing until a video is actually
    // attached (getPublishedVideoSections) — so an owner who never adds one
    // sees the control without ever shipping an empty band.
    enabled: section.enabled !== false,
    style: VIDEO_STYLE_KEYS.has(toString(section.style)) ? (toString(section.style) as SiteVideoStyle) : 'split',
    eyebrow: toString(section.eyebrow, DEFAULT_VIDEO_EYEBROW).slice(0, 40),
    headline: toString(section.headline, DEFAULT_VIDEO_HEADLINE).slice(0, 120),
    body: toString(section.body, DEFAULT_VIDEO_BODY).slice(0, 400),
    ctaLabel: toString(section.ctaLabel, DEFAULT_VIDEO_CTA).slice(0, 40),
    ctaHref: toString(section.ctaHref, '#contact').slice(0, 200),
    videos: parseVideoItems(section.videos),
    location: toString(section.location).slice(0, 60),
    timeline: toString(section.timeline).slice(0, 40),
    service: toString(section.service).slice(0, 40),
    steps: section.steps === undefined
      ? DEFAULT_VIDEO_STEPS.map((step) => ({ ...step }))
      : parseProcessSteps(section.steps).slice(0, MAX_VIDEO_STEPS),
    autoplay: section.autoplay !== false,
    loop: section.loop !== false,
    controls: toBoolean(section.controls),
    overlay: Math.min(90, Math.max(0, Math.round(toPositiveNumber(section.overlay, 55)))),
    mobilePoster: section.mobilePoster !== false,
  };
}

// Every site saved before there could be more than one band has a single
// `videoSection` object and no `videoSections` array. Reading the old key when
// the new one is absent is the whole migration — nothing is rewritten on disk
// until the owner next saves, so a rollback loses nothing.
function parseVideoSections(root: Record<string, unknown>): SiteVideoSectionContent[] {
  const list = Array.isArray(root.videoSections)
    ? root.videoSections.slice(0, MAX_VIDEO_SECTIONS).map(parseVideoSection)
    : [parseVideoSection(root.videoSection, 0)];

  // Ids are order keys, so a duplicate would make two bands fight for one slot.
  const seen = new Set<string>();
  return list.map((section, index) => {
    if (!seen.has(section.id)) { seen.add(section.id); return section; }
    let n = index + 1;
    let id = `video-${n}`;
    while (seen.has(id)) id = `video-${++n}`;
    seen.add(id);
    return { ...section, id };
  });
}

function parseProcessSteps(value: unknown): SiteProcessStep[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, 5).map((item, index) => ({
    id: toString(item.id, `step-${index + 1}`),
    title: toString(item.title),
    description: toString(item.description),
  }));
}

// Turn a title into a URL-safe slug (lowercase, hyphenated, alnum only).
export function slugifyBlogTitle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseBlogPosts(value: unknown): SiteBlogPost[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, 60).map((item, index) => {
    const title = toString(item.title);
    const rawStatus = toString(item.status);
    const rawSlug = toString(item.slug);
    return {
      id: toString(item.id, `post-${index + 1}`),
      slug: rawSlug ? slugifyBlogTitle(rawSlug) : slugifyBlogTitle(title) || `post-${index + 1}`,
      title,
      excerpt: toString(item.excerpt),
      body: toString(item.body),
      coverImage: toString(item.coverImage),
      status: rawStatus === 'published' ? 'published' : 'draft',
      date: toString(item.date),
      publishAt: /^\d{4}-\d{2}-\d{2}$/.test(toString(item.publishAt)) ? toString(item.publishAt) : '',
    };
  });
}

export function getSiteContent(content: Record<string, unknown> | null | undefined): NormalizedSiteContent {
  const root = isRecord(content) ? content : {};
  const showcase = isRecord(root.showcase) ? root.showcase : {};
  const faqs = isRecord(root.faqs) ? root.faqs : {};
  const testimonials = isRecord(root.testimonials) ? root.testimonials : {};
  const quoteForm = isRecord(root.quoteForm) ? root.quoteForm : {};
  const estimateRanges = isRecord(root.estimateRanges) ? root.estimateRanges : {};
  // Promoted from estimateRanges.introVideo once it applied to both intakes;
  // the nested location is still read so sites saved before the move keep
  // their video instead of silently losing it.
  const introVideo = isRecord(root.introVideo)
    ? root.introVideo
    : isRecord(estimateRanges.introVideo)
      ? estimateRanges.introVideo
      : {};
  const leadFilters = isRecord(root.leadFilters) ? root.leadFilters : {};
  const fullyBooked = isRecord(leadFilters.fullyBooked) ? leadFilters.fullyBooked : {};
  const stickyCallBar = isRecord(root.stickyCallBar) ? root.stickyCallBar : {};
  const ratingBadge = isRecord(root.ratingBadge) ? root.ratingBadge : {};
  const trustBadges = isRecord(root.trustBadges) ? root.trustBadges : {};
  const financing = isRecord(root.financing) ? root.financing : {};
  const serviceAreas = isRecord(root.serviceAreas) ? root.serviceAreas : {};
  const certifications = isRecord(root.certifications) ? root.certifications : {};
  const stats = isRecord(root.stats) ? root.stats : {};
  const beforeAfter = isRecord(root.beforeAfter) ? root.beforeAfter : {};
  const announcement = isRecord(root.announcement) ? root.announcement : {};
  const whyUs = isRecord(root.whyUs) ? root.whyUs : {};
  const legal = isRecord(root.legal) ? root.legal : {};
  const workGallery = isRecord(root.workGallery) ? root.workGallery : {};
  const introBlock = isRecord(root.introBlock) ? root.introBlock : {};
  const projectShowcase = isRecord(root.projectShowcase) ? root.projectShowcase : {};
  const services = isRecord(root.services) ? root.services : {};
  const howItWorks = isRecord(root.howItWorks) ? root.howItWorks : {};
  const blog = isRecord(root.blog) ? root.blog : {};
  const heroBadge = isRecord(root.heroBadge) ? root.heroBadge : {};
  const images = isRecord(root.images) ? root.images : {};
  // Hoisted: sectionOrder is validated against these bands' own keys, so it
  // cannot be parsed until we know how many bands there are.
  const videoSections = parseVideoSections(root);

  return {
    showcase: {
      enabled: showcase.enabled !== false,
      title: toString(showcase.title, DEFAULT_SHOWCASE_TITLE),
      intro: toString(showcase.intro, "Whether it's a small job or big one, we've got you covered!"),
      navLabel: toString(showcase.navLabel).slice(0, 24),
      layout: showcase.layout === 'grid' || showcase.layout === 'filmstrip' ? showcase.layout : 'featured',
      items: parseShowcaseItems(showcase.items),
    },
    faqs: {
      enabled: faqs.enabled !== false,
      title: toString(faqs.title, DEFAULT_FAQ_TITLE),
      items: parseFaqItems(faqs.items),
    },
    testimonials: {
      enabled: testimonials.enabled !== false,
      title: toString(testimonials.title, DEFAULT_TESTIMONIALS_TITLE),
      sourceMode: testimonials.sourceMode === 'google' || testimonials.sourceMode === 'mixed' ? testimonials.sourceMode : 'manual',
      displayStyle: testimonials.displayStyle === 'carousel' || testimonials.displayStyle === 'spotlight' ? testimonials.displayStyle : 'grid',
      items: parseTestimonials(testimonials.items),
      googlePlaceId: toString(testimonials.googlePlaceId),
      googleName: toString(testimonials.googleName),
      googleUrl: toString(testimonials.googleUrl),
      googleRating: toRating(testimonials.googleRating),
      googleReviewCount: typeof testimonials.googleReviewCount === 'number' ? testimonials.googleReviewCount : 0,
      googleReviews: parseGoogleReviews(testimonials.googleReviews),
      googleImportedAt: toString(testimonials.googleImportedAt),
    },
    quoteForm: {
      enabled: quoteForm.enabled === true,
      emailRequired: toBoolean(quoteForm.emailRequired),
      estimateLabel: quoteForm.estimateLabel === 'instant' ? 'instant' : 'quick',
      formHeading: toString(quoteForm.formHeading).slice(0, 40) || DEFAULT_QUOTE_FORM_HEADING,
    },
    stickyCallBar: {
      enabled: stickyCallBar.enabled !== false,
      showQuote: stickyCallBar.showQuote !== false,
      callLabel: toString(stickyCallBar.callLabel, 'Call now').slice(0, 30),
      quoteLabel: toString(stickyCallBar.quoteLabel, 'Free quote').slice(0, 30),
    },
    ratingBadge: {
      enabled: toBoolean(ratingBadge.enabled),
      rating: toRatingValue(ratingBadge.rating),
      reviewCount: Math.max(0, Math.round(toPositiveNumber(ratingBadge.reviewCount, 0))),
      sourceLabel: toString(ratingBadge.sourceLabel, DEFAULT_RATING_SOURCE_LABEL),
    },
    estimateRanges: {
      // Exactly one intake method is ever active: Smart Intake (this) or the
      // classic quote form — never both, never neither. quoteForm.enabled is the
      // single source of truth, so Smart Intake is simply "on when the quote form
      // is off". A legacy site that had both off now resolves to Smart Intake.
      enabled: quoteForm.enabled !== true,
      emailField: estimateRanges.emailField === 'off' || estimateRanges.emailField === 'required' ? estimateRanges.emailField : 'optional',
    },
    introVideo: {
      // `enabled` is the owner's switch, kept raw. Folding "has a usable link"
      // into it would mean ticking the box in the builder immediately un-ticked
      // itself — there's no link yet at that point, which is exactly when the
      // URL field needs to appear. Whether it actually renders is
      // isIntroVideoLive(), asked at the point of render.
      enabled: toBoolean(introVideo.enabled),
      url: toString(introVideo.url).slice(0, 300),
      title: toString(introVideo.title, DEFAULT_INTRO_VIDEO_TITLE).slice(0, 60),
    },
    phonePublic: root.phonePublic !== false,
    leadFilters: {
      serviceAreaGate: leadFilters.serviceAreaGate !== false,
      minJobAmount: Math.max(0, Math.round(toPositiveNumber(leadFilters.minJobAmount, 0))),
      exclusions: parseWhyPoints(leadFilters.exclusions, 10),
      askTimeline: leadFilters.askTimeline !== false,
      fullyBooked: {
        enabled: toBoolean(fullyBooked.enabled),
        until: /^\d{4}-\d{2}-\d{2}$/.test(toString(fullyBooked.until)) ? toString(fullyBooked.until) : '',
        message: toString(fullyBooked.message).slice(0, 140),
      },
      phoneVerification: toBoolean(leadFilters.phoneVerification),
    },
    trustBadges: {
      enabled: toBoolean(trustBadges.enabled),
      badges: parseTrustBadges(trustBadges.badges),
    },
    financing: {
      enabled: toBoolean(financing.enabled),
      monthlyFrom: Math.max(0, Math.round(toPositiveNumber(financing.monthlyFrom, 0))),
      blurb: toString(financing.blurb, DEFAULT_FINANCING_BLURB),
      applyUrl: toString(financing.applyUrl),
    },
    serviceAreas: {
      enabled: serviceAreas.enabled !== false,
      title: toString(serviceAreas.title, DEFAULT_SERVICE_AREAS_TITLE),
      intro: toString(serviceAreas.intro, DEFAULT_SERVICE_AREAS_INTRO),
      cities: parseCities(serviceAreas.cities),
    },
    certifications: {
      enabled: toBoolean(certifications.enabled),
      title: toString(certifications.title, DEFAULT_CERTIFICATIONS_TITLE),
      items: parseCertifications(certifications.items),
    },
    stats: {
      // On by default so the section shows once numbers exist. Items default to
      // empty and getPublishedStats requires a labelled item, so an empty stats
      // section still renders nothing — no fabricated figures are shown.
      enabled: stats.enabled !== false,
      title: toString(stats.title, DEFAULT_STATS_TITLE),
      items: parseStats(stats.items),
    },
    beforeAfter: {
      enabled: toBoolean(beforeAfter.enabled),
      title: toString(beforeAfter.title, DEFAULT_BEFORE_AFTER_TITLE),
      intro: toString(beforeAfter.intro, DEFAULT_BEFORE_AFTER_INTRO),
      items: parseBeforeAfter(beforeAfter.items),
    },
    announcement: {
      enabled: toBoolean(announcement.enabled),
      message: toString(announcement.message).slice(0, 140),
      subtext: toString(announcement.subtext).slice(0, 140),
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(toString(announcement.endDate)) ? toString(announcement.endDate) : '',
    },
    whyUs: {
      enabled: whyUs.enabled !== false,
      title: toString(whyUs.title, DEFAULT_WHY_US_TITLE).slice(0, 80),
      points: whyUs.points === undefined ? [...DEFAULT_WHY_US_POINTS] : parseWhyPoints(whyUs.points),
    },
    legal: {
      privacyEnabled: legal.privacyEnabled !== false,
      termsEnabled: legal.termsEnabled !== false,
      privacyBody: toString(legal.privacyBody).slice(0, 20000),
      termsBody: toString(legal.termsBody).slice(0, 20000),
      updated: /^\d{4}-\d{2}-\d{2}$/.test(toString(legal.updated)) ? toString(legal.updated) : '',
    },
    workGallery: {
      eyebrow: toString(workGallery.eyebrow).slice(0, 40),
      title: toString(workGallery.title).slice(0, 80),
    },
    introBlock: {
      eyebrow: toString(introBlock.eyebrow).slice(0, 40),
      title: toString(introBlock.title).slice(0, 120),
      body: toString(introBlock.body).slice(0, 400),
    },
    heroEyebrow: toString(root.heroEyebrow).slice(0, 50),
    brandFont: toString(root.brandFont).slice(0, 120),
    headerStyle: HEADER_STYLES.some((style) => style.key === root.headerStyle) ? toString(root.headerStyle) : '',
    headerCta: root.headerCta !== false,
    menuButton: MENU_BUTTON_STYLE_KEYS.has(toString(root.menuButton)) ? toString(root.menuButton) : 'bars',
    headerButtonStyle: HEADER_BUTTON_STYLE_KEYS.has(toString(root.headerButtonStyle)) ? toString(root.headerButtonStyle) : '',
    colorScheme: COLOR_SCHEMES.some((scheme) => scheme.key === root.colorScheme) ? toString(root.colorScheme) : '',
    wordmarkStyle: WORDMARK_STYLES.some((style) => style.key === root.wordmarkStyle) ? toString(root.wordmarkStyle) : '',
    projectShowcase: {
      // On by default so existing Care sites keep their work band; the owner can
      // toggle it off to hide the whole section.
      enabled: projectShowcase.enabled !== false,
      eyebrow: toString(projectShowcase.eyebrow, DEFAULT_PROJECT_SHOWCASE_EYEBROW).slice(0, 40),
      title: toString(projectShowcase.title, DEFAULT_PROJECT_SHOWCASE_TITLE).slice(0, 80),
      style: PROJECT_SHOWCASE_STYLE_KEYS.has(toString(projectShowcase.style)) ? (toString(projectShowcase.style) as SiteProjectShowcaseStyle) : 'coverflow',
      items: parseShowcaseItems(projectShowcase.items).slice(0, MAX_PROJECT_SHOWCASE_ITEMS),
    },
    videoSections,
    services: {
      enabled: services.enabled !== false,
      title: toString(services.title, DEFAULT_SERVICES_TITLE),
      intro: toString(services.intro),
      items: parseServices(services.items),
    },
    howItWorks: {
      enabled: toBoolean(howItWorks.enabled),
      title: toString(howItWorks.title, DEFAULT_HOW_IT_WORKS_TITLE),
      intro: toString(howItWorks.intro),
      // Never-set (undefined) → starter steps; an explicit array (even empty, i.e.
      // the owner cleared them) is respected exactly.
      steps: howItWorks.steps === undefined ? DEFAULT_HOW_IT_WORKS_STEPS.map((step) => ({ ...step })) : parseProcessSteps(howItWorks.steps),
    },
    blog: {
      enabled: blog.enabled !== false,
      title: toString(blog.title, DEFAULT_BLOG_TITLE),
      intro: toString(blog.intro),
      layout: BLOG_LAYOUT_KEYS.has(toString(blog.layout)) ? toString(blog.layout) : 'grid',
      reminderWeeks: [2, 4, 8].includes(Number(blog.reminderWeeks)) ? Number(blog.reminderWeeks) : 0,
      posts: parseBlogPosts(blog.posts),
    },
    heroBadge: {
      preset: toString(heroBadge.preset, 'licensed'),
      showStats: heroBadge.showStats !== false,
      style: HERO_BADGE_STYLE_KEYS.has(toString(heroBadge.style)) ? toString(heroBadge.style) : 'soft',
      customLabel: toString(heroBadge.customLabel).slice(0, 40),
      // The second/extra floating badge: 'default' keeps each template's built-in
      // one (Shine "500+ customers", Guild "Proudly local", Fixit's auto second),
      // 'none' hides it, or a preset key / 'custom' picks a specific badge. Falls
      // back from the legacy showStats boolean so old sites keep their choice.
      secondPreset: toString(heroBadge.secondPreset) || (heroBadge.showStats === false ? 'none' : 'default'),
      secondCustomLabel: toString(heroBadge.secondCustomLabel).slice(0, 40),
    },
    images: parseImageSlots(images),
    sectionOrder: parseSectionOrder(root.sectionOrder, videoSections),
    heroImages: Array.isArray(root.heroImages)
      ? root.heroImages.filter((url): url is string => typeof url === 'string' && url.trim().length > 0).map((url) => url.trim()).slice(0, MAX_EXTRA_HERO_IMAGES)
      : [],
    logoStyle: LOGO_STYLE_KEYS.has(toString(root.logoStyle)) ? toString(root.logoStyle) : 'plain',
    logoSize: LOGO_SIZE_KEYS.has(toString(root.logoSize)) ? toString(root.logoSize) : 'medium',
    footerStyle: FOOTER_STYLE_KEYS.has(toString(root.footerStyle)) ? toString(root.footerStyle) : 'columns',
    trade: toString(root.trade).slice(0, 80),
    zip: toString(root.zip).slice(0, 12),
    brandGlyph: SERVICE_ICON_GLYPHS[toString(root.brandGlyph)] ? toString(root.brandGlyph) : '',
    stockImages: parseStockImages(root.stockImages),
  };
}

// Validate the stored stock-image attribution records. Permissive on optional
// fields but requires a usable imageUrl + role, and caps the count.
function parseStockImages(value: unknown): WebsiteImageAssignment[] {
  if (!Array.isArray(value)) return [];
  const out: WebsiteImageAssignment[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const imageUrl = toString(raw.imageUrl);
    const role = toString(raw.role);
    if (!imageUrl || !role) continue;
    out.push({
      id: toString(raw.id) || `${role}-${out.length}`,
      role,
      ...(toString(raw.slot) ? { slot: toString(raw.slot) } : {}),
      ...(toString(raw.serviceId) ? { serviceId: toString(raw.serviceId) } : {}),
      provider: raw.provider === 'upload' ? 'upload' : 'pexels',
      ...(toString(raw.providerImageId) ? { providerImageId: toString(raw.providerImageId) } : {}),
      ...(toString(raw.sourceUrl) ? { sourceUrl: toString(raw.sourceUrl) } : {}),
      imageUrl,
      ...(toString(raw.thumbnailUrl) ? { thumbnailUrl: toString(raw.thumbnailUrl) } : {}),
      alt: toString(raw.alt).slice(0, 200),
      ...(toString(raw.photographerName) ? { photographerName: toString(raw.photographerName).slice(0, 120) } : {}),
      ...(toString(raw.photographerUrl) ? { photographerUrl: toString(raw.photographerUrl) } : {}),
      ...(toString(raw.searchQuery) ? { searchQuery: toString(raw.searchQuery).slice(0, 120) } : {}),
      ...(typeof raw.width === 'number' ? { width: raw.width } : {}),
      ...(typeof raw.height === 'number' ? { height: raw.height } : {}),
      selectedAutomatically: raw.selectedAutomatically !== false,
      selectedAt: toString(raw.selectedAt),
    });
  }
  return out.slice(0, 24);
}

// Keep only string→non-empty-string entries whose slot is a known template
// image slot, so a malformed content blob can't inject arbitrary keys.
function parseImageSlots(value: Record<string, unknown>): Record<string, string> {
  const slots: Record<string, string> = {};
  for (const key of Object.keys(IMAGE_SLOT_LABELS)) {
    const url = value[key];
    if (typeof url === 'string' && url.trim()) slots[key] = url.trim();
  }
  return slots;
}

export function mergeSiteContent(content: Record<string, unknown>, updates: Partial<NormalizedSiteContent>): Record<string, unknown> {
  return {
    ...content,
    ...updates,
  };
}

// Forge, Guild and Vista each render a built-in "recent work" band. It used to
// read content.gallery — a pool nothing has been able to fill since the Images
// tab was removed — so it always fell through to STOCK_SITE_IMAGES: the same
// three general-construction photos on every site, whatever the trade, under a
// heading claiming they were the contractor's own jobs.
//
// It now renders the owner-managed Photo gallery (showcase) in the template's
// own styling, which also inherits the existing honest stock labelling. The
// template's "our work" voice is used only once the contractor's OWN photos are
// in the band AND the heading is still the generated stock one — an owner who
// renamed the gallery keeps their wording, and an owner who wants something
// else for this band sets content.workGallery.
export function getWorkBand(
  content: Record<string, unknown> | null | undefined,
  ownWorkEyebrow: string,
  ownWorkTitle: string,
): { items: SiteShowcaseItem[]; eyebrow: string; title: string; intro: string } {
  const showcase = getPublishedShowcase(content);
  const items = showcase ? showcase.items : [];
  const override = getSiteContent(content).workGallery;
  const hasOwnPhotos = items.some((item) => item.source === 'upload');
  const stillStockLabelled = showcase?.title === STOCK_SHOWCASE_TITLE;
  const claimOwnWork = hasOwnPhotos && stillStockLabelled;

  return {
    items,
    eyebrow: override.eyebrow || (hasOwnPhotos ? ownWorkEyebrow : 'What we do'),
    title: override.title || (claimOwnWork ? ownWorkTitle : showcase?.title || ''),
    intro: claimOwnWork ? '' : showcase?.intro || '',
  };
}

// A trade-appropriate default brand glyph (a ServiceIcon key) inferred from the
// contractor's field of work. Used as the fallback logo mark when no logo has
// been uploaded, so an AI-generated site opens with an icon that fits the trade
// instead of a generic placeholder. Falls back to 'home' (a house) for any
// unrecognized or blank trade.
// Ordered most-specific first (e.g. "tree service" beats generic landscaping,
// "pressure washing" beats generic cleaning). options[0] is the trade default;
// the rest are on-brand alternatives offered in the logo picker (≥5 where the
// icon set allows). All keys are validated against the icon set at read time.
const TRADE_GLYPH_RULES: { test: RegExp; options: string[] }[] = [
  { test: /electric|electrician|wiring|generator|solar|lighting/, options: ['bolt', 'plug', 'lightbulb', 'power', 'lamp', 'cable', 'sun', 'battery'] },
  { test: /pressure\s*wash|power\s*wash|soft\s*wash/, options: ['spray', 'droplets', 'waves', 'drip', 'faucet', 'sparkles', 'wind', 'gauge'] },
  { test: /paint|drywall|stain|\bcoat/, options: ['roller', 'paintbrush', 'brush', 'palette', 'paintbucket'] },
  { test: /window\s*clean|window\s*wash|\bclean|maid|janitor|carpet/, options: ['sparkles', 'spray', 'droplets', 'drip', 'brush', 'wind', 'trash'] },
  { test: /pest|extermin|termite|rodent|mosquito/, options: ['bug', 'rat', 'shield', 'spray', 'clover', 'sparkles'] },
  { test: /tree|arborist|stump|forestry/, options: ['tree', 'trees', 'pine', 'palm', 'treestump', 'chainsaw', 'axe', 'scissors', 'leaf'] },
  { test: /landscap|lawn|garden|\byard|sod|mow|irrigation|hardscape|snow/, options: ['sprout', 'leaf', 'trees', 'shrub', 'leafyGreen', 'flower', 'tractor', 'shovel', 'scissors', 'palm', 'cactus', 'fence', 'clover'] },
  { test: /haul|mov(?:e|ing)|junk|dumpster|delivery|demolition/, options: ['truck', 'trash', 'boxes', 'package', 'container', 'recycle', 'forklift'] },
  { test: /hvac|heat|cool|\bair\b|furnace|boiler|duct|ventilat/, options: ['wind', 'fan', 'snowflake', 'thermometerSnow', 'thermometer', 'flame', 'airvent', 'gauge'] },
  { test: /plumb|drain|sewer|pipe|\bwater|leak|faucet/, options: ['droplet', 'droplets', 'faucet', 'showerhead', 'drip', 'waves', 'gauge', 'wrench'] },
  { test: /roof|gutter|siding/, options: ['home', 'hardhat', 'triangle', 'ruler', 'warehouse', 'building'] },
  { test: /concrete|mason|foundation|paver|brick|asphalt/, options: ['hardhat', 'brickwall', 'bulldozer', 'pickaxe', 'layers', 'ruler', 'hammer', 'square'] },
  { test: /carpen|handy|remodel|renov|deck|fence|cabinet|framing|\btrim/, options: ['hammer', 'wrench', 'toolscross', 'drill', 'ruler', 'pencilRuler', 'hardhat'] },
  { test: /floor|tile|hardwood|laminate/, options: ['grid', 'layers', 'square', 'ruler', 'brickwall'] },
  { test: /appliance|garage\s*door|\brepair/, options: ['wrench', 'settings', 'cog', 'toolscross', 'plug', 'washingmachine'] },
  { test: /construct|contractor|\bbuild|excavat/, options: ['hardhat', 'building', 'crane', 'bulldozer', 'toolscross', 'hammer', 'pickaxe', 'ruler', 'wrench', 'home'] },
  { test: /secur|alarm|camera|inspect|\block|surveil/, options: ['shield', 'lock', 'camera', 'bell', 'key'] },
];

const DEFAULT_GLYPH_OPTIONS = ['home', 'star', 'hardhat', 'hammer', 'wrench', 'shield', 'building'];

// All on-brand glyph keys for a trade (≥5 where the icon set allows), filtered to
// keys that actually exist. options[0] is the default; the logo picker shows the rest.
export function getTradeGlyphOptions(trade: string | null | undefined): string[] {
  const t = (trade || '').toLowerCase();
  const rule = TRADE_GLYPH_RULES.find((r) => r.test.test(t));
  const opts = (rule ? rule.options : DEFAULT_GLYPH_OPTIONS).filter((key) => SERVICE_ICON_GLYPHS[key]);
  return opts.length ? opts : ['home'];
}

// The default trade mark (first option) — used as the fallback logo mark and the
// favicon glyph when the owner hasn't picked one.
export function getTradeGlyph(trade: string | null | undefined): string {
  return getTradeGlyphOptions(trade)[0];
}

// The glyph a site actually renders: the owner's picked brandGlyph when set & valid,
// otherwise the trade default. Use this everywhere the brand mark is drawn so the
// header, footer, favicon, and downloadable icon always agree.
export function glyphForContent(content: NormalizedSiteContent): string {
  return content.brandGlyph && SERVICE_ICON_GLYPHS[content.brandGlyph]
    ? content.brandGlyph
    : getTradeGlyph(content.trade);
}

export function getPublishedShowcase(content: Record<string, unknown> | null | undefined): SiteShowcaseContent | null {
  const showcase = getSiteContent(content).showcase;
  const items = showcase.items.filter((item) => item.url && item.alt);
  return showcase.enabled && items.length > 0 ? { ...showcase, items } : null;
}

export function getPublishedFaqs(content: Record<string, unknown> | null | undefined): SiteFaqContent | null {
  const faqs = getSiteContent(content).faqs;
  const items = faqs.items.filter((item) => item.question.trim() && item.answer.trim());
  return faqs.enabled && items.length > 0 ? { ...faqs, items } : null;
}

export function getPublishedTestimonials(content: Record<string, unknown> | null | undefined): SiteTestimonialsContent | null {
  const testimonials = getSiteContent(content).testimonials;
  // sourceMode decides what shows: manual only, Google only, or both.
  const items = testimonials.sourceMode === 'google' ? [] : testimonials.items.filter((item) => item.text.trim());
  const googleReviews = testimonials.sourceMode === 'manual' ? [] : testimonials.googleReviews.filter((review) => review.text.trim());
  if (!testimonials.enabled || items.length + googleReviews.length === 0) return null;
  return { ...testimonials, items, googleReviews };
}

export function getPublishedStickyCallBar(
  content: Record<string, unknown> | null | undefined,
  phone: string | null | undefined,
): SiteStickyCallBarContent | null {
  const stickyCallBar = getSiteContent(content).stickyCallBar;
  return stickyCallBar.enabled && Boolean(phone && phone.trim()) ? stickyCallBar : null;
}

export function getPublishedRatingBadge(content: Record<string, unknown> | null | undefined): SiteRatingBadgeContent | null {
  const ratingBadge = getSiteContent(content).ratingBadge;
  return ratingBadge.enabled && ratingBadge.reviewCount > 0 ? ratingBadge : null;
}

export function getPublishedTrustBadges(content: Record<string, unknown> | null | undefined): SiteTrustBadgesContent | null {
  const trustBadges = getSiteContent(content).trustBadges;
  const badges = trustBadges.badges.filter((badge) => badge.enabled && badge.label.trim());
  return trustBadges.enabled && badges.length > 0 ? { ...trustBadges, badges } : null;
}

export function getPublishedFinancing(content: Record<string, unknown> | null | undefined): SiteFinancingContent | null {
  const financing = getSiteContent(content).financing;
  return financing.enabled && financing.monthlyFrom > 0 ? financing : null;
}

export function getPublishedServiceAreas(content: Record<string, unknown> | null | undefined): SiteServiceAreasContent | null {
  const serviceAreas = getSiteContent(content).serviceAreas;
  const cities = serviceAreas.cities.map((city) => city.trim()).filter(Boolean);
  return serviceAreas.enabled && cities.length > 0 ? { ...serviceAreas, cities } : null;
}

// The video band is live only once there is something to play. A style is a
// layout, not content — an owner who picks "Reel gallery" and never uploads gets
// nothing on the page rather than three empty frames.
//
// The returned `videos` are trimmed to what the chosen style shows, so the extra
// clips a reel had never leak into the DOM after a switch to a single-video
// style. They stay in storage untouched.
/** Every band that would actually render — enabled, and with a playable video. */
export function getPublishedVideoSections(content: Record<string, unknown> | null | undefined): SiteVideoSectionContent[] {
  return getSiteContent(content).videoSections.flatMap((section) => {
    if (!section.enabled) return [];
    const playable = section.videos.filter((item) => item.url.trim());
    if (playable.length === 0) return [];
    return [{ ...section, videos: playable.slice(0, videoStyleCapacity(section.style)) }];
  });
}

/** The first published band. For callers that need one — the nav's "is there
    any video at all" check, and the /videos page's own empty test. */
export function getPublishedVideoSection(content: Record<string, unknown> | null | undefined): SiteVideoSectionContent | null {
  return getPublishedVideoSections(content)[0] ?? null;
}

/** Every playable video across every band, in page order, de-duplicated by URL —
    one clip used in two bands is still one clip on the /videos page. */
export function getAllPublishedVideos(
  content: Record<string, unknown> | null | undefined,
): { item: SiteVideoItem; section: SiteVideoSectionContent }[] {
  const seen = new Set<string>();
  const out: { item: SiteVideoItem; section: SiteVideoSectionContent }[] = [];
  // Deliberately NOT getPublishedVideoSections: that trims each band's list to
  // what its style can show, which is one clip for a hero. The owner may have
  // five saved, and the index is the one place all of them belong — trimming
  // here would hide uploads behind a layout choice made on the homepage.
  for (const section of getSiteContent(content).videoSections) {
    if (!section.enabled) continue;
    for (const item of section.videos.filter((video) => video.url.trim())) {
      const key = item.url.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ item, section });
    }
  }
  return out;
}

export function getPublishedCertifications(content: Record<string, unknown> | null | undefined): SiteCertificationsContent | null {
  const certifications = getSiteContent(content).certifications;
  const items = certifications.items.filter((item) => item.label.trim() || item.imageUrl.trim());
  return certifications.enabled && items.length > 0 ? { ...certifications, items } : null;
}

export function getPublishedStats(content: Record<string, unknown> | null | undefined): SiteStatsContent | null {
  const stats = getSiteContent(content).stats;
  const items = stats.items.filter((item) => item.label.trim());
  return stats.enabled && items.length > 0 ? { ...stats, items } : null;
}

export function getPublishedBeforeAfter(content: Record<string, unknown> | null | undefined): SiteBeforeAfterContent | null {
  const beforeAfter = getSiteContent(content).beforeAfter;
  const items = beforeAfter.items.filter((item) => item.beforeUrl.trim() && item.afterUrl.trim());
  return beforeAfter.enabled && items.length > 0 ? { ...beforeAfter, items } : null;
}

export function getPublishedAnnouncement(content: Record<string, unknown> | null | undefined): SiteAnnouncementContent | null {
  const announcement = getSiteContent(content).announcement;
  if (!announcement.enabled || !announcement.message.trim()) return null;
  // An expired run date hides the bar without the owner having to remember to
  // turn it off. The bar shows through the END of its last day (local server time).
  if (announcement.endDate) {
    const end = new Date(`${announcement.endDate}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return null;
  }
  return announcement;
}

// Care template's "Why choose us" checklist: hidden when toggled off or when
// every point is blank.
export function getPublishedWhyUs(content: Record<string, unknown> | null | undefined): SiteWhyUsContent | null {
  const whyUs = getSiteContent(content).whyUs;
  const points = whyUs.points.filter((point) => point.trim());
  return whyUs.enabled && points.length > 0 ? { ...whyUs, points } : null;
}

export function getPublishedServices(content: Record<string, unknown> | null | undefined): SiteServicesContent | null {
  const services = getSiteContent(content).services;
  const items = services.items.filter((item) => item.title.trim());
  return services.enabled && items.length > 0 ? { ...services, items } : null;
}

export function getPublishedHowItWorks(content: Record<string, unknown> | null | undefined): SiteHowItWorksContent | null {
  const howItWorks = getSiteContent(content).howItWorks;
  const steps = howItWorks.steps.filter((step) => step.title.trim());
  return howItWorks.enabled && steps.length > 0 ? { ...howItWorks, steps } : null;
}

// Public blog gate: only published posts with a title + body, newest first.
// Returns null when the section is off or has no publishable posts.
export function getPublishedBlog(content: Record<string, unknown> | null | undefined): SiteBlogContent | null {
  const blog = getSiteContent(content).blog;
  const posts = blog.posts
    .filter((post) => post.status === 'published' && post.title.trim() && post.body.trim())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return blog.enabled && posts.length > 0 ? { ...blog, posts } : null;
}

// A single published post by slug (for /blog/[slug]). Ignores the section's
// enabled flag — a shared link should resolve even mid-review — but still
// requires the post itself to be published.
export function getPublishedBlogPost(
  content: Record<string, unknown> | null | undefined,
  slug: string,
): SiteBlogPost | null {
  const blog = getSiteContent(content).blog;
  return (
    blog.posts.find(
      (post) => post.slug === slug && post.status === 'published' && post.title.trim() && post.body.trim(),
    ) ?? null
  );
}

// The floating hero badge to render, or null when the owner chose to hide it.
// Falls back to the first preset if an unknown key somehow persists.
export function getHeroBadge(content: Record<string, unknown> | null | undefined): HeroBadgePreset | null {
  const heroBadge = getSiteContent(content).heroBadge;
  if (heroBadge.preset === 'none') return null;
  if (heroBadge.preset === 'custom') {
    const title = heroBadge.customLabel.trim();
    return title ? { key: 'custom', icon: '✓', title, subtitle: '', label: title } : null;
  }
  return HERO_BADGE_PRESETS.find((badge) => badge.key === heroBadge.preset) ?? HERO_BADGE_PRESETS[0];
}

// The chosen badge treatment ('solid' | 'outline' | 'soft'); set on the template
// root as data-badge-style so one rule restyles every template's hero badge.
export function getHeroBadgeStyle(content: Record<string, unknown> | null | undefined): string {
  return getSiteContent(content).heroBadge.style;
}

// The extra decorative floating badge on the hero (Shine's "500+ customers",
// Fixit's second card, Guild's "Proudly local", Reno's hex). Owners can hide
// it independently of the trust chip via the Hero badge control.
export function getHeroShowStats(content: Record<string, unknown> | null | undefined): boolean {
  return getSiteContent(content).heroBadge.showStats;
}

// What the second/extra floating badge should be: 'none' (hidden), 'default'
// (the template's built-in second badge), or an explicit badge (a chosen preset
// or custom text). Templates render each mode however suits their layout.
export type HeroSecondBadge = { mode: 'none' } | { mode: 'default' } | { mode: 'badge'; badge: HeroBadgePreset };

export function getHeroSecondBadge(content: Record<string, unknown> | null | undefined): HeroSecondBadge {
  const heroBadge = getSiteContent(content).heroBadge;
  const preset = heroBadge.secondPreset;
  if (preset === 'none') return { mode: 'none' };
  if (preset === 'custom') {
    const title = heroBadge.secondCustomLabel.trim();
    return title ? { mode: 'badge', badge: { key: 'custom', icon: '✓', title, subtitle: '', label: title } } : { mode: 'default' };
  }
  const found = HERO_BADGE_PRESETS.find((badge) => badge.key === preset);
  return found ? { mode: 'badge', badge: found } : { mode: 'default' };
}

// The decorative/secondary photo slots a template can expose for direct
// swapping. The key is the slot id used in `content.images` and the
// `data-edit="image-<slot>"` preview marker; the value is the builder label.
export const IMAGE_SLOT_LABELS: Record<string, string> = {
  heroBackground: 'Hero background photo',
  heroSecondary: 'Second hero photo',
  heroTertiary: 'Third hero photo',
  stats: 'Stats section photo',
  about: 'About-section photo',
};

// A template's photo for a given slot: the owner's explicit override if set,
// otherwise the template's auto-derived fallback (unchanged legacy behaviour).
export function getSlotImage(content: Record<string, unknown> | null | undefined, slot: string, fallback: string): string {
  return getSiteContent(content).images[slot] || fallback;
}

// The in-flow content sections whose page order the owner can rearrange. The
// key matches the block key in SiteContentSections; the label is shown in the
// builder's "Page order" panel. Default array order = the default page order.
export const REORDERABLE_SECTIONS = [
  { key: 'services', label: 'Services' },
  { key: 'showcase', label: 'Showcase gallery' },
  { key: 'video', label: 'Video' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'stats', label: 'Animated stats' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'beforeAfter', label: 'Before & after' },
  { key: 'projectShowcase', label: 'Additional image gallery' },
  { key: 'howItWorks', label: 'How it works' },
  { key: 'blog', label: 'Blog' },
  { key: 'serviceAreas', label: 'Service areas' },
] as const;

const DEFAULT_SECTION_ORDER = REORDERABLE_SECTIONS.map((section) => section.key);


// Coerce a stored order into a full, deduped permutation of the known keys:
// keep recognized keys in their saved order, drop anything unknown, then append
// any missing keys in default order so every section still renders.
//
// The known set is not fixed, because video bands are INSTANCES: one `video`
// key plus a `video:<id>` for each band after the first. That is what lets a
// second band sit somewhere else on the page rather than always next to the
// first. A band the owner deleted leaves an unknown key behind, which the drop
// rule below already handles.
function parseSectionOrder(value: unknown, videoSections: SiteVideoSectionContent[]): string[] {
  const videoKeys = videoSections.map((section) => videoSectionKey(section.id));
  // A newly-added band lands directly after the one before it rather than at
  // the bottom of the page — appending it would put a second video below the
  // footer CTA, which is never where someone adding one wants it.
  const defaults: string[] = [];
  for (const key of DEFAULT_SECTION_ORDER) {
    defaults.push(key);
    if (key === 'video') defaults.push(...videoKeys.filter((k) => k !== 'video'));
  }

  const known = new Set<string>(defaults);
  const seen = new Set<string>();
  const order: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && known.has(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item);
      }
    }
  }
  for (const key of defaults) if (!seen.has(key)) order.push(key);
  return order;
}

export function getSectionOrder(content: Record<string, unknown> | null | undefined): string[] {
  return getSiteContent(content).sectionOrder;
}

// The full ordered hero image set (primary hero + extras), deduped. Used by the
// hero cross-fade; a single image means no cycling (unchanged behaviour).
export function getHeroImages(content: Record<string, unknown> | null | undefined, primary: string | null | undefined): string[] {
  const set: string[] = [];
  for (const url of [primary, ...getSiteContent(content).heroImages]) {
    if (url && url.trim() && !set.includes(url)) set.push(url);
  }
  return set;
}

// The extra hero photos rendered as full-width parallax bands lower down.
export function getHeroBandImages(content: Record<string, unknown> | null | undefined): string[] {
  return getSiteContent(content).heroImages;
}
