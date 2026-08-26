'use client';

import React, { useState, useEffect } from 'react';
import type { PropertyIntelligence } from '@/lib/property-intel/types';
import styles from './PropertyDossierCard.module.css';

export type PropertyDossierCardProps = {
  address: string | null | undefined;
  lat?: number | null;
  lng?: number | null;
  initialData?: PropertyIntelligence | null;
  className?: string;
  onApplyRoofSquares?: (squares: number) => void;
};

export function PropertyDossierCard({
  address,
  lat,
  lng,
  initialData,
  className = '',
  onApplyRoofSquares,
}: PropertyDossierCardProps) {
  const [intel, setIntel] = useState<PropertyIntelligence | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(!initialData && Boolean(address || (lat != null && lng != null)));
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'street' | 'satellite'>('street');
  const [showSegments, setShowSegments] = useState<boolean>(false);
  const [imageFailed, setImageFailed] = useState<boolean>(false);

  useEffect(() => {
    setImageFailed(false);
  }, [activeView, address, lat, lng]);

  useEffect(() => {
    if (initialData) {
      setIntel(initialData);
      setLoading(false);
      setImageFailed(false);
      return;
    }

    if (!address && (lat == null || lng == null)) {
      setIntel(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setImageFailed(false);

    const params = new URLSearchParams();
    if (address) params.set('address', address);
    if (lat != null && Number.isFinite(lat)) params.set('lat', String(lat));
    if (lng != null && Number.isFinite(lng)) params.set('lng', String(lng));

    fetch(`/api/property-intel?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch property intelligence');
        const data = await res.json();
        if (isMounted) {
          setIntel(data.data ?? null);
          if (data.data?.streetView?.available) {
            setActiveView('street');
          } else {
            setActiveView('satellite');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error fetching property data');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [address, lat, lng, initialData]);

  if (!address && lat == null && lng == null) {
    return null;
  }

  // Generate a direct Google Maps URL as a resilient escape hatch
  const gmapsQuery = encodeURIComponent(
    address || (lat != null && lng != null ? `${lat},${lng}` : '')
  );
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${gmapsQuery}`;

  if (loading) {
    return (
      <div className={`${styles.skeleton} ${className}`} aria-busy="true" aria-label="Loading property intelligence">
        <div className={styles.skeletonHeader}>
          <div className={styles.skeletonBar} style={{ height: '18px', width: '150px' }} />
          <div className={styles.skeletonBar} style={{ height: '24px', width: '80px' }} />
        </div>
        <div className={styles.skeletonImage} />
        <div className={styles.skeletonGrid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <svg className={styles.headerIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Property Intelligence
          </div>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapActionBtn}
          >
            Open in Google Maps ↗
          </a>
        </div>
        <div className={styles.body}>
          <div className={styles.diagnosticCard}>
            <div className={styles.diagnosticHeader}>
              <span>Unable to load automated intelligence</span>
            </div>
            <div className={styles.diagnosticItem}>
              <span className={styles.diagnosticIcon}>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!intel) {
    return null;
  }

  const { streetView, satellite, roof, specs, lat: resolvedLat, lng: resolvedLng } = intel;
  const currentImageUrl = activeView === 'street' && streetView.available ? streetView.imageUrl : satellite.imageUrl;
  const isPre1978 = specs?.yearBuilt != null && specs.yearBuilt < 1978;
  const hasImagery = Boolean(currentImageUrl) && !imageFailed;
  const hasNeitherRoofNorSpecs = !roof && !specs;

  return (
    <div className={`${styles.container} ${className}`}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>
            <svg className={styles.headerIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Property Intelligence
          </span>
          {roof && (
            <span className={styles.badgeSolar}>
              Solar Verified
            </span>
          )}
          {specs && (
            <span className={styles.badgeTax}>
              Tax Records
            </span>
          )}
          {hasNeitherRoofNorSpecs && resolvedLat != null && resolvedLng != null && (
            <span className={styles.badgeGeocoded}>
              Geocoded ({resolvedLat.toFixed(3)}, {resolvedLng.toFixed(3)})
            </span>
          )}
        </div>

        {/* View Toggle / Google Maps Link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {streetView.available && (
            <div className={styles.viewToggle} role="group" aria-label="Visual Map View">
              <button
                type="button"
                onClick={() => setActiveView('street')}
                className={`${styles.toggleBtn} ${activeView === 'street' ? styles.toggleBtnActive : ''}`}
                aria-pressed={activeView === 'street'}
              >
                Street View
              </button>
              <button
                type="button"
                onClick={() => setActiveView('satellite')}
                className={`${styles.toggleBtn} ${activeView === 'satellite' ? styles.toggleBtnActive : ''}`}
                aria-pressed={activeView === 'satellite'}
              >
                Satellite
              </button>
            </div>
          )}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapActionBtn}
            title="Open property location in Google Maps"
          >
            Google Maps ↗
          </a>
        </div>
      </div>

      {/* Visual Preview Banner */}
      <div className={styles.visualPreview}>
        {hasImagery ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentImageUrl!}
            alt={activeView === 'street' ? 'Street View' : 'Aerial Satellite'}
            className={styles.previewImage}
            crossOrigin="anonymous"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.previewFallback}>
            <div className={styles.fallbackTitle}>
              <svg className={styles.headerIconSmall} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Satellite Imagery Unavailable
            </div>
            <p className={styles.fallbackSubtext}>
              {address ? address : `${resolvedLat?.toFixed(4)}, ${resolvedLng?.toFixed(4)}`}
            </p>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mapActionBtn}
            >
              Open Satellite View in Google Maps ↗
            </a>
          </div>
        )}

        {/* Overlay Badges */}
        <div className={styles.overlayTopLeft}>
          {hasImagery && activeView === 'street' && streetView.date && (
            <span className={styles.overlayBadge}>
              Street View {streetView.date}
            </span>
          )}
          {hasImagery && roof?.imageryDate && (
            <span className={styles.overlayBadge}>
              LiDAR {roof.imageryDate}
            </span>
          )}
          {hasImagery && specs?.propertyType && (
            <span className={styles.overlayBadge}>
              {specs.propertyType}
            </span>
          )}
        </div>

        <div className={styles.overlayTopRight}>
          {roof?.isSteep && (
            <span className={`${styles.warningBadge} ${styles.warningBadgeAmber}`}>
              <span>⚠️</span> Steep Slope ({roof.dominantPitchRatio})
            </span>
          )}
          {isPre1978 && (
            <span className={`${styles.warningBadge} ${styles.warningBadgeRose}`}>
              <span>🛡️</span> Built {specs?.yearBuilt} (Lead Paint Rule)
            </span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {/* Core Specs Grid (RentCast / County Assessor) */}
        {specs && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Building & Parcel Specs</span>
              {specs.ownerOccupied != null && (
                <span className={styles.sectionSubtext}>
                  {specs.ownerOccupied ? 'Owner-occupied' : 'Rental / Non-owner occupied'}
                </span>
              )}
            </div>
            <div className={styles.specsGrid}>
              {/* Year Built */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Year Built</div>
                <div className={styles.specValue}>
                  {specs.yearBuilt ?? 'Unknown'}
                </div>
                <div className={styles.specSubtext}>
                  {isPre1978 ? 'Pre-1978 structure' : 'Modern build'}
                </div>
              </div>

              {/* Finished Living Area */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Living Area</div>
                <div className={styles.specValue}>
                  {specs.squareFootage ? (
                    <>
                      {specs.squareFootage.toLocaleString()} <span className={styles.specValueUnit}>ft²</span>
                    </>
                  ) : (
                    'N/A'
                  )}
                </div>
                <div className={styles.specSubtext}>
                  {specs.stories ? `${specs.stories} Story` : 'Finished area'}
                </div>
              </div>

              {/* Lot Size */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Lot Size</div>
                <div className={styles.specValue}>
                  {specs.lotSizeAcres ? (
                    <>
                      {specs.lotSizeAcres} <span className={styles.specValueUnit}>ac</span>
                    </>
                  ) : specs.lotSizeSqFt ? (
                    <>
                      {specs.lotSizeSqFt.toLocaleString()} <span className={styles.specValueUnit}>ft²</span>
                    </>
                  ) : (
                    'N/A'
                  )}
                </div>
                <div className={styles.specSubtext}>
                  {specs.lotSizeSqFt ? `${specs.lotSizeSqFt.toLocaleString()} ft² total` : 'Parcel size'}
                </div>
              </div>

              {/* Layout / Rooms */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Layout</div>
                <div className={styles.specValue}>
                  {specs.bedrooms ?? '?'} bd / {specs.bathrooms ?? '?'} ba
                </div>
                <div className={styles.specSubtext}>
                  {specs.heatingFuel ? `${specs.heatingFuel} Heat` : specs.foundationType ? `${specs.foundationType} base` : 'Residential'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Roof & Solar Measurements (Google Solar) */}
        {roof && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Roof & Geometric Measurements</span>
            </div>
            <div className={styles.specsGrid}>
              {/* Roofing Squares */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Roof Area</div>
                <div className={styles.specValue}>
                  {roof.roofingSquares}{' '}
                  <span className={styles.specValueUnit}>sq ({roof.totalAreaSqFt.toLocaleString()} ft²)</span>
                </div>
                {onApplyRoofSquares && (
                  <button
                    type="button"
                    onClick={() => onApplyRoofSquares(roof.roofingSquares)}
                    className={styles.applyBtn}
                  >
                    Use {roof.roofingSquares} sq in quote →
                  </button>
                )}
              </div>

              {/* Dominant Pitch */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Pitch / Slope</div>
                <div className={styles.specValue}>
                  {roof.dominantPitchRatio}
                  {roof.isSteep && (
                    <span className={styles.pitchPill}>
                      Steep
                    </span>
                  )}
                </div>
                <div className={styles.specSubtext}>
                  Max {roof.maxPitchDegrees}°
                </div>
              </div>

              {/* Footprint */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Ground Footprint</div>
                <div className={styles.specValue}>
                  {roof.groundAreaSqFt.toLocaleString()}{' '}
                  <span className={styles.specValueUnit}>ft²</span>
                </div>
                <div className={styles.specSubtext}>
                  Foundation level
                </div>
              </div>

              {/* Solar / Sunshine */}
              <div className={styles.specCard}>
                <div className={styles.specLabel}>Sunshine & Solar</div>
                <div className={styles.specValue}>
                  {roof.maxSunshineHoursPerYear.toLocaleString()}{' '}
                  <span className={styles.specValueUnit}>hrs/yr</span>
                </div>
                <div className={styles.specSubtext}>
                  Max {roof.solarPotentialPanels} panels
                </div>
              </div>
            </div>

            {/* Roof Complexity Bar */}
            <div className={styles.complexityBar}>
              <span className={styles.complexityLabel}>
                Structure: <strong className={styles.complexityValue}>{roof.complexityLabel}</strong>
              </span>
              {roof.segments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSegments(!showSegments)}
                  className={styles.facetToggleBtn}
                >
                  {showSegments ? 'Hide Facets' : `View ${roof.segments.length} Facets`}
                  <span style={{ fontSize: '0.625rem' }}>{showSegments ? '▲' : '▼'}</span>
                </button>
              )}
            </div>

            {/* Segment Drill-down */}
            {showSegments && roof.segments.length > 0 && (
              <div className={styles.facetList}>
                {roof.segments.map((seg, idx) => (
                  <div key={idx} className={styles.facetItem}>
                    <div className={styles.facetItemLeft}>
                      <span className={styles.facetIndex}>#{idx + 1}</span>
                      <span className={styles.facetHeading}>
                        {seg.compassDirection} ({seg.azimuthDegrees}°)
                      </span>
                      <span className={styles.facetPitch}>{seg.pitchRatio}</span>
                    </div>
                    <span className={styles.facetArea}>
                      {seg.areaSqFt} ft²
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Informative Diagnostic State when either Solar or Specs are not active */}
        {hasNeitherRoofNorSpecs && (
          <div className={styles.diagnosticCard}>
            <div className={styles.diagnosticHeader}>
              <span>Automated Roof & Tax Specs</span>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.mapActionBtn}
              >
                Inspect on Google Maps ↗
              </a>
            </div>
            <div className={styles.diagnosticList}>
              <div className={styles.diagnosticItem}>
                <span className={styles.diagnosticIcon}>📐</span>
                <span>
                  <strong>Roof Measurements:</strong> Automated 3D LiDAR geometry and square calculation require Google Solar API enabled on your Google Maps Platform key.
                </span>
              </div>
              <div className={styles.diagnosticItem}>
                <span className={styles.diagnosticIcon}>📋</span>
                <span>
                  <strong>Building Specs:</strong> County tax assessor records, living area, and year built require the <code>RENTCAST_API_KEY</code> environment credential.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
