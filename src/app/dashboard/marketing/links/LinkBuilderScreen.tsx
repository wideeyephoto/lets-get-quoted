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
  const [selectedPresetId, setSelectedPresetId] = useState<CampaignLinkPresetId>('facebook_ad');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || 'https://example.com');
  const [source, setSource] = useState('facebook');
  const [medium, setMedium] = useState('paid_social');
  const [campaign, setCampaign] = useState('summer_roofing_sale');
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

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQr = () => {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${campaign || source || 'campaign'}.svg`;
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

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Tracking & Links</p>
          <h1 className="workspace-title">Campaign Link &amp; QR Code Builder</h1>
          <p className="workspace-lead">
            Create trackable URLs and printable high-resolution QR codes for social ads, search campaigns, yard signs, and truck decals.
          </p>
        </div>
      </section>

      <div className={styles.container}>
        {/* Left Column: Form & Presets */}
        <section className="panel workspace-section-card">
          <div className={styles.presetSection}>
            <div className="section-heading workspace-section-heading compact-heading">
              <h2>1. Choose a channel preset</h2>
            </div>
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

          <div className="section-heading workspace-section-heading compact-heading">
            <h2>2. Customize parameters</h2>
          </div>

          <div className={styles.formGrid}>
            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label htmlFor="base-url">Landing Page URL</label>
              <input
                id="base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://yourbusiness.com/estimate"
              />
              <span className={styles.fieldHint}>The page on your website where visitors will land.</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="utm-source">Source (utm_source)</label>
              <input
                id="utm-source"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="facebook, google, yard_sign"
              />
              <span className={styles.fieldHint}>Where the visitor came from (platform or placement).</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="utm-medium">Medium (utm_medium)</label>
              <input
                id="utm-medium"
                type="text"
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                placeholder="cpc, paid_social, print_qr"
              />
              <span className={styles.fieldHint}>Marketing medium or channel type.</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="utm-campaign">Campaign Name (utm_campaign)</label>
              <input
                id="utm-campaign"
                type="text"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="summer_roofing_promo"
              />
              <span className={styles.fieldHint}>The promotion or seasonal effort.</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="utm-content">Creative / Variant (utm_content)</label>
              <input
                id="utm-content"
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="video_ad_1, lawn_sign_5x3"
              />
              <span className={styles.fieldHint}>Optional: differentiate ads or sign designs.</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="utm-term">Keyword / Term (utm_term)</label>
              <input
                id="utm-term"
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="emergency roof repair"
              />
              <span className={styles.fieldHint}>Optional: paid search keyword.</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="promo-tag">Intra-Site Promo (promo)</label>
              <input
                id="promo-tag"
                type="text"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="spring_special"
              />
              <span className={styles.fieldHint}>Optional: onsite discount or banner code.</span>
            </div>
          </div>
        </section>

        {/* Right Column: Live Output & QR Preview */}
        <div className={styles.previewPanel}>
          <section className={styles.urlBox}>
            <div className={styles.urlHead}>
              <span>Generated Campaign URL</span>
              {copied && <span className={styles.toastSuccess}>✓ Copied to clipboard</span>}
            </div>
            <div className={styles.urlDisplay}>{generatedUrl}</div>
            <div className={styles.urlActions}>
              <button type="button" className="btn primary" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy Link'}
              </button>
              <a href={generatedUrl} target="_blank" rel="noopener noreferrer" className="btn ghost">
                Test Link ↗
              </a>
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
              <span>Ready for high-DPI print collateral and signs</span>
            </div>
            <div className={styles.qrActions}>
              <button type="button" className="btn secondary" onClick={handleDownloadQr}>
                Download SVG QR
              </button>
              <button type="button" className="btn ghost" onClick={handlePrint}>
                🖨️ Print Sign Preview
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
