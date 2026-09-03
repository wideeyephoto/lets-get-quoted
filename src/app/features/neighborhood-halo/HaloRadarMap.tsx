'use client';

import { useState } from 'react';
import styles from './neighborhood-halo.module.css';

type HaloRadarMapProps = {
  streetName: string;
  trade: string;
  activeClusterTier: number;
};

export default function HaloRadarMap({ streetName, trade, activeClusterTier }: HaloRadarMapProps) {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);

  // Neighbor pins situated within the 1-mile perimeter
  const neighborPins = [
    { id: 'jobsite', x: 200, y: 200, label: `Completed ${trade} Job`, street: streetName, isJobsite: true },
    { id: 'neighbor-1', x: 235, y: 170, label: 'Neighbor (Adjacent)', street: streetName, tier: 1 },
    { id: 'neighbor-2', x: 165, y: 230, label: 'Neighbor (Across Street)', street: streetName, tier: 1 },
    { id: 'neighbor-3', x: 260, y: 220, label: 'Neighbor (Corner)', street: `${streetName} & Elm`, tier: 2 },
    { id: 'neighbor-4', x: 140, y: 155, label: 'Neighbor (Cul-de-sac)', street: `${streetName} Court`, tier: 2 },
    { id: 'neighbor-5', x: 290, y: 140, label: 'Neighbor (HOA North)', street: 'Pine Hollow Dr', tier: 3 },
    { id: 'neighbor-6', x: 110, y: 260, label: 'Neighbor (HOA South)', street: 'Oakridge Terrace', tier: 3 },
  ];

  return (
    <div className={styles.radarContainer}>
      <div className={styles.radarHeader}>
        <div>
          <div className={styles.radarLiveBadge}>
            <span className={styles.radarLiveDot} />
            LIVE GEOFENCE RADAR
          </div>
          <h4 className={styles.radarHeading}>
            1.0-Mile Targeting Mesh &middot; {streetName}
          </h4>
        </div>
        <div className={styles.radarStats}>
          <div className={styles.radarStatCell}>
            <span className={styles.radarStatLabel}>RADIUS</span>
            <strong className={styles.radarStatVal}>1.0 mi (5,280 ft)</strong>
          </div>
          <div className={styles.radarStatCell}>
            <span className={styles.radarStatLabel}>EST. HOUSEHOLDS</span>
            <strong className={styles.radarStatVal}>~1,840 Homes</strong>
          </div>
          <div className={styles.radarStatCell}>
            <span className={styles.radarStatLabel}>ACTIVE CLUSTER</span>
            <strong className={styles.radarStatVal} style={{ color: '#34d399' }}>
              Tier {activeClusterTier} ({activeClusterTier === 1 ? '2 Homes' : activeClusterTier === 2 ? '3+ Homes' : '5+ Homes'})
            </strong>
          </div>
        </div>
      </div>

      <div className={styles.radarDisplayWrapper}>
        <svg viewBox="0 0 400 400" className={styles.radarSvg} aria-label="Geofence radar map">
          <defs>
            {/* Radial background gradient */}
            <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#081b2a" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#040e17" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#02080d" stopOpacity="1" />
            </radialGradient>

            {/* Sweep gradient */}
            <radialGradient id="sweepGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.35)" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
            </radialGradient>

            {/* Glowing filter for active pins */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background */}
          <rect width="400" height="400" rx="16" fill="url(#radarBg)" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" />

          {/* Concentric Distance Rings */}
          <circle cx="200" cy="200" r="45" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
          <text x="204" y="152" fill="#64748b" fontSize="8" fontWeight="600">0.25 mi</text>

          <circle cx="200" cy="200" r="90" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" strokeDasharray="3 3" />
          <text x="204" y="107" fill="#64748b" fontSize="8" fontWeight="600">0.50 mi</text>

          <circle cx="200" cy="200" r="135" fill="none" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" strokeDasharray="3 3" />
          <text x="204" y="62" fill="#64748b" fontSize="8" fontWeight="600">0.75 mi</text>

          {/* 1.0-Mile Outer Perimeter */}
          <circle
            cx="200"
            cy="200"
            r="180"
            fill="rgba(56, 189, 248, 0.03)"
            stroke="rgba(56, 189, 248, 0.6)"
            strokeWidth="1.5"
            filter="url(#glow)"
          />
          <text x="204" y="18" fill="#38bdf8" fontSize="9" fontWeight="700" letterSpacing="0.05em">
            1.0 MILE GEOFENCE BOUNDARY
          </text>

          {/* Crosshairs */}
          <line x1="20" y1="200" x2="380" y2="200" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="1" />
          <line x1="200" y1="20" x2="200" y2="380" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="1" />

          {/* Simulated Street Grid Lines */}
          <path
            d="M 60 140 Q 200 200 340 260"
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 120 280 Q 200 200 280 120"
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <text x="235" y="240" fill="#94a3b8" fontSize="8" fontWeight="600" transform="rotate(22 235 240)">
            {streetName}
          </text>

          {/* Neighbor Pins */}
          {neighborPins.map((pin) => {
            const isHighlighted = pin.isJobsite || (pin.tier !== undefined && pin.tier <= activeClusterTier);
            const isHovered = hoveredPin === pin.id;

            if (pin.isJobsite) {
              return (
                <g
                  key={pin.id}
                  onMouseEnter={() => setHoveredPin(pin.id)}
                  onMouseLeave={() => setHoveredPin(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Outer Pulsing Beacon */}
                  <circle cx={pin.x} cy={pin.y} r="16" fill="rgba(249, 115, 22, 0.25)" className={styles.pulseRing} />
                  <circle cx={pin.x} cy={pin.y} r="9" fill="var(--accent, #f97316)" stroke="#ffffff" strokeWidth="2" />
                  <circle cx={pin.x} cy={pin.y} r="3" fill="#ffffff" />
                </g>
              );
            }

            return (
              <g
                key={pin.id}
                onMouseEnter={() => setHoveredPin(pin.id)}
                onMouseLeave={() => setHoveredPin(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Ping aura if unlocked in active cluster */}
                {isHighlighted && (
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={isHovered ? '12' : '8'}
                    fill={isHovered ? 'rgba(52, 211, 153, 0.4)' : 'rgba(52, 211, 153, 0.2)'}
                  />
                )}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={isHovered ? '6' : '4.5'}
                  fill={isHighlighted ? '#34d399' : '#64748b'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip / Legend */}
        <div className={styles.radarLegend}>
          <div className={styles.legendItem}>
            <span className={styles.legendDotJobsite} />
            <span>Jobsite ({streetName})</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDotUnlocked} />
            <span>Active Neighbor Cluster</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDotOuter} />
            <span>Targeted Homeowners</span>
          </div>
        </div>
      </div>
    </div>
  );
}
