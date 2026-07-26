import { SERVICE_ICON_GLYPHS } from './service-icons.data';

// A polished stroke-icon set (Lucide, baked offline — see scripts/build-service-icons.mjs).
// Keyed by a stable name; unknown keys fall back to 'spark'. The bodies are bare
// geometry, so this <svg> supplies fill/stroke/width and every template tints the
// glyph via `color` (currentColor). One source of truth for the services grid,
// the header brand mark, the favicon, and the downloadable logo (@/lib/brand-mark).
export { SERVICE_ICON_GLYPHS };
export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICON_GLYPHS);

export default function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const glyph = SERVICE_ICON_GLYPHS[name] ?? SERVICE_ICON_GLYPHS.spark;
  // Most glyphs are stroke-only (Lucide); a few baked-in raw icons are solid
  // fills (mode: 'fill'). Either way the paint is currentColor, so `color`
  // tints the glyph for every consumer.
  const fill = glyph.mode === 'fill';
  return (
    <svg
      className={className}
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={fill ? undefined : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: glyph.body }}
    />
  );
}
