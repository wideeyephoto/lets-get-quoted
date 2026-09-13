import { requireAdmin } from '@/lib/auth';
import AdminBlogEditor from '../AdminBlogEditor';
import { createAdminBlogPostAction } from '../actions';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New Article — Blog Admin' };

export default async function NewAdminBlogPage() {
  await requireAdmin();

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Platform Marketing &amp; Content</p>
        <h1 className={styles.title}>Compose New Article</h1>
        <p className={styles.lead}>
          Draft a new strategic playbook or tactical guide for trade business owners on <code>letsgetquoted.com/blog</code>.
        </p>
      </header>

      <div className={styles.panel} style={{ padding: '24px' }}>
        <AdminBlogEditor action={createAdminBlogPostAction} isEditing={false} />
      </div>
    </>
  );
}
