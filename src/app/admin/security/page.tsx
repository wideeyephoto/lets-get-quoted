import { requireAdmin } from '@/lib/auth';
import MfaPanel from './MfaPanel';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security' };

export default async function AdminSecurityPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ step_up?: string; permission?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { adminEmail, userId } = await requireAdmin();
  return <>
    <header className={styles.pageHead}><p className={styles.eyebrow}>Access</p><h1 className={styles.title}>Security</h1><p className={styles.lead}>Verify with a passkey to unlock high-impact staff actions. Keep an authenticator app as your backup.</p></header>
    {searchParams.permission ? <p className={styles.muted}>Requested permission: <code>{searchParams.permission}</code></p> : null}
    <MfaPanel stepUp={searchParams.step_up === '1'} accountEmail={adminEmail} accountId={userId} />
  </>;
}
