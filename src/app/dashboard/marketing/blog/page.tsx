import { requireOfficeContext } from '@/lib/auth';
import { loadBlogWorkspace } from '@/lib/site-blog';
import type { PostState } from '@/lib/marketing-status';
import BlogScreen from './BlogScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog' };

const FILTER_IDS = new Set(['all', 'draft', 'ready', 'scheduled', 'published', 'archived']);

/**
 * Blog, as a sub-workspace of Marketing.
 *
 * It was reachable only by opening /dashboard/sites, finding the Blog section
 * among a dozen others, and expanding it — which made writing a post feel like
 * editing a website rather than doing marketing. It is marketing: the posts are
 * the same seasonal topics the calendar proposes, drafted by the same model,
 * aimed at the same customers.
 *
 * The screen itself is in BlogScreen so the demo renders the same one.
 */
export default async function MarketingBlogPage({
  searchParams,
}: {
  searchParams: { topic?: string; status?: string };
}) {
  // The legacy ?post=<id> shape is forwarded to the post's own route by the
  // middleware, before anything here renders — see the note there for why it
  // cannot be a redirect() from inside this component.
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const blog = await loadBlogWorkspace(supabase, accountId, rootDomain);

  const requested = (searchParams.status ?? '').toLowerCase();
  const initialFilter = (FILTER_IDS.has(requested) ? requested : 'all') as PostState | 'all';

  return (
    <BlogScreen
      blog={blog}
      initialTopic={(searchParams.topic ?? '').slice(0, 200)}
      initialFilter={initialFilter}
    />
  );
}
