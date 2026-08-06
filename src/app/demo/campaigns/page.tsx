import { redirect } from 'next/navigation';

/**
 * The demo's marketing area now mirrors the real one's shape —
 * /demo/marketing, /demo/marketing/campaigns, /blog, /performance — because the
 * point of the demo is to show the product that exists, and Marketing having
 * four sections is part of that.
 *
 * This URL was where the old single flat page lived. It is kept as a redirect
 * rather than deleted: it is a public URL that has been linked to from the
 * marketing site and the sidebar for months, and a 404 is a bad way to greet
 * somebody who followed one.
 */
export default function DemoCampaignsRedirect() {
  redirect('/demo/marketing/campaigns');
}
