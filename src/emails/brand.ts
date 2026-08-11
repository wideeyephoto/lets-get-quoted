// The look of every email a homeowner gets from a contractor.
//
// Before this, all fifteen were hand-written HTML strings carrying Let's Get
// Quoted's amber-and-navy palette, and the customer saw OUR name in the From
// line for THEIR plumber's invoice. This is the one shell they all render
// through, wearing the contractor's name, color and logo.
//
// Emails our own customers get — the daily digest, lead alerts, "your quote was
// sent" confirmations — deliberately do NOT use this. Those are us talking to
// the contractor, and they should look like us.
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
};

const NAVY = '#172033';
const INK = '#1c2230';
const MUTED = '#6b7280';
const HAIRLINE = '#e6e9ef';

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

/**
 * Readable text on the accent.
 *
 * A contractor who picks a pale yellow gets white-on-yellow otherwise, which is
 * the kind of thing nobody notices until a customer cannot find the button.
 * Standard luminance, same rule the app's own theme uses.
 */
export function onAccent(accent: string): string {
  const hex = safeAccent(accent).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.55 ? INK : '#ffffff';
}

/**
 * The From line.
 *
 * The DISPLAY name is the contractor's; the address stays on our verified
 * domain because that is what SPF and DKIM sign. Sending as their own address
 * without their DNS would fail authentication and land in spam — the failure
 * mode being worse than the branding gain, by a lot.
 *
 * Quotes and backslashes are stripped rather than escaped: a display name is a
 * header field, and a stray quote there can split it.
 */
export function contractorFrom(businessName: string): string {
  const clean = String(businessName ?? '').replace(/["\\<>\r\n]/g, '').trim().slice(0, 60);
  return clean ? `${clean} <hello@letsgetquoted.com>` : "Let's Get Quoted <hello@letsgetquoted.com>";
}

/**
 * The masthead: their uploaded logo if they have one, otherwise their name set
 * in their own color.
 *
 * Deliberately NOT the SVG brand mark the site and favicon use. Gmail refuses
 * data: URIs on images and several clients don't render SVG at all, so it would
 * be an empty box for most recipients — worse than a wordmark, which always
 * works and still carries the color.
 */
function brandLockup(brand: EmailBrand): string {
  const accent = safeAccent(brand.accent);
  const name = escapeHtml(brand.businessName || 'Your contractor');
  if (brand.logoUrl) {
    return `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" width="150" style="display:block;max-width:150px;height:auto;border:0;outline:none;text-decoration:none" />`;
  }
  return `<span style="font-size:20px;font-weight:700;color:${accent};letter-spacing:-0.01em">${name}</span>`;
}

/**
 * Hidden preview text — the line a mail client shows next to the subject.
 *
 * Without it the preview is whatever the first visible words happen to be,
 * which for a branded email is the business name it already shows in the From
 * line. The padding characters stop the client pulling the body in after it.
 */
function preheaderBlock(text: string): string {
  if (!text) return '';
  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(text)}${'&#8199;&#65279;&nbsp;'.repeat(30)}</div>`;
}

export type BrandedEmail = {
  brand: EmailBrand;
  /** Mail-client preview line. */
  preheader?: string;
  /** Small uppercase kicker above the heading. */
  eyebrow?: string;
  heading: string;
  /** Plain sentences. Escaped for you — pass text, not markup. */
  paragraphs?: string[];
  cta?: { label: string; url: string };
  /** Pre-built, already-escaped HTML dropped in below the paragraphs (line items, totals). */
  bodyHtml?: string;
  /** Appended inside the footer, e.g. the CAN-SPAM block for marketing mail. */
  footerHtml?: string;
};

export function renderBrandedEmail(input: BrandedEmail): string {
  const { brand } = input;
  const accent = safeAccent(brand.accent);
  const name = escapeHtml(brand.businessName || 'your contractor');

  const eyebrow = input.eyebrow
    ? `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent}">${escapeHtml(input.eyebrow)}</p>`
    : '';

  const paragraphs = (input.paragraphs ?? [])
    .map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK}">${escapeHtml(text)}</p>`)
    .join('');

  // A table, not a styled <a>: Outlook ignores padding on inline anchors, so a
  // plain button collapses to a bare link exactly where it matters most.
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
         <tr><td align="center" bgcolor="${accent}" style="border-radius:6px">
           <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:${onAccent(accent)};text-decoration:none;border-radius:6px">${escapeHtml(input.cta.label)}</a>
         </td></tr>
       </table>`
    : '';

  const contactBits = [
    brand.phone ? `<a href="tel:${escapeHtml(brand.phone)}" style="color:${MUTED};text-decoration:none">${escapeHtml(brand.phone)}</a>` : '',
    brand.siteUrl ? `<a href="${escapeHtml(brand.siteUrl)}" style="color:${MUTED};text-decoration:none">${escapeHtml(brand.siteUrl.replace(/^https?:\/\//, ''))}</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${name}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9">
${preheaderBlock(input.preheader ?? '')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="height:4px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 0">${brandLockup(brand)}</td></tr>
      <tr><td style="padding:24px 32px 8px">
        ${eyebrow}
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;color:${INK}">${escapeHtml(input.heading)}</h1>
        ${paragraphs}
        ${input.bodyHtml ?? ''}
        ${cta}
      </td></tr>
      <tr><td style="padding:24px 32px 28px">
        <div style="border-top:1px solid ${HAIRLINE};padding-top:16px">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">
            Sent by ${name}${contactBits ? `<br/>${contactBits}` : ''}
          </p>
          <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${MUTED}">
            Reply to this email to reach ${name} directly.
          </p>
          ${input.footerHtml ?? ''}
        </div>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#9099a6">Powered by Let&#39;s Get Quoted</p>
  </td></tr>
</table>
</body></html>`;
}
