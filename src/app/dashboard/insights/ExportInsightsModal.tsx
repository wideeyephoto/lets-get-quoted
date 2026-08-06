import ModalDialog from '@/components/modal-dialog';

// The header's "Export report" control. A thin wrapper around the app's shared
// ModalDialog (portal, Escape, backdrop-close, scroll-lock, focus to the close
// button) whose body is the format picker. The two working formats are plain
// download links to /api/export/insights carrying the current window/from/to, so
// the file matches exactly what is on screen. Excel is shown disabled — there is
// no .xlsx writer installed, and CSV opens in Excel anyway.
//
// No client hooks of its own, so it stays a server component; ModalDialog is the
// only client boundary.
export default function ExportInsightsModal({ query, periodLabel }: { query: string; periodLabel: string }) {
  const suffix = query ? `&${query}` : '';

  return (
    <ModalDialog
      triggerClassName="ins-export"
      triggerLabel={
        <>
          <span aria-hidden="true">⬇</span> Export report
        </>
      }
      title="Export insights"
    >
      <p className="ins-export-intro">
        A snapshot of <strong>{periodLabel.toLowerCase()}</strong> — the same figures on screen, ready to file or share.
      </p>

      <ul className="ins-export-formats">
        <li>
          <a className="ins-export-opt" href={`/api/export/insights?format=pdf${suffix}`} download>
            <span className="ins-export-opt-ic" aria-hidden="true">📄</span>
            <span className="ins-export-opt-body">
              <span className="ins-export-opt-title">
                Business Performance PDF <span className="ins-export-tag">Recommended</span>
              </span>
              <span className="ins-export-opt-sub">Every card in one formatted report.</span>
            </span>
          </a>
        </li>
        <li>
          <a className="ins-export-opt" href={`/api/export/insights?format=csv${suffix}`} download>
            <span className="ins-export-opt-ic" aria-hidden="true">▦</span>
            <span className="ins-export-opt-body">
              <span className="ins-export-opt-title">CSV — all metrics</span>
              <span className="ins-export-opt-sub">Every figure as rows, for your own spreadsheet.</span>
            </span>
          </a>
        </li>
        <li>
          <span className="ins-export-opt is-disabled" aria-disabled="true">
            <span className="ins-export-opt-ic" aria-hidden="true">▥</span>
            <span className="ins-export-opt-body">
              <span className="ins-export-opt-title">Excel (.xlsx)</span>
              <span className="ins-export-opt-sub">Not available yet — the CSV above opens straight into Excel.</span>
            </span>
          </span>
        </li>
      </ul>

      <p className="ins-export-foot">
        Approximations stay labeled inside the report: revenue by service, age-based payment health, and
        delivery-only marketing.
      </p>
    </ModalDialog>
  );
}
