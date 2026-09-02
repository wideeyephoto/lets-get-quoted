import type { Metadata } from 'next';
import Image from 'next/image';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import { TRADES } from '@/lib/trades';
import styles from './ai-vision.module.css';

export const metadata: Metadata = {
  title: 'AI Vision & Photo Job Estimator for Contractors',
  description:
    'Turn project photos into accurate scopes, material pick-lists, and instant price ranges. Multimodal AI photo analysis for contractor intake and field inspection.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-vision' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-vision',
    siteName: "Let's Get Quoted",
    title: 'Turn job photos into instant scopes and material pick-lists',
    description:
      'AI photo inspection reads damage, recognizes equipment models, drafts material lists, and grounds estimate ranges before you step on site.',
    images: [{ url: '/features/og-ai-vision.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted AI Vision for Contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Turn job photos into instant scopes and material pick-lists',
    description:
      'AI photo inspection reads damage, recognizes equipment models, drafts material lists, and grounds estimate ranges before you step on site.',
    images: ['/features/og-ai-vision.jpg'],
  },
};

function VisionInspectorSimulator() {
  return (
    <div className={styles.visionSimulator}>
      <div className={styles.visionHeader}>
        <div>
          <span className={styles.visionBadge}>✦ Multimodal AI Vision Engine</span>
          <h4 className={styles.visionTitle}>Photo Scope &amp; Equipment Diagnostic</h4>
        </div>
        <span className={styles.confidencePill}>98.4% Detection Confidence</span>
      </div>

      <div className={styles.photoGrid}>
        {/* Photo Box 1: Equipment Model OCR */}
        <div className={styles.photoBox}>
          <div className={styles.photoPlaceholder}>
            <Image
              src="/images/ai-vision/furnace-rating-plate.jpg"
              alt="Carrier gas furnace rating plate OCR inspection showing model 59TP6B and 80,000 BTU input"
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className={styles.photoImg}
              priority
            />
            <div className={styles.photoScanOverlay} aria-hidden="true" />
            <div className={styles.cameraHudCornerTopLeft} />
            <div className={styles.cameraHudCornerTopRight} />
            <div className={styles.cameraHudCornerBottomLeft} />
            <div className={styles.cameraHudCornerBottomRight} />
            <span className={styles.photoLabel}>furnace-rating-plate.jpg</span>
            <div className={styles.detectionBox} style={{ top: '16%', left: '14%', width: '54%', height: '68%' }}>
              <span className={styles.detectionLabel}>OCR: Carrier 59TP6B · Gas 80k BTU</span>
            </div>
          </div>
          <div className={styles.photoMeta}>
            <div className={styles.metaRow}>
              <b>Equipment Identified:</b>
              <span className={styles.metaTag}>Carrier Performance 96%</span>
            </div>
            <small>80,000 BTU &middot; Variable-Speed 2-Stage &middot; Manufactured 2014</small>
          </div>
        </div>

        {/* Photo Box 2: Defect / Corrosion Diagnostic */}
        <div className={styles.photoBox}>
          <div className={styles.photoPlaceholder}>
            <Image
              src="/images/ai-vision/secondary-coil-rust.jpg"
              alt="Close-up inspection photo of secondary coil showing severe flame rollout rust and corrosion breach"
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className={styles.photoImg}
              priority
            />
            <div className={styles.photoScanOverlay} aria-hidden="true" />
            <div className={styles.cameraHudCornerTopLeft} />
            <div className={styles.cameraHudCornerTopRight} />
            <div className={styles.cameraHudCornerBottomLeft} />
            <div className={styles.cameraHudCornerBottomRight} />
            <span className={styles.photoLabel}>secondary-coil-rust.jpg</span>
            <div className={styles.detectionBoxDefect} style={{ top: '20%', left: '8%', width: '60%', height: '62%' }}>
              <span className={styles.detectionLabelDefect}>Hazard: Severe Flame Rollout Corrosion</span>
            </div>
          </div>
          <div className={styles.photoMeta}>
            <div className={styles.metaRow}>
              <b>Diagnostic Finding:</b>
              <span className={styles.metaTagDanger}>Coil Failure Imminent</span>
            </div>
            <small>Corrosion breach on heat exchanger; replacement flagged for client safety</small>
          </div>
        </div>
      </div>

      {/* Extracted Scope & Pick-List */}
      <div className={styles.pickListContainer}>
        <div className={styles.pickListHead}>
          <span className={styles.pickListTitle}>Generated Material Pick-List &amp; Scope</span>
          <span className={styles.groundedPrice}>Estimated Scope: $4,800 – $6,200</span>
        </div>
        <ul className={styles.pickListItems}>
          <li>
            <span className={styles.itemCheck}>✓</span>
            <span><strong>Primary Unit:</strong> Carrier Infinity 80k BTU 96% Variable Stage Furnace</span>
          </li>
          <li>
            <span className={styles.itemCheck}>✓</span>
            <span><strong>Flue &amp; Venting:</strong> 2-pipe PVC concentric vent kit (2-inch diameter)</span>
          </li>
          <li>
            <span className={styles.itemCheck}>✓</span>
            <span><strong>Condensate Pump:</strong> Little Giant 1/30 HP with safety cutoff switch</span>
          </li>
          <li>
            <span className={styles.itemCheck}>✓</span>
            <span><strong>Filter Media:</strong> 16x25x4 MERV 11 cabinet upgrade</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: 'How does AI Vision analyze customer photos and videos?',
    a: 'When homeowners submit photos or videos via your smart intake form, or when your crew takes photos on site, our multimodal vision model identifies key elements: equipment brand and model plates, spatial dimensions, physical damage, and clearance hazards.',
  },
  {
    q: 'Do I or my customers need an iPhone with LiDAR to get 3D measurements?',
    a: 'No. Our AI Vision engine calculates 3D room boundaries, alcove spans, and ceiling clearances from standard video or photos on ANY smartphone (iPhone or Android) with zero app download. If you or your field crew happen to use an iPhone 12–16 Pro or iPad Pro with hardware LiDAR, you can also upload native CAD point clouds (Apple RoomPlan, Polycam, Canvas 3D) for instant millimeter-precision takeoffs.',
  },
  {
    q: 'How do roof and exterior 3D measurements work?',
    a: 'Roof and exterior measurements are calculated automatically using high-resolution aerial satellite LiDAR via Google Solar API. The moment you enter a job address, the system maps roof pitch, facets, and square counts without requiring you to climb a ladder or fly a drone.',
  },
  {
    q: 'Can it read serial numbers and equipment rating plates?',
    a: 'Yes. It performs OCR on HVAC rating plates, electrical panel specs, water heater manufacturer tags, and plumbing fittings, pulling exact tonnage, amperages, and serial details automatically.',
  },
  {
    q: 'Does it create material pick-lists for supply houses?',
    a: 'Yes. Based on the diagnosed scope and trade, it suggests the exact supplies and fittings needed, allowing you to copy a supply run list in one tap.',
  },
  {
    q: 'Can we generate printable visual inspection reports for homeowners?',
    a: 'Yes. Every photo inspection generates a client-facing PDF report with labeled photo callouts, inspection checklists, and recommendations that build trust and close high-ticket jobs faster.',
  },
];

export default function AiVisionPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI Vision Estimator', path: '/features/ai-vision' }}
      eyebrow="Multimodal AI Vision & Photo Estimator"
      title={
        <>
          Turn job photos into <em>instant scopes and material lists.</em>
        </>
      }
      lede="Stop guessing job requirements from vague phone calls. AI photo analysis identifies equipment models, calculates square footage, spots hazards, and drafts material pick-lists before you step on site."
      heroNote={`Trained for ${TRADES.length} trades · High-resolution OCR on equipment plates · One-click PDF inspection reports`}
      heroChips={['Photo Damage Detection', 'Serial & Rating Plate OCR', 'Instant Material Pick-Lists']}
      primary={{ label: 'Start Free Platform Trial', href: 'https://app.letsgetquoted.com/start?goal=feature&feature=ai_intake&source=feature_page' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Automated Photo Scope & Equipment Diagnostic"
          note="Live multimodal analysis of homeowner intake photos. Detects rating plates, rust cracking, and generates an itemized material pick-list."
        >
          <VisionInspectorSimulator />
        </ExampleFrame>
      }
      proof={[
        { title: 'Equipment OCR', body: 'Reads model plates, BTUs, tonnage, and amps automatically.' },
        { title: 'Material Pick-Lists', body: 'Converts photo analysis into supply house shopping lists.' },
        { title: 'Inspection Checklists', body: 'Generates branded PDF photo inspection reports for clients.' },
        { title: 'Accurate Ranges', body: 'Grounds price ranges in real visual job complexity.' },
      ]}
      story={{
        eyebrow: 'A picture is worth an accurate quote',
        title: 'Quote faster by seeing the job before you drive.',
        body: 'Driving 45 minutes to discover a job needs a 200-amp service upgrade or a specialized flange burns your profit. AI Vision identifies job complexities from homeowner intake photos, so you arrive with the right parts, the right crew, and an accurate price from day one.',
      }}
      benefits={[
        {
          title: 'Instant Scope Recognition',
          body: 'Detects repair vs. replacement needs, roof pitch and square counts, plumbing pipe materials (PEX vs. Copper vs. Galvanized), and electrical panel capacities.',
        },
        {
          title: 'Automated Supply Pick-Lists',
          body: 'Translates photo findings directly into an itemized parts list, ready to send to your distributor or load onto the truck.',
        },
        {
          title: 'Client-Facing Photo Reports',
          body: 'Export branded visual inspection PDFs with labeled photo callouts, giving homeowners transparent proof of needed repairs.',
        },
      ]}
      stepsEyebrow="From uploaded photo to approved quote"
      stepsTitle="Four intelligent vision steps"
      steps={[
        {
          title: '01 · Homeowner or crew snaps photos',
          body: 'Uploads via Smart Intake or directly from the field app with no app download required.',
        },
        {
          title: '02 · AI scans equipment & damage',
          body: 'Multimodal vision models identify model numbers, wear patterns, and safety hazards.',
        },
        {
          title: '03 · Pick-list & price range generated',
          body: 'The system drafts an itemized materials checklist and realistic labor hours.',
        },
        {
          title: '04 · One-tap quote & PDF report',
          body: 'Convert the vision scope directly into an approved estimate with photo proof attached.',
        },
      ]}
      cta={{
        title: 'Turn job site photos into approved quotes.',
        note: 'AI photo scope analysis included with Smart Intake and the Field App.',
      }}
    >
      <section className="section-block" aria-labelledby="vision-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Before you turn it on</p>
          <h2 id="vision-faq-title">The questions contractors ask us.</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {FAQ.map((item, index) => (
            <details key={item.q} open={index === 0} style={{ padding: '1rem', background: 'var(--bg-surface-elevated, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>{item.q}</summary>
              <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, fontSize: '0.9375rem' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
