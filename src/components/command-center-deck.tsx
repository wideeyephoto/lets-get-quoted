'use client';

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
// Imported from the split module, not from feature-wheel-story.markup, so the
// wheel's own 16KB string cannot ride along into the homepage bundle.
import { COMMAND_CENTER_MARKUP } from '@/app/features/command-center-markup';
import { wireCommandCenter } from '@/app/features/command-center-motion';
import './command-center-deck.css';

/**
 * The product screens — Today, Current leads, Schedule, Automations, Insights.
 *
 * These were built for the original homepage and have been sitting on
 * /home-classic ever since the flagship replaced it. Nothing about them was
 * redrawn to bring them here; the markup is the same string /home-classic
 * renders (see feature-wheel-story.markup.ts) and the stylesheet is generated
 * from the same source, so the two cannot drift apart.
 *
 * ONE SCREEN AT A TIME, NOT SIX STACKED.
 *
 * They used to render as six full-width cards down the page, each one a
 * heading plus a dashboard mockup taller than most viewports — about six
 * screens of scrolling to see what is, from the visitor's point of view, one
 * product from five angles. Worse, the section directly above already listed
 * the same capabilities as a grid of cards, so the page said everything twice:
 * once in a sentence, then again at full height.
 *
 * The two are now one section. The grid above chooses which screen shows here.
 *
 * TWO WRAPPER CLASSES, BOTH LOAD-BEARING
 *
 *   fw-scope  declares the palette (--panel, --ink, --orange, --mono ...) that
 *             every rule in the deck reads. Without it the cards render with no
 *             colors and the wrong typeface.
 *   cc-root   is what the generated stylesheet prefixes every selector with, so
 *             its rules outrank the flagship homepage's preflight reset. See
 *             scripts/generate-command-center-css.mjs for the full reasoning.
 */

/**
 * The deck string, cut into one entry per screen.
 *
 * Done at module scope, once, on a constant — not per render and not in an
 * effect. The source is a generated single string of HTML, so this is a parse
 * rather than a data structure, but the shape it is parsing is stable and
 * machine-written: every screen is exactly one `<article class="cc-card">` and
 * nothing else in the document is an article.
 *
 * The label comes out of the card's own eyebrow, so a tab can never be named
 * something different from the screen it selects.
 */
type Screen = { id: string; label: string; html: string };

function splitDeck(markup: string): Screen[] {
  const OPEN = '<article class="cc-card">';
  const CLOSE = '</article>';
  return markup
    .split(OPEN)
    .slice(1)
    .map((chunk) => {
      const end = chunk.indexOf(CLOSE);
      const inner = end === -1 ? chunk : chunk.slice(0, end);
      const label = inner.match(/class="cc-card-eye">([^<]+)</)?.[1]?.trim() ?? '';
      // Re-wrapped: the split consumed the opening tag, and .cc-card is what
      // both the stylesheet and the reveal/parallax wiring select on.
      return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, html: OPEN + inner + CLOSE };
    })
    .filter((screen) => screen.label !== '');
}

/**
 * "Client dashboard" is dropped.
 *
 * The section directly above this one is a full-width demonstration of the
 * client portal with the conversation playing in it — the same idea, shown
 * better, one screen earlier. Filtered by label rather than by index so
 * regenerating the markup with the cards in a different order cannot silently
 * remove the wrong one.
 */
const OMIT = new Set(['Client dashboard']);

const SCREENS = splitDeck(COMMAND_CENTER_MARKUP).filter((screen) => !OMIT.has(screen.label));

/** Stable objects: a fresh {__html} each render makes React rebuild the node. */
const HTML_BY_ID = new Map(SCREENS.map((screen) => [screen.id, { __html: screen.html }]));

export const COMMAND_CENTER_SCREENS = SCREENS.map(({ id, label }) => ({ id, label }));

function CommandCenterDeck({ activeId }: { activeId?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [internal, setInternal] = useState(SCREENS[0]?.id ?? '');
  const reactId = useId();

  // Controlled by the feature grid when it passes an id; self-driving (its own
  // tab strip) when it does not, so /home-classic and the features page can
  // still render this on its own.
  const controlled = activeId != null;
  const current = controlled ? activeId : internal;
  const screen = useMemo(
    () => SCREENS.find((s) => s.id === current) ?? SCREENS[0],
    [current],
  );

  /**
   * ONE OBJECT PER SCREEN, CREATED ONCE.
   *
   * This was an inline `{{ __html: MARKUP }}` — a brand new object on every
   * render. The homepage re-renders on scroll (it tracks an active feature
   * step), and each of those renders was enough for React to tear this subtree
   * down and rebuild it from the string, which orphaned the IntersectionObserver
   * below onto six elements no longer in the document while the fresh ones sat
   * hidden with nobody watching them. Measured directly: tag the cards at load,
   * scroll once, and all the tags are gone.
   */
  const html = HTML_BY_ID.get(screen?.id ?? '') ?? { __html: '' };

  useEffect(() => {
    const scope = rootRef.current;
    if (!scope) return;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    return wireCommandCenter(scope, reduce);
    // Re-wired when the screen changes: the observer and the parallax hold
    // references to the card that is on screen, and swapping the markup under
    // them would leave both pointing at a detached node.
  }, [screen?.id]);

  if (!screen) return null;

  /* THE REF IS ON THE OUTER WRAPPER, NOT ON .cc. wireCommandCenter does
     scope.querySelector('.cc'), which searches descendants and never matches
     the scope element itself — putting the ref one level in would find nothing
     and return a no-op teardown, silently. */
  return (
    <div className="cc-root fw-scope cc-single" ref={rootRef}>
      {!controlled ? (
        <div className="cc-tabs" role="tablist" aria-label="Product screens">
          {SCREENS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`${reactId}-${option.id}`}
              aria-selected={option.id === current}
              aria-controls={`${reactId}-panel`}
              tabIndex={option.id === current ? 0 : -1}
              className={option.id === current ? 'is-on' : undefined}
              onClick={() => setInternal(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="cc">
        <div
          id={controlled ? undefined : `${reactId}-panel`}
          role={controlled ? undefined : 'tabpanel'}
          aria-labelledby={controlled ? undefined : `${reactId}-${current}`}
          className="cc-deck"
          dangerouslySetInnerHTML={html}
        />
      </div>
    </div>
  );
}

/* And memo on top: the only prop is a string id, so a parent re-render that
   does not change the screen can never have anything to say about it. Belt and
   braces, because the failure mode here is the section silently disappearing. */
export default memo(CommandCenterDeck);
