/**
 * One-time split of feature-wheel-story.markup.ts into its two halves.
 *
 * The file was a single 31KB string holding BOTH the scroll-driven wheel and
 * the command-center deck inside one .fw-scope wrapper. The homepage renders
 * the deck WITHOUT the wheel, so the two are separated here.
 *
 * Separate MODULES rather than two exports from one, so importing the deck
 * cannot drag the wheel's 16KB string into the homepage bundle — that would
 * depend on the bundler shaking out a string constant, which is not worth
 * relying on. feature-wheel-story.markup.ts stays as the module that composes
 * both, and FEATURE_WHEEL_MARKUP is byte-identical to what it was, so
 * /home-classic is untouched. That equality is asserted below.
 *
 * Run once; the result is committed. Kept in the repo because it documents how
 * the boundary was chosen.
 *
 *   node scripts/split-wheel-markup.mjs path/to/original-markup.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const INDEX = 'src/app/features/feature-wheel-story.markup.ts';
const WHEEL = 'src/app/features/wheel-story-markup.ts';
const DECK = 'src/app/features/command-center-markup.ts';

const source = process.argv[2] || INDEX;
const raw = readFileSync(source, 'utf8');

const at = raw.indexOf('FEATURE_WHEEL_MARKUP = "');
if (at < 0) throw new Error(`no single-string FEATURE_WHEEL_MARKUP in ${source}`);
const html = JSON.parse(raw.slice(at).match(/"(?:[^"\\]|\\.)*"/)[0]);

const OPEN = '<div class="fw-scope">';
const CC = '<!-- ============ command center (everything else) ============ -->';
const CLOSE = '</div>';

if (!html.startsWith(OPEN)) throw new Error('markup does not open with the fw-scope wrapper');
const ccAt = html.indexOf(CC);
if (ccAt < 0) throw new Error('could not find the command-center boundary comment');
const closeAt = html.lastIndexOf(CLOSE);

const wheel = html.slice(OPEN.length, ccAt);
const deck = html.slice(ccAt, closeAt);

const tail = html.slice(closeAt + CLOSE.length);
if (tail.trim() !== '') throw new Error(`unexpected trailing content: ${JSON.stringify(tail)}`);
if (OPEN + wheel + deck + CLOSE !== html) throw new Error('split does not recombine to the original');

const banner = (what) => `// Auto-extracted static markup — ${what}.
// Injected with dangerouslySetInnerHTML; interaction lives in the component.
//
// Inner markup only: NO .fw-scope wrapper. That wrapper is where the palette
// custom properties (--panel, --ink, --orange, --mono ...) are declared, so
// whatever renders this has to supply it or the markup loses every colour and
// font. Split out of one 31KB string so each half can be rendered alone.
/* eslint-disable */
`;

writeFileSync(WHEEL, `${banner('the scroll-driven feature wheel')}
export const WHEEL_STORY_MARKUP = ${JSON.stringify(wheel)};
`);

writeFileSync(DECK, `${banner('the command-center deck (six dashboard cards)')}
export const COMMAND_CENTER_MARKUP = ${JSON.stringify(deck)};
`);

writeFileSync(INDEX, `// Both halves of the wheel story, wrapped — what /home-classic renders.
//
// Byte-identical to the single string this module used to hold; the split is
// asserted in scripts/split-wheel-markup.mjs. Import the halves directly
// (wheel-story-markup / command-center-markup) to render one without the other.
import { WHEEL_STORY_MARKUP } from './wheel-story-markup';
import { COMMAND_CENTER_MARKUP } from './command-center-markup';

export { WHEEL_STORY_MARKUP, COMMAND_CENTER_MARKUP };

export const FEATURE_WHEEL_MARKUP =
  '<div class="fw-scope">' + WHEEL_STORY_MARKUP + COMMAND_CENTER_MARKUP + '</div>';
`);

console.log(`wheel ${wheel.length}  deck ${deck.length}  (original ${html.length})`);
