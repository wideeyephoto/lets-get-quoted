'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import MarketingNav from '../MarketingNav';
import {
  CAMPAIGN_LINK_PRESETS,
  buildCampaignUrl,
  buildCampaignQrSvg,
  type CampaignLinkPresetId,
} from '@/lib/campaign-roi';
import styles from './LinkBuilderScreen.module.css';

type SavedTrackingCampaign = {
  id: string;
  name: string;
  source: string;
  medium: string;
  placement: string;
  url: string;
  visits: number;
  leads: number;
  wonJobs: number;
  revenue: number;
  createdAt: string;
};

const INITIAL_SAVED_CAMPAIGNS: SavedTrackingCampaign[] = [
  {
    id: 'track-1',
    name: 'Jobsite Yard Signs',
    source: 'yard_sign',
    medium: 'print_qr',
    placement: 'Customer Front Lawn',
    url: 'https://example.com/estimate?utm_source=yard_sign&utm_medium=print_qr&utm_campaign=jobsite_yard_signs',
    visits: 142,
    leads: 18,
    wonJobs: 7,
    revenue: 24500,
    createdAt: '2026-08-15',
  },
  {
    id: 'track-2',
    name: 'Van & Truck Rear Window QR',
    source: 'truck_wrap',
    medium: 'vehicle_qr',
    placement: 'Fleet Graphics',
    url: 'https://example.com/estimate?utm_source=truck_wrap&utm_medium=vehicle_qr&utm_campaign=fleet_branding',
    visits: 89,
    leads: 11,
    wonJobs: 4,
    revenue: 16200,
    createdAt: '2026-08-10',
  },
  {
    id: 'track-3',
    name: 'Instagram Bio Link',
    source: 'instagram',
    medium: 'social_bio',
    placement: 'Profile Bio',
    url: 'https://example.com/estimate?utm_source=instagram&utm_medium=social_bio&utm_campaign=ig_bio',
    visits: 215,
    leads: 24,
    wonJobs: 9,
    revenue: 31000,
    createdAt: '2026-08-01',
  },
];

type Props = {
  defaultBaseUrl: string;
  businessName: string;
  basePath?: string;
  navOnly?: string[];
};

