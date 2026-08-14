import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmailTheme, type EmailBrand, type EmailThemeId } from '@/emails/brand';
import { createAdminClient } from './auth';

// Assembling a contractor's email brand from what they've already set up.
//
// Nothing new to fill in: the name, color and logo come from the website they
// built, and the reply address is the login they already have. A contractor who
// has never opened the site builder still gets their business name and a working
// reply-to, which is most of the benefit.

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

type BrandRow = {
  company_name: string | null;
  accent_override: string | null;
  logo_url: string | null;
  phone: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  custom_domain_verified_at: string | null;
  email_theme: EmailThemeId | null;
};

/**
 * The brand for a contractor's outbound email.
 *
 * Never throws and never returns null: an email that fails to send because the
 * branding lookup broke is a far worse outcome than one that goes out looking
 * plain. Every field degrades on its own.
 */
export async function loadEmailBrand(
  accountId: string,
  fallbackBusinessName = '',
  client?: SupabaseClient,
): Promise<EmailBrand> {
  // Its own admin client by default: this runs from webhooks and cron as often
  // as from a request, and none of those carry a session.
  const admin = client ?? createAdminClient();
  let row: BrandRow | null = null;
  try {
    const { data } = await admin
      .from('sites')
      .select('company_name, accent_override, logo_url, phone, subdomain, custom_domain, custom_domain_verified_at, email_theme')
      .eq('account_id', accountId)
      .maybeSingle();
    row = (data as BrandRow) ?? null;
  } catch {
    row = null;
  }

  // The reply address is the point of the whole exercise — before this, a
  // customer hitting Reply on their plumber's invoice reached OUR inbox and the
  // plumber never saw it. Best-effort, but tried first.
  // Deliberately NOT imported from ./email — that module imports this one, and
  // a cycle between them resolves to undefined at runtime in a way that only
  // shows up when an email is actually sent.
  let replyTo: string | null = null;
  try {
    const { data: owner } = await admin
      .from('memberships')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('role', 'owner')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (owner?.user_id) {
      const { data: ownerUser } = await admin.auth.admin.getUserById(owner.user_id);
      replyTo = ownerUser?.user?.email ?? null;
    }
  } catch {
    replyTo = null;
  }

  const host = row?.custom_domain && row.custom_domain_verified_at
    ? row.custom_domain
    : row?.subdomain
      ? `${row.subdomain}.${ROOT_DOMAIN}`
      : null;

  return {
    businessName: (row?.company_name ?? '').trim() || fallbackBusinessName.trim() || 'Your contractor',
    accent: (row?.accent_override ?? '').trim(),
    // Only a hosted raster logo is usable in email — see brandLockup. An empty
    // string here means "use the wordmark", which is the common case.
    logoUrl: (row?.logo_url ?? '').trim() || null,
    phone: (row?.phone ?? '').trim() || null,
    siteUrl: host ? `https://${host}` : null,
    replyTo,
    theme: normalizeEmailTheme(row?.email_theme),
  };
}

/** The brand for a contractor we only know the name of (no account lookup available). */
export function nameOnlyBrand(businessName: string): EmailBrand {
  return {
    businessName: businessName.trim() || 'Your contractor',
    accent: '',
    logoUrl: null,
    phone: null,
    siteUrl: null,
    replyTo: null,
    theme: 'studio',
  };
}
