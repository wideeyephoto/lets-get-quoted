'use client';

/**
 * Global pulsating technical grid background for all public marketing pages.
 *
 * Renders a full-screen, fixed-position light opacity blueprint grid that
 * breathes in opacity continuously, giving ambient vitality to every
 * public page across the application.
 *
 * GPU-accelerated (opacity only), non-interactive (pointer-events: none),
 * accessibility safe (aria-hidden="true"), and respects prefers-reduced-motion.
 */
export default function PublicGridBackground() {
  return <div className="public-grid-background" aria-hidden="true" />;
}
