'use client';

import { useEffect, useRef } from 'react';
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
export default function CommandCenterDeck() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = rootRef.current;
    if (!scope) return;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    return wireCommandCenter(scope, reduce);
  }, []);

  return (
    <div
      ref={rootRef}
      className="cc-root fw-scope"
      dangerouslySetInnerHTML={{ __html: COMMAND_CENTER_MARKUP }}
    />
  );
}
