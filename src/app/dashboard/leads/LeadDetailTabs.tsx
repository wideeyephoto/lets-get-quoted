'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { LeadDetailDto } from '@/lib/lead-detail';
import { isContactablePhone } from '@/lib/lead-queue';
import type { LeadVisualAnalysis } from '@/lib/lead-photo-ai';
import type { LeadViewItem } from './LeadsWorkspace';
import { PropertyDossierCard } from '@/components/property-intel/PropertyDossierCard';
import { PermitFeasibilityCard } from '@/components/permits/PermitFeasibilityCard';
import { RoomScanViewer } from '@/components/property-intel/RoomScanViewer';
import { shouldDisplayRoomSpatialScan } from '@/lib/property-intel/profile';
import { useRouter } from 'next/navigation';
import { updateLeadAddressAction, updateLeadContactAction } from './actions';
import { QuickEditAddressModal, QuickEditContactModal, quickEditStyles } from '@/components/quick-edit';
import styles from '../focus.module.css';
import leadStyles from './leads.module.css';

/**
 * The six detail panels behind a lead — Overview, Property & Roof, Request, Activity, Photos,
 * Quote & visit.
 *
 * Lifted out of LeadFocusView unchanged so Focus and Smoothie render the same
 * content from the same code. It keeps focus.module.css: these panels ARE the
 * Focus look, and Smoothie is meant to look like Focus rather than like a
 * second design.
 *
 * The one addition is `headingLevel`. Focus passes nothing and gets the h4s it
 * always had; Smoothie passes 3, because its pane heading is an h2 and h2 → h4
 * is a level skip. Everything else about the markup is identical.
 */

export const LEAD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'property', label: 'Property Intel' },
  { id: 'request', label: 'Request' },
  { id: 'activity', label: 'Activity' },
  { id: 'photos', label: 'Photos' },
  { id: 'quote', label: 'Quote & visit' },
] as const;

export type LeadTabId = (typeof LEAD_TABS)[number]['id'];

export function LeadDetailSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function Head({ level, children }: { level: 3 | 4; children: ReactNode }) {
  return level === 3 ? <h3>{children}</h3> : <h4>{children}</h4>;
}

