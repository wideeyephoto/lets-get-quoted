'use client';

/**
 * Living ambient glow and dynamic background lighting system for the
 * dedicated AI Photo Intake & Scope Scanner experience section (#product-demo).
 *
 * Layers:
 * - Precision AI Dot Grid Mesh: Subtle radial-masked technological matrix
 * - Solar / Amber Radiant Aurora: Breathing warmth behind the eyebrow and headline
 * - Electric Cyan Nebula: Dynamic luminescence illuminating the left flank
 * - Emerald / Mint Qualification Nebula: Vibrant glow framing the qualification side
 * - Central Core Spatial Aura: 3D backlight elevation centered directly behind the intake demo
 * - Atmospheric Diagonal Light Ray / Shimmer: Kinetic energy sweeping smoothly across the section
 */
export default function IntakeAmbientGlow() {
  return (
    <div className="intake-ambient-glow" aria-hidden="true">
      <div className="intake-glow-grid" />
      <div className="intake-glow-orb-header" />
      <div className="intake-glow-orb-cyan" />
      <div className="intake-glow-orb-emerald" />
      <div className="intake-glow-orb-core" />
      <div className="intake-glow-ray" />
    </div>
  );
}
