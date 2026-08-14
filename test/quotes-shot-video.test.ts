import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Step 2 clip on /features/quotes.
 *
 * It is the one piece of moving media on the page, it starts without being
 * asked, and it never stops on its own — three properties that between them
 * cover an accessibility requirement, an autoplay policy and 400KB of somebody
 * else's data. What is asserted here is the set of attributes and guards that
 * keep all three answered, because every one of them is a single word that
 * would be easy to drop in a tidy-up.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const COMPONENT = stripJs(read('src', 'app', 'features', 'quotes', 'ShotVideo.tsx'));
const PAGE = stripJs(read('src', 'app', 'features', 'quotes', 'page.tsx'));

describe('the step 2 clip plays by itself', () => {
  it('loops, so the add-on being taken is not a thing you can miss by three seconds', () => {
    expect(COMPONENT).toContain('loop');
  });

  /**
   * MUTED AND playsInline ARE WHAT MAKE UNPROMPTED PLAYBACK LEGAL.
   *
   * Every current browser refuses to start a video with sound without a
   * gesture, so dropping `muted` does not make the clip audible — it stops the
   * clip. And without playsInline, iOS takes it fullscreen the moment it
   * starts, which turns a small panel on a marketing page into a takeover.
   */
  it('is muted and inline, or it does not start at all', () => {
    expect(COMPONENT).toContain('muted');
    expect(COMPONENT).toContain('playsInline');
  });

  it('starts on arrival rather than on load, so the 400KB follows the visitor', () => {
    expect(COMPONENT).toContain('IntersectionObserver');
    expect(COMPONENT).toContain('preload="none"');
    expect(COMPONENT).toContain("video.preload = 'auto'");
    expect(COMPONENT).toContain('video.play()');
    // The attribute would start it on load, before anyone has scrolled to it.
    expect(COMPONENT).not.toContain('autoPlay');
  });

  /* A rejected play() is a normal outcome, not a crash. The poster and the
     controls are already the answer to it. */
  it('survives a browser that refuses to start it', () => {
    expect(COMPONENT).toContain('.catch(');
  });
});

describe('and it can always be stopped', () => {
  /**
   * WCAG 2.2.2. Motion that starts on its own and runs past five seconds needs
   * a way to pause it, and a three-second loop runs until the tab closes.
   * `controls` is that mechanism, so it is not decoration and not optional.
   */
  it('keeps the controls that are the pause mechanism', () => {
    expect(COMPONENT).toContain('controls');
  });

  it('never starts for somebody who asked for no motion', () => {
    expect(COMPONENT).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    // Bail before the observer is ever wired up — not pause afterwards.
    expect(COMPONENT).toMatch(/prefers-reduced-motion: reduce\)'\)\.matches\) return;/);
  });

  /**
   * THE VISITOR'S PAUSE OUTRANKS THE SCROLL POSITION.
   *
   * Without this the clip restarts every time the section re-enters the
   * viewport, so pressing pause achieves nothing and the control that satisfies
   * 2.2.2 is a decoration. `surrendered` is set once and never cleared.
   */
  it('does not start again once the visitor has paused it', () => {
    expect(COMPONENT).toContain('surrendered = true');
    expect(COMPONENT).toContain('if (surrendered');
    // Exactly one `= false`, and it is the declaration. A second one would be
    // somebody clearing the flag, which is the whole bug this guards against.
    expect(COMPONENT.match(/surrendered = false/g)).toHaveLength(1);
    expect(COMPONENT).toContain('let surrendered = false');
  });

  /**
   * AND OUR OWN PAUSE MUST NOT LOOK LIKE THEIRS.
   *
   * Scrolling away pauses the clip, which fires the same `pause` event the
   * visitor's press does — so without a flag, one scroll past the section
   * permanently counts as a surrender. `pause()` queues its event rather than
   * firing it inline, so the flag has to be cleared by the handler; and it is
   * only ever set on a video that is actually playing, or a no-op pause would
   * leave it standing to swallow the visitor's next press.
   */
  it('tells its own pause apart from the visitor\'s', () => {
    expect(COMPONENT).toContain('selfPause = true');
    expect(COMPONENT).toContain('selfPause = false');
    expect(COMPONENT).toMatch(/if \(video\.paused\) return;\s*selfPause = true;/);
  });

  it('stops decoding for a section nobody is looking at', () => {
    expect(COMPONENT).toContain('visibilitychange');
    expect(COMPONENT).toContain('document.hidden');
    expect(COMPONENT).toContain('observer.disconnect()');
    expect(COMPONENT).toContain("removeEventListener('pause'");
  });
});

describe('the page hands it over intact', () => {
  it('renders the client component rather than a bare tag', () => {
    expect(PAGE).toContain('<ShotVideo');
    expect(PAGE).toContain("import ShotVideo from './ShotVideo'");
    expect(PAGE).not.toContain('<video');
  });

  /* The clip has no captions and no transcript, so the label is the only
     description of what happens in it. */
  it('still describes the clip for somebody who cannot see it', () => {
    expect(PAGE).toContain('label={shot.media.label}');
    expect(COMPONENT).toContain('aria-label={label}');
  });

  it('points at files that exist', () => {
    for (const asset of ['quote-preview-popup.mp4', 'quote-preview-popup-poster.jpg']) {
      expect(existsSync(join(process.cwd(), 'public', 'media', 'quotes', asset)), asset).toBe(true);
    }
    expect(PAGE).toContain('poster={shot.media.poster}');
  });
});
