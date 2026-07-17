import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';

// Lightweight status check used by the app shell to show a persistent Stripe
// onboarding badge, plus the Website Builder promo badge, on every dashboard
// page. Intentionally returns only booleans/a public URL — never account
// details — since this is fetched client-side.
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false, onboarded: false, sitePublished: false, siteUrl: null });
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId) {
    return NextResponse.json({ loggedIn: true, onboarded: false, sitePublished: false, siteUrl: null });
  }

  const admin = createAdminClient();
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('connect_onboarded').eq('id', membership.accountId).maybeSingle(),
    admin
      .from('sites')
      .select('published, subdomain, custom_domain, custom_domain_verified_at')
      .eq('account_id', membership.accountId)
      .maybeSingle(),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const sitePublished = site?.published ?? false;
  const siteUrl = sitePublished
    ? site?.custom_domain && site?.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site?.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null
    : null;

  return NextResponse.json({
    loggedIn: true,
    onboarded: account?.connect_onboarded ?? false,
    sitePublished,
    siteUrl,
  });
}
