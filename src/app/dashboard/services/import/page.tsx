import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import SmartImport from '@/components/smart-import';
import { analyzeServicesImport, previewServicesImport, commitServicesImport, ocrPriceBookAction } from './actions';

export const metadata = { title: 'Import your services' };

export const dynamic = 'force-dynamic';

export default async function ImportServicesPage() {
  await requireOwnerContext();

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Price book</p>
          <h1 className="workspace-title">Import your services &amp; rate sheets</h1>
          <p className="workspace-lead">
            Bring your service list and prices over in one step. Upload a CSV or Excel spreadsheet, paste
            rows directly, or <strong>snap a photo of a paper rate sheet, service menu, or catalog using AI OCR</strong>.
            We match names, prices, units, and descriptions automatically, show you the preview, and import only once you confirm.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/services" className="btn secondary">← Back to price book</Link>
          </div>
        </div>
      </section>

      <SmartImport
        fields={[
          { key: 'name', label: 'Name' },
          { key: 'unit_price', label: 'Price' },
          { key: 'unit', label: 'Unit' },
          { key: 'description', label: 'Description' },
        ]}
        noun={{ one: 'service', many: 'services' }}
        analyze={analyzeServicesImport}
        runPreview={previewServicesImport}
        commit={commitServicesImport}
        onOcrFile={ocrPriceBookAction}
        ocrLabel="Rate Sheet &amp; Price Book AI OCR Scanner"
        doneHref="/dashboard/services"
        doneLabel="View your price book"
      />

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Format</p>
          <h2>What we read</h2>
        </div>
        <ul className="workspace-card-copy" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>
            <strong>📷 Photos &amp; Scans (AI OCR):</strong> Snap a photo or upload an image (<strong>.jpg</strong>, <strong>.png</strong>, <strong>.webp</strong>) of your printed price list, laminated truck sheet, or supplier catalog. Our vision model transcribes every service item, unit price, and description automatically.
          </li>
          <li>
            <strong>📊 Spreadsheets:</strong> Upload a <strong>.csv</strong> or <strong>Excel</strong> file (<strong>.xlsx</strong>), or paste raw rows — any column names or order.
          </li>
          <li>We match <strong>name</strong>, <strong>price</strong>, <strong>unit</strong>, and <strong>description</strong> automatically, and you can reassign any column before importing.</li>
          <li>Units map to one of <em>each</em>, <em>hour</em>, <em>sqft</em>, <em>visit</em>, or <em>job</em> (anything else defaults to <em>each</em>).</li>
          <li>Each service needs a name — rows without one are skipped.</li>
          <li>Services already in your price book (same name) are skipped, so re-importing is safe.</li>
        </ul>
      </section>
    </main>
  );
}
