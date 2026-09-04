import { requireOfficeContext } from '@/lib/auth';
import { loadMessagingSetup } from '@/lib/owner-sms';
import { listUploadedSiteImages } from '@/lib/site-image-storage';
import { getOrCreateSite } from '@/lib/sites';
import { templateFontVars } from '@/lib/templates/fonts';
import WebsiteBuilder from './WebsiteBuilder';

export const metadata = {
  title: 'Website Settings',
  description: 'Customize your contractor website',
};

export const maxDuration = 180;

// `?built=1` is set by first run when it generated the whole site from the
// business name, trade and ZIP. Without a word of explanation the owner arrives
// at a finished website they never asked anyone to write, which reads as
// somebody else's site rather than a head start on their own.
//
// Intake tuning used to be rendered here and passed into the builder as a slot.
// It lives on Automations → Smart Intake now: none of it changed how
// the site looked, and a page about headlines and photos was the wrong place to
// decide which leads interrupt somebody.
//
// `?open=<key>` opens one card straight away, for links sent from elsewhere in
// the dashboard — Automations → Review requests points at `reviews`, because
// the Google Business Profile the review ask needs is set on that card and
// nowhere else.
export default async function SitesPage({ searchParams }: { searchParams?: Promise<{ built?: string; open?: string }> }) {
  const params = searchParams ? await searchParams : undefined;
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const justBuilt = params?.built === '1';

  // Get site, images, messaging registration, and credit balances in parallel
  const [site, uploadedImages, messagingSetup, balanceRes] = await Promise.all([
    getOrCreateSite(supabase, accountId),
    listUploadedSiteImages(accountId),
    loadMessagingSetup(accountId),
    supabase
      .from('workspace_usage_credit_balances')
      .select('resource_code, available_units')
      .eq('account_id', accountId),
  ]);

  const balanceRows = balanceRes?.data;
  const aiIntakeUnits = balanceRows?.find((r) => r.resource_code === 'ai_intake_threads')?.available_units;
  const aiWritingUnits = balanceRows?.find((r) => r.resource_code === 'ai_writing_drafts')?.available_units;
  const hasAiBalance = typeof aiIntakeUnits === 'number' || typeof aiWritingUnits === 'number';
  const aiCredits = hasAiBalance
    ? (typeof aiIntakeUnits === 'number' ? aiIntakeUnits : 0) + (typeof aiWritingUnits === 'number' ? aiWritingUnits : 0)
    : null;

  return (
    // The one dashboard route that renders the contractor's own type: the
    // heading and company-name pickers preview each option in the face itself,
    // and the live preview renders the site. display:contents so the wrapper
    // carries the variables without adding a box — the builder's own layout
    // rules expect it to be a direct child of the dashboard shell.
    <div className={templateFontVars} style={{ display: 'contents' }}>
      <WebsiteBuilder
        site={site}
        uploadedImages={uploadedImages}
        messagingSetup={messagingSetup}
        justBuilt={justBuilt}
        openTarget={params?.open ?? null}
        aiCredits={aiCredits}
      />
    </div>
  );
}
