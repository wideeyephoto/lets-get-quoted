import { describe, it, expect } from 'vitest';
import { AVATAR_TONE_COUNT, avatarTone } from '@/lib/avatar-tone';

// An avatar colour is only useful if it's the SAME colour every time. A tone
// that shuffles is worse than no tone at all, because it invites you to rely on
// it and then lies to you.

describe('a tone is stable', () => {
  it('gives the same key the same tone, every time', () => {
    const key = '9c011ad8-acfb-4545-993b-6056c784ef21';
    const first = avatarTone(key);
    for (let i = 0; i < 50; i += 1) expect(avatarTone(key)).toBe(first);
  });

  it('ignores case and surrounding whitespace', () => {
    // The same person reached through a name in one view and an id in another
    // must not change colour over a stray space.
    expect(avatarTone('Dana Whitfield')).toBe(avatarTone('  dana whitfield  '));
  });
});

describe('a tone is always paintable', () => {
  it('stays inside the palette the stylesheet defines', () => {
    const keys = ['a', 'Dana Whitfield', '9c011ad8-acfb-4545-993b-6056c784ef21', '?', '🙂', 'x'.repeat(500)];
    for (const key of keys) {
      const tone = avatarTone(key);
      expect(Number.isInteger(tone)).toBe(true);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(AVATAR_TONE_COUNT);
    }
  });

  it('handles a missing key rather than throwing', () => {
    expect(avatarTone(null)).toBe(0);
    expect(avatarTone(undefined)).toBe(0);
    expect(avatarTone('')).toBe(0);
    expect(avatarTone('   ')).toBe(0);
  });
});

describe('a tone actually differentiates', () => {
  // The whole point. A weak hash walks slowly through the palette in
  // alphabetical order, so a name-sorted list comes out as bands of one
  // colour — which is the thing the colour exists to break up.
  const names = [
    'Alan Trudeau', 'Alicia Nunez', 'Bethany Iqbal', 'Curtis Mabry', 'Damon Pryce',
    'Dana Whitfield', 'Derek Salinas', 'Danny Whitcombe', 'Dee Whitlock', 'Grace Yun',
    'Karl Vance', 'Luis Moreno', 'Mike Torres', 'Omar Haddad', 'Pete Salas',
    'Ray Okafor', 'Nina Delacroix', 'Ruben Castillo', 'Hannah Ostrowski', 'Marcus Boyle',
  ];

  it('does not put neighbours in a sorted list on the same tone', () => {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const tones = sorted.map(avatarTone);
    let adjacentClashes = 0;
    for (let i = 1; i < tones.length; i += 1) if (tones[i] === tones[i - 1]) adjacentClashes += 1;
    // Twelve tones over twenty names will collide somewhere; what must not
    // happen is a run of the same colour down the visible list.
    expect(adjacentClashes).toBeLessThanOrEqual(1);
  });

  it('splits names that share a prefix', () => {
    // "Dana" / "Danny" / "Damon" sit together in every sorted roster.
    const cluster = ['Damon Pryce', 'Dana Whitfield', 'Danny Whitcombe', 'Derek Salinas', 'Dee Whitlock'];
    expect(new Set(cluster.map(avatarTone)).size).toBeGreaterThanOrEqual(4);
  });

  it('splits people who share initials', () => {
    // The case where colour is doing the entire job: identical two letters in
    // the circle, so only the colour tells the rows apart.
    expect(avatarTone('Danny Whitcombe')).not.toBe(avatarTone('Dee Whitlock'));
  });

  it('uses most of the palette across a real roster', () => {
    expect(new Set(names.map(avatarTone)).size).toBeGreaterThanOrEqual(AVATAR_TONE_COUNT - 3);
  });

  it('spreads sequential ids, which is how seeded data arrives', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `crew-${i}`);
    const counts = new Map<number, number>();
    for (const tone of ids.map(avatarTone)) counts.set(tone, (counts.get(tone) ?? 0) + 1);
    expect(counts.size).toBe(AVATAR_TONE_COUNT);
    // No tone should take more than a quarter of a 40-strong list.
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(10);
  });
});
