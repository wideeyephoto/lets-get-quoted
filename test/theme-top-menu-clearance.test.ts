import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('website builder themes top menu clearance', () => {
  const cssPath = resolve(__dirname, '../src/lib/templates/themes.module.css');
  const css = readFileSync(cssPath, 'utf8');

  it('declares scroll-margin-top for section targets so anchor jumps clear the top menu', () => {
    expect(css).toMatch(/\.site\s+section\[id\][\s\S]*?scroll-margin-top:\s*clamp\(84px/);
    expect(css).toMatch(/\.site\s+#top\s*\{\s*scroll-margin-top:\s*0/);
  });

  it('declares expanded scroll-margin-top for stacked desktop header layout', () => {
    expect(css).toMatch(/\.site\[data-header=['"]stacked['"]\]\s+section\[id\][\s\S]*?scroll-margin-top:\s*clamp\(130px/);
  });

  it('prevents forgeHeader from covering announcement and utility bars', () => {
    // forgeHeader uses sticky/relative with negative margin instead of absolute top:0
    expect(css).toMatch(/\.forgeHeader\s*\{[^}]*position:\s*sticky;[^}]*margin-bottom:\s*-84px/);
  });

  it('adjusts glass floating header offset when announcement or utility bars are active', () => {
    expect(css).toMatch(/\.site:has\(\.announceBar\)\[data-header=['"]glass['"]\]\s+header\s*\{\s*top:\s*calc\(14px\s*\+\s*38px\)/);
    expect(css).toMatch(/\.site:has\(\.headerUtilityBar\)\[data-header=['"]glass['"]\]\s+header\s*\{\s*top:\s*calc\(14px\s*\+\s*36px\)/);
  });

  it('provides hero headroom for glass header across all themes', () => {
    expect(css).toContain('.reno[data-header=\'glass\'] .renoHero');
    expect(css).toContain('.guild[data-header=\'glass\'] .guildHero');
    expect(css).toContain('.vista[data-header=\'glass\'] .vistaHero');
  });

  it('ensures forgeBadge has clearance from the header', () => {
    expect(css).toMatch(/\.forgeBadge\s*\{[^}]*top:\s*clamp\(6\.5rem,\s*14vw/);
  });
});
