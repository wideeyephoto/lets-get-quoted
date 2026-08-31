import { loadBlogWorkspace } from '@/lib/site-blog';
import type { PostState } from '@/lib/marketing-status';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import BlogScreen from '@/app/dashboard/marketing/blog/BlogScreen';

export const metadata = { title: 'Blog — Live Demo' };

const FILTER_IDS = new Set(['all', 'draft', 'ready', 'scheduled', 'published', 'archived']);

/**
 * Blog, for a logged-out visitor.
 *
 * Real posts, loaded through the real workspace reader — including one whose
 * publishAt is next week, which is how a post becomes "Scheduled" without there
 * being a scheduled STATUS. That distinction is the sort of thing a hand-drawn
 * demo would have flattened into a coloured chip.
 */
export default async function DemoMarketingBlogPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ topic?: string; status?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const blog = await loadBlogWorkspace(demoSupabase, DEMO_ACCOUNT_ID, DEMO_SITE_HOST.split('.').slice(1).join('.'));

  const requested = (searchParams.status ?? '').toLowerCase();
  const initialFilter = (FILTER_IDS.has(requested) ? requested : 'all') as PostState | 'all';

  return (
    <BlogScreen
      blog={blog}
      initialTopic={(searchParams.topic ?? '').slice(0, 200)}
      initialFilter={initialFilter}
      basePath="/demo"
      readOnly
    />
  );
}
