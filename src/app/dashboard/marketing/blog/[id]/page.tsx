import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { loadBlogWorkspace } from '@/lib/site-blog';
import MarketingNav from '../../MarketingNav';
import PostEditor from './PostEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit post' };

/**
 * One post, on its own screen.
 *
 * Editing used to happen inside the list: a row expanded into the whole form.
 * That made the list unusable while editing and the editor cramped while
 * listing, and a post is a document — it deserves a page.
 */
export default async function BlogPostPage({ params }: { params: { id: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const blog = await loadBlogWorkspace(supabase, accountId, rootDomain);

  const post = blog?.posts.find((entry) => entry.id === params.id);
  // A deleted post, or somebody else's id. notFound rather than a redirect to
  // the list: a silent bounce reads as "the link worked and there was nothing
  // to see", which is a different thing from "that post is gone".
  if (!blog || !post) notFound();

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <nav className="mkt-crumb" aria-label="Breadcrumb">
        <Link href="/dashboard/marketing/blog">← All posts</Link>
      </nav>

      <PostEditor
        post={post}
        publicBase={blog.publicBase}
        trade={blog.trade}
        sectionEnabled={blog.sectionEnabled}
      />
    </main>
  );
}
