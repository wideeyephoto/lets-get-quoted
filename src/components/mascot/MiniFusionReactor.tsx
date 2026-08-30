import React from 'react';
import styles from './MiniFusionReactor.module.css';

export interface MiniFusionReactorProps {
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isThinking?: boolean;
  className?: string;
  showText?: boolean;
  interactive?: boolean;
  alt?: string;
}

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 60,
  '2xl': 96,
};

export default function MiniFusionReactor({
  size = 'md',
  isThinking = false,
  className = '',
  showText = true,
  interactive = false,
  alt = 'Mini Fusion Reactor - Energy Spark',
}: MiniFusionReactorProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 36;
  const isCompact = pixelSize < 44;

  return (
    <div
      className={`${styles.reactorContainer} ${isThinking ? styles.reactorThinking : ''} ${
        interactive ? styles.reactorInteractive : ''
      } ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      role="img"
      aria-label={alt}
    >
      {/* Ambient Containment Halo / Outer Glow */}
      <div className={styles.ambientGlow} />

      {/* Titanium / Brushed Metal Outer Bezel */}
      <div className={styles.outerBezel}>
        {/* Cardinal Notch LED Status Indicators (12, 3, 6, 9 o'clock) */}
        <span className={`${styles.notchLed} ${styles.notchTop}`} />
        <span className={`${styles.notchLed} ${styles.notchRight}`} />
        <span className={`${styles.notchLed} ${styles.notchBottom}`} />
        <span className={`${styles.notchLed} ${styles.notchLeft}`} />

        {/* Magnetic Torus Chamber (Dark Void Background) */}
        <div className={styles.plasmaChamber}>
          {/* Swirling Plasma Vortex Layer 1 (Clockwise Cyan / Violet / Amber) */}
          <div className={styles.plasmaVortexA} />

          {/* Swirling Plasma Vortex Layer 2 (Counter-Clockwise Solar Gold / Electric Teal Shear) */}
          <div className={styles.plasmaVortexB} />

          {/* Stator Magnetic Field SVG (Rotating Magnetic Flux & Stator Nodes) */}
          <svg
            className={styles.statorRing}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Outer Magnetic Flux Dashes */}
            <circle
              cx="50"
              cy="50"
              r="44"
              stroke="#2563eb"
              strokeWidth="1.2"
              strokeDasharray="4 8"
              strokeOpacity="0.8"
            />
            {/* Stator Magnetic Coil Nodes */}
            <circle cx="50" cy="6" r="2.2" fill="#3b82f6" />
            <circle cx="94" cy="50" r="2.2" fill="#3b82f6" />
            <circle cx="50" cy="94" r="2.2" fill="#3b82f6" />
            <circle cx="6" cy="50" r="2.2" fill="#3b82f6" />
            <circle cx="18.9" cy="18.9" r="1.5" fill="#1d4ed8" />
            <circle cx="81.1" cy="18.9" r="1.5" fill="#1d4ed8" />
            <circle cx="81.1" cy="81.1" r="1.5" fill="#1d4ed8" />
            <circle cx="18.9" cy="81.1" r="1.5" fill="#1d4ed8" />
          </svg>

          {/* Inner Counter-Rotating Magnetic Pinch Ring */}
          <svg
            className={styles.armatureRing}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Magnetic Confinement Field Ellipses */}
            <circle
              cx="50"
              cy="50"
              r="34"
              stroke="#1d4ed8"
              strokeWidth="0.9"
              strokeDasharray="6 6"
              strokeOpacity="0.7"
            />
            <circle cx="50" cy="16" r="1.8" fill="#2563eb" />
            <circle cx="79.4" cy="33" r="1.8" fill="#2563eb" />
            <circle cx="79.4" cy="67" r="1.8" fill="#2563eb" />
            <circle cx="50" cy="84" r="1.8" fill="#2563eb" />
            <circle cx="20.6" cy="67" r="1.8" fill="#2563eb" />
            <circle cx="20.6" cy="33" r="1.8" fill="#2563eb" />
          </svg>

          {/* Dynamic Electric Plasma Lightning Arcs (Layer 1 - Primary Royal / Deep Blue Filaments) */}
          <svg
            className={styles.lightningLayerA}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M50 50 L42 38 L48 32 L36 20 L30 14"
              stroke="#2563eb"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.lightningPath1}
            />
            <path
              d="M50 50 L58 40 L54 30 L66 18 L76 16"
              stroke="#60a5fa"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.lightningPath2}
            />
            <path
              d="M50 50 L38 58 L32 54 L20 66 L14 74"
              stroke="#1d4ed8"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.lightningPath3}
            />
            <path
              d="M50 50 L62 56 L58 66 L72 76 L82 82"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.lightningPath4}
            />
          </svg>

          {/* Dynamic Electric Plasma Lightning Arcs (Layer 2 - Deep Navy / Cobalt Filaments) */}
          <svg
            className={styles.lightningLayerB}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M50 50 L60 42 L68 46 L78 36 L86 28"
              stroke="#1e40af"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.goldLightning1}
            />
            <path
              d="M50 50 L44 60 L48 68 L36 78 L26 84"
              stroke="#1d4ed8"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.goldLightning2}
            />
            <path
              d="M50 50 L38 42 L34 46 L22 38 L16 30"
              stroke="#3b82f6"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.goldLightning3}
            />
            <path
              d="M50 50 L64 58 L70 54 L82 64 L88 72"
              stroke="#1e3a8a"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.goldLightning4}
            />
          </svg>

          {/* High-Frequency Core Micro-Arcs (Continuous Central Crackle) */}
          <svg
            className={styles.coreMicroArcs}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M50 50 L47 44 L53 40 L50 34"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M50 50 L56 46 L54 52 L62 54"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M50 50 L45 54 L51 58 L48 64"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M50 50 L44 48 L40 52 L34 48"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>

          {/* Orbiting Ionized Fusion Sparks */}
          <div className={`${styles.orbitingSpark} ${styles.spark1}`} />
          <div className={`${styles.orbitingSpark} ${styles.spark2}`} />
          <div className={`${styles.orbitingSpark} ${styles.spark3}`} />
          <div className={`${styles.orbitingSpark} ${styles.spark4}`} />

          {/* Radiant Fusion Core (The Star / Plasma Singularity) */}
          <div className={styles.fusionCore}>
            {/* Outer Radiant Corona Glow */}
            <div className={styles.coreCorona} />

            {/* Rotating Crystalline Lens Flare Star */}
            <div className={styles.coreFlare} />

            {/* Inner Superheated Epicenter */}
            <div className={styles.coreEpicenter} />
          </div>

          {/* Lower HUD Inscription Arc ("AI ASSISTANT") */}
          {showText && !isCompact && (
            <div className={styles.hudTextWrapper}>
              <svg viewBox="0 0 100 100" className={styles.hudSvg} aria-hidden="true">
                <path
                  id={`hudArc-${pixelSize}`}
                  d="M 22 75 A 38 38 0 0 0 78 75"
                  fill="none"
                />
                <text className={styles.hudText}>
                  <textPath
                    href={`#hudArc-${pixelSize}`}
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    AI ASSISTANT
                  </textPath>
                </text>
              </svg>
            </div>
          )}

          {/* Spherical 3D Glass Dome & Specular Reflection */}
          <div className={styles.glassDomeHighlight} />
        </div>
      </div>
    </div>
  );
}
