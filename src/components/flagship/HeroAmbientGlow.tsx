'use client';

/**
 * Living ambient glow system for the flagship hero section.
 *
 * Provides a dynamic, multi-layered atmospheric lighting stage:
 * - Amber / Solar radiant nebula drifting smoothly behind the headline & CTA copy
 * - Electric Cyan / Deep Teal nebula framing the interactive workflow demo
 * - Center bridge aurora connecting both columns with warm kinetic luminescence
 * - Deep sapphire atmospheric base layer adding spatial depth
 * - Atmospheric kinetic light shimmer beam sweeping across the grid
 *
 * GPU-accelerated (transforms & opacity), isolated with pointer-events: none,
 * zero layout shift, fully accessible (aria-hidden), and respects prefers-reduced-motion.
 */
export default function HeroAmbientGlow() {
  return (
    <div className="hero-ambient-glow" aria-hidden="true">
      <div className="hero-glow-orb-primary" />
      <div className="hero-glow-orb-secondary" />
      <div className="hero-glow-orb-center" />
      <div className="hero-glow-orb-deep" />
      <div className="hero-glow-ray" />
    </div>
  );
}
