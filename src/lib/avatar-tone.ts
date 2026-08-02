// Which colour a person's initials circle gets.
//
// Thirty-seven clients in one scrolling list, every avatar the same orange,
// meant the circle carried no information at all — you read two letters to
// find a row you had already scrolled past once. Colour makes a row findable
// by shape rather than by reading, which is the only thing an avatar is for
// when there's no photo.
//
// STABLE, not random. The same person is the same colour on the roster, in the
// detail pane, in the hours table and after a page refresh — a colour that
// shuffles is worse than no colour, because it invites you to rely on it and
// then lies.
//
// Keyed on the NAME, not the record id, and that choice is load-bearing. The
// initials come from the name, so hashing the name makes the colour vary
// exactly when the two letters in the circle vary — which is the only moment
// the colour has a job to do. Keyed on the id, "Danny Whitcombe" and "Dee
// Whitlock" landed on the same tone on a real roster: adjacent rows, both
// reading DW, in the same colour, and nothing on screen told them apart. Two
// people who share a full name still collide, but they are indistinguishable
// anyway and giving them different colours would be the confusing answer.
//
// PURE — no I/O, no React. The palette itself lives in CSS (see [data-avatar-tone]
// in globals.css) so the crew skins can keep overriding what they already
// override, and so a tone is one number crossing the wire rather than three
// colour strings.

/** How many tones the stylesheet defines. Keep in step with globals.css. */
export const AVATAR_TONE_COUNT = 12;

/**
 * A stable tone index for a key, 0..AVATAR_TONE_COUNT-1.
 *
 * FNV-1a rather than a sum of char codes: a sum puts "Dana" and "Dan a" on the
 * same tone and, worse, walks slowly through the palette in alphabetical order,
 * so a name-sorted list comes out as bands of one colour — the exact thing the
 * colour is meant to break up.
 */
export function avatarTone(key: string | null | undefined): number {
  const text = (key ?? '').trim().toLowerCase();
  if (!text) return 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // imul keeps the multiply in 32-bit range; without it the value goes
    // through float precision and the low bits — the ones we mod on — rot.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Avalanche before the modulus. FNV-1a's LOW bits are its weakest, and
  // `% 12` reads nothing else — on a real client list that put six unrelated
  // names on one colour while three tones went unused. This is the lowbias32
  // finalizer: it pulls the high bits, which are well mixed, down into the
  // range the modulus actually looks at.
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash = (hash ^ (hash >>> 15)) >>> 0;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  // The >>> 0 is not decoration. `^` yields a SIGNED 32-bit int, so without it
  // the last xor can go negative and `% 12` comes back negative with it —
  // which is a tone the stylesheet has no rule for, i.e. an uncoloured avatar.
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % AVATAR_TONE_COUNT;
}
