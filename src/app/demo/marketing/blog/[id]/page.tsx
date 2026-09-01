import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import MarketingNav from '@/app/dashboard/marketing/MarketingNav';
import PostEditor from '@/app/dashboard/marketing/blog/[id]/PostEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit post — Live Demo' };

export default async function DemoBlogPostPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const rootDomain = DEMO_SITE_HOST.split('.').slice(1).join('.');
  const blog = await loadBlogWorkspace(demoSupabase, DEMO_ACCOUNT_ID, rootDomain);

  const post = blog?.posts.find((entry) => entry.id === params.id);
  if (!blog || !post) notFound();

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath="/demo" />

      <nav className="mkt-crumb" aria-label="Breadcrumb">
        <Link href="/demo/marketing/blog">← All posts</Link>
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
