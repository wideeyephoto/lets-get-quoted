import { APP_ORIGIN } from '@/lib/app-origin';
import type { EmailThemeId } from '@/emails/brand';

export type PlatformAudienceId =
  | 'all_contractors'
  | 'active_30d'
  | 'active_90d'
  | 'paid_tier'
  | 'free_tier'
  | 'incomplete_onboarding'
  | 'recent_signups'
  | 'custom';

export type PlatformAudienceDef = {
  id: PlatformAudienceId;
  label: string;
  description: string;
  badge: string;
};

export const PLATFORM_AUDIENCES: PlatformAudienceDef[] = [
  {
    id: 'all_contractors',
    label: 'All Contractors & Accounts',
    description: 'Every verified business owner registered on Let’s Get Quoted.',
    badge: 'Full reach',
  },
  {
    id: 'active_30d',
    label: 'Active (Last 30 Days)',
    description: 'Contractors who logged in, created quotes, or issued invoices in the last 30 days.',
    badge: 'High engagement',
  },
  {
    id: 'active_90d',
    label: 'Active (Last 90 Days)',
    description: 'Contractors active within the previous quarter.',
    badge: 'Broad active',
  },
  {
    id: 'paid_tier',
    label: 'Paid Plan Subscribers',
    description: 'Contractors subscribed to Pro, Crew+, or Custom paid tiers.',
    badge: 'Paid customers',
  },
  {
    id: 'free_tier',
    label: 'Free Plan Accounts',
    description: 'Contractors currently on the Free tier (prime audience for upgrade campaigns).',
    badge: 'Upgrade target',
  },
  {
    id: 'incomplete_onboarding',
    label: 'Incomplete Payout Setup',
    description: 'Contractors who registered but haven’t finished Stripe Connect setup.',
    badge: 'Activation nudge',
  },
  {
    id: 'recent_signups',
    label: 'Recent Signups (Last 14 Days)',
    description: 'Newly registered businesses created within the past two weeks.',
    badge: 'Welcome series',
  },
  {
    id: 'custom',
    label: 'Custom Recipient List',
    description: 'Paste a specific list of comma- or newline-separated email addresses.',
    badge: 'Ad-hoc list',
  },
];

export type PlatformCampaignRecipient = {
  email: string;
  name: string | null;
  businessName: string | null;
  accountId: string | null;
};

export type PlatformCampaignInput = {
  subject: string;
  preheader?: string;
  eyebrow?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  theme?: EmailThemeId;
  mailingAddress?: string | null;
  audience: PlatformAudienceId;
  customEmails?: string;
};

export type PlatformCampaignRecord = {
  id: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  audience: PlatformAudienceId;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  theme: EmailThemeId;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'sent' | 'partially_failed' | 'failed';
  sentBy: string;
  sentAt: string;
};

/**
 * Replace template tokens with recipient specifics.
 */
export function interpolateTokens(text: string, recipient?: Partial<PlatformCampaignRecipient> | null): string {
  if (!text) return '';
  const biz = recipient?.businessName?.trim() || 'your business';
  const fullName = recipient?.name?.trim() || '';
  const firstName = fullName ? fullName.split(' ')[0] : 'there';
  const email = recipient?.email?.trim() || '';
  const appUrl = (APP_ORIGIN || 'https://letsgetquoted.com').replace(/\/$/, '');

  return text
    .replace(/\{\{\s*business_name\s*\}\}/gi, biz)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, fullName || biz || 'there')
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*app_url\s*\}\}/gi, `${appUrl}/dashboard`);
}

/**
 * Validate an email structure for custom list entries.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

/**
 * Parse a custom email list string (comma, newline, semicolon, or space delimited).
 */
export function parseCustomEmailList(raw: string): string[] {
  if (!raw) return [];
  const entries = raw
    .split(/[\r\n,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const valid = new Set<string>();
  for (const entry of entries) {
    if (isValidEmailFormat(entry)) {
      valid.add(entry);
    }
  }
  return Array.from(valid);
}
