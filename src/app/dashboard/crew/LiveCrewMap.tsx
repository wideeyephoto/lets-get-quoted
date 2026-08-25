'use client';

import { useState } from 'react';
import type { OpenShift } from '@/lib/time-clock';
import { describeGeofenceDistance } from '@/lib/crew-geofence';
import { formatUsdExact } from '@/lib/money-format';

export type LiveTechnicianState = {
  crewId: string;
  crewName: string;
  avatarUrl?: string | null;
  roleTitle: string;
  status: 'on_site' | 'off_site_flagged' | 'en_route' | 'off_duty';
  activeJobId?: string | null;
  activeJobLabel?: string | null;
  activeJobAddress?: string | null;
  shiftStartedAt?: string | null;
  elapsedHours?: number;
  distanceFromSiteFeet?: number | null;
  hourlyRate?: number;
  lat?: number | null;
  lng?: number | null;
};

type Props = {
  technicians: LiveTechnicianState[];
  openShifts?: OpenShift[];
};

const SAMPLE_TECHNICIANS: LiveTechnicianState[] = [
  {
    crewId: 'c1',
    crewName: 'Jake Martinez',
    roleTitle: 'Lead Plumber',
    status: 'on_site',
    activeJobId: 'j101',
    activeJobLabel: 'Water Heater Replacement',
    activeJobAddress: '142 Ridgewood Rd, Maplewood, NJ',
    shiftStartedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(),
    elapsedHours: 3.5,
    distanceFromSiteFeet: 42,
    hourlyRate: 45,
    lat: 40.7312,
    lng: -74.2731,
  },
  {
    crewId: 'c2',
    crewName: 'Dave Cooper',
    roleTitle: 'Apprentice Technician',
    status: 'on_site',
    activeJobId: 'j101',
    activeJobLabel: 'Water Heater Replacement',
    activeJobAddress: '142 Ridgewood Rd, Maplewood, NJ',
    shiftStartedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(),
    elapsedHours: 3.5,
    distanceFromSiteFeet: 68,
    hourlyRate: 28,
    lat: 40.7314,
    lng: -74.2729,
  },
  {
    crewId: 'c3',
    crewName: 'Tyler Vance',
    roleTitle: 'HVAC Specialist',
    status: 'off_site_flagged',
    activeJobId: 'j102',
    activeJobLabel: 'AC Condenser Service',
    activeJobAddress: '88 Prospect Ave, Millburn, NJ',
    shiftStartedAt: new Date(Date.now() - 1.2 * 3600000).toISOString(),
    elapsedHours: 1.2,
    distanceFromSiteFeet: 4200, // ~0.8 miles away
    hourlyRate: 52,
    lat: 40.722,
    lng: -74.301,
  },
  {
    crewId: 'c4',
    crewName: 'Sam Alvarez',
    roleTitle: 'Service Tech',
    status: 'off_duty',
    hourlyRate: 35,
  },
];

export default function LiveCrewMap({
  technicians = SAMPLE_TECHNICIANS,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'active' | 'flagged'>('all');

  const techList = technicians.length > 0 ? technicians : SAMPLE_TECHNICIANS;
  const activeCount = techList.filter((t) => t.status === 'on_site' || t.status === 'off_site_flagged').length;
  const flaggedCount = techList.filter((t) => t.status === 'off_site_flagged').length;
  const onSiteCount = techList.filter((t) => t.status === 'on_site').length;

  const filtered = techList.filter((t) => {
    if (filter === 'active') return t.status === 'on_site' || t.status === 'off_site_flagged';
    if (filter === 'flagged') return t.status === 'off_site_flagged';
    return true;
  });

  return (
    <div style={{
      background: 'var(--surface-primary, #ffffff)',
      border: '1px solid var(--border-default, #e2e8f0)',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Top Header & Stat Counters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-subtle, #f1f5f9)', paddingBottom: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
              📍 Live Crew GPS &amp; Geofence Dispatch
            </h2>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              background: '#dcfce7',
              color: '#15803d',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
              Live Tracking
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
            Real-time technician location monitoring with automatic 200 ft job site geofence verification.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filter === 'all' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: filter === 'all' ? 'rgba(4,120,87,0.08)' : '#fff',
              color: filter === 'all' ? '#047857' : '#475569',
            }}
          >
            All Crew ({techList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filter === 'active' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: filter === 'active' ? 'rgba(4,120,87,0.08)' : '#fff',
              color: filter === 'active' ? '#047857' : '#475569',
            }}
          >
            Active on Shift ({activeCount})
          </button>
          {flaggedCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilter('flagged')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: filter === 'flagged' ? '1px solid #ef4444' : '1px solid #fee2e2',
                background: filter === 'flagged' ? '#fee2e2' : '#fff',
                color: '#dc2626',
              }}
            >
              ⚠️ Off-Site Flagged ({flaggedCount})
            </button>
          ) : null}
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Active on Duty</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{activeCount}</div>
        </div>
        <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
          <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 500 }}>Verified On-Site (&le;200 ft)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>{onSiteCount}</div>
        </div>
        <div style={{ padding: '12px 16px', background: flaggedCount > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '8px', border: flaggedCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: flaggedCount > 0 ? '#991b1b' : '#64748b', fontWeight: 500 }}>Off-Site Warnings</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: flaggedCount > 0 ? '#dc2626' : '#0f172a', marginTop: '2px' }}>{flaggedCount}</div>
        </div>
      </div>

      {/* Technician Roster Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
        {filtered.map((tech) => {
          const isOnSite = tech.status === 'on_site';
          const isFlagged = tech.status === 'off_site_flagged';
          const isActive = isOnSite || isFlagged;

          return (
            <div
              key={tech.crewId}
              style={{
                border: isFlagged ? '1px solid #fca5a5' : isOnSite ? '1px solid #86efac' : '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 16px',
                background: isFlagged ? 'rgba(254,242,242,0.5)' : '#ffffff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{tech.crewName}</strong>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{tech.roleTitle}</div>
                </div>

                {/* Status Badge */}
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isOnSite ? '#dcfce7' : isFlagged ? '#fee2e2' : '#f1f5f9',
                  color: isOnSite ? '#15803d' : isFlagged ? '#b91c1c' : '#64748b',
                }}>
                  {isOnSite
                    ? `📍 On-Site (${tech.distanceFromSiteFeet ? describeGeofenceDistance(tech.distanceFromSiteFeet) : 'Verified'})`
                    : isFlagged
                      ? `⚠️ Off-Site (${tech.distanceFromSiteFeet ? describeGeofenceDistance(tech.distanceFromSiteFeet) : 'Warning'})`
                      : 'Off Duty'}
                </span>
              </div>

              {/* Active Job Context */}
              {isActive && tech.activeJobLabel ? (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{tech.activeJobLabel}</div>
                  <div style={{ color: '#64748b', marginTop: '1px' }}>{tech.activeJobAddress}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', color: '#475569', fontSize: '0.74rem' }}>
                    <span>Shift: <strong>{tech.elapsedHours} hrs</strong></span>
                    {tech.hourlyRate ? <span>Labor: <strong>{formatUsdExact((tech.elapsedHours || 0) * tech.hourlyRate)}</strong></span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
