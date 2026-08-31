// The look of every email a homeowner gets from a contractor.
//
// Before this, all fifteen were hand-written HTML strings carrying Let's Get
// Quoted's amber-and-navy palette, and the customer saw OUR name in the From
// line for THEIR plumber's invoice. This is the one shell they all render
// through, wearing the contractor's name, color and logo.
//
// Account emails to the contractor use this shell too. They keep Let's Get
// Quoted in the From/reply identity, but the owner's selected layout, logo and
// color still carry through so every email for one account feels related.
//
// EMAIL HTML IS NOT WEB HTML. Everything below is inline-styled and
// table-based on purpose:
//   - Outlook renders through Word and ignores flexbox and grid outright. The
//     old invoice email laid its totals out with display:flex, which means it
//     has been collapsing into a single column in Outlook the whole time.
//   - <style> blocks are stripped by several clients, so there are none.
//   - Gmail blocks data: URIs on <img>, which rules out the SVG brand mark used
//     everywhere else in the product. See brandLockup for what happens instead.

export type EmailBrand = {
  businessName: string;
  /** Hex, already validated by the caller. Falls back to the platform navy. */
  accent: string;
  /** A hosted raster logo. NOT the SVG mark — see brandLockup. */
  logoUrl: string | null;
  phone: string | null;
  /** Their public site, for the footer. */
  siteUrl: string | null;
  /** Where a reply actually goes. */
  replyTo: string | null;
  /** The owner's chosen layout. Missing/legacy values render as Studio. */
  theme?: EmailThemeId;
  /** Physical postal address for CAN-SPAM and footer verification. */
  mailingAddress?: string | null;
  /** Contractor license number, e.g. "Lic #104928" */
  licenseNumber?: string | null;
  /** Geographic service territory, e.g. "Serving Oakland & Wayne Counties" */
  serviceArea?: string | null;
  /** Friendly sender name or owner name */
  senderName?: string | null;
};

export const EMAIL_THEMES = [
  {
    id: 'studio',
    name: 'Studio',
    outcome: 'Best all-purpose choice',
    description: 'Quiet, polished, and easy to scan. Best all-purpose choice for any trade.',
  },
  {
    id: 'letterhead',
    name: 'Letterhead',
    outcome: 'Estimates, invoices, and commercial work',
    description: 'Crisp, formal business-document look. Ideal for estimates, invoices, and commercial work.',
  },
  {
    id: 'neighborly',
    name: 'Neighborly',
    outcome: 'Residential and recurring service',
    description: 'Warmer paper tones and soft typography. Perfect for residential homeowners and recurring service.',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    outcome: 'Project updates and scheduling',
    description: 'Structured, confident, and high-contrast. Built for project updates, schedules, and job details.',
  },
  {
    id: 'spotlight',
    name: 'Spotlight',
    outcome: 'Campaigns and prominent calls to action',
    description: 'Bold color-led header and high visual punch. Great for seasonal campaigns and big calls to action.',
  },
] as const;

export type EmailThemeId = (typeof EMAIL_THEMES)[number]['id'];

export function normalizeEmailTheme(value: unknown): EmailThemeId {
  return EMAIL_THEMES.some((theme) => theme.id === value) ? (value as EmailThemeId) : 'studio';
}

export const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const NAVY = '#172033';
export const INK = '#1c2230';
export const MUTED = '#64748b';
export const HAIRLINE = '#e2e8f0';

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A hex we're willing to paint with; anything else falls back rather than emitting garbage CSS. */
export function safeAccent(accent: string | null | undefined): string {
  return typeof accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(accent.trim()) ? accent.trim() : NAVY;
}

/** Parse a 6-digit hex into RGB integers [0-255]. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = safeAccent(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * WCAG 2.2 Relative Luminance (0 = black, 1 = white).
 * Follows the standard W3C definition with linearized sRGB channels.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 2.2 Contrast Ratio between two colors (ranging from 1:1 to 21:1).
 */
