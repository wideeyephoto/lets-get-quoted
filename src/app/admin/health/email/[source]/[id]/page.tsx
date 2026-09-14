import { randomUUID } from 'node:crypto';
import { staffCan } from '@/lib/staff';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import styles from '../../../../admin.module.css';
import { resolveEmailSend, resendDocumentEmail } from './actions';

export default async function EmailSendRecoveryDetail(props: { params: Promise<{ source: string; id: string }> }) {
  const params = await props.params;
  const { staff } = await requireAdmin();
  const canManage = staffCan(staff, 'ops.manage');
  if (params.source !== 'lifecycle' && params.source !== 'document' && params.source !== 'customer') {
    notFound();
  }

  const admin = createAdminClient();
  const table = params.source === 'lifecycle' ? 'contractor_lifecycle_sends' : params.source === 'customer' ? 'customer_email_sends' : 'document_email_sends';
  const { data, error } = await admin.from(table).select('*').eq('id', params.id).single();

  if (error || !data) {
    notFound();
  }

  const handleResolve = resolveEmailSend.bind(null, params.source, params.id);
  const handleResend = resendDocumentEmail.bind(null, params.id);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>Inspect & Resolve Email Send</h1>
        <p>Source: {params.source} | ID: {params.id}</p>
        <Link href="/admin/health#email-recovery">Back to Health Dashboard</Link>
      </header>

      <div className={styles.panel}>
        <h2>Send Details</h2>
        <div className={styles.detailGrid}>
          <div><strong>State:</strong> {data.state}</div>
          <div><strong>Phase:</strong> {data.phase}</div>
          <div><strong>Attempts:</strong> {data.attempts}</div>
          <div><strong>First Attempt:</strong> {new Date(data.first_attempt_at).toLocaleString()}</div>
          {data.next_retry_at && <div><strong>Next Retry:</strong> {new Date(data.next_retry_at).toLocaleString()}</div>}
          {data.accepted_at && <div><strong>Accepted At:</strong> {new Date(data.accepted_at).toLocaleString()}</div>}
          {data.provider_id && <div><strong>Provider ID:</strong> {data.provider_id}</div>}
          {data.last_error && <div><strong>Last Error:</strong> {data.last_error}</div>}
          {data.resolved_by && <div><strong>Resolved By:</strong> {data.resolved_by}</div>}
          {data.resolution && <div><strong>Resolution:</strong> {data.resolution}</div>}
          {data.resolved_at && <div><strong>Resolved At:</strong> {new Date(data.resolved_at).toLocaleString()}</div>}
        </div>
        <p className={styles.muted}>Payloads are redacted for privacy.</p>
        
        {canManage && data.state !== 'accepted' && data.state !== 'cancelled' && (
          <form action={handleResolve}>
            <h3>Evidence-backed Closeout</h3>
            <label>
              Evidence (Required):
              <input type="text" name="evidence" required className={styles.input} />
            </label>
            <br/>
            <label>
              Provider ID (Optional):
              <input type="text" name="provider_id" className={styles.input} />
            </label>
            <br/>
            <button type="submit">Resolve</button>
          </form>
        )}
        {(canManage && params.source === 'document' && (data.state === 'accepted' || data.state === 'cancelled')) && (
          <form action={handleResend}>
            <input type="hidden" name="request_id" value={randomUUID()} />
            <h3>Deliberate Resend</h3>
            <p>Resend this unchanged document. A new tracked send will be created.</p>
            <button type="submit">Resend</button>
          </form>
        )}
      </div>
    </div>
  );
}
