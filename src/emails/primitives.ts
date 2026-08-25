import {
  escapeHtml,
  type EmailBrand,
  type ThemePaint,
  INK,
  MUTED,
} from './brand';

/**
 * Reusable, theme-aware email layout primitives.
 *
 * EMAIL HTML RULES:
 * - Table-based layouts only (Outlook ignores flexbox/grid).
 * - Inline styles only (no <style> blocks or classes).
 * - Fully driven by ThemePaint tokens so themes feel distinct inside the message body.
 */

/**
 * A bordered, styled card for structured content (specs, details, lead fields).
 */
export function detailCard(
  paint: ThemePaint,
  contentHtml: string,
  options: { title?: string; subtitle?: string; borderLeft?: boolean } = {},
): string {
  const titleHtml = options.title
    ? `<div style="padding:10px 16px;background:${paint.tableHeaderBg};border-bottom:${paint.tableHeaderBorder};font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${paint.accessibleAccent}">
        ${escapeHtml(options.title)}
        ${options.subtitle ? `<span style="font-weight:400;color:${MUTED};margin-left:6px;text-transform:none">· ${escapeHtml(options.subtitle)}</span>` : ''}
       </div>`
    : '';

  const leftBorder = options.borderLeft ? `border-left:4px solid ${paint.accent};` : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px;background:${paint.subtleBg};border:1px solid ${paint.border};${leftBorder}border-radius:${paint.cardRadius};overflow:hidden">
    ${titleHtml ? `<tr><td>${titleHtml}</td></tr>` : ''}
    <tr><td style="padding:16px 18px">${contentHtml}</td></tr>
  </table>`;
}

/**
 * Financial summary table for invoices, quotes, and deposits.
 */
export function moneySummary(
  paint: ThemePaint,
  rows: Array<{ label: string; value: string; strong?: boolean; accent?: boolean }>,
  totalRow: { label: string; value: string },
  options: { dueNotice?: string } = {},
): string {
  const rowHtml = rows
    .map((r) => {
      const color = r.accent ? paint.accessibleAccent : r.strong ? INK : MUTED;
      const weight = r.strong ? '700' : '400';
      const size = r.strong ? '14px' : '13px';
      const padding = r.strong ? '8px 0 4px' : '6px 0';
      return `<tr>
        <td style="padding:${padding};font-size:${size};font-weight:${weight};color:${color}">${escapeHtml(r.label)}</td>
        <td align="right" style="padding:${padding};font-size:${size};font-weight:${weight};color:${color};white-space:nowrap">${escapeHtml(r.value)}</td>
      </tr>`;
    })
    .join('');

  const dueHtml = options.dueNotice
    ? `<div style="margin-top:10px;font-size:12px;color:${MUTED};text-align:right">${escapeHtml(options.dueNotice)}</div>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 20px;border-top:1px solid ${paint.border}">
    ${rowHtml}
    <tr>
      <td style="padding:12px 0 6px;border-top:2px solid ${paint.border};font-size:16px;font-weight:700;color:${INK}">${escapeHtml(totalRow.label)}</td>
      <td align="right" style="padding:12px 0 6px;border-top:2px solid ${paint.border};font-size:20px;font-weight:700;color:${paint.accessibleAccent};white-space:nowrap">${escapeHtml(totalRow.value)}</td>
    </tr>
  </table>
  ${dueHtml}`;
}

/**
 * Appointment / Scheduling card with date badge, address, and service details.
 */
export function appointmentBlock(
  paint: ThemePaint,
  options: {
    whenLabel: string;
    timeLabel?: string;
    address?: string | null;
    serviceName?: string | null;
    notes?: string | null;
    rescheduleText?: string | null;
  },
): string {
  const serviceHtml = options.serviceName
    ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${INK}">Service: ${escapeHtml(options.serviceName)}</p>`
    : '';

  const addressHtml = options.address
    ? `<p style="margin:0 0 6px;font-size:14px;color:${MUTED}">📍 <strong>Where:</strong> ${escapeHtml(options.address)}</p>`
    : '';

  const notesHtml = options.notes
    ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(options.notes)}</p>`
    : '';

  const rescheduleHtml = options.rescheduleText
    ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed ${paint.border};font-size:12px;color:${MUTED}">
        ${escapeHtml(options.rescheduleText)}
       </div>`
    : '';

  const badgeContent = `
    <div style="display:inline-block;padding:6px 14px;background:${paint.badgeBg};color:${paint.badgeText};border-radius:6px;font-weight:700;font-size:14px;letter-spacing:0.02em">
      🗓️ ${escapeHtml(options.whenLabel)}
    </div>
  `;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 20px;background:${paint.subtleBg};border:1px solid ${paint.border};border-left:5px solid ${paint.accent};border-radius:${paint.cardRadius};overflow:hidden">
    <tr>
      <td style="padding:18px 20px">
        <div style="margin-bottom:12px">${badgeContent}</div>
        ${serviceHtml}
        ${addressHtml}
        ${notesHtml}
        ${rescheduleHtml}
      </td>
    </tr>
  </table>`;
}

/**
 * Status or urgent callout banner.
 */
export function statusBanner(
  paint: ThemePaint,
  options: {
    tone?: 'info' | 'warn' | 'success' | 'urgent';
    title?: string;
    message: string;
  },
): string {
  const tone = options.tone ?? 'info';
  let bg = paint.subtleBg;
  let border = paint.border;
  let text = INK;
  let icon = 'ℹ️';

  if (tone === 'warn' || tone === 'urgent') {
    bg = '#fff7ed';
    border = '#ea580c';
    text = '#9a3412';
    icon = '⚠️';
  } else if (tone === 'success') {
    bg = '#f0fdf4';
    border = '#16a34a';
    text = '#166534';
    icon = '✅';
  }

  const titleHtml = options.title
    ? `<div style="font-weight:700;font-size:14px;margin-bottom:4px;color:${text}">${icon} ${escapeHtml(options.title)}</div>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 16px;background:${bg};border:1px solid ${border};border-left:4px solid ${border};border-radius:${paint.cardRadius}">
    <tr>
      <td style="padding:12px 16px;font-size:14px;line-height:1.5;color:${text}">
        ${titleHtml}
        <div>${escapeHtml(options.message)}</div>
      </td>
    </tr>
  </table>`;
}

/**
 * High-proximity phone/reply contact component positioned near primary actions.
 */
export function contactBlock(
  paint: ThemePaint,
  brand: EmailBrand,
  options: { prompt?: string } = {},
): string {
  const prompt = options.prompt || 'Questions? Reach us directly:';
  const phone = brand.phone
    ? `<a href="tel:${escapeHtml(brand.phone)}" style="display:inline-block;padding:6px 12px;margin:4px 6px 4px 0;background:${paint.subtleBg};border:1px solid ${paint.border};border-radius:6px;font-size:13px;font-weight:700;color:${paint.accessibleAccent};text-decoration:none">📞 ${escapeHtml(brand.phone)}</a>`
    : '';
  const replyNote = `<span style="font-size:13px;color:${MUTED}">or reply to this email</span>`;

  return `<div style="margin:16px 0 8px;padding-top:12px;border-top:1px solid ${paint.border}">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED}">${escapeHtml(prompt)}</p>
    <div>${phone}${replyNote}</div>
  </div>`;
}
