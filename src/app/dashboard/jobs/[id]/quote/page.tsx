import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { getJob, parseQuoteItems, formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import PrintButton from '@/components/print-button';

export const metadata = { title: 'Quote' };

export default async function QuotePrintPage({ params }: { params: { id: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, params.id);

  if (!job) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Job not found.</p>
          <Link href="/dashboard/jobs" className="btn secondary">Back to jobs</Link>
        </div>
      </main>
    );
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, phone, license').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);
  const businessPhone = site?.phone || null;
  const license = site?.license || null;

  const items = parseQuoteItems(job.quote_items);
  const baseItems = items.filter((item) => item.kind === 'base');
  const addonItems = items.filter((item) => item.kind === 'addon');
  const baseTotal = baseItems.reduce((sum, item) => sum + item.amount, 0);
  const hasItems = items.length > 0;
  const estimateTotal = hasItems ? baseTotal : Number(job.quoted_amount) || 0;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <main className="wide-shell workspace-shell statement-page">
      <div className="statement-toolbar no-print">
        <Link href={`/dashboard/jobs/${job.id}`} className="btn secondary">← Back to job</Link>
        <PrintButton label="🖨 Print / Save estimate" />
      </div>

      <article className="statement-doc">
        <header className="statement-head">
          <div>
            <h1 className="statement-biz">{businessName}</h1>
            {businessPhone ? <p className="statement-sub">{businessPhone}</p> : null}
            {license ? <p className="statement-sub">Lic. {license}</p> : null}
          </div>
          <div className="statement-title">
            <span>Estimate</span>
            <span className="statement-date">{job.ref} · {today}</span>
          </div>
        </header>

        <section className="statement-billto">
          <p className="statement-label">Prepared for</p>
          <p className="statement-client">{job.client_name}</p>
          <p className="statement-sub">
            {[job.client_phone ? formatPhoneDashes(job.client_phone) : null, job.client_email, job.address].filter(Boolean).join(' · ') || '—'}
          </p>
        </section>

        {job.scope ? (
          <section className="quote-scope">
            <p className="statement-label">Scope of work</p>
            <p>{job.scope}</p>
          </section>
        ) : null}

        {hasItems ? (
          <>
            <h2 className="statement-section-title">Included</h2>
            <table className="statement-table">
              <thead>
                <tr><th>Item</th><th className="num">Price</th></tr>
              </thead>
              <tbody>
                {baseItems.length > 0 ? baseItems.map((item) => (
                  <tr key={item.id}><td>{item.label}</td><td className="num">{formatMoney(item.amount)}</td></tr>
                )) : (
                  <tr><td className="muted-row">No included items</td><td className="num">—</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr><td>Estimate total</td><td className="num">{formatMoney(estimateTotal)}</td></tr>
              </tfoot>
            </table>

            {addonItems.length > 0 ? (
              <>
                <h2 className="statement-section-title">Optional add-ons</h2>
                <table className="statement-table">
                  <thead>
                    <tr><th>Add-on</th><th className="num">Price</th></tr>
                  </thead>
                  <tbody>
                    {addonItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.label}{item.recommended ? <span className="quote-recommend"> ★ Recommended</span> : null}</td>
                        <td className="num">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="statement-sub">Add-ons are optional and not included in the estimate total above.</p>
              </>
            ) : null}
          </>
        ) : (
          <table className="statement-table">
            <tbody>
              <tr><td>Quoted work{job.scope ? '' : ''}</td><td className="num">{formatMoney(estimateTotal)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>Estimate total</td><td className="num">{formatMoney(estimateTotal)}</td></tr>
            </tfoot>
          </table>
        )}

        <footer className="statement-foot">
          <p>This estimate is valid for 30 days. To approve, reply to {businessName}{businessPhone ? ` at ${businessPhone}` : ''} or approve online from the link we sent you. Thank you!</p>
        </footer>
      </article>
    </main>
  );
}