export default function LinkBuilderScreen({
  defaultBaseUrl,
  businessName,
  basePath = '/dashboard',
  navOnly,
}: Props) {
  const [savedCampaigns, setSavedCampaigns] = useState<SavedTrackingCampaign[]>(INITIAL_SAVED_CAMPAIGNS);
  const [showBuilder, setShowBuilder] = useState(false);

  const [selectedPresetId, setSelectedPresetId] = useState<CampaignLinkPresetId>('yard_sign');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || 'https://example.com');
  const [source, setSource] = useState('yard_sign');
  const [medium, setMedium] = useState('print_qr');
  const [campaign, setCampaign] = useState('spring_yard_signs_2026');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [promo, setPromo] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedPreset = useMemo(
    () => CAMPAIGN_LINK_PRESETS.find((p) => p.id === selectedPresetId) ?? CAMPAIGN_LINK_PRESETS[0],
    [selectedPresetId]
  );

  const handleSelectPreset = (presetId: CampaignLinkPresetId) => {
    setSelectedPresetId(presetId);
    const preset = CAMPAIGN_LINK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    if (preset.category === 'onsite') {
      setSource('');
      setMedium('onsite');
      setCampaign('');
      setPromo(preset.suggestedCampaign);
    } else {
      setSource(preset.defaultSource);
      setMedium(preset.defaultMedium);
      setCampaign(preset.suggestedCampaign);
      setPromo('');
    }
  };

  const generatedUrl = useMemo(
    () =>
      buildCampaignUrl({
        baseUrl,
        source: source.trim() || undefined,
        medium: medium.trim() || undefined,
        campaign: campaign.trim() || undefined,
        content: content.trim() || undefined,
        term: term.trim() || undefined,
        promo: promo.trim() || undefined,
      }),
    [baseUrl, source, medium, campaign, content, term, promo]
  );

  const qrSvg = useMemo(() => buildCampaignQrSvg(generatedUrl, 200), [generatedUrl]);

  const handleCopy = async (urlToCopy = generatedUrl) => {
    if (!urlToCopy) return;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQr = (name = campaign) => {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${name || 'campaign'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${businessName} - Campaign QR Code</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              text-align: center;
              padding: 2rem;
            }
            .qr-card {
              border: 3px solid #0f172a;
              border-radius: 16px;
              padding: 2rem;
              max-width: 400px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
            p { color: #475569; margin: 0 0 1.5rem; font-size: 0.95rem; }
            .url { font-size: 0.75rem; color: #64748b; word-break: break-all; margin-top: 1rem; }
            @media print {
              body { padding: 0; }
              .qr-card { border: 2px solid #000; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="qr-card">
            <h1>${businessName}</h1>
            <p>Scan with your phone camera for an instant quote</p>
            ${qrSvg}
            <div class="url">${generatedUrl}</div>
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveCampaign = () => {
    const newCamp: SavedTrackingCampaign = {
      id: `track-${Date.now()}`,
      name: campaign ? campaign.replace(/_/g, ' ') : selectedPreset.name,
      source: source || 'custom',
      medium: medium || 'link',
      placement: selectedPreset.name,
      url: generatedUrl,
      visits: 0,
      leads: 0,
      wonJobs: 0,
      revenue: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setSavedCampaigns((prev) => [newCamp, ...prev]);
    setShowBuilder(false);
  };

  // Metrics summary
  const totalVisits = savedCampaigns.reduce((acc, c) => acc + c.visits, 0);
  const totalLeads = savedCampaigns.reduce((acc, c) => acc + c.leads, 0);
  const totalWonJobs = savedCampaigns.reduce((acc, c) => acc + c.wonJobs, 0);
  const totalRevenue = savedCampaigns.reduce((acc, c) => acc + c.revenue, 0);

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      {/* Header */}
      <section className="workspace-hero panel marketing-hero" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Closed-Loop Attribution</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Tracking
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              See which ads, signs, vehicle wraps, and promotions produce jobs and revenue.
            </p>
          </div>

          <button
            type="button"
            className="btn primary"
            onClick={() => setShowBuilder((prev) => !prev)}
            style={{ fontWeight: 700 }}
          >
            {showBuilder ? '✕ Close Builder' : '+ New Tracking Link'}
          </button>
        </div>
      </section>

      {/* 1. Tracking Results Summary */}
      <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Active Links &amp; QR</span>
          <strong className="mkt-tile-value">{savedCampaigns.length}</strong>
          <span className="mkt-tile-note">Tracked touchpoints</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Total Visits &amp; Scans</span>
          <strong className="mkt-tile-value">{totalVisits}</strong>
          <span className="mkt-tile-note">Visitor traffic</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Attributed Leads</span>
          <strong className="mkt-tile-value">{totalLeads}</strong>
          <span className="mkt-tile-note">Quote submissions</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Won Jobs</span>
          <strong className="mkt-tile-value">{totalWonJobs}</strong>
          <span className="mkt-tile-note">Closed contracts</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Attributed Revenue</span>
          <strong className="mkt-tile-value">${totalRevenue.toLocaleString()}</strong>
          <span className="mkt-tile-note">Direct sales ROI</span>
        </article>
      </div>

      {/* 2. New Link & QR Builder Section (Expandable or open) */}
      {showBuilder ? (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <div>
              <p className="eyebrow">Creator</p>
              <h2>Create New Tracking Link &amp; QR</h2>
            </div>
          </div>

          <div className={styles.container}>
            {/* Left Column: Form & Presets */}
            <div>
              <div className={styles.presetSection}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', display: 'block' }}>
                  1. Choose a promotion channel
                </label>
                <div className={styles.presetGrid}>
                  {CAMPAIGN_LINK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`${styles.presetCard} ${selectedPresetId === preset.id ? styles.active : ''}`}
                      onClick={() => handleSelectPreset(preset.id)}
                    >
                      <div className={styles.presetHead}>
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                      </div>
                      <span className={styles.presetDesc}>{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="base-url">Destination Page URL</label>
                  <input
                    id="base-url"
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://yourbusiness.com/estimate"
                  />
                </div>

                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="utm-campaign">Campaign Name</label>
                  <input
                    id="utm-campaign"
                    type="text"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                    placeholder="e.g. Spring Yard Signs 2026"
                  />
                  <span className={styles.fieldHint}>Descriptive name for your reporting.</span>
                </div>

                {/* Advanced Parameters Details */}
                <details className="workspace-details" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                  <summary className="workspace-details-summary">Advanced tracking parameters (UTM tags)</summary>
                  <div className={styles.formGrid} style={{ marginTop: '0.75rem' }}>
                    <div className={styles.field}>
                      <label htmlFor="utm-source">Source (utm_source)</label>
                      <input id="utm-source" value={source} onChange={(e) => setSource(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-medium">Medium (utm_medium)</label>
                      <input id="utm-medium" value={medium} onChange={(e) => setMedium(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-content">Creative Variant (utm_content)</label>
                      <input id="utm-content" value={content} onChange={(e) => setContent(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-term">Keyword (utm_term)</label>
                      <input id="utm-term" value={term} onChange={(e) => setTerm(e.target.value)} />
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {/* Right Column: Live Output & QR Preview */}
            <div className={styles.previewPanel}>
              <section className={styles.urlBox}>
                <div className={styles.urlHead}>
                  <span>Trackable Campaign URL</span>
                  {copied && <span className={styles.toastSuccess}>✓ Copied</span>}
                </div>
                <div className={styles.urlDisplay}>{generatedUrl}</div>
                <div className={styles.urlActions}>
                  <button type="button" className="btn primary" onClick={() => handleCopy(generatedUrl)}>
                    {copied ? '✓ Copied' : 'Copy Link'}
                  </button>
                  <button type="button" className="btn secondary" onClick={handleSaveCampaign}>
                    💾 Save Campaign
                  </button>
                </div>
              </section>

              <section className={styles.qrBox}>
                <div
                  className={styles.qrWrap}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  aria-label="Generated Campaign QR Code"
                />
                <div className={styles.qrMeta}>
                  <strong>{selectedPreset.name}</strong>
                  <span>High-DPI SVG for sign printing</span>
                </div>
                <div className={styles.qrActions}>
                  <button type="button" className="btn secondary" onClick={() => handleDownloadQr(campaign)}>
                    Download SVG QR
                  </button>
                  <button type="button" className="btn ghost" onClick={handlePrint}>
                    🖨️ Print Sign
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Saved Campaigns Table */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Campaign Directory</p>
            <h2>Saved Tracking Touchpoints</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{savedCampaigns.length} campaigns active</span>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--muted)' }}>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Campaign Name</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Source / Type</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Visits</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Leads</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Won Jobs</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>Revenue</th>
                <th style={{ padding: '0.65rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {savedCampaigns.map((camp) => (
                <tr key={camp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <strong style={{ display: 'block', fontSize: '0.86rem', color: 'var(--foreground)' }}>
                      {camp.name}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Created {camp.createdAt}</span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.74rem' }}>
                      {camp.source} · {camp.medium}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{camp.visits}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#38bdf8' }}>{camp.leads}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#10b981' }}>{camp.wonJobs}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>${camp.revenue.toLocaleString()}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn ghost btn-sm"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => handleCopy(camp.url)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="btn ghost btn-sm"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => handleDownloadQr(camp.name)}
                      >
                        QR
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
