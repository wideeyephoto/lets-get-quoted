import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getSiteGallery } from '@/lib/site-images';
import { getOrCreateSite, withPublicContact } from '@/lib/sites';
import { siteIsUnwritten } from '@/lib/site-seed';
import { getTemplate } from '@/lib/templates';

export const metadata: Metadata = {
  title: 'Your new website',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function WelcomeSiteRevealPage() {
  const { supabase, accountId } = await requireOwnerContext({ skipFirstRunGate: true });
  const site = await getOrCreateSite(supabase, accountId);

  // Never reveal an unwritten or empty template — redirect straight to builder
  if (siteIsUnwritten(site)) {
    redirect('/dashboard/sites');
  }

  const Template = getTemplate(site.template);
  if (!Template) {
    redirect('/dashboard/sites?built=1');
  }

  return (
    <div className="welcome-site-reveal">
      <header className="welcome-site-reveal-bar" role="banner">
        <div className="welcome-site-reveal-bar-content">
          <p className="welcome-site-reveal-bar-text">
            <strong>This is your website.</strong> Written from your business name, your trade and your ZIP. The reviews and stats are AI examples, so they&apos;re switched off until you replace them.
          </p>
          <div className="welcome-site-reveal-bar-actions">
            <Link href="/dashboard/sites" className="btn primary welcome-site-reveal-cta">
              Make it yours &rarr;
            </Link>
            <Link href="/dashboard" className="welcome-site-reveal-skip">
              Skip to dashboard
            </Link>
          </div>
        </div>
      </header>
      <div className="welcome-site-reveal-frame">
        <Template site={withPublicContact(site)} galleryImages={getSiteGallery(site.content)} />
      </div>
    </div>
  );
}
