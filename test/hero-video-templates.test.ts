import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const THEMES_CSS = read('src', 'lib', 'templates', 'themes.module.css');
const HANDY_TSX = read('src', 'lib', 'templates', 'handy.tsx');
const PROFESSIONAL_TSX = read('src', 'lib', 'templates', 'professional.tsx');

describe('Hero video rendering and styling across templates', () => {
  it('ensures Haven (handy) passes className and styles video within careHeroCircle', () => {
    // handy.tsx passes className={styles.careHeroImg}
    expect(HANDY_TSX).toContain('className={styles.careHeroImg}');

    // themes.module.css styles video in careHeroCircle
    expect(THEMES_CSS).toMatch(/\.careHeroCircle\s+img,\s*\.careHeroCircle\s+video/);
    expect(THEMES_CSS).toContain('.careHeroCircle .heroCycle');
  });

  it('ensures Guild (professional) styles video within guildHeroFrame', () => {
    expect(THEMES_CSS).toMatch(/\.guildHeroFrame\s*>\s*img,\s*\.guildHeroFrame\s*>\s*video/);
  });
});
