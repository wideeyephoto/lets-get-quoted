/**
 * A signature drawn with a finger.
 *
 * WHAT IS STORED, AND WHY IT IS NOT AN IMAGE. A drawn signature could be a PNG
 * data URL, and every signature library reaches for one. Three reasons this
 * keeps the strokes instead:
 *
 *   It prints. A homeowner saving their quote as a PDF gets the mark at the
 *   printer's resolution rather than at whatever the canvas happened to be on
 *   their phone. A rasterised signature on paper is the fuzzy thing everybody
 *   recognises from a scanned contract.
 *
 *   It is small. A signature is one to three kilobytes of path data against
 *   forty or more for a legible PNG, and it goes in a text column rather than a
 *   storage bucket with a signed-URL lifecycle attached to it.
 *
 *   It can be checked. Path data is numbers and eight letters. The value
 *   arrives from a public endpoint — the token page has no session — so what
 *   lands in the database has to be something a strict allowlist can prove is
 *   inert, and `d="M12 4 L18 9"` is. A base64 blob is not.
 *
 * COORDINATES. Points are captured in units of the pad's own WIDTH, so x runs
 * 0..1 and y runs 0..1/aspect. Nothing here depends on how many device pixels
 * the canvas had, so the same signature redraws correctly after a rotation, a
 * resize, or on a different screen entirely.
 */

export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

/**
 * The box every stored signature is expressed in. Fixed, so the path data is
 * the only thing that has to be stored — the viewBox is a constant both the
 * writer and every reader already agree on. 3:1 matches the pad's CSS aspect
 * ratio, so nothing is ever squashed.
 */
export const SIGNATURE_VIEWBOX = { width: 600, height: 200 } as const;
export const SIGNATURE_ASPECT = SIGNATURE_VIEWBOX.width / SIGNATURE_VIEWBOX.height;

/** Path data long enough to be a real signature is nowhere near this. */
export const SIGNATURE_MAX_CHARS = 20_000;

/**
 * How much travel counts as having signed, in units of the pad's width.
 *
 * A stray tap while scrolling is ~0, a flick is ~0.05, and any actual mark —
 * even a terse one — clears this several times over. It exists so the Approve
 * button cannot be unlocked by brushing the canvas.
 */
export const SIGNATURE_MIN_INK = 0.08;

/** How the acceptance was signed. Both are signatures; they are not the same. */
export type SignatureMethod = 'drawn' | 'typed';

export function isSignatureMethod(value: unknown): value is SignatureMethod {
  return value === 'drawn' || value === 'typed';
}

/** Total pen travel across every stroke, in pad-width units. */
export function signatureInk(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      total += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
  }
  return total;
}

/** Enough of a mark to be treated as a signature. */
export function hasSignedEnough(strokes: SignatureStroke[]): boolean {
  return signatureInk(strokes) >= SIGNATURE_MIN_INK;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Strokes to SVG path data, smoothed.
 *
 * Quadratic curves through stroke midpoints rather than straight segments
 * between raw samples: a pointer emits points at whatever rate the device felt
 * like, and joining them with `L` gives a signature made of visible facets.
 * The midpoint construction is the standard one, and it costs nothing — the
 * control points are the samples themselves.
 */
export function strokesToPath(strokes: SignatureStroke[]): string {
  const scale = SIGNATURE_VIEWBOX.width;
  const parts: string[] = [];

  for (const stroke of strokes) {
    const points = stroke.map((point) => ({ x: round(point.x * scale), y: round(point.y * scale) }));
    if (points.length === 0) continue;

    if (points.length === 1) {
      // A dot. Given a round linecap this renders as one, and a zero-length
      // path renders as nothing at all in several browsers.
      parts.push(`M${points[0].x} ${points[0].y}l0.1 0`);
      continue;
    }

    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = round((points[i].x + points[i + 1].x) / 2);
      const midY = round((points[i].y + points[i + 1].y) / 2);
      d += `Q${points[i].x} ${points[i].y} ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += `L${last.x} ${last.y}`;
    parts.push(d);
  }

  return parts.join('');
}

/**
 * Whether a string may be written to the database as path data.
 *
 * THE ALLOWLIST IS THE POINT. This value is submitted by an anonymous visitor
 * holding a link, and it is later rendered inside an <svg> on the contractor's
 * own screens as well as the customer's. Anything but the eight path commands
 * and the numbers between them is rejected outright rather than escaped,
 * because "escaped correctly everywhere it is used, forever" is a promise no
 * codebase keeps.
 */
export function isSignaturePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  if (path.length === 0 || path.length > SIGNATURE_MAX_CHARS) return false;
  if (!path.startsWith('M')) return false;
  return /^[MLQCZ0-9 .,-]+$/.test(path);
}

/**
 * What actually goes in the column: the path if it is one, otherwise nothing.
 * Never a partially-cleaned string — a signature that had to be scrubbed to be
 * storable is not a signature anybody should be shown as evidence later.
 */
export function safeSignaturePath(value: unknown): string | null {
  return isSignaturePath(value) ? value.trim() : null;
}
