import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasSignedEnough,
  isSignatureMethod,
  isSignaturePath,
  safeSignaturePath,
  signatureInk,
  SIGNATURE_ASPECT,
  SIGNATURE_MAX_CHARS,
  SIGNATURE_MIN_INK,
  SIGNATURE_VIEWBOX,
  strokesToPath,
  type SignatureStroke,
} from '@/lib/signature';

/**
 * Signing a quote with a finger.
 *
 * The page collected a typed name, which is a valid signature and is also the
 * one nobody feels they have signed anything with. Drawing is the default now
 * and typing is an equal alternative rather than a fallback — a canvas cannot
 * be operated from a keyboard, and no amount of ARIA makes one that can.
 *
 * The mark is stored as SVG path data, so most of what is worth guarding here
 * is about the string that reaches the database: it arrives from an anonymous
 * visitor holding a link and is later rendered on the contractor's screens too.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const pad = read('src', 'components', 'signature-pad.tsx');
const mark = read('src', 'components', 'signature-mark.tsx');
const accept = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteAcceptance.tsx');
const doc = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx');
const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
const feed = read('src', 'lib', 'job-feed.ts');
const actions = read('src', 'app', 'client', 'jobs', '[token]', 'actions.ts');
const lite = readFileSync(join(process.cwd(), 'src', 'app', 'globals-lite.css'), 'utf8').replace(/\r\n/g, '\n');

/** A plausible scrawl: two strokes across most of the pad. */
const scrawl: SignatureStroke[] = [
  Array.from({ length: 40 }, (_, i) => ({ x: 0.1 + i * 0.018, y: 0.16 + Math.sin(i / 3) * 0.06 })),
  Array.from({ length: 12 }, (_, i) => ({ x: 0.55 + i * 0.02, y: 0.1 + i * 0.005 })),
];

/* --- what counts as having signed ------------------------------------------ */

describe('signatureInk measures pen travel, not taps', () => {
  it('a stray tap is nothing', () => {
    expect(signatureInk([[{ x: 0.5, y: 0.2 }]])).toBe(0);
    expect(hasSignedEnough([[{ x: 0.5, y: 0.2 }]])).toBe(false);
  });

  it('a flick while scrolling does not unlock the button', () => {
    const flick: SignatureStroke[] = [[{ x: 0.4, y: 0.2 }, { x: 0.44, y: 0.21 }]];
    expect(signatureInk(flick)).toBeLessThan(SIGNATURE_MIN_INK);
    expect(hasSignedEnough(flick)).toBe(false);
  });

  it('an actual mark clears the floor several times over', () => {
    expect(signatureInk(scrawl)).toBeGreaterThan(SIGNATURE_MIN_INK * 4);
    expect(hasSignedEnough(scrawl)).toBe(true);
  });

  it('adds up across strokes, so a signature made of short letters still counts', () => {
    const letters: SignatureStroke[] = Array.from({ length: 6 }, (_, s) => [
      { x: 0.1 + s * 0.1, y: 0.1 },
      { x: 0.1 + s * 0.1, y: 0.22 },
    ]);
    expect(hasSignedEnough(letters)).toBe(true);
  });

  it('nothing at all is nothing', () => {
    expect(hasSignedEnough([])).toBe(false);
    expect(hasSignedEnough([[]])).toBe(false);
  });
});

/* --- the string that reaches the column ------------------------------------- */

describe('strokesToPath produces path data and only path data', () => {
  const path = strokesToPath(scrawl);

  it('starts at a move and smooths with quadratics rather than facets', () => {
    expect(path.startsWith('M')).toBe(true);
    expect(path).toContain('Q');
    // A pointer samples at whatever rate it likes; joining raw samples with L
    // gives a signature made of visible flat segments.
    expect((path.match(/Q/g) ?? []).length).toBeGreaterThan(10);
  });

  it('scales into the fixed viewBox, so one column is enough', () => {
    expect(SIGNATURE_VIEWBOX).toEqual({ width: 600, height: 200 });
    expect(SIGNATURE_ASPECT).toBe(3);
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(SIGNATURE_VIEWBOX.width);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
  });

  it('stays small — kilobytes, not the forty a legible PNG costs', () => {
    expect(path.length).toBeLessThan(2000);
  });

  it('renders a single tap as a dot rather than as nothing', () => {
    // A zero-length path draws nothing at all in several browsers.
    const dot = strokesToPath([[{ x: 0.5, y: 0.2 }]]);
    expect(dot).toBe('M300 120l0.1 0');
  });

  it('round-trips its own output through the validator', () => {
    expect(isSignaturePath(path)).toBe(true);
    expect(safeSignaturePath(path)).toBe(path);
  });
});

