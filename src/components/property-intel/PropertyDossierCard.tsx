'use client';

import React, { useState, useEffect } from 'react';
import type { PropertyIntelligence } from '@/lib/property-intel/types';

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

  useEffect(() => {
    if (initialData) {
      setIntel(initialData);
      setLoading(false);
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

  if (loading) {
    return (
      <div className={`bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 animate-pulse ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-36 bg-neutral-800 rounded" />
          <div className="h-4 w-20 bg-neutral-800 rounded" />
        </div>
        <div className="h-48 bg-neutral-800 rounded-lg mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="h-12 bg-neutral-800 rounded-lg" />
          <div className="h-12 bg-neutral-800 rounded-lg" />
          <div className="h-12 bg-neutral-800 rounded-lg" />
          <div className="h-12 bg-neutral-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !intel) {
    return null; // Gracefully stay hidden if no data or outside coverage
  }

  const { streetView, satellite, roof, specs } = intel;
  const currentImageUrl = activeView === 'street' && streetView.available ? streetView.imageUrl : satellite.imageUrl;
  const isPre1978 = specs?.yearBuilt != null && specs.yearBuilt < 1978;

  return (
    <div className={`bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-lg ${className}`}>
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Property Intelligence
          </span>
          {roof && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-mono">
              Solar Verified
            </span>
          )}
          {specs && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-400 border border-sky-800/60 font-mono">
              Tax Records
            </span>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-neutral-800/80 rounded-lg p-0.5 border border-neutral-700/60 text-xs">
          {streetView.available && (
            <button
              type="button"
              onClick={() => setActiveView('street')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeView === 'street'
                  ? 'bg-neutral-700 text-white font-medium shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Street View
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveView('satellite')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activeView === 'satellite'
                ? 'bg-neutral-700 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Satellite
          </button>
        </div>
      </div>

      {/* Visual Preview Banner */}
      <div className="relative w-full h-44 sm:h-52 bg-neutral-950 overflow-hidden group">
        {currentImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentImageUrl}
            alt={activeView === 'street' ? 'Street View' : 'Aerial Satellite'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
            No visual imagery available
          </div>
        )}

        {/* Overlay Badges */}
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
          {activeView === 'street' && streetView.date && (
            <span className="text-[11px] px-2 py-0.5 bg-black/75 backdrop-blur text-neutral-300 rounded font-mono border border-white/10">
              Street View {streetView.date}
            </span>
          )}
          {roof?.imageryDate && (
            <span className="text-[11px] px-2 py-0.5 bg-black/75 backdrop-blur text-neutral-300 rounded font-mono border border-white/10">
              LiDAR {roof.imageryDate}
            </span>
          )}
          {specs?.propertyType && (
            <span className="text-[11px] px-2 py-0.5 bg-black/75 backdrop-blur text-neutral-300 rounded border border-white/10">
              {specs.propertyType}
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {roof?.isSteep && (
            <span className="text-[11px] px-2.5 py-0.5 bg-amber-950/90 text-amber-300 rounded-full font-medium border border-amber-600/60 shadow flex items-center gap-1">
              <span>⚠️</span> Steep Slope ({roof.dominantPitchRatio})
            </span>
          )}
          {isPre1978 && (
            <span className="text-[11px] px-2.5 py-0.5 bg-rose-950/90 text-rose-300 rounded-full font-medium border border-rose-600/60 shadow flex items-center gap-1">
              <span>🛡️</span> Built {specs?.yearBuilt} (Lead Paint Rule)
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Core Specs Grid (RentCast / County Assessor) */}
        {specs && (
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Building & Parcel Specs</span>
              {specs.ownerOccupied != null && (
                <span className="text-[10px] lowercase px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">
                  {specs.ownerOccupied ? 'Owner-occupied' : 'Rental / Non-owner occupied'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Year Built */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Year Built</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {specs.yearBuilt ?? 'Unknown'}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {isPre1978 ? 'Pre-1978 structure' : 'Modern build'}
                </div>
              </div>

              {/* Finished Living Area */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Living Area</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {specs.squareFootage ? `${specs.squareFootage.toLocaleString()} ft²` : 'N/A'}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {specs.stories ? `${specs.stories} Story` : 'Finished area'}
                </div>
              </div>

              {/* Lot Size */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Lot Size</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {specs.lotSizeAcres ? `${specs.lotSizeAcres} ac` : specs.lotSizeSqFt ? `${specs.lotSizeSqFt.toLocaleString()} ft²` : 'N/A'}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {specs.lotSizeSqFt ? `${specs.lotSizeSqFt.toLocaleString()} ft² total` : 'Parcel size'}
                </div>
              </div>

              {/* Layout / Rooms */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Layout</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {specs.bedrooms ?? '?'} bd / {specs.bathrooms ?? '?'} ba
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {specs.heatingFuel ? `${specs.heatingFuel} Heat` : specs.foundationType ? `${specs.foundationType} base` : 'Residential'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Roof & Solar Measurements (Google Solar) */}
        {roof && (
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Roof & Geometric Measurements
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Roofing Squares */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Roof Area</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {roof.roofingSquares}{' '}
                  <span className="text-xs font-normal text-neutral-400">sq ({roof.totalAreaSqFt.toLocaleString()} ft²)</span>
                </div>
                {onApplyRoofSquares && (
                  <button
                    type="button"
                    onClick={() => onApplyRoofSquares(roof.roofingSquares)}
                    className="mt-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-0.5"
                  >
                    Use {roof.roofingSquares} sq in quote →
                  </button>
                )}
              </div>

              {/* Dominant Pitch */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Pitch / Slope</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5 flex items-center gap-1.5">
                  {roof.dominantPitchRatio}
                  {roof.isSteep && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-amber-900/50 text-amber-400 rounded border border-amber-700/50">
                      Steep
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Max {roof.maxPitchDegrees}°
                </div>
              </div>

              {/* Footprint */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Ground Footprint</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {roof.groundAreaSqFt.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-neutral-400">ft²</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Foundation level
                </div>
              </div>

              {/* Solar / Sunshine */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-neutral-400 font-medium">Sunshine & Solar</div>
                <div className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {roof.maxSunshineHoursPerYear.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-neutral-400">hrs/yr</span>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Max {roof.solarPotentialPanels} panels
                </div>
              </div>
            </div>

            {/* Roof Complexity Bar */}
            <div className="mt-2.5 flex items-center justify-between text-xs bg-neutral-950/40 px-3 py-2 rounded-lg border border-neutral-800/60">
              <span className="text-neutral-400">
                Structure: <strong className="text-neutral-200">{roof.complexityLabel}</strong>
              </span>
              {roof.segments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSegments(!showSegments)}
                  className="text-sky-400 hover:text-sky-300 font-medium text-xs flex items-center gap-1"
                >
                  {showSegments ? 'Hide Facets' : `View ${roof.segments.length} Facets`}
                  <span className="text-[10px]">{showSegments ? '▲' : '▼'}</span>
                </button>
              )}
            </div>

            {/* Segment Drill-down */}
            {showSegments && roof.segments.length > 0 && (
              <div className="mt-2 pt-2 border-t border-neutral-800/60 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  Roof Planes & Facets
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                  {roof.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-neutral-950/80 px-2.5 py-1.5 rounded border border-neutral-800"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-neutral-500">#{idx + 1}</span>
                        <span className="font-medium text-neutral-300">
                          {seg.compassDirection} ({seg.azimuthDegrees}°)
                        </span>
                        <span className="text-neutral-400 text-[11px]">{seg.pitchRatio}</span>
                      </div>
                      <span className="font-mono text-neutral-300 text-[11px]">
                        {seg.areaSqFt} ft²
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
