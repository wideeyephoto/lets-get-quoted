'use client';

import React, { useState } from 'react';
import {
  applyPrecision,
  arrivalWindowTimes,
  buildArrivalMessage,
  DEFAULT_ARRIVAL_TEMPLATE,
  DEFAULT_DELAY_TEMPLATE,
  formatArrivalWindow,
  locationExpiry,
  locationVisible,
  recalculateLiveArrivalTimes,
  ARRIVAL_GEOFENCE_METERS,
  ARRIVAL_WINDOW_CHOICES,
  LOCATION_SHARE_MINUTES,
  TRACKING_LINK_HOURS,
  type ArrivalStatus,
} from '@/lib/arrival';
import styles from './live-eta-demo.module.css';

type DemoStep = 'en_route' | 'delayed' | 'arrived';

const BASE_TIME = new Date('2026-09-07T14:00:00.000Z'); // 10:00 AM EDT
const TIME_ZONE = 'America/New_York';
const RAW_COORD = { lat: 40.7128456, lng: -74.0059731 };

export default function LiveEtaDemo() {
  const [step, setStep] = useState<DemoStep>('en_route');

  const initialPromise = arrivalWindowTimes(BASE_TIME, 15, {
    windowStyle: 'window',
    windowMinutes: 30,
  });

  let currentTime = BASE_TIME;
  let currentTimes = initialPromise;
  let status: ArrivalStatus = 'en_route';
  let trackingUrl = 'https://letsgetquoted.com/track/4f9c2d7e81b3';
  let template = DEFAULT_ARRIVAL_TEMPLATE;

  if (step === 'delayed') {
    currentTime = new Date(BASE_TIME.getTime() + 10 * 60_000); // 10 minutes into journey
    const recalculated = recalculateLiveArrivalTimes(
      currentTime,
      40,
      { windowStyle: 'window', windowMinutes: 30 },
      initialPromise.end.toISOString()
    );
    currentTimes = recalculated.times;
    status = recalculated.isDelayed ? 'delayed' : 'en_route';
    trackingUrl = ''; // Delay notice carries NO link on purpose
    template = DEFAULT_DELAY_TEMPLATE;
  } else if (step === 'arrived') {
    currentTime = new Date(BASE_TIME.getTime() + 45 * 60_000);
    currentTimes = initialPromise;
    status = 'arrived';
    trackingUrl = '';
    template = DEFAULT_ARRIVAL_TEMPLATE;
  }

  const windowLabel = formatArrivalWindow(currentTimes, TIME_ZONE);
  const smsBody = buildArrivalMessage({
    template,
    business: 'Apex Services',
    crewName: 'Marcus',
    customerName: 'Sarah',
    times: currentTimes,
    trackingUrl,
    timeZone: TIME_ZONE,
  });

  const blurredCoord = applyPrecision(RAW_COORD, 'street');
  const isSharingLocation = locationVisible(
    {
      status,
      share_location: true,
      location_expires_at: locationExpiry(BASE_TIME).toISOString(),
    },
    currentTime
  );

  const statusBadgeClass =
    status === 'en_route'
      ? `${styles.statusBadge} ${styles.en_route}`
      : status === 'delayed'
      ? `${styles.statusBadge} ${styles.delayed}`
      : `${styles.statusBadge} ${styles.arrived}`;

  return (
    <div className={styles.demoContainer} id="live-eta-demo" aria-label="Interactive Live ETA Demonstration">
      <div className={styles.demoHead}>
        <div className={styles.badgeRow}>
          <span className={styles.livePill}>
            <span className={styles.pulsingDot} aria-hidden="true" />
            Live Code Simulation
          </span>
          <span className={styles.subtitle}>All values calculated at runtime by @/lib/arrival</span>
        </div>
        <p className={styles.subtitle}>
          Step through an active service call to see how live recalculation, privacy blurring, and automated notifications run in code:
        </p>
      </div>

      <div className={styles.buttonRow} role="group" aria-label="Simulation steps">
        <button
          type="button"
          className={`${styles.stepButton} ${step === 'en_route' ? styles.active : ''}`}
          onClick={() => setStep('en_route')}
          aria-pressed={step === 'en_route'}
        >
          <span>1. On my way</span>
          <span className={styles.stepLabel}>15 min away</span>
        </button>
        <button
          type="button"
          className={`${styles.stepButton} ${step === 'delayed' ? styles.active : ''}`}
          onClick={() => setStep('delayed')}
          aria-pressed={step === 'delayed'}
        >
          <span>2. Hit traffic</span>
          <span className={styles.stepLabel}>+25m delay</span>
        </button>
        <button
          type="button"
          className={`${styles.stepButton} ${step === 'arrived' ? styles.active : ''}`}
          onClick={() => setStep('arrived')}
          aria-pressed={step === 'arrived'}
        >
          <span>3. Arrived</span>
          <span className={styles.stepLabel}>Sharing ends</span>
        </button>
      </div>

      {/* Customer Mobile View */}
      <div className={styles.phoneCard}>
        <div className={styles.phoneHeader}>
          <div className={styles.businessBrand}>
            <span>Apex Services</span>
            <small style={{ fontWeight: 400, opacity: 0.7 }}>&middot; Marcus V.</small>
          </div>
          <span className={statusBadgeClass}>
            {status === 'en_route' ? 'On the way' : status === 'delayed' ? 'Running late' : 'Arrived'}
          </span>
        </div>

        <div className={styles.arrivalWindowBox}>
          <small>{status === 'arrived' ? 'Visit Status' : 'Arrival Window'}</small>
          <span className={styles.windowValue}>
            {status === 'arrived' ? 'Marcus is on site' : windowLabel}
          </span>
        </div>

        {/* Street-Level SVG Map Illustration */}
        <div className={styles.mapFrame} aria-label="Delivery-style street tracking map">
          <svg
            className={styles.mapSvg}
            viewBox="0 0 320 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
          >
            {/* Grid street layout */}
            <path d="M0 40 H320 M0 90 H320 M0 135 H320" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <path d="M50 0 V160 M140 0 V160 M230 0 V160" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />

            {/* Destination home marker */}
            <g transform="translate(230, 40)">
              <circle r="14" fill="rgba(56, 189, 248, 0.2)" />
              <circle r="7" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
              <text x="0" y="22" fill="#94a3b8" fontSize="9" textAnchor="middle" fontWeight="600">
                Customer
              </text>
            </g>

            {/* Live route path */}
            {isSharingLocation && (
              <path
                d={step === 'en_route' ? 'M 50 135 L 50 90 L 140 90 L 230 90 L 230 40' : 'M 140 90 L 230 90 L 230 40'}
                stroke={step === 'delayed' ? '#f59e0b' : '#38bdf8'}
                strokeWidth="3"
                strokeDasharray="4 4"
              />
            )}

            {/* Technician live position pin (visible only when locationVisible returns true) */}
            {isSharingLocation && (
              <g transform={step === 'en_route' ? 'translate(50, 115)' : 'translate(140, 90)'}>
                <circle r="16" fill={step === 'delayed' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)'} />
                <circle
                  r="8"
                  fill={step === 'delayed' ? '#f59e0b' : '#10b981'}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text x="0" y="-12" fill="#f8fafc" fontSize="9" textAnchor="middle" fontWeight="700">
                  Van (~100m blur)
                </text>
              </g>
            )}

            {/* Inactive state */}
            {!isSharingLocation && (
              <g transform="translate(160, 85)">
                <text x="0" y="0" fill="#64748b" fontSize="11" textAnchor="middle" fontWeight="600">
                  Location sharing stopped on arrival
                </text>
              </g>
            )}
          </svg>
          <span className={styles.mapCaption}>
            {isSharingLocation ? 'Street-level map illustration' : 'Privacy: GPS stream terminated'}
          </span>
        </div>
      </div>

      {/* SMS Message Bubble */}
      <div className={styles.smsCard}>
        <span className={styles.smsLabel}>
          {step === 'delayed' ? 'Automated Delay Text (Zero-link update)' : 'Customer Dispatch SMS'}
        </span>
        <div className={styles.smsBubble}>{smsBody}</div>
      </div>

      {/* Privacy Rounding Strip */}
      <div className={styles.privacyStrip}>
        <div className={styles.privacyValues}>
          <span className={styles.rawCoord}>
            {RAW_COORD.lat}, {RAW_COORD.lng}
          </span>
          <span className={styles.arrow} aria-hidden="true">
            &rarr;
          </span>
          <span className={styles.blurredCoord}>
            {blurredCoord?.lat}, {blurredCoord?.lng}
          </span>
          <span>(applyPrecision street level)</span>
        </div>
        <p className={styles.privacyCaption}>
          GPS coordinates round to 3 decimal places (~100m) before reaching the server. Customers see neighborhood streets, never an exact van footprint.
        </p>
      </div>

      {/* Real Invariant Limits from Product Code */}
      <div className={styles.specStrip}>
        <div className={styles.specChip}>
          <span className={styles.specVal}>{TRACKING_LINK_HOURS} hrs</span>
          <span className={styles.specName}>Link Expiration</span>
        </div>
        <div className={styles.specChip}>
          <span className={styles.specVal}>{LOCATION_SHARE_MINUTES} mins</span>
          <span className={styles.specName}>Trip Backstop</span>
        </div>
        <div className={styles.specChip}>
          <span className={styles.specVal}>{ARRIVAL_GEOFENCE_METERS}m</span>
          <span className={styles.specName}>Arrival Geofence</span>
        </div>
        <div className={styles.specChip}>
          <span className={styles.specVal}>{ARRIVAL_WINDOW_CHOICES.join('/')}m</span>
          <span className={styles.specName}>Window Choices</span>
        </div>
      </div>
    </div>
  );
}
