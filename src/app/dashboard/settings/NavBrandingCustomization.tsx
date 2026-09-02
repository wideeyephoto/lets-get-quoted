'use client';

import React, { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useNavCustomization } from '@/lib/nav-customization';
import { updateNavBrandingAction, uploadContractorLogoAction, removeContractorLogoAction } from './actions';
import BrandLogo from '@/components/brand-logo';

interface NavBrandingCustomizationProps {
  initialLogoUrl?: string | null;
  businessName?: string | null;
  initialNavLogoTop?: boolean;
}

export default function NavBrandingCustomization({
  initialLogoUrl,
  businessName,
  initialNavLogoTop = false,
}: NavBrandingCustomizationProps) {
  const { contractorLogoTop, setContractorLogoTop } = useNavCustomization(initialNavLogoTop);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null);
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = businessName || 'My Business';
  const initials = displayName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'HQ';

  const handleToggle = () => {
    const nextVal = !contractorLogoTop;
    setContractorLogoTop(nextVal);
    startTransition(async () => {
      try {
        await updateNavBrandingAction(nextVal);
      } catch (err) {
        console.error('Failed to persist nav branding preference:', err);
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.set('logo', file);

    startTransition(async () => {
      try {
        const res = await uploadContractorLogoAction(formData);
        if (res.ok && res.logoUrl) {
          setLogoUrl(res.logoUrl);
          setUploadSuccess('Logo uploaded successfully! Your navigation has been updated.');
          // Also dispatch event to notify any listeners
          window.dispatchEvent(new CustomEvent('lgq-nav-customization-change', { detail: { logoUrl: res.logoUrl } }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to upload logo image.';
        setUploadError(msg);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    });
  };

  const handleRemoveLogo = async () => {
    if (!confirm('Are you sure you want to remove your custom logo?')) return;
    setUploadError(null);
    setUploadSuccess(null);

    startTransition(async () => {
      try {
        await removeContractorLogoAction();
        setLogoUrl(null);
        setUploadSuccess('Logo removed. Navigation will show your brand monogram.');
        window.dispatchEvent(new CustomEvent('lgq-nav-customization-change', { detail: { logoUrl: null } }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to remove logo.';
        setUploadError(msg);
      }
    });
  };

  return (
    <div className="nav-customization-card" style={{
      display: 'grid',
      gap: '1.25rem',
      padding: '1.15rem',
      borderRadius: '12px',
      border: '1px solid var(--edge-t14)',
      background: 'rgba(var(--tint), 0.035)',
    }}>
      {/* Top Header & Switch Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ maxWidth: '640px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🏷️</span>
            <strong style={{ fontSize: '0.98rem', color: 'var(--text)' }}>
              Contractor Logo at Top of Navigation
            </strong>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: '999px',
              background: contractorLogoTop ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              border: contractorLogoTop ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(148, 163, 184, 0.25)',
              color: contractorLogoTop ? '#4ade80' : 'var(--muted-2)',
            }}>
              {contractorLogoTop ? 'Contractor-First' : 'Standard'}
            </span>
          </div>
          <span style={{ fontSize: '0.84rem', color: 'var(--muted-2)', lineHeight: 1.45, display: 'block' }}>
            Feature your company logo and business name at the very top of the desktop sidebar and mobile navigation bar, moving Let&apos;s Get Quoted to the navigation footer.
          </span>
        </div>

        <div className="automation-switch-wrap">
          <button
            type="button"
            className={`automation-switch${contractorLogoTop ? ' on' : ''}`}
            onClick={handleToggle}
            disabled={isPending}
            aria-checked={contractorLogoTop}
            role="switch"
            aria-label="Toggle contractor logo at top of navigation"
          >
            <span className="automation-switch-track">
              <span className="automation-switch-knob" />
            </span>
            <span className="automation-switch-text">
              {contractorLogoTop ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>

      {/* Logo Asset Manager */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '0.9rem 1rem',
        borderRadius: '10px',
        background: 'rgba(0, 0, 0, 0.12)',
        border: '1px solid var(--edge-t14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          {logoUrl ? (
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '8px',
              background: '#ffffff',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={displayName}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.15rem',
              letterSpacing: '0.05em',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
            }}>
              {initials}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                {logoUrl ? 'Active Company Logo' : 'Brand Monogram Badge'}
              </strong>
              {logoUrl ? (
                <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>✓ Custom logo active</span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-2)' }}>Default monogram</span>
              )}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted-2)', display: 'block', marginTop: '2px' }}>
              {logoUrl
                ? 'Appears at the top of your nav bar when Contractor-First is on.'
                : 'Upload a logo file (PNG, JPG, WebP) or create one in the AI Logo Studio.'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="btn secondary"
            disabled={isPending}
            onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          >
            {logoUrl ? 'Replace logo' : 'Upload custom logo'}
          </button>

          {logoUrl ? (
            <button
              type="button"
              className="btn secondary"
              disabled={isPending}
              onClick={handleRemoveLogo}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', color: 'var(--amber-11, #f87171)' }}
            >
              Remove
            </button>
          ) : null}

          <Link
            href="/dashboard/sites"
            className="btn secondary"
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          >
            ✨ AI Logo Studio
          </Link>
        </div>
      </div>

      {uploadError ? (
        <div style={{ fontSize: '0.82rem', color: '#ef4444', padding: '0.4rem 0' }}>
          ⚠️ {uploadError}
        </div>
      ) : null}

      {uploadSuccess ? (
        <div style={{ fontSize: '0.82rem', color: '#22c55e', padding: '0.4rem 0' }}>
          ✓ {uploadSuccess}
        </div>
      ) : null}

      {/* Mini Sidebar Preview Scheme */}
      <div style={{
        borderRadius: '8px',
        border: '1px dashed var(--edge-t14)',
        padding: '0.85rem 1rem',
        background: 'rgba(0, 0, 0, 0.08)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: 'var(--muted-2)',
          marginBottom: '0.65rem',
        }}>
          <strong>Live Navigation Mockup Preview</strong>
          <span>{contractorLogoTop ? 'Contractor-First mode' : 'Standard mode'}</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 240px) 1fr',
          gap: '1rem',
          alignItems: 'center',
        }}>
          {/* Mini Nav Frame */}
          <div style={{
            background: 'var(--bg-card, #131b26)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {/* Top of Nav */}
            <div style={{
              padding: '6px 8px',
              borderRadius: '6px',
              background: contractorLogoTop ? 'rgba(234, 88, 12, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: contractorLogoTop ? '1px solid rgba(234, 88, 12, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              {contractorLogoTop ? (
                <>
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" style={{ height: '16px', maxWidth: '36px', objectFit: 'contain' }} />
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      background: '#ea580c',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: 700,
                    }}>
                      {initials}
                    </span>
                  )}
                  <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName}
                  </strong>
                </>
              ) : (
                <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.68rem', color: '#ea580c' }}>
                  LET&apos;S GET QUOTED
                </span>
              )}
            </div>

            {/* Simulated nav items */}
            <div style={{ opacity: 0.5, display: 'flex', flexDirection: 'column', gap: '3px', padding: '2px 4px' }}>
              <div style={{ height: '5px', width: '70%', background: 'currentColor', borderRadius: '3px' }} />
              <div style={{ height: '5px', width: '55%', background: 'currentColor', borderRadius: '3px' }} />
              <div style={{ height: '5px', width: '80%', background: 'currentColor', borderRadius: '3px' }} />
            </div>

            {/* Bottom of Nav */}
            <div style={{
              marginTop: '4px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px',
            }}>
              <span style={{ opacity: 0.6, fontSize: '0.66rem' }}>Account</span>
              {contractorLogoTop ? (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.65rem',
                  color: 'var(--muted-2)',
                }}>
                  <BrandLogo size={12} />
                  <span>Powered by LGQ</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.65rem', color: '#22c55e' }}>$ Stripe</span>
              )}
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--muted-2)', lineHeight: 1.5 }}>
            {contractorLogoTop ? (
              <p style={{ margin: 0 }}>
                ✨ <strong>Contractor-First Layout is active!</strong> Your navigation puts your brand front and center for yourself, crew, and clients. Let&apos;s Get Quoted sits proudly at the bottom footer.
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                Switch on <strong>Contractor Logo at Top of Navigation</strong> to brand your dashboard navigation with your own company logo and move Let&apos;s Get Quoted to the bottom.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
