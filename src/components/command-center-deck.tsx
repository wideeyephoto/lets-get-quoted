'use client';

import { memo, useEffect, useRef } from 'react';
// Imported from the split module, not from feature-wheel-story.markup, so the
// wheel's own 16KB string cannot ride along into the homepage bundle.
import { COMMAND_CENTER_MARKUP } from '@/app/features/command-center-markup';
import { wireCommandCenter } from '@/app/features/command-center-motion';
import './command-center-deck.css';

/**
 * The six full-width dashboard cards — Today, Current leads, Schedule, Client
 * dashboard, Automations, Insights.
 *
 * These were built for the original homepage and have been sitting on
 * /home-classic ever since the flagship replaced it. Nothing about them was
 * redrawn to bring them here; the markup is the same string /home-classic
 * renders (see feature-wheel-story.markup.ts) and the stylesheet is generated
 * from the same source, so the two cannot drift apart.
 *
 * TWO WRAPPER CLASSES, BOTH LOAD-BEARING
 *
 *   fw-scope  declares the palette (--panel, --ink, --orange, --mono ...) that
 *             every rule in the deck reads. Without it the cards render with no
 *             colours and the wrong typeface.
 *   cc-root   is what the generated stylesheet prefixes every selector with, so
 *             its rules outrank the flagship homepage's preflight reset. See
 *             scripts/generate-command-center-css.mjs for the full reasoning.
 *
 * The deck's own header labels the figures as sample data — that label is part
 * of the markup, not decoration, and should stay wherever this renders.
 */
/**
 * ONE OBJECT, CREATED ONCE, FOR THE LIFETIME OF THE MODULE.
 *
 * This was an inline `{{ __html: COMMAND_CENTER_MARKUP }}` — a brand new object
 * on every render. The homepage re-renders on scroll (it tracks an active
 * feature step), and each of those renders was enough for React to tear this
 * subtree down and rebuild it from the string.
 *
 * That is what made the deck render as its own height in empty space. The
 * effect below wires an IntersectionObserver to the cards ONCE, on mount; when
 * React replaced every card node on the first scroll, the observer was left
 * watching six elements that were no longer in the document, the fresh ones had
 * no `in` class and nobody observing them, and `cc-anim` — which is what sets
 * them to opacity 0 — stayed on the wrapper. Measured directly: tag the six
 * cards at load, scroll once, and all six tags are gone.
 *
 * A stable reference means React has nothing to update, so the nodes the
 * observer is holding are the nodes on the page.
 */
const DECK_HTML = { __html: COMMAND_CENTER_MARKUP };

function CommandCenterDeck() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = rootRef.current;
    if (!scope) return;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    return wireCommandCenter(scope, reduce);
  }, []);

  return <div ref={rootRef} className="cc-root fw-scope" dangerouslySetInnerHTML={DECK_HTML} />;
}

/* And memo on top: the deck takes no props and its markup is a constant, so a
   parent re-render can never have anything to say about it. Belt and braces,
   because the failure mode here is the entire section silently disappearing. */
export default memo(CommandCenterDeck);
