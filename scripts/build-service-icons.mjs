// Bakes a curated set of Lucide icons (via @iconify-json/lucide) into a static
// TS module, so the app renders real, polished icons with ZERO runtime Iconify
// dependency — no API calls on published sites, tiny client bundle (only these
// icons, not all ~1500). Re-run after editing GLYPHS:
//   node scripts/build-service-icons.mjs
import { getIconData } from '@iconify/utils';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const lucide = require('@iconify-json/lucide/icons.json');

// key (stable, referenced in stored site content) -> Lucide icon name.
// The first 13 keys are the original service-picker set (kept for back-compat);
// the rest give each trade several on-brand options to choose from. Missing names
// are warned + skipped (so getTradeGlyphOptions just offers fewer choices).
const GLYPHS = {
  // Original service-picker keys
  spark: 'sparkle',
  wrench: 'wrench',
  droplet: 'droplet',
  bolt: 'zap',
  home: 'house',
  star: 'star',
  shield: 'shield-check',
  clock: 'clock',
  leaf: 'leaf',
  grid: 'layout-grid',
  truck: 'truck',
  sparkles: 'sparkles',
  roller: 'paint-roller',
  // Electrical
  plug: 'plug',
  lightbulb: 'lightbulb',
  power: 'power',
  lamp: 'lamp',
  cable: 'cable',
  sun: 'sun',
  battery: 'battery-charging',
  // Plumbing
  droplets: 'droplets',
  showerhead: 'shower-head',
  waves: 'waves',
  gauge: 'gauge',
  // HVAC
  wind: 'wind',
  fan: 'fan',
  thermometer: 'thermometer',
  thermometerSnow: 'thermometer-snowflake',
  snowflake: 'snowflake',
  flame: 'flame',
  airvent: 'air-vent',
  // Painting
  paintbrush: 'paintbrush-vertical',
  brush: 'brush',
  palette: 'palette',
  paintbucket: 'paint-bucket',
  // Cleaning
  spray: 'spray-can',
  trash: 'trash-2',
  // Pest
  bug: 'bug',
  // Landscaping / tree
  trees: 'trees',
  tree: 'tree-deciduous',
  pine: 'tree-pine',
  palm: 'tree-palm',
  shrub: 'shrub',
  leafyGreen: 'leafy-green',
  sprout: 'sprout',
  flower: 'flower',
  flower2: 'flower-2',
  shovel: 'shovel',
  scissors: 'scissors',
  axe: 'axe',
  pickaxe: 'pickaxe',
  tractor: 'tractor',
  fence: 'fence',
  clover: 'clover',
  // Pest
  rat: 'rat',
  // Hauling / moving
  package: 'package',
  boxes: 'boxes',
  container: 'container',
  forklift: 'forklift',
  recycle: 'recycle',
  // Carpentry / construction / masonry / roofing
  hardhat: 'hard-hat',
  hammer: 'hammer',
  ruler: 'ruler',
  drill: 'drill',
  brickwall: 'brick-wall',
  layers: 'layers',
  triangle: 'triangle',
  warehouse: 'warehouse',
  building: 'building',
  building2: 'building-2',
  crane: 'construction',
  pencilRuler: 'pencil-ruler',
  square: 'square',
  // Appliance / repair
  settings: 'settings',
  cog: 'cog',
  washingmachine: 'washing-machine',
  // Security
  lock: 'lock',
  camera: 'cctv',
  bell: 'bell',
  key: 'key-round',
};

