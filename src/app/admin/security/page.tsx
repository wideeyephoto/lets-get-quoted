import { requireAdmin } from '@/lib/auth';
import MfaPanel from './MfaPanel';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security' };

export default async function AdminSecurityPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ step_up?: string; permission?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  await requireAdmin();
  return <>
    <header className={styles.pageHead}><p className={styles.eyebrow}>Access</p><h1 className={styles.title}>Security</h1><p className={styles.lead}>High-impact staff actions require an authenticator-verified session. Enrollment and verification happen directly with the authentication provider.</p></header>
    {searchParams.permission ? <p className={styles.muted}>Requested permission: <code>{searchParams.permission}</code></p> : null}
    <MfaPanel stepUp={searchParams.step_up === '1'} />
  </>;
}