describe('isSignaturePath is an allowlist, because this value is public input', () => {
  it('takes path data', () => {
    expect(isSignaturePath('M10 10L20 20')).toBe(true);
    expect(isSignaturePath('M1.5 2,3 4Q5 6 7 8Z')).toBe(true);
    expect(isSignaturePath('M-4 -2L0 0')).toBe(true);
  });

  it('refuses anything that is not', () => {
    for (const bad of [
      '<svg onload=alert(1)>',
      'M10 10"/><script>alert(1)</script>',
      "M10 10' onclick='x",
      'url(javascript:alert(1))',
      'M10 10 A 5 5 0 0 1 20 20', // arcs are not emitted here, so they are not accepted
      'L10 10', // must start at a move
      '',
      '   ',
    ]) {
      expect(isSignaturePath(bad), bad).toBe(false);
      expect(safeSignaturePath(bad), bad).toBeNull();
    }
  });

  it('refuses the wrong type entirely, not just the wrong string', () => {
    for (const bad of [null, undefined, 42, {}, ['M0 0'], true]) {
      expect(isSignaturePath(bad)).toBe(false);
      expect(safeSignaturePath(bad)).toBeNull();
    }
  });

  it('caps the length, so a link holder cannot post a megabyte', () => {
    expect(isSignaturePath(`M0 0${'L1 1'.repeat(SIGNATURE_MAX_CHARS)}`)).toBe(false);
  });

  it('never returns a partially-cleaned string', () => {
    // A mark that had to be scrubbed to be storable is not evidence of anything.
    expect(safeSignaturePath('M10 10<script>')).toBeNull();
  });

  it('knows the two ways of signing and nothing else', () => {
    expect(isSignatureMethod('drawn')).toBe(true);
    expect(isSignatureMethod('typed')).toBe(true);
    expect(isSignatureMethod('scanned')).toBe(false);
    expect(isSignatureMethod(null)).toBe(false);
  });
});

/* --- the pad ---------------------------------------------------------------- */