// Strip Lucide's per-element presentation attributes so the body is bare geometry
// (like the app's original icons). The parent <svg>/<g> then supplies fill/stroke/
// width/caps, so tinting works via `color` (currentColor) for every consumer —
// the header brand mark, the services grid, the favicon, and downloads alike.
// Lucide is stroke-only (fill=none everywhere), so dropping fill is safe.
function sanitizeBody(body) {
  return body
    .replace(/\s+(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-opacity|fill-opacity)="[^"]*"/g, '')
    .replace(/<g\s*>/g, '')
    .replace(/<\/g>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const out = {};
const missing = [];
for (const [key, iconName] of Object.entries(GLYPHS)) {
  const data = getIconData(lucide, iconName);
  if (!data || !data.body) {
    missing.push(`${key} -> ${iconName}`);
    continue; // warn + skip; trade option lists filter to what actually resolved
  }
  const body = sanitizeBody(data.body);
  // Guard: the sanitizer unwraps only styling-only <g> wrappers. If a <g> with a
  // transform (or any leftover group) survives, unconditional </g> removal would
  // corrupt the geometry — fail loudly so we handle it rather than ship a broken icon.
  if (body.includes('<g')) {
    console.error(`Icon "${key}" (${iconName}) has a <g> that survived sanitizing — handle it before regenerating.`);
    process.exit(1);
  }
  out[key] = {
    body,
    width: data.width ?? lucide.width ?? 24,
    height: data.height ?? lucide.height ?? 24,
  };
}

// Raw SVGs from other Iconify sets (dropped in scripts/raw-icons/) for concepts
// Lucide lacks — chainsaw, tree stump, bulldozer, faucet, cactus, etc. Each is a
// single-color, tintable icon; `mode: 'fill'` marks the solid-fill ones so the
// renderer paints fill (not stroke). Multicolor emoji sets are intentionally not
// used here — they can't be tinted to the brand accent. key -> {file, mode}.
const RAW_ICONS = {
  faucet: { file: 'lucide-lab--faucet.svg', mode: 'stroke' },
  drip: { file: 'arcticons--drip.svg', mode: 'stroke' },
  treestump: { file: 'temaki--tree-stump.svg', mode: 'fill' },
  cactus: { file: 'temaki--tree-cactus.svg', mode: 'fill' },
  bulldozer: { file: 'pinhead--bulldozer.svg', mode: 'fill' },
  chainsaw: { file: 'pinhead--chainsaw.svg', mode: 'fill' },
  toolscross: { file: 'material-symbols--construction-rounded.svg', mode: 'fill' },
};

const rawDir = join(dirname(fileURLToPath(import.meta.url)), 'raw-icons');
for (const [key, { file, mode }] of Object.entries(RAW_ICONS)) {
  const svg = readFileSync(join(rawDir, file), 'utf8');
  const vb = (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []);
  if (!vb.length) {
    console.error(`Raw icon "${key}" (${file}) has no "0 0 W H" viewBox — handle it before regenerating.`);
    process.exit(1);
  }
  // Inner geometry only, with per-element fill/stroke stripped so the parent
  // <svg> supplies the paint (fill for 'fill' mode, stroke for 'stroke').
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  const body = sanitizeBody(inner);
  if (body.includes('<g')) {
    console.error(`Raw icon "${key}" (${file}) has a <g> that survived sanitizing — handle it before regenerating.`);
    process.exit(1);
  }
  out[key] = { body, width: Number(vb[1]), height: Number(vb[2]), ...(mode === 'fill' ? { mode: 'fill' } : {}) };
}

if (missing.length) {
  console.warn(`Skipped ${missing.length} missing Lucide icon(s):\n  ` + missing.join('\n  '));
}
console.log('Resolved keys:', Object.keys(out).join(', '));

const banner =
  '// AUTO-GENERATED by scripts/build-service-icons.mjs — do not edit by hand.\n' +
  '// Sources: Lucide (@iconify-json/lucide, MIT) + curated raw SVGs in\n' +
  '// scripts/raw-icons/ (various Iconify sets). Re-run the script to refresh.\n' +
  "// mode 'fill' = solid-fill glyph (default is stroke).\n\n" +
  "export type ServiceIconGlyph = { body: string; width: number; height: number; mode?: 'fill' };\n\n" +
  'export const SERVICE_ICON_GLYPHS: Record<string, ServiceIconGlyph> = {\n';

const lines = Object.entries(out).map(
  ([key, g]) => `  ${key}: { body: ${JSON.stringify(g.body)}, width: ${g.width}, height: ${g.height}${g.mode ? `, mode: ${JSON.stringify(g.mode)}` : ''} },`
);
const contents = banner + lines.join('\n') + '\n};\n';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'templates', 'service-icons.data.ts');
writeFileSync(target, contents, 'utf8');
console.log(`Wrote ${Object.keys(out).length} icons to ${target}`);
