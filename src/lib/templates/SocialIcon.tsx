import { SOCIAL_ICON_GLYPHS } from './social-icons.data';

// The social / review-platform brand marks, baked offline — see
// scripts/build-social-icons.mjs. Unknown keys fall back to a globe rather than
// rendering nothing, so a platform added to the registry before its mark is
// baked degrades to a generic icon instead of an invisible link.
//
// Simple Icons are solid fills and Lucide is stroke geometry, so `mode` decides
// which one this <svg> paints. Both use currentColor, so the footer tints them
// with the theme's own on-deep color like every other glyph.
export { SOCIAL_ICON_GLYPHS };

export default function SocialIcon({ name, className }: { name: string; className?: string }) {
  const glyph = SOCIAL_ICON_GLYPHS[name] ?? SOCIAL_ICON_GLYPHS.website;
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
