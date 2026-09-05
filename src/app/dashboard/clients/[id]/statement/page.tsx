import Link from 'next/link';
import { requireOfficeContextAny } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { getClient, getClientStatement } from '@/lib/clients';
// formatMoneyExact, not formatMoney. The latter documents itself as rounding
// to whole dollars and says to use this one for anything a customer pays --
// three $438.50 jobs printed as three $439 rows over a $1,316 total, and the
// customer is holding the paper.
import { formatMoneyExact } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import PrintButton from './PrintButton';

export const metadata = { title: 'Client statement' };

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const KIND_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  stage: 'Stage payment',
  final: 'Final payment',
  plan_installment: 'Installment',
};
/**
 * Every status the type allows, because the fallback prints the stored value.
 *
 * The render is `STATUS_LABEL[status] || status`, which is the right fallback --
 * a blank where a payment's state should be is worse than an unfamiliar word --
 * but it means an unlisted status reaches the page as the raw database enum.
 * `canceled` was unlisted, so a withdrawn payment printed lowercase "canceled"
 * on a statement a contractor hands to their client.
 *
 * /pay/[id] carries the same map and the same lesson, in its own words: the enum
 * is what gets read aloud, copied, and pasted into an email asking what it
 * means. Kept in step with PaymentStatus by a test rather than by memory.
 */
const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  disputed: 'Disputed',
  // Withdrawn before it reached checkout, and kept as history rather than
  // deleted. British spelling in the label, American in the stored value --
  // matching /pay/[id], which made the same choice.
  canceled: 'Cancelled',
};

export default async function ClientStatementPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const { supabase, accountId } = await requireOfficeContextAny('payments.read', 'reports.read');
  const client = await getClient(supabase, accountId, params.id);

  if (!client) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Client not found.</p>
          <Link href="/dashboard/clients" className="btn secondary">Back to clients</Link>
        </div>
      </main>
    );
  }

  const [statement, { data: account }, { data: site }] = await Promise.all([
    getClientStatement(supabase, accountId, client.id),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, phone').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);
  const businessPhone = site?.phone || null;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <main className="wide-shell workspace-shell statement-page">
      <div className="statement-toolbar no-print">
        <Link href={`/dashboard/clients/${client.id}`} className="btn secondary">← Back to client</Link>
        <PrintButton />
      </div>

      <article className="statement-doc">
        <header className="statement-head">
          <div>
            <h1 className="statement-biz">{businessName}</h1>
            {businessPhone ? <p className="statement-sub">{businessPhone}</p> : null}
          </div>
          <div className="statement-title">
            <span>Statement</span>
            <span className="statement-date">{today}</span>
          </div>
        </header>

        <section className="statement-billto">
          <p className="statement-label">Statement for</p>
          <p className="statement-client">{client.name}</p>
          <p className="statement-sub">
            {[client.phone ? formatPhoneDashes(client.phone) : null, client.email, client.address].filter(Boolean).join(' · ') || '—'}
          </p>
        </section>

        <section className="statement-totals">
          <div className="statement-total-box">
            <span>Agreed</span>
            <strong>{formatMoneyExact(statement.totalQuoted)}</strong>
          </div>
          <div className="statement-total-box">
            <span>Paid</span>
            <strong className="pos">{formatMoneyExact(statement.totalPaid)}</strong>
          </div>
          <div className="statement-total-box">
            <span>Balance</span>
            {/* A NEGATIVE balance is not good news styled green. It means the
                customer has paid more than the agreed amount -- usually sales
                tax pushing Paid above Agreed -- and they are owed money, which
                is a different conversation from "nothing due". Only exactly
                zero is settled. */}
            <strong className={statement.outstanding > 0 ? 'due' : statement.outstanding < 0 ? 'credit' : 'pos'}>
              {formatMoneyExact(statement.outstanding)}
            </strong>
            {statement.outstanding < 0 ? <span className="statement-credit-note">Credit owed to customer</span> : null}
          </div>
        </section>

        <h2 className="statement-section-title">Jobs</h2>
        <table className="statement-table">
          <thead>
            <tr><th>Job</th><th>Date</th><th className="num">Agreed</th><th className="num">Paid</th><th className="num">Balance</th></tr>
          </thead>
          <tbody>
            {statement.jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.ref}</td>
                <td>{fmtDate(job.date)}</td>
                <td className="num">{formatMoneyExact(job.quoted)}</td>
                <td className="num">{formatMoneyExact(job.paid)}</td>
                <td className="num">{formatMoneyExact(job.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num">{formatMoneyExact(statement.totalQuoted)}</td>
              <td className="num">{formatMoneyExact(statement.totalPaid)}</td>
              <td className="num">{formatMoneyExact(statement.outstanding)}</td>
            </tr>
          </tfoot>
        </table>

        {statement.payments.length > 0 ? (
          <>
            <h2 className="statement-section-title">Payment history</h2>
            <table className="statement-table">
              <thead>
                <tr><th>Date</th><th>For</th><th>Type</th><th>Status</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {statement.payments.map((payment) => (
                  <tr key={payment.id} className={payment.status === 'paid' ? '' : 'muted-row'}>
                    <td>{fmtDate(payment.at)}</td>
                    <td>{payment.jobRef}</td>
                    <td>{payment.label || KIND_LABEL[payment.kind] || payment.kind}</td>
                    <td>{STATUS_LABEL[payment.status] || payment.status}</td>
                    <td className="num">{formatMoneyExact(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <footer className="statement-foot">
          <p>Thank you for your business. Questions about this statement? Reach out to {businessName}{businessPhone ? ` at ${businessPhone}` : ''}.</p>
        </footer>
      </article>
    </main>
  );
}
