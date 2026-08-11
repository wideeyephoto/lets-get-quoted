import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBrandMarkSvg, DEFAULT_BRAND_ACCENT } from '@/lib/brand-mark';
import { pickBusinessName } from '@/lib/business-name';
import { getSiteContent, glyphForContent } from '@/lib/site-content';
import { siteOrigin } from '@/lib/seo/site-pages';

/**
 * Whose business a homeowner is looking at.
 *
 * Every page a customer opens from a text or an email — the quote, the invoice,
 * the payment page, their portal — was carrying the Let's Get Quoted mark and
 * wordmark at the top. That is the wrong name on the door twice over: the
 * homeowner hired a contractor they can name, and on the payment page in
 * particular a brand they do not recognize above a card form is the moment they
 * stop and ring somebody. Our name belongs in the footer, small, as the thing
 * that carried the message.
 *
 * There is always a mark. A contractor who never uploaded a logo still has
 * `buildBrandMarkSvg` — their trade glyph on their accent — which is the same
 * mark their website's favicon and downloadable logo files already use, so this
 * is not a new visual identity invented for these pages.
 */
export type ContractorBrand = {
  businessName: string;
  /** An uploaded logo, when there is one. Beats the derived mark. */
  logoUrl: string | null;
  /** Inline SVG for the derived mark. Null when `logoUrl` is used instead. */
  markSvg: string | null;
  /** Their color, so the page reads as theirs rather than as ours. */
  accent: string;
  /** Their published website, for the "back to" link. Null before publishing. */
  siteUrl: string | null;
  /**
   * Where a customer books more work — an APP-ORIGIN path, not a path on their
   * site. The booking page lives at /book/[subdomain] and the tenant-host
   * rewrite maps a sub-path to /site/[subdomain]/<path>, where no `book` route
   * exists. `${siteUrl}/book` looks obviously right and 404s.
   */
  bookingPath: string | null;
  phone: string | null;
};

/** The columns `shapeContractorBrand` reads. Kept here so every caller selects
 *  the same set and none of them drifts into selecting `*`. */
export const CONTRACTOR_BRAND_COLUMNS =
  'company_name, logo_url, accent_override, content, subdomain, custom_domain, custom_domain_verified_at, published, phone';

type BrandSiteRow = {
  company_name?: string | null;
  logo_url?: string | null;
  accent_override?: string | null;
  content?: Record<string, unknown> | null;
  subdomain?: string | null;
  custom_domain?: string | null;
  custom_domain_verified_at?: string | null;
  published?: boolean | null;
  phone?: string | null;
};

/**
 * Pure: row in, brand out. Separated from the query so the fallback ladder —
 * which is the part that decides whose name a customer sees — is unit-testable
 * without a database.
 */
export function shapeContractorBrand(
  account: { business_name?: string | null } | null | undefined,
  site: BrandSiteRow | null | undefined,
): ContractorBrand {
  const businessName = pickBusinessName(site, account);
  const accent = normalizeAccent(site?.accent_override);
  const logoUrl = site?.logo_url?.trim() || null;

  return {
    businessName,
    logoUrl,
    // Built only when it will be used. The mark is a string of SVG that gets
    // inlined into the page, and generating one to throw away on every invoice
    // for a contractor who HAS a logo is wasted bytes on the wire.
    markSvg: logoUrl ? null : buildBrandMarkSvg(glyphForContent(getSiteContent(site?.content ?? null)), accent, 'color'),
    accent,
    // Only a PUBLISHED site gets linked. Sending a customer to a subdomain that
    // does not resolve yet is worse than not offering the link.
    siteUrl:
      site?.published && (site.subdomain || site.custom_domain)
        ? siteOrigin({
            custom_domain: site.custom_domain ?? null,
            custom_domain_verified_at: site.custom_domain_verified_at ?? null,
            subdomain: site.subdomain ?? null,
          } as Parameters<typeof siteOrigin>[0])
        : null,
    bookingPath: site?.published && site.subdomain ? `/book/${site.subdomain}` : null,
    phone: site?.phone?.trim() || null,
  };
}

/** Anything that isn't a hex color falls back, rather than reaching a `fill=`
 *  attribute verbatim. */
function normalizeAccent(value: string | null | undefined): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : DEFAULT_BRAND_ACCENT;
}

/* --- painting a page in somebody else's color -----------------------------
   The brand bar re-points --accent on ITSELF and deliberately stopped there,
   because handing an arbitrary contractor hex to .btn.primary is how you get a
   navy Pay button with a label nobody can read. That reasoning was right and it
   was never a reason to leave the customer's quote page painted in OUR orange —
   a homeowner opens a green-branded email from their landscaper and lands on an
   orange page belonging to a company they have never heard of.

   What was missing is the derivation. A solid button only has one contrast
   obligation: its own label against its own fill. That is computable, so it is
   computed here rather than guessed. */

type Rgb = [number, number, number];

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

// WCAG relative luminance.
function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black rather than pure black — it reads as ink, not as a hole. */
const BRAND_DARK_INK: Rgb = [18, 16, 14];
const BRAND_LIGHT_INK: Rgb = [255, 255, 255];

export type BrandPaint = {
  /** The contractor's color, for fills and stripes. */
  accent: string;
  /** Black or white — whichever is legible ON that fill. Computed, not chosen. */
  onAccent: string;
  /** A low-alpha wash of the same color, for card grounds. Carries no text. */
  soft: string;
  /** A mid-alpha edge, for borders. Carries no text either. */
  edge: string;
};

/**
 * The four values a page needs to wear a contractor's color safely.
 *
 * Only `onAccent` is a contrast decision, and it is the only one that has to be:
 * `soft` and `edge` are washes behind and around content that keeps its own
 * color, so nothing legible is ever placed on an unknown hex.
 *
 * Returns null for an unparseable color, and the caller keeps the platform
 * palette — a page in the wrong brand is better than a page in no brand.
 */
export function brandPaint(hex: string | null | undefined): BrandPaint | null {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return null;
  const onAccent = contrastRatio(rgb, BRAND_LIGHT_INK) >= contrastRatio(rgb, BRAND_DARK_INK) ? '#ffffff' : '#12100e';
  const [r, g, b] = rgb;
  return {
    accent: `rgb(${r}, ${g}, ${b})`,
    onAccent,
    soft: `rgba(${r}, ${g}, ${b}, 0.16)`,
    edge: `rgba(${r}, ${g}, ${b}, 0.38)`,
  };
}

/**
 * Load the brand for one account. Admin client on purpose: nobody on these
 * pages is a signed-in user, so there is no session to read it with.
 */
export async function loadContractorBrand(admin: SupabaseClient, accountId: string): Promise<ContractorBrand> {
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select(CONTRACTOR_BRAND_COLUMNS).eq('account_id', accountId).maybeSingle(),
  ]);
  return shapeContractorBrand(account as { business_name?: string | null } | null, site as BrandSiteRow | null);
}