export default function LeadDetailTabs({
  tab,
  detail,
  lead,
  base,
  headingLevel = 4,
  onSelectTab,
}: {
  tab: LeadTabId;
  detail: LeadDetailDto;
  lead: LeadViewItem;
  base: string;
  headingLevel?: 3 | 4;
  onSelectTab?: (tab: LeadTabId) => void;
}) {
  const H = headingLevel;
  const router = useRouter();
  const [copiedPickList, setCopiedPickList] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  function copyPickListToClipboard(analysis: LeadVisualAnalysis) {
    const lines = [
      `SUPPLY HOUSE PICK-LIST:`,
      `Project / Equipment: ${analysis.detectedEquipment.map((e) => [e.brand, e.type, e.specs].filter(Boolean).join(' ')).join(', ') || 'General Service'}`,
      '',
      ...analysis.suggestedPickList.map((item) => `• [${item.category}] ${item.name}${item.quantity ? ` (${item.quantity})` : ''}${item.notes ? ` — ${item.notes}` : ''}`),
    ];
    if (analysis.safetyOrCodeFlags.length > 0) {
      lines.push('', 'CODE & SAFETY ITEMS:');
      lines.push(...analysis.safetyOrCodeFlags.map((f) => `⚠️ ${f}`));
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPickList(true);
      setTimeout(() => setCopiedPickList(false), 2500);
    }
  }

  if (tab === 'overview') {
    const contactablePhone = isContactablePhone(detail.phoneDigits);
    const leadScope = [detail.projectType, detail.message].filter(Boolean).join(' ');

    return (
      <div className={styles.grid}>
        {/* 1. Customer Request & Message (Front & Center) */}
        <section
          className={styles.card}
          style={{
            gridColumn: '1 / -1',
            background: 'linear-gradient(180deg, rgba(255, 122, 33, 0.07), rgba(var(--tint), 0.02) 65%)',
            borderColor: 'var(--cedge-orange-66, rgba(255, 122, 33, 0.4))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <Head level={H}>💬 Customer Request &amp; Scope</Head>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={leadStyles.flagChip} style={{ background: 'rgba(255, 122, 33, 0.18)', color: 'var(--accent-ink, #ff7a21)', fontWeight: 750 }}>
                {detail.projectType || 'General Service'}
              </span>
              {detail.sourceLabel && (
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                  via {detail.sourceLabel}{detail.sourcePage ? ` (${detail.sourcePage})` : ''}
                </span>
              )}
            </div>
          </div>
          {detail.message ? (
            <blockquote
              className={styles.quote}
              style={{
                margin: '0.4rem 0 0.6rem',
                fontSize: '0.94rem',
                lineHeight: '1.5',
                color: 'var(--text)',
                borderLeft: '3px solid var(--accent, #ff7a21)',
                paddingLeft: '0.85rem',
              }}
            >
              &ldquo;{detail.message}&rdquo;
            </blockquote>
          ) : (
            <p className={styles.muted} style={{ margin: '0.35rem 0 0.6rem', fontStyle: 'italic' }}>
              No written message left during intake.
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.2rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span>Received: <strong style={{ color: 'var(--text)' }}>{detail.createdAtLabel}</strong></span>
            {onSelectTab && (
              <button
                type="button"
                onClick={() => onSelectTab('request')}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-orange-8, #ff7a21)', fontSize: '0.76rem', fontWeight: 650, cursor: 'pointer' }}
              >
                View full intake details →
              </button>
            )}
          </div>
        </section>

        {/* 2. Photo Evidence Strip & Visual AI Preview */}
        {detail.photos.length > 0 ? (
          <section className={styles.card} style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <Head level={H}>📸 Project Photos &amp; Visual Evidence ({detail.photoCount})</Head>
              {onSelectTab && (
                <button
                  type="button"
                  onClick={() => onSelectTab('photos')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-orange-8, #ff7a21)', fontSize: '0.76rem', fontWeight: 650, cursor: 'pointer' }}
                >
                  Open photo gallery ({detail.photoCount}) →
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', overflowX: 'auto', paddingBottom: '0.3rem' }}>
              {detail.photos.slice(0, 5).map((photo, idx) => {
                const isVideo = photo.path.endsWith('.mp4') || photo.path.endsWith('.mov') || photo.path.endsWith('.webm') || photo.url.includes('video/');
                return (
                  <div
                    key={photo.path || idx}
                    onClick={() => onSelectTab?.('photos')}
                    style={{
                      position: 'relative',
                      width: '84px',
                      height: '84px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      flexShrink: 0,
                      cursor: 'pointer',
                      border: '1px solid var(--edge-t14)',
                      background: '#05080d',
                    }}
                    title="Click to open photo gallery"
                  >
                    {isVideo ? (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: '1.4rem' }}>
                        ▶
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt={`Evidence ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    )}
                    {idx === 4 && detail.photoCount > 5 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.68)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 750, fontSize: '0.85rem' }}>
                        +{detail.photoCount - 4}
                      </div>
                    )}
                  </div>
                );
              })}
              {detail.visualAnalysis && (
                <div style={{ flex: 1, minWidth: '220px', padding: '0.2rem 0.65rem', borderLeft: '2px solid var(--edge-t14)', fontSize: '0.82rem', color: 'var(--mute-t75)' }}>
                  <strong style={{ color: 'var(--text)', display: 'block', fontSize: '0.78rem', marginBottom: '0.2rem' }}>AI Visual Inspection:</strong>
                  <p style={{ margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {detail.visualAnalysis.summary}
                  </p>
                  {detail.visualAnalysis.detectedEquipment.length > 0 && (
                    <div className={styles.chips} style={{ marginTop: '0.3rem' }}>
                      {detail.visualAnalysis.detectedEquipment.slice(0, 2).map((eq, i) => (
                        <span className={leadStyles.flagChip} key={i} style={{ background: 'rgba(96,165,250,.15)', color: 'var(--ink-sky-5)', fontSize: '0.7rem' }}>
                          🏷️ {[eq.brand, eq.type].filter(Boolean).join(' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section
            className={styles.card}
            style={{
              gridColumn: '1 / -1',
              padding: '0.65rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              📷 <strong>No homeowner photos attached.</strong> Photos help scope the work before driving out.
            </span>
            <Link
              href={`${base}/leads/${detail.id}?details=photos#lead-photos-modal`}
              className={styles.cardLink}
              style={{ marginTop: 0, fontSize: '0.78rem' }}
            >
              + Add site photos
            </Link>
          </section>
        )}

        {/* 3. Property & Municipal Permit Feasibility Snapshot */}
        {detail.address ? (
          <section className={styles.card} style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <Head level={H}>🏛️ Property Intel &amp; Permit Feasibility</Head>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={quickEditStyles.quickEditBtn}
                  onClick={() => setIsEditingAddress(true)}
                  aria-label="Edit project address"
                >
                  Edit address
                </button>
                {onSelectTab && (
                  <button
                    type="button"
                    onClick={() => onSelectTab('property')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-orange-8, #ff7a21)', fontSize: '0.76rem', fontWeight: 650, cursor: 'pointer' }}
                  >
                    Open 3D Property Intel &amp; Satellite →
                  </button>
                )}
              </div>
            </div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Site location: <strong style={{ color: 'var(--text)' }}>{detail.address}</strong>
            </p>
            <PermitFeasibilityCard address={detail.address} isLead={true} />
          </section>
        ) : (
          <section className={styles.card} style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <Head level={H}>🏛️ Property Intel &amp; Address</Head>
              <button
                type="button"
                className={quickEditStyles.quickEditBtn}
                onClick={() => setIsEditingAddress(true)}
                aria-label="Add project address"
              >
                Edit address
              </button>
            </div>
            <p className={styles.muted} style={{ margin: 0 }}>
              No project address on file yet. Add an address to unlock property intel, aerial imagery, and permit checks.
            </p>
          </section>
        )}

        {/* 4. Latest Touchpoint & Activity */}
        <section className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
            <Head level={H}>Recent Activity</Head>
            {detail.contactCount > 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(var(--tint), 0.1)', color: 'var(--text)' }}>
                {detail.contactCount} logged
              </span>
            )}
          </div>
          {detail.contactLog.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 650, color: 'var(--text)' }}>
                {detail.contactLog[0].label}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                {detail.contactLog[0].at}
              </div>
              {detail.contactLog[0].note && (
                <p style={{ fontSize: '0.8rem', color: 'var(--mute-t75)', margin: '0.35rem 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
                  &ldquo;{detail.contactLog[0].note}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <p className={styles.muted}>No touchpoints logged yet — reach out to customer.</p>
          )}
          <div style={{ marginTop: '0.65rem' }}>
            {onSelectTab && detail.contactLog.length > 0 ? (
              <button
                type="button"
                onClick={() => onSelectTab('activity')}
                className={styles.cardLink}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                View all touchpoints ({detail.contactCount}) →
              </button>
            ) : null}
          </div>
        </section>

        {/* 5. Estimate Visit & Quote Status */}
        <section className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
            <Head level={H}>Quote &amp; Estimate Visit</Head>
            {detail.convertedJob ? (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', background: 'rgba(74, 222, 128, 0.18)', color: 'var(--good, #22c55e)' }}>
                Job Converted
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)' }}>
                {detail.quoteVisit ? 'Visit Booked' : 'Unscheduled'}
              </span>
            )}
          </div>
          {detail.quoteVisit ? (
            <dl className={styles.defs} style={{ gap: '0.3rem' }}>
              <div><dt>Visit</dt><dd>{detail.quoteVisit.whenLabel} ({detail.quoteVisit.durationLabel})</dd></div>
              <div><dt>Confirmed</dt><dd>{detail.quoteVisit.confirmedLabel ? `Texted ${detail.quoteVisit.confirmedLabel}` : 'Not texted yet'}</dd></div>
            </dl>
          ) : (
            <p className={styles.muted}>No estimate visit booked on calendar.</p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
            <Link className={styles.cardLink} href={`${base}/leads/${detail.id}#availability-snapshot`} style={{ marginTop: 0 }}>
              {detail.quoteVisit ? 'Change visit →' : 'Book a visit →'}
            </Link>
            <Link
              className={styles.cardLink}
              href={detail.convertedJob ? `${base}/jobs/${detail.convertedJob.id}` : `${base}/leads/${detail.id}#lead-estimate`}
              style={{ marginTop: 0 }}
            >
              {detail.convertedJob ? `Job ${detail.convertedJob.ref} →` : 'Create quote →'}
            </Link>
          </div>
        </section>

        {/* 6. Client Contact & Relationship History */}
        <section className={styles.card}>
          <div className={quickEditStyles.cardHeadRow}>
            <Head level={H}>Client &amp; Contact</Head>
            <button
              type="button"
              className={quickEditStyles.quickEditBtn}
              onClick={() => setIsEditingContact(true)}
              aria-label="Edit contact details"
            >
              Edit contact
            </button>
          </div>
          <dl className={styles.defs}>
            <div>
              <dt>Phone</dt>
              <dd>
                {contactablePhone ? (
                  <a href={`tel:${detail.phoneDigits}`}>{detail.phone}</a>
                ) : detail.phone ? (
                  <>{detail.phone} <Link href={`${base}/leads/${detail.id}?edit=client#lead-edit-modal`}>Fix phone</Link></>
                ) : 'Not on file'}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Not on file'}</dd>
            </div>
            <div>
              <dt>History</dt>
              <dd>
                {detail.history && (detail.history.jobs > 0 || detail.history.leads > 0) ? (
                  <span style={{ color: 'var(--gold-ink)', fontWeight: 700 }}>
                    Repeat ({detail.history.jobs} jobs, {detail.history.leads} leads)
                  </span>
                ) : (
                  <span className={styles.muted}>First-time customer</span>
                )}
              </dd>
            </div>
          </dl>
          {detail.textOnly && <p className={styles.muted} style={{ marginTop: '0.4rem', color: 'var(--ink-orange-3)' }}>💬 Customer requested text messages first.</p>}
        </section>

        {/* 7. Visual AI Analysis & Supply House Materials (if available) */}
        {detail.visualAnalysis && (
          <section className={styles.card} style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <Head level={H}>📸 Visual AI Analysis &amp; Materials Pick-List</Head>
              {detail.visualAnalysis.suggestedPickList.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyPickListToClipboard(detail.visualAnalysis!)}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '0.24rem 0.6rem',
                    borderRadius: '5px',
                    border: '1px solid var(--cedge-orange-66, rgba(255,122,33,0.4))',
                    background: copiedPickList ? 'rgba(74,222,128,0.18)' : 'rgba(255,122,33,0.08)',
                    color: copiedPickList ? 'var(--good, #22c55e)' : 'var(--accent-ink, #ff7a21)',
                    cursor: 'pointer',
                  }}
                >
                  {copiedPickList ? '✓ Copied to Clipboard!' : '📋 Copy Supply Pick-List'}
                </button>
              )}
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text)', marginBottom: '0.6rem', lineHeight: '1.45' }}>
              <strong>Visual Summary:</strong> {detail.visualAnalysis.summary}
            </p>
            {detail.visualAnalysis.detectedEquipment.length > 0 && (
              <div style={{ marginBottom: '0.6rem' }}>
                <strong style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute-t60)' }}>Detected Equipment</strong>
                <div className={styles.chips} style={{ marginTop: '0.25rem' }}>
                  {detail.visualAnalysis.detectedEquipment.map((eq, i) => (
                    <span className={leadStyles.flagChip} key={i} style={{ background: 'rgba(96,165,250,.15)', color: 'var(--ink-sky-5)' }}>
                      🏷️ {[eq.brand, eq.type, eq.specs].filter(Boolean).join(' ')} {eq.approxAgeYears ? `(~${eq.approxAgeYears} yrs old)` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {detail.visualAnalysis.observedIssues.length > 0 && (
              <div style={{ marginBottom: '0.6rem' }}>
                <strong style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute-t60)' }}>Observed Damage &amp; Conditions</strong>
                <ul style={{ margin: '0.2rem 0 0 1.2rem', padding: 0, fontSize: '0.82rem', color: 'var(--mute-t75)' }}>
                  {detail.visualAnalysis.observedIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {detail.visualAnalysis.suggestedPickList.length > 0 && (
              <div style={{ marginBottom: '0.6rem' }}>
                <strong style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute-t60)' }}>Supply House Materials Pick-List</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem', marginTop: '0.3rem' }}>
                  {detail.visualAnalysis.suggestedPickList.map((item, i) => (
                    <div key={i} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--edge-t10)', borderRadius: '6px', fontSize: '0.78rem', background: 'rgba(var(--tint), .02)' }}>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--mute-t50)', display: 'block' }}>{item.category}</span>
                      <strong>{item.name}</strong> {item.quantity ? `(${item.quantity})` : ''}
                      {item.notes && <div style={{ color: 'var(--mute-t50)', fontSize: '0.72rem', marginTop: '0.15rem' }}>{item.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detail.visualAnalysis.safetyOrCodeFlags.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <strong style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--bad)' }}>⚠️ Code Compliance &amp; Safety Items</strong>
                <ul style={{ margin: '0.2rem 0 0 1.2rem', padding: 0, fontSize: '0.82rem', color: 'var(--bad)' }}>
                  {detail.visualAnalysis.safetyOrCodeFlags.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <QuickEditContactModal
          isOpen={isEditingContact}
          onClose={() => setIsEditingContact(false)}
          title="Edit contact details"
          initialPhone={detail.phone}
          initialEmail={detail.email}
          onSave={async (phone, email) => {
            await updateLeadContactAction(detail.id, phone, email);
            router.refresh();
          }}
        />

        <QuickEditAddressModal
          isOpen={isEditingAddress}
          onClose={() => setIsEditingAddress(false)}
          title="Edit project address"
          label="Project address"
          initialAddress={detail.address || detail.location}
          onSave={async (address) => {
            await updateLeadAddressAction(detail.id, address);
            router.refresh();
          }}
        />
      </div>
    );
  }

  if (tab === 'property') {
    const leadScope = [detail.projectType, detail.message].filter(Boolean).join(' ');
    const displayConfig = shouldDisplayRoomSpatialScan({
      scope: leadScope,
    });

    return (
      <div style={{ maxWidth: '720px' }}>
        {detail.address ? (
          <>
            <PropertyDossierCard
              address={detail.address}
              scope={leadScope}
            />
            <PermitFeasibilityCard address={detail.address} isLead={true} />
            <RoomScanViewer scope={leadScope} />
          </>
        ) : (
          <>
            <p className={styles.muted}>No address on file for this lead to fetch exterior property intelligence.</p>
            <RoomScanViewer scope={leadScope} />
          </>
        )}
      </div>
    );
  }

  if (tab === 'request') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <Head level={H}>Project request</Head>
          <dl className={styles.defs}>
            <div><dt>Type</dt><dd>{detail.projectType || 'General service'}</dd></div>
            <div><dt>Source</dt><dd>{detail.sourceLabel}</dd></div>
            {detail.sourcePage && <div><dt>From page</dt><dd>{detail.sourcePage}</dd></div>}
          </dl>
          {detail.message ? (
            <>
              <p className={styles.label} style={{ marginTop: '0.8rem' }}>Customer message</p>
              <blockquote className={styles.quote}>{detail.message}</blockquote>
            </>
          ) : (
            <p className={styles.muted} style={{ marginTop: '0.8rem' }}>No written message left.</p>
          )}
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return detail.contactLog.length === 0 ? (
      <p className={styles.muted}>No touchpoints logged yet — log a call or text when you reach out.</p>
    ) : (
      <>
        <ul className={styles.activityList}>
          {detail.contactLog.map((entry, index) => (
            <li key={index}>
              <strong>{entry.label}</strong>
              <time>{entry.at}</time>
              {entry.note && <p>{entry.note}</p>}
            </li>
          ))}
        </ul>
        {detail.contactCount > detail.contactLog.length && (
          <p className={styles.muted} style={{ marginTop: '0.7rem' }}>
            Showing the last {detail.contactLog.length} of {detail.contactCount}.{' '}
            <Link href={`${base}/leads/${detail.id}#lead-activity`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  if (tab === 'photos') {
    // Photos the homeowner sent with the request — often the only way to know
    // what the job actually is before you drive out to it.
    return detail.photos.length === 0 ? (
      <p className={styles.muted}>They didn&rsquo;t send any photos with this request.</p>
    ) : (
      <>
        {detail.visualAnalysis && (
          <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', border: '1px solid var(--edge-t12)', borderRadius: '8px', background: 'rgba(var(--tint), .025)' }}>
            <strong style={{ fontSize: '0.86rem', color: 'var(--text)' }}>📸 AI Visual Inspection</strong>
            <p style={{ margin: '0.3rem 0 0.5rem', fontSize: '0.82rem', color: 'var(--mute-t75)', lineHeight: '1.45' }}>
              {detail.visualAnalysis.summary}
            </p>
            {detail.visualAnalysis.detectedEquipment.length > 0 && (
              <div className={styles.chips} style={{ marginTop: '0.3rem' }}>
                {detail.visualAnalysis.detectedEquipment.map((eq, i) => (
                  <span className={leadStyles.flagChip} key={i} style={{ background: 'rgba(96,165,250,.15)', color: 'var(--ink-sky-5)' }}>
                    🏷️ {[eq.brand, eq.type, eq.specs].filter(Boolean).join(' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={styles.photos}>
          {detail.photos.map((photo) => {
            const isVideo = photo.path.endsWith('.mp4') || photo.path.endsWith('.mov') || photo.path.endsWith('.webm') || photo.url.includes('video/');
            return isVideo ? (
              <video
                key={photo.path}
                src={photo.url}
                controls
                playsInline
                preload="metadata"
                style={{ width: '100%', maxHeight: '240px', borderRadius: '6px', objectFit: 'cover', background: '#000' }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.path} src={photo.url} alt="" loading="lazy" />
            );
          })}
        </div>
        {detail.photoCount > detail.photos.length && (
          <p className={styles.muted}>
            Showing {detail.photos.length} of {detail.photoCount}.{' '}
            <Link href={`${base}/leads/${detail.id}?details=photos#lead-photos-modal`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <Head level={H}>Estimate visit</Head>
        {detail.quoteVisit ? (
          <dl className={styles.defs}>
            <div><dt>When</dt><dd>{detail.quoteVisit.whenLabel}</dd></div>
            <div><dt>Length</dt><dd>{detail.quoteVisit.durationLabel}</dd></div>
            <div><dt>Confirmed</dt><dd>{detail.quoteVisit.confirmedLabel ? `Texted ${detail.quoteVisit.confirmedLabel}` : 'Not texted yet'}</dd></div>
            {detail.quoteVisit.notes ? <div><dt>Notes</dt><dd>{detail.quoteVisit.notes}</dd></div> : null}
          </dl>
        ) : (
          <p className={styles.muted}>No visit booked.</p>
        )}
        <Link className={styles.cardLink} href={`${base}/leads/${detail.id}#availability-snapshot`}>
          {detail.quoteVisit ? 'Change the visit →' : 'Book a visit →'}
        </Link>
      </section>

      <section className={styles.card}>
        <Head level={H}>Quote</Head>
        {detail.convertedJob ? (
          <dl className={styles.defs}>
            <div><dt>Job</dt><dd>{detail.convertedJob.ref}</dd></div>
            <div><dt>Stage</dt><dd>{detail.convertedJob.stageLabel}</dd></div>
            <div><dt>Quoted</dt><dd>{detail.convertedJob.quotedLabel}</dd></div>
          </dl>
        ) : (
          <>
            <dl className={styles.defs}>
              <div><dt>Est. value</dt><dd>{detail.estimateLabel ?? 'No number given'}</dd></div>
              <div><dt>Est. labor</dt><dd>{lead.estimatedHours ? `${lead.estimatedHours} hrs` : 'Not set'}</dd></div>
            </dl>
            <p className={styles.muted}>No quote sent yet.</p>
          </>
        )}
        <Link
          className={styles.cardLink}
          href={detail.convertedJob ? `${base}/jobs/${detail.convertedJob.id}` : `${base}/leads/${detail.id}#lead-estimate`}
        >
          {detail.convertedJob ? 'Open the job →' : 'Send a quote →'}
        </Link>
      </section>
    </div>
  );
}