export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Readable text color (dark ink vs white) on top of the accent color.
 *
 * The mathematical crossover point for maximum contrast is luminance ≈ 0.179.
 * Accents lighter than 0.179 (e.g. orange #ff7a21, yellow #f0b429, cyan, lime)
 * achieve WCAG AA (>= 4.5:1) with dark ink (#1c2230). White text on #ff7a21
 * produces only ~2.61:1 contrast and fails WCAG AA.
 */
export function onAccent(accent: string): string {
  const lum = relativeLuminance(accent);
  return lum >= 0.179 ? INK : '#ffffff';
}

/**
 * Derives a darkened "accessible accent" that achieves at least targetRatio
 * (default 4.5:1 under WCAG AA) against a light background (default #ffffff).
 *
 * Keeps the contractor's brand identity while preventing unreadable pale orange/yellow text.
 */
export function accessibleAccent(accent: string, onBackground = '#ffffff', targetRatio = 4.5): string {
  const base = safeAccent(accent);
  if (contrastRatio(base, onBackground) >= targetRatio) return base;

  let [r, g, b] = hexToRgb(base);
  for (let step = 0; step < 40; step++) {
    r = Math.max(0, Math.floor(r * 0.93));
    g = Math.max(0, Math.floor(g * 0.93));
    b = Math.max(0, Math.floor(b * 0.93));
    const candidate = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(candidate, onBackground) >= targetRatio) {
      return candidate;
    }
  }
  return INK;
}

/**
 * The From line.
 *
 * The DISPLAY name is the contractor's; the address stays on our verified
 * domain because that is what SPF and DKIM sign. Sending as their own address
 * without their DNS would fail authentication and land in spam — the failure
 * mode being worse than the branding gain, by a lot.
 */
export function contractorFrom(businessName: string): string {
  const clean = String(businessName ?? '').replace(/["\\<>\r\n]/g, '').trim().slice(0, 60);
  return clean ? `${clean} <hello@letsgetquoted.com>` : "Let's Get Quoted <hello@letsgetquoted.com>";
}

/**
 * The masthead: their uploaded logo if they have one, otherwise their name set
 * in their own color.
 */
export function brandLockup(
  brand: EmailBrand,
  options: { textColor?: string; logoPlate?: boolean } = {},
): string {
  const accent = safeAccent(brand.accent);
  const name = escapeHtml(brand.businessName || 'Your contractor');
  if (brand.logoUrl) {
    const image = `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" width="160" style="display:block;max-width:160px;height:auto;border:0;outline:none;text-decoration:none" />`;
    return options.logoPlate
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block"><tr><td bgcolor="#ffffff" style="padding:8px 14px;background:#ffffff;border-radius:8px;border:1px solid #e2e8f0">${image}</td></tr></table>`
      : image;
  }
  return `<span style="font-family:${FONT_STACK};font-size:21px;font-weight:800;color:${options.textColor ?? accent};letter-spacing:-0.02em">${name}</span>`;
}

/**
 * Hidden preview text — the line a mail client shows next to the subject.
 */
function preheaderBlock(text: string): string {
  if (!text) return '';
  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(text)}${'&#8199;&#65279;&nbsp;'.repeat(30)}</div>`;
}

export type BrandedEmail = {
  brand: EmailBrand;
  /** Account mail keeps Let's Get Quoted as the sender while using the saved theme. */
  audience?: 'customer' | 'account';
  /** Optional account-mail reply instruction when Reply-To points somewhere else. */
  accountReplyText?: string;
  /** Mail-client preview line. */
  preheader?: string;
  /** Small uppercase kicker above the heading. */
  eyebrow?: string;
  heading: string;
  /** Plain sentences. Escaped for you — pass text, not markup. */
  paragraphs?: string[];
  cta?: { label: string; url: string };
  /** High-proximity contact callout placed before footer when appropriate. */
  contactCallout?: string;
  /** Pre-built, already-escaped HTML dropped in below the paragraphs (line items, totals). */
  bodyHtml?: string;
  /** Appended inside the footer, e.g. the CAN-SPAM block for marketing mail. */
  footerHtml?: string;
};

export type ThemePaint = {
  theme: EmailThemeId;
  accent: string;
  accessibleAccent: string;
  page: string;
  card: string;
  cardStyle: string;
  cardRadius: string;
  subtleBg: string;
  border: string;
  header: string;
  headerStyle: string;
  headerText: string;
  logoPlate: boolean;
  bodyStyle: string;
  footer: string;
  footerStyle: string;
  eyebrow: string;
  headingFont: string;
  headingSize: string;
  tableHeaderBg: string;
  tableHeaderBorder: string;
  badgeBg: string;
  badgeText: string;
  highlightBg: string;
  highlightBorder: string;
  ctaRadius: string;
  ctaBackground: string;
  ctaText: string;
};

export function tint(hexValue: string, whitePercent: number): string {
  const hex = safeAccent(hexValue).slice(1);
  const amount = Math.min(1, Math.max(0, whitePercent));
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

export function themePaint(theme: EmailThemeId, accent: string): ThemePaint {
  const acc = safeAccent(accent);
  const darkAcc = accessibleAccent(acc, '#ffffff', 4.5);

  if (theme === 'letterhead') {
    return {
      theme: 'letterhead',
      accent: acc,
      accessibleAccent: darkAcc,
      page: '#ffffff',
      card: '#ffffff',
      cardStyle: 'border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 12px -2px rgba(0,0,0,0.06)',
      cardRadius: '6px',
      subtleBg: '#f8fafc',
      border: '#e2e8f0',
      header: '#ffffff',
      headerStyle: `padding:28px 34px 22px;border-bottom:4px solid ${acc}`,
      headerText: darkAcc,
      logoPlate: true,
      bodyStyle: 'padding:28px 34px 14px',
      footer: '#f8fafc',
      footerStyle: 'padding:24px 34px 28px;border-top:1px solid #e2e8f0',
      eyebrow: darkAcc,
      headingFont: FONT_STACK,
      headingSize: '24px',
      tableHeaderBg: '#f1f5f9',
      tableHeaderBorder: '#cbd5e1',
      badgeBg: NAVY,
      badgeText: '#ffffff',
      highlightBg: '#f8fafc',
      highlightBorder: `border-left:4px solid ${acc}`,
      ctaRadius: '4px',
      ctaBackground: NAVY,
      ctaText: '#ffffff',
    };
  }

  if (theme === 'neighborly') {
    const cardBg = '#fffdf9';
    const darkOnWarm = accessibleAccent(acc, cardBg, 4.5);
    return {
      theme: 'neighborly',
      accent: acc,
      accessibleAccent: darkOnWarm,
      page: '#f6f1e8',
      card: cardBg,
      cardStyle: `border:1px solid #ebd5be;border-left:8px solid ${acc};border-radius:14px;box-shadow:0 10px 20px -5px rgba(120,53,15,0.07)`,
      cardRadius: '14px',
      subtleBg: '#faf4eb',
      border: '#ebd5be',
      header: cardBg,
      headerStyle: 'padding:30px 34px 20px',
      headerText: darkOnWarm,
      logoPlate: true,
      bodyStyle: 'padding:24px 34px 12px',
      footer: '#fffaf3',
      footerStyle: 'padding:24px 34px 30px;border-top:1px solid #ebd5be',
      eyebrow: darkOnWarm,
      headingFont: `Georgia, Cambria, 'Times New Roman', Times, serif`,
      headingSize: '25px',
      tableHeaderBg: '#f4ece0',
      tableHeaderBorder: '#dfcfb9',
      badgeBg: '#f3ede2',
      badgeText: '#422006',
      highlightBg: '#fcf7ee',
      highlightBorder: `border-left:4px solid ${acc}`,
      ctaRadius: '999px',
      ctaBackground: acc,
      ctaText: onAccent(acc),
    };
  }

  if (theme === 'blueprint') {
    return {
      theme: 'blueprint',
      accent: acc,
      accessibleAccent: darkAcc,
      page: '#0b1329',
      card: '#ffffff',
      cardStyle: 'border:1px solid #1e293b;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4)',
      cardRadius: '12px',
      subtleBg: '#f8fafc',
      border: '#cbd5e1',
      header: '#0f172a',
      headerStyle: `padding:28px 34px 24px;border-top:5px solid ${acc}`,
      headerText: '#ffffff',
      logoPlate: true,
      bodyStyle: 'padding:30px 34px 14px',
      footer: '#f8fafc',
      footerStyle: 'padding:24px 34px 28px;border-top:1px solid #e2e8f0',
      eyebrow: darkAcc,
      headingFont: `'Trebuchet MS', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
      headingSize: '25px',
      tableHeaderBg: '#1e293b',
      tableHeaderBorder: '#0f172a',
      badgeBg: '#0f172a',
      badgeText: '#ffffff',
      highlightBg: '#f1f5f9',
      highlightBorder: `border-left:4px solid ${acc}`,
      ctaRadius: '6px',
      ctaBackground: acc,
      ctaText: onAccent(acc),
    };
  }

  if (theme === 'spotlight') {
    const pageBg = tint(acc, 0.92);
    return {
      theme: 'spotlight',
      accent: acc,
      accessibleAccent: darkAcc,
      page: pageBg,
      card: '#ffffff',
      cardStyle: 'border:1px solid #fed7aa;border-radius:16px;box-shadow:0 20px 25px -5px rgba(255,122,33,0.1),0 8px 10px -6px rgba(0,0,0,0.05)',
      cardRadius: '16px',
      subtleBg: tint(acc, 0.96),
      border: tint(acc, 0.8),
      header: acc,
      headerStyle: 'padding:32px 34px 28px',
      headerText: onAccent(acc),
      logoPlate: true,
      bodyStyle: 'padding:32px 34px 16px',
      footer: '#ffffff',
      footerStyle: 'padding:24px 34px 30px;border-top:1px solid #f1f5f9',
      eyebrow: darkAcc,
      headingFont: FONT_STACK,
      headingSize: '27px',
      tableHeaderBg: tint(acc, 0.9),
      tableHeaderBorder: tint(acc, 0.75),
      badgeBg: acc,
      badgeText: onAccent(acc),
      highlightBg: tint(acc, 0.95),
      highlightBorder: `border-left:4px solid ${acc}`,
      ctaRadius: '12px',
      ctaBackground: acc,
      ctaText: onAccent(acc),
    };
  }

  // Default: Studio
  return {
    theme: 'studio',
    accent: acc,
    accessibleAccent: darkAcc,
    page: '#f1f5f9',
    card: '#ffffff',
    cardStyle: 'border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05),0 8px 10px -6px rgba(0,0,0,0.05)',
    cardRadius: '14px',
    subtleBg: '#f8fafc',
    border: '#e2e8f0',
    header: '#ffffff',
    headerStyle: `padding:28px 34px 22px;border-bottom:1px solid #edf2f7;border-top:4px solid ${acc}`,
    headerText: darkAcc,
    logoPlate: true,
    bodyStyle: 'padding:30px 34px 14px',
    footer: '#f8fafc',
    footerStyle: 'padding:24px 34px 28px;border-top:1px solid #edf2f7',
    eyebrow: darkAcc,
    headingFont: FONT_STACK,
    headingSize: '24px',
    tableHeaderBg: '#f8fafc',
    tableHeaderBorder: '#e2e8f0',
    badgeBg: '#e2e8f0',
    badgeText: '#1e293b',
    highlightBg: '#f8fafc',
    highlightBorder: `border-left:4px solid ${acc}`,
    ctaRadius: '8px',
    ctaBackground: acc,
    ctaText: onAccent(acc),
  };
}

/**
 * Renders rich, interactive visual cards for campaign bodies.
 * Automatically transforms:
 *  - Numbered lists (1. Title: Description) -> styled step cards with round colored step pills
 *  - Bullet checklists (• Title: Description) -> styled feature cards with checkmarks
 *  - Quotes / Callouts (> ... or Tip:) -> highlighted callout boxes
 *  - Regular paragraphs -> readable, nicely spaced text blocks
 */
export function renderRichCampaignBodyHtml(body: string, paint: ThemePaint): string {
  if (!body) return '';

  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

      // Check for Numbered List
      const isNumberedList = lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line));
      if (isNumberedList) {
        const items = lines
          .map((line) => {
            const match = line.match(/^(\d+)\.\s+(.*)$/);
            if (!match) return '';
            const num = match[1];
            const content = match[2];
            const colonIdx = content.indexOf(':');
            let title = '';
            let desc = content;
            if (colonIdx > 0 && colonIdx < 60) {
              title = content.slice(0, colonIdx).trim();
              desc = content.slice(colonIdx + 1).trim();
            }

            return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;background:${paint.subtleBg};border:1px solid ${paint.border};border-radius:${paint.cardRadius};overflow:hidden">
              <tr>
                <td width="48" valign="top" style="padding:14px 0 14px 14px">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${paint.accent}" style="width:28px;height:28px;border-radius:50%;font-family:${FONT_STACK};font-size:13px;font-weight:800;color:${onAccent(paint.accent)};text-align:center;line-height:28px">
                        ${num}
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="top" style="padding:14px 16px 14px 8px;font-family:${FONT_STACK}">
                  ${title ? `<div style="font-size:14px;font-weight:700;color:${INK};margin-bottom:3px">${escapeHtml(title)}</div>` : ''}
                  <div style="font-size:14px;line-height:1.55;color:#475569">${escapeHtml(desc)}</div>
                </td>
              </tr>
            </table>`;
          })
          .join('');
        return `<div style="margin:0 0 16px">${items}</div>`;
      }

      // Check for Bullet Checklist
      const isBulletList = lines.length > 0 && lines.every((line) => line.startsWith('•') || line.startsWith('-'));
      if (isBulletList) {
        const items = lines
          .map((line) => {
            const rawContent = line.replace(/^[•\-]\s*/, '').trim();
            const colonIdx = rawContent.indexOf(':');
            let title = '';
            let desc = rawContent;
            if (colonIdx > 0 && colonIdx < 60) {
              title = rawContent.slice(0, colonIdx).trim();
              desc = rawContent.slice(colonIdx + 1).trim();
            }

            return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;background:${paint.subtleBg};border:1px solid ${paint.border};border-radius:8px;overflow:hidden">
              <tr>
                <td width="38" valign="top" style="padding:12px 0 12px 14px">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="#e0f2fe" style="width:22px;height:22px;border-radius:50%;font-family:${FONT_STACK};font-size:12px;font-weight:800;color:#0284c7;text-align:center;line-height:22px">
                        ✓
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="top" style="padding:12px 14px 12px 6px;font-family:${FONT_STACK}">
                  ${title ? `<strong style="font-size:14px;font-weight:700;color:${INK}">${escapeHtml(title)}: </strong>` : ''}
                  <span style="font-size:14px;line-height:1.55;color:#475569">${escapeHtml(desc)}</span>
                </td>
              </tr>
            </table>`;
          })
          .join('');
        return `<div style="margin:0 0 16px">${items}</div>`;
      }

      // Check for Callout/Tip (> Quote or Tip:)
      if (block.startsWith('>') || /^tip:/i.test(block) || /^note:/i.test(block) || /^important:/i.test(block)) {
        const cleanText = block.replace(/^>\s*/, '');
        return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px;background:${paint.highlightBg};${paint.highlightBorder};border-radius:8px;overflow:hidden">
          <tr>
            <td style="padding:14px 18px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:#334155">
              ${escapeHtml(cleanText)}
            </td>
          </tr>
        </table>`;
      }

      // Standard Paragraph
      return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

export function renderBrandedEmail(input: BrandedEmail): string {
  const { brand } = input;
  const accent = safeAccent(brand.accent);
  const name = escapeHtml(brand.businessName || 'your contractor');
  const theme = normalizeEmailTheme(brand.theme);
  const paint = themePaint(theme, accent);

  const eyebrow = input.eyebrow
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">
         <tr>
           <td bgcolor="${paint.theme === 'spotlight' ? 'rgba(255, 122, 33, 0.14)' : paint.subtleBg}" style="padding:4px 12px;border-radius:6px;border:1px solid ${paint.border}">
             <span style="font-family:${FONT_STACK};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${paint.eyebrow}">${escapeHtml(input.eyebrow)}</span>
           </td>
         </tr>
       </table>`
    : '';

  const paragraphs = (input.paragraphs ?? [])
    .map((text) => `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(text)}</p>`)
    .join('');

  // A table, not a styled <a>: Outlook ignores padding on inline anchors, so a
  // plain button collapses to a bare link exactly where it matters most.
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 14px">
         <tr>
           <td align="center" bgcolor="${paint.ctaBackground}" style="border-radius:${paint.ctaRadius};box-shadow:0 4px 14px rgba(0,0,0,0.12)">
             <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:700;color:${paint.ctaText};text-decoration:none;border-radius:${paint.ctaRadius};letter-spacing:-0.01em">
               ${escapeHtml(input.cta.label)} &nbsp;→
             </a>
           </td>
         </tr>
       </table>`
    : '';

  const contactCallout = input.contactCallout
    ? `<div style="margin:18px 0 10px;font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:${MUTED}">${input.contactCallout}</div>`
    : '';

  const contactBits = [
    brand.phone ? `<a href="tel:${escapeHtml(brand.phone)}" style="color:${MUTED};text-decoration:none">${escapeHtml(brand.phone)}</a>` : '',
    brand.siteUrl ? `<a href="${escapeHtml(brand.siteUrl)}" style="color:${MUTED};text-decoration:none">${escapeHtml(brand.siteUrl.replace(/^https?:\/\//, ''))}</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const metaBits = [
    brand.licenseNumber ? `Lic: ${escapeHtml(brand.licenseNumber)}` : '',
    brand.serviceArea ? escapeHtml(brand.serviceArea) : '',
    brand.mailingAddress ? escapeHtml(brand.mailingAddress) : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const accountEmail = input.audience === 'account';
  const senderLine = accountEmail
    ? `For ${name} &nbsp;&middot;&nbsp; sent by Let&#39;s Get Quoted`
    : `Sent by ${name}${contactBits ? `<br/>${contactBits}` : ''}`;
  const replyLine = accountEmail
    ? escapeHtml(input.accountReplyText || `Reply to this email to reach Let's Get Quoted.`)
    : `Reply to this email to reach ${name} directly.`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${name}</title></head>
<body style="margin:0;padding:0;background:${paint.page};font-family:${FONT_STACK}">
${preheaderBlock(input.preheader ?? '')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${paint.page}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${paint.card};${paint.cardStyle};overflow:hidden">
      <tr><td bgcolor="${paint.header}" style="${paint.headerStyle}">${brandLockup(brand, { textColor: paint.headerText, logoPlate: paint.logoPlate })}</td></tr>
      <tr><td style="${paint.bodyStyle}">
        ${eyebrow}
        <h1 style="margin:0 0 16px;font-family:${paint.headingFont};font-size:${paint.headingSize};line-height:1.25;font-weight:800;color:${INK};letter-spacing:-0.02em">${escapeHtml(input.heading)}</h1>
        ${paragraphs}
        ${input.bodyHtml ?? ''}
        ${cta}
        ${contactCallout}
      </td></tr>
      <tr><td bgcolor="${paint.footer}" style="${paint.footerStyle}">
        <div style="border-top:1px solid ${HAIRLINE};padding-top:16px;font-family:${FONT_STACK}">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">
             ${senderLine}
          </p>
          ${metaBits ? `<p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#94a3b8">${metaBits}</p>` : ''}
          <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${MUTED}">
             ${replyLine}
          </p>
          ${input.footerHtml ?? ''}
        </div>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:11px;color:#9099a6;letter-spacing:0.02em">Powered by Let&#39;s Get Quoted</p>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Recommends an email theme based on the contractor's website theme template.
 * Enables the "Match my website" feature so emails harmonize with the web presence.
 */
export function recommendEmailTheme(websiteTemplate?: string | null): EmailThemeId {
  if (!websiteTemplate) return 'studio';
  const key = websiteTemplate.toLowerCase().trim();
  switch (key) {
    case 'carbon': // Forge
    case 'reno': // Blueprint
      return 'blueprint';
    case 'professional': // Guild
    case 'coat': // Foundry
      return 'letterhead';
    case 'handy': // Haven
    case 'fixit': // Tinker
      return 'neighborly';
    case 'shine': // Lustre
      return 'spotlight';
    case 'modern': // Vista
    default:
      return 'studio';
  }
}

