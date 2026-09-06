'use client';

import { useState, useTransition } from 'react';
import type { HaloSettingsRecord, HaloCampaignRecord } from '@/lib/neighborhood-halo-service';
import {
  saveHaloSettingsAction,
  launchManualHaloAction,
  toggleHaloCampaignStateAction,
  previewJobForHaloAction,
} from './halo-actions';

type CompletedJobSummary = {
  id: string;
  ref: string;
  address?: string | null;
  quoted_amount?: number;
  photo_paths?: string[];
};

type Props = {
  businessName: string;
  trade: string;
  city: string;
  domain: string;
  initialSettings?: HaloSettingsRecord;
  initialCampaigns?: HaloCampaignRecord[];
  completedJobs?: CompletedJobSummary[];
};

export default function NeighborhoodHaloDashboardTab({
  businessName,
  trade,
  city,
  domain,
  initialSettings,
  initialCampaigns = [],
  completedJobs = [],
}: Props) {
  const [settings, setSettings] = useState<HaloSettingsRecord>(
    initialSettings || {
      accountId: '',
      autoLaunchEnabled: false,
      defaultRadiusMiles: 1.0,
      perJobBudgetDollars: 25.0,
      monthlySpendCapDollars: 250.0,
      requirePhotos: true,
    }
  );

  const [campaigns, setCampaigns] = useState<HaloCampaignRecord[]>(initialCampaigns);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, startSaveSettings] = useTransition();

  // Manual launch modal state
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>(completedJobs[0]?.id || '');
  const [jobPreview, setJobPreview] = useState<Awaited<ReturnType<typeof previewJobForHaloAction>> | null>(null);
  const [isPreviewLoading, startPreview] = useTransition();
  const [isLaunching, startLaunch] = useTransition();
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSettingsSaved(false);
    setSettingsError(null);
    const formData = new FormData(e.currentTarget);

    startSaveSettings(async () => {
      const res = await saveHaloSettingsAction(formData);
      if (res.success && res.settings) {
        setSettings(res.settings);
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      } else {
        setSettingsError(res.error || 'Failed to save settings');
      }
    });
  };

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setLaunchError(null);
    if (!jobId) {
      setJobPreview(null);
      return;
    }

    startPreview(async () => {
      try {
        const preview = await previewJobForHaloAction(jobId);
        setJobPreview(preview);
      } catch (err) {
        setLaunchError(err instanceof Error ? err.message : 'Failed to preview job.');
      }
    });
  };

  const handleLaunchCampaign = () => {
    if (!selectedJobId) return;
    setLaunchError(null);

    startLaunch(async () => {
      const res = await launchManualHaloAction(selectedJobId, {
        radiusMiles: settings.defaultRadiusMiles,
        budgetDollars: settings.perJobBudgetDollars,
      });

      if (res.success && res.campaign) {
        setCampaigns((prev) => [res.campaign!, ...prev]);
        setShowLaunchModal(false);
        setJobPreview(null);
      } else {
        setLaunchError(res.error || 'Unable to launch campaign');
      }
    });
  };

  const handleToggleState = async (campaignId: string, action: 'pause' | 'resume' | 'kill') => {
    const res = await toggleHaloCampaignStateAction(campaignId, action);
    if (res.success && res.campaign) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? res.campaign! : c))
      );
    }
  };

  const currentMonthSpend = campaigns.reduce((sum, c) => sum + (c.spendDollars || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner & Quick Stats */}
      <div className="panel workspace-section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '1.15rem', margin: 0 }}>📍 Neighborhood Halo 1-Mile Micro-Ads</h3>
              <span style={{ fontSize: '0.72rem', color: settings.autoLaunchEnabled ? '#10b981' : 'var(--muted)', background: settings.autoLaunchEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.55rem', borderRadius: '12px', fontWeight: 700 }}>
                {settings.autoLaunchEnabled ? '⚡ Auto-Launch Active' : '⏸️ Manual Mode'}
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: '0.35rem 0 0' }}>
              Surrounds completed jobs with geofenced micro-ads on Google &amp; Meta. Uses verified site craftsmanship and privacy-sanitized street copy.
            </p>
          </div>

          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setShowLaunchModal(true);
              if (completedJobs[0]?.id && !jobPreview) {
                handleSelectJob(completedJobs[0].id);
              }
            }}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
          >
            + Launch Halo from Completed Job
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Monthly Halo Pacing</span>
            <strong style={{ fontSize: '1.15rem', color: '#10b981' }}>
              ${currentMonthSpend.toFixed(2)} <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>/ ${settings.monthlySpendCapDollars.toFixed(2)} Cap</span>
            </strong>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Active / Total Halos</span>
            <strong style={{ fontSize: '1.15rem' }}>
              {campaigns.filter((c) => c.status === 'active' || c.status === 'simulated_sandbox').length} Active
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}> ({campaigns.length} total)</span>
            </strong>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Neighbor Inquiries Generated</span>
            <strong style={{ fontSize: '1.15rem', color: '#38bdf8' }}>
              {campaigns.reduce((sum, c) => sum + (c.leadsGenerated || 0), 0)} Leads
            </strong>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="panel workspace-section-card">
        <h4 style={{ fontSize: '0.95rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚙️ Halo Campaign Automation &amp; Spend Safeguards
        </h4>

        <form onSubmit={handleSaveSettings}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Auto-Launch on Job Complete
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                <input
                  type="checkbox"
                  name="autoLaunchEnabled"
                  id="autoLaunchEnabled"
                  defaultChecked={settings.autoLaunchEnabled}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="autoLaunchEnabled" style={{ fontSize: '0.82rem', color: 'var(--muted)', cursor: 'pointer' }}>
                  Auto-deploy $25 micro-ad whenever a job is completed
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="defaultRadiusMiles" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Geofence Radius (Miles)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="5.0"
                id="defaultRadiusMiles"
                name="defaultRadiusMiles"
                defaultValue={settings.defaultRadiusMiles}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>

            <div>
              <label htmlFor="perJobBudgetDollars" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Per-Job Budget ($)
              </label>
              <input
                type="number"
                step="5"
                min="10"
                max="100"
                id="perJobBudgetDollars"
                name="perJobBudgetDollars"
                defaultValue={settings.perJobBudgetDollars}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>

            <div>
              <label htmlFor="monthlySpendCapDollars" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Monthly Halo Budget Cap ($)
              </label>
              <input
                type="number"
                step="25"
                min="50"
                max="1000"
                id="monthlySpendCapDollars"
                name="monthlySpendCapDollars"
                defaultValue={settings.monthlySpendCapDollars}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="submit" className="btn secondary" disabled={isSavingSettings} style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
              {isSavingSettings ? 'Saving…' : 'Save Safeguard Settings'}
            </button>
            {settingsSaved ? <span style={{ color: '#10b981', fontSize: '0.82rem' }}>✓ Settings saved</span> : null}
            {settingsError ? <span style={{ color: '#ef4444', fontSize: '0.82rem' }}>{settingsError}</span> : null}
          </div>
        </form>
      </div>

      {/* Campaigns Table */}
      <div className="panel workspace-section-card">
        <h4 style={{ fontSize: '0.95rem', margin: '0 0 1rem' }}>
          📡 Neighborhood Halo Campaigns
        </h4>

        {campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)', fontSize: '0.88rem' }}>
            No Neighborhood Halo campaigns launched yet.
            <div style={{ marginTop: '0.75rem' }}>
              Complete a job with photos or use the button above to launch your first 1-mile halo.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Street &amp; Geofence</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Duration &amp; Pacing</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Spend</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Impr / Clicks</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Leads</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <strong style={{ display: 'block', color: 'var(--text)' }}>📍 {c.streetName}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                        {c.city} · {c.radiusMiles} mi radius
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          background:
                            c.status === 'active'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : c.status === 'simulated_sandbox'
                              ? 'rgba(56, 189, 248, 0.15)'
                              : c.status === 'paused'
                              ? 'rgba(234, 179, 8, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                          color:
                            c.status === 'active'
                              ? '#10b981'
                              : c.status === 'simulated_sandbox'
                              ? '#38bdf8'
                              : c.status === 'paused'
                              ? '#eab308'
                              : 'var(--muted)',
                        }}
                      >
                        {c.status === 'simulated_sandbox' ? 'Sandbox' : c.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div>Day {c.daysActive} of {c.durationDays}</div>
                      <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '0.25rem' }}>
                        <div style={{ width: `${Math.min(100, (c.daysActive / c.durationDays) * 100)}%`, height: '100%', background: '#f97316', borderRadius: '2px' }} />
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      ${c.spendDollars.toFixed(2)} <span style={{ color: 'var(--muted)' }}>/ ${c.budgetDollars.toFixed(2)}</span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {c.impressions} impr / {c.clicks} clicks
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <strong style={{ color: '#10b981' }}>{c.leadsGenerated}</strong>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <a
                          href={`/claim/halo/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'none', padding: '0.25rem 0.5rem', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '4px' }}
                        >
                          View Offer ↗
                        </a>
                        {c.status === 'active' || c.status === 'simulated_sandbox' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleState(c.id, 'pause')}
                            style={{ fontSize: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--muted)', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            Pause
                          </button>
                        ) : null}
                        {c.status === 'paused' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleState(c.id, 'resume')}
                            style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            Resume
                          </button>
                        ) : null}
                        {c.status !== 'completed' && c.status !== 'killed' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleState(c.id, 'kill')}
                            style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            Kill &amp; Refund
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Launch Modal */}
      {showLaunchModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>🚀 Launch Neighborhood Halo Campaign</h3>
              <button
                type="button"
                onClick={() => setShowLaunchModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {launchError ? (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {launchError}
              </div>
            ) : null}

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="halo-completed-jobsite" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Select Completed Jobsite
              </label>
              <select
                id="halo-completed-jobsite"
                value={selectedJobId}
                onChange={(e) => handleSelectJob(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.88rem' }}
              >
                {completedJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.ref} — {j.address || 'Address unrecorded'} (${j.quoted_amount || 0})
                  </option>
                ))}
              </select>
            </div>

            {isPreviewLoading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                Inspecting craftsmanship photos &amp; computing geofence…
              </div>
            ) : jobPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Sanitized Target Street</span>
                    <strong style={{ fontSize: '0.88rem', color: '#38bdf8' }}>📍 {jobPreview.sanitizedAddress}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Qualification Check</span>
                    <strong style={{ fontSize: '0.85rem', color: jobPreview.qualification.qualified ? '#10b981' : '#ef4444' }}>
                      {jobPreview.qualification.qualified ? '✓ Qualified for Halo' : '✕ Not Qualified'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Craftsmanship Photos</span>
                    <span style={{ fontSize: '0.85rem' }}>{jobPreview.photoUrls.length} available</span>
                  </div>
                </div>

                {jobPreview.creative ? (
                  <div style={{ background: 'rgba(249, 115, 22, 0.05)', border: '1px solid rgba(249, 115, 22, 0.25)', borderRadius: '8px', padding: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
                      Generated Ad Copy Preview
                    </span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>
                      {jobPreview.creative.copy.headline}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                      {jobPreview.creative.copy.primaryText}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <span>Micro-Budget: <strong>${settings.perJobBudgetDollars.toFixed(2)}</strong> over 5 days</span>
                  <span>Geofence: <strong>{settings.defaultRadiusMiles} mile radius</strong></span>
                </div>
              </div>
            ) : null}

            {launchError ? (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#f87171', fontSize: '0.82rem', marginBottom: '1rem' }}>
                {launchError}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowLaunchModal(false)}
                style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={isLaunching || !jobPreview?.qualification.qualified}
                onClick={handleLaunchCampaign}
                style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem', fontWeight: 700 }}
              >
                {isLaunching ? 'Deploying Campaign…' : `Deploy $${settings.perJobBudgetDollars.toFixed(2)} Halo →`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
