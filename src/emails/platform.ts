import { escapeHtml, platformEmailPaint, renderBrandedEmail, renderRichCampaignBodyHtml } from '@/emails/brand';
import { interpolateTokens, type PlatformCampaignRecipient } from '@/lib/admin-campaign-types';
import { buildUnsubscribePageUrl } from '@/lib/email-suppression';
import { LGQ_LEGAL_NAME, LGQ_MAILING_ADDRESS } from '@/lib/company';

export type PlatformEmailContent = {
  subject: string;
  heading: string;
  body: string;
  preheader?: string;
  eyebrow?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  senderName?: string;
  replyTo?: string;
};

/** Shared by actual sends and previews so reviewers see the message recipients get. */
export function renderPlatformEmail(input: PlatformEmailContent, recipient?: Partial<PlatformCampaignRecipient>): string {
  const replyTo = input.replyTo?.trim() || 'hello@letsgetquoted.com';
  const unsubscribeUrl = buildUnsubscribePageUrl(recipient?.accountId || 'platform', recipient?.email || 'contractor@example.com');
  const interpolate = (text: string) => interpolateTokens(text, recipient);
  return renderBrandedEmail({
    design: 'platform',
    audience: 'account',
    brand: {
      businessName: "Let's Get Quoted", accent: '#ff6a24', logoUrl: null,
      phone: null, siteUrl: 'https://letsgetquoted.com', replyTo, theme: 'blueprint',
    },
    heading: interpolate(input.heading),
    preheader: interpolate(input.preheader || input.subject),
    eyebrow: interpolate(input.eyebrow || 'From Let’s Get Quoted'),
    bodyHtml: renderRichCampaignBodyHtml(interpolate(input.body), platformEmailPaint()),
    cta: input.ctaLabel && input.ctaUrl ? { label: interpolate(input.ctaLabel), url: interpolate(input.ctaUrl) } : undefined,
    accountReplyText: `Reply to this email to reach our team at ${replyTo}.`,
    footerHtml: `<p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:1.6"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569;text-decoration:underline">Unsubscribe from onboarding tips and platform announcements</a></p>`,
  });
}

export function renderPlatformEmailText(input: PlatformEmailContent, recipient?: Partial<PlatformCampaignRecipient>): string {
  const text = [input.heading, input.body, input.ctaLabel && input.ctaUrl ? `${input.ctaLabel}: ${input.ctaUrl}` : '',
    `Reply to ${input.replyTo?.trim() || 'hello@letsgetquoted.com'} for help.`,
    `${LGQ_LEGAL_NAME} · ${LGQ_MAILING_ADDRESS}`,
    `Unsubscribe: ${buildUnsubscribePageUrl(recipient?.accountId || 'platform', recipient?.email || 'contractor@example.com')}`,
  ].filter(Boolean).join('\n\n');
  return interpolateTokens(text, recipient).replace(/^##\s+/gm, '').replace(/\*\*/g, '');
}
