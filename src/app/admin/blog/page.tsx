import { requireAdmin } from '@/lib/auth';
import { getPlatformBlogPosts, BLOG_CATEGORIES } from '@/lib/platform-blog';
import AdminBlogClient from './AdminBlogClient';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog & Editorial — Admin' };

export default async function AdminBlogPage() {
  await requireAdmin();

  const posts = await getPlatformBlogPosts({ status: 'all' });
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const draftCount = posts.filter((p) => p.status === 'draft').length;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Platform Marketing &amp; Content</p>
        <h1 className={styles.title}>Blog &amp; Editorial Management</h1>
        <p className={styles.lead}>
          Create, edit, and publish straight-talk tactical articles to the public blog (<code>letsgetquoted.com/blog</code>). Changes update the live site and RSS/JSON feeds immediately.
        </p>
      </header>

      {/* Top Metric Cards */}
      <section className={styles.cardGrid} aria-label="Blog summary" style={{ marginBottom: '1.4rem' }}>
        <div className={`${styles.panel} ${styles.statCard} ${styles.accentAmber}`}>
          <span className={styles.statValue}>{posts.length}</span>
          <span className={styles.statLabel}>Total Articles</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            Across {BLOG_CATEGORIES.length} strategic categories
          </span>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentEmerald}`}>
          <span className={styles.statValue}>{publishedCount}</span>
          <span className={styles.statLabel}>Live Published</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            Broadcasting on /blog &amp; RSS feed
          </span>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentBlue}`}>
          <span className={styles.statValue}>{draftCount}</span>
          <span className={styles.statLabel}>In Draft</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            Visible via staff preview only
          </span>
        </div>
      </section>

      {/* Main Content Management Area */}
      <div className={styles.panel} style={{ padding: '24px' }}>
        <AdminBlogClient posts={posts} />
      </div>
    </>
  );
}
