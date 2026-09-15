const fs = require('fs');

let page = fs.readFileSync('src/app/portal/view/[token]/page.tsx', 'utf-8');

// 1. T11: Metrics Nav
const metricsReplacement = `
            {/* Quick Metrics Index */}
            <div className="portal-metrics-bar" style={{ position: 'sticky', top: '1rem', zIndex: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              {portal.outstanding > 0 ? (
                <a href="#portal-section-2" className="payment-amount-block" style={{ margin: 0, padding: '0.55rem 0.9rem', textDecoration: 'none' }}>
                  <span className="payment-amount-label">
                    Balance due{openInvoices.length > 1 ? \` · \${openInvoices.length} invoices\` : ''}
                  </span>
                  <strong className="payment-amount" style={{ fontSize: '1.25rem' }}>{formatMoney(portal.outstanding)}</strong>
                </a>
              ) : null}

              {pendingQuotes.length > 0 ? (
                <a href="#portal-section-3" className="portal-metric-card portal-metric-pending" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label portal-metric-pending-label">Quotes to Review</span>
                  <strong className="portal-metric-value portal-metric-pending-value">{pendingQuotes.length} pending</strong>
                </a>
              ) : portal.quotes.length > 0 ? (
                <a href="#portal-section-3" className="portal-metric-card" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label">Quotes</span>
                  <strong className="portal-metric-value">{portal.quotes.length} total</strong>
                </a>
              ) : null}

              {activePlans.length > 0 ? (
                <a href="#portal-section-4" className="portal-metric-card portal-metric-active" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label portal-metric-active-label">Active Service Plans</span>
                  <strong className="portal-metric-value portal-metric-active-value">{activePlans.length} active</strong>
                </a>
              ) : portal.plans.length > 0 ? (
                <a href="#portal-section-4" className="portal-metric-card" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label">Service Plans</span>
                  <strong className="portal-metric-value">{portal.plans.length} total</strong>
                </a>
              ) : null}

              {portal.documents.length > 0 ? (
                <a href="#portal-section-7" className="portal-metric-card" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label">Documents</span>
                  <strong className="portal-metric-value">{portal.documents.length} vault</strong>
                </a>
              ) : null}

              {portal.warranties.length > 0 ? (
                <a href="#portal-section-9" className="portal-metric-card" style={{ textDecoration: 'none' }}>
                  <span className="portal-metric-label">Warranties</span>
                  <strong className="portal-metric-value">{portal.warranties.length} active</strong>
                </a>
              ) : null}
            </div>
`;
page = page.replace(/<div className="portal-metrics-bar">[\s\S]*?<\/div>\s*<div className="actions workspace-actions portal-home-actions">/, metricsReplacement.trim() + '\n\n            <div className="actions workspace-actions portal-home-actions">');

// 2. T11: Collapse history
page = page.replace(
  `          {portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : (
            <ul className="portal-job-list portal-history">
              {portal.jobs.map((job) => (
                <li key={job.id} className={\`portal-job status-\${job.status}\`}>
                  <div className="portal-job-main">
                    <strong>{job.scope || job.ref || 'Work'}</strong>
                    <span className="portal-job-meta">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.completedAt ? \` · finished \${formatDay(job.completedAt)}\` : job.scheduledFor ? \` · \${formatDay(job.scheduledFor)}\` : ''}
                      {job.address ? \` · \${job.address}\` : ''}
                    </span>
                  </div>
                  {job.quotedAmount > 0 ? <span className="portal-job-amount">{formatMoney(job.quotedAmount)}</span> : null}
                </li>
              ))}
            </ul>
          )}`,
  `          {portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : portal.jobs.length > 5 ? (
            <details className="portal-history-details">
              <summary className="portal-history-summary">View all {portal.jobs.length} past jobs</summary>
              <ul className="portal-job-list portal-history">
                {portal.jobs.map((job) => (
                  <li key={job.id} className={\`portal-job status-\${job.status}\`}>
                    <div className="portal-job-main">
                      <strong>{job.scope || job.ref || 'Work'}</strong>
                      <span className="portal-job-meta">
                        {STATUS_LABEL[job.status] ?? job.status}
                        {job.completedAt ? \` · finished \${formatDay(job.completedAt)}\` : job.scheduledFor ? \` · \${formatDay(job.scheduledFor)}\` : ''}
                        {job.address ? \` · \${job.address}\` : ''}
                      </span>
                    </div>
                    {job.quotedAmount > 0 ? <span className="portal-job-amount">{formatMoney(job.quotedAmount)}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <ul className="portal-job-list portal-history">
              {portal.jobs.map((job) => (
                <li key={job.id} className={\`portal-job status-\${job.status}\`}>
                  <div className="portal-job-main">
                    <strong>{job.scope || job.ref || 'Work'}</strong>
                    <span className="portal-job-meta">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.completedAt ? \` · finished \${formatDay(job.completedAt)}\` : job.scheduledFor ? \` · \${formatDay(job.scheduledFor)}\` : ''}
                      {job.address ? \` · \${job.address}\` : ''}
                    </span>
                  </div>
                  {job.quotedAmount > 0 ? <span className="portal-job-amount">{formatMoney(job.quotedAmount)}</span> : null}
                </li>
              ))}
            </ul>
          )}`
);

// 3. T11: Collapse receipts
const receiptsRegex = /(<section aria-labelledby="portal-section-10"[^>]*>[\s\S]*?<h2 id="portal-section-10">What you&apos;ve paid<\/h2>\s*<\/div>\s*)([\s\S]*?)(<\/section>)/;
const match = page.match(receiptsRegex);
if (match) {
  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];

  const receiptsWrapper = `{portal.payments.length + settledInvoices.length > 5 ? (
              <details className="portal-history-details">
                <summary className="portal-history-summary">View all {portal.payments.length + settledInvoices.length} receipts</summary>
                ${body.trim()}
              </details>
            ) : (
              <>
                ${body.trim()}
              </>
            )}`;
  page = page.replace(receiptsRegex, prefix + receiptsWrapper + '\n        ' + suffix);
}

// 4. T12: Messages
if (!page.includes("import { PortalMessageThread }")) {
  page = page.replace("import { PortalMessageForm } from './PortalMessageForm';", "import { PortalMessageForm } from './PortalMessageForm';\nimport { PortalMessageThread } from './PortalMessageThread';");
}

const threadRegex = /(<h2 id="portal-section-8">Messages with \{portal\.businessName\}<\/h2>\s*<\/div>\s*)([\s\S]*?)(<\/section>)/;
const threadMatch = page.match(threadRegex);
if (threadMatch) {
  const prefix = threadMatch[1];
  const body = threadMatch[2];
  const suffix = threadMatch[3];
  
  const threadComponent = `
          <PortalMessageThread 
            token={params.token} 
            businessName={portal.businessName} 
            accountId={access.accountId} 
            initialMessages={portal.messages.slice(0, 15)} 
            jobs={portal.jobs.map((j) => ({ id: j.id, ref: j.ref, scope: j.scope }))} 
          />
  `;

  page = page.replace(threadRegex, prefix + threadComponent + '\n        ' + suffix);
}

fs.writeFileSync('src/app/portal/view/[token]/page.tsx', page);
