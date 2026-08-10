import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ONE COLOUR FOR A SENT TEXT, IN THREE PLACES.
 *
 * The same outgoing message is drawn on three surfaces: the inbox thread, the
 * outgoing-text catalogue under Automations, and the thread beside the hero
 * copy on /features. They are the same message, so they have to be the same
 * bubble — and they drifted apart before, which is why this exists.
 *
 * The comments in both stylesheets quote the gradient they are explaining, so
 * they are stripped before anything is matched or a bare toContain would find
 * the explanation instead of the rule.
 */

const read = (path: string) =>
  readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

const GLOBALS = read('src/app/globals.css');
const FLAGSHIP = read('src/components/flagship/flagship.module.css');
const GENERATOR = read('scripts/generate-flagship-css.mjs');

const SENT = 'linear-gradient(246deg, #0061af, #1f3b4d)';

function ruleFor(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('a sent text message', () => {
  it('is the same blue in the inbox, the catalogue and the /features thread', () => {
    expect(ruleFor(GLOBALS, '.inbox-bubble-outbound {')).toContain(SENT);
    expect(ruleFor(GLOBALS, '.sms-cat-bubble {')).toContain(SENT);
    expect(ruleFor(FLAGSHIP, '.root :global(.ht-out) p {')).toContain(SENT);
  });

  it('survives a regeneration of the flagship stylesheet', () => {
    // flagship.module.css is generated. A hand-edit there is undone by the next
    // `node scripts/generate-flagship-css.mjs`, so the source has to carry it.
    expect(GENERATOR).toContain(SENT);
  });

  it('is no longer the brand orange, which is what buttons are', () => {
    for (const css of [GLOBALS, FLAGSHIP, GENERATOR]) {
      expect(css).not.toContain('#c9430a');
    }
  });

  it('keeps white text, which the lighter end of the gradient can carry', () => {
    // #0061af against #ffffff is 6.3:1 — above the 4.5:1 body-text bar — and the
    // other end is darker still, so no part of the bubble drops below it.
    expect(ruleFor(GLOBALS, '.inbox-bubble-outbound {')).toMatch(/color: #ffffff/);
    expect(ruleFor(GLOBALS, '.sms-cat-bubble {')).toMatch(/color: #ffffff/);
    expect(ruleFor(FLAGSHIP, '.root :global(.ht-out) p {')).toMatch(/color: #fff/);
  });
});