describe('the pad works with a thumb', () => {
  it('uses pointer events, so one code path covers finger, mouse and stylus', () => {
    expect(pad).toContain('onPointerDown');
    expect(pad).toContain('onPointerMove');
    // Without capture, a stroke that leaves the pad is dropped mid-letter.
    expect(pad).toContain('setPointerCapture');
    expect(pad).not.toContain('onTouchStart');
  });

  it('takes the gesture away from the scroller', () => {
    // Without this the first downstroke of every signature scrolls the page.
    expect(lite).toMatch(/\.sigpad-canvas \{[\s\S]{0,240}touch-action: none/);
  });

  it('ignores a second finger, which is how a two-finger scroll draws a line', () => {
    expect(pad).toContain('if (!event.isPrimary) return;');
  });

  it('draws at device resolution rather than at CSS pixels', () => {
    expect(pad).toContain('window.devicePixelRatio');
  });

  it('survives a resize or a rotation, because it stores no device pixels', () => {
    expect(pad).toContain('ResizeObserver');
    expect(pad).toContain('/ rect.width');
  });

  it('can be undone and cleared', () => {
    expect(pad).toContain('function undo()');
    expect(pad).toContain('function clear()');
  });
});

/* --- drawing is primary, typing is equal ------------------------------------ */

describe('drawing is the default and typing is a real alternative', () => {
  it('opens on the pad', () => {
    expect(read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDeck.tsx')).toContain(
      "useState<SignatureMethod>('drawn')",
    );
  });

  it('offers typing as an announced control, not a hidden escape hatch', () => {
    // A canvas cannot be operated from a keyboard, so the alternative has to be
    // reachable by one.
    expect(accept).toContain('role="radiogroup"');
    expect(accept).toContain('Draw my signature');
    expect(accept).toContain('Type my name');
    expect(accept).toContain('aria-checked={signMethod === ');
  });

  it('does not make somebody type a name the job already knows', () => {
    expect(page).toContain('initialSigner={dashboard.job.client_name');
    // Editable, though: the person at the table is sometimes the other half of
    // the household, and the record should say who actually accepted.
    expect(accept).toContain('onChange={(event) => setSigner(event.target.value)}');
  });

  it('says what is missing when the name is there and the mark is not', () => {
    expect(accept).toContain('Sign in the box above to approve.');
  });

  it('carries the mark to the same action, in a field the server cleans again', () => {
    expect(accept).toContain('name="signaturePath"');
    expect(actions).toContain("formData.get('signaturePath')");
    expect(feed).toContain('safeSignaturePath(drawn?.path)');
  });
});

/* --- what is recorded -------------------------------------------------------- */

describe('the record says how it was signed', () => {
  it('stores the mark, the method and the moment', () => {
    expect(feed).toContain('quote_signature_path: drawnPath');
    expect(feed).toContain('quote_signature_method: method');
    expect(feed).toContain('quote_signed_at: now');
  });

  it('keeps WHO accepted even on a database without the mark columns', () => {
    // Losing a drawing during a deploy window is a shame. Losing the name,
    // because the write named a column that was not there, is a hole in the
    // record — and Supabase returns that as an error object, not a throw, so
    // the surrounding try/catch would never have seen it.
    expect(feed).toContain('if (error) await record({ quote_signer_name: signature, quote_signed_at: now });');
    expect(page).toContain('wide.error ?');
  });

  it('is only ever written against an unsigned job', () => {
    expect(feed).toMatch(/\.is\('quote_signed_at', null\)/);
  });

  it('does not change what happens for a caller that passes no mark', () => {
    // Every existing acceptance path — the invoice signature, the owner's own
    // "mark won", picking a start date — calls this with no drawing.
    expect(feed).toContain('drawn?: { path: string | null } | null,');
    expect(feed).toContain("const method: SignatureMethod = drawnPath ? 'drawn' : 'typed';");
  });
});

/* --- reading it back --------------------------------------------------------- */

describe('the mark is read back the same way everywhere', () => {
  it('renders as a path attribute, never as injected markup', () => {
    expect(mark).toContain('<path d={path} />');
    expect(mark).not.toContain('dangerouslySetInnerHTML');
  });

  it('is checked again on the way out, not trusted because it is in a column', () => {
    expect(page).toContain('safeSignaturePath(signatureRow?.quote_signature_path)');
    expect(page).toContain('isSignatureMethod(signatureRow?.quote_signature_method)');
  });

  it('has a text alternative, since a signature is a picture of a name', () => {
    expect(mark).toContain('aria-label={name ? `Signature of ${name}`');
  });

  it('appears on the document itself, which is the copy that gets filed', () => {
    expect(doc).toContain('quote-doc-executed');
    expect(doc).toContain('<SignatureMark');
    expect(page).toContain('signature={awaitingApproval ? null :');
  });

  it('treats an old typed acceptance as typed rather than as unsigned', () => {
    // Every acceptance recorded before the mark columns existed has a name and
    // no method.
    expect(page).toContain("? 'typed'");
  });
});

describe('and it prints', () => {
  const block = lite.slice(lite.indexOf('@media print'));

  it('is why the mark is a path and not a canvas bitmap', () => {
    expect(block).toContain('.quote-doc-executed');
    expect(block).toContain('.sigmark-ink');
  });

  it('redraws the signature lines as borders, since backgrounds do not print', () => {
    expect(block).toMatch(/\.quote-doc-executed-rule \{[\s\S]{0,120}border-top: 1px solid #111 !important/);
  });

  it('does not print the input surface', () => {
    expect(block).toContain('.sigpad');
    expect(block).toContain('.sign-method');
  });
});
