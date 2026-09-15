import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPlatformBlogPostById } from '@/lib/platform-blog';
import AdminBlogEditor from '../AdminBlogEditor';
import { updateAdminBlogPostAction } from '../actions';
import styles from '../../admin.module.css';

interface EditAdminBlogPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit Article — Blog Admin' };

export default async function EditAdminBlogPage({ params }: EditAdminBlogPageProps) {
  await requireAdmin();
  const { id } = await params;
  const post = await getPlatformBlogPostById(id);

  if (!post) {
    notFound();
  }

  const updateAction = updateAdminBlogPostAction.bind(null, id);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Platform Marketing &amp; Content</p>
        <h1 className={styles.title}>Edit Article: {post.title}</h1>
        <p className={styles.lead}>
          Update article text, headings, metadata, or status. Changes take effect on the live site immediately upon saving.
        </p>
      </header>

      <div className={styles.panel} style={{ padding: '24px' }}>
        <AdminBlogEditor initialPost={post} action={updateAction} isEditing />
      </div>
    </>
  );
}
