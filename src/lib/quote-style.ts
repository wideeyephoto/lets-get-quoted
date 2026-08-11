/**
 * Three ways a contractor's quote can look.
 *
 * WHY THREE AND NOT A THEME EDITOR. A contractor already picks one colour and
 * uploads one logo, and that is the right amount of design work to ask of
 * somebody whose job is fencing. What they actually want to control is tone:
 * a heritage roofing firm and a two-year-old pressure-washing outfit should not
 * hand a homeowner the same document, and neither of them wants to choose a
 * border radius. So the choice is three finished treatments, each of which is
 * already correct, rather than a panel of knobs that can be set wrong.
 *
 * WHAT THE STYLE MAY CHANGE, and what it may not. A style changes the hero
 * treatment, the type family and scale, card geometry, and how the accent is
 * used. It never changes what is on the page, the order of it, or any number:
 * the same quote, the same total, the same two agreements, in the same
 * sequence. Presentation is the only variable, so a style can never be the
 * reason somebody misread what they were agreeing to.
 *
 * The contractor's own colour drives all three — see `brandPaint`. These are
 * treatments, not palettes.
 */

export type QuoteStyle = 'classic' | 'signature' | 'bold';

export const QUOTE_STYLES: readonly QuoteStyle[] = ['classic', 'signature', 'bold'] as const;

/**
 * The middle one, and it has to be the one that suits the most trades: an
 * account that never opens the setting is on this forever.
 */
export const DEFAULT_QUOTE_STYLE: QuoteStyle = 'signature';

/**
 * Anything that isn't one of the three falls back rather than reaching a
 * className. Covers null (never set), an un-migrated database (undefined) and a
 * value written by an older build.
 */
export function normalizeQuoteStyle(value: unknown): QuoteStyle {
  return typeof value === 'string' && (QUOTE_STYLES as readonly string[]).includes(value)
    ? (value as QuoteStyle)
    : DEFAULT_QUOTE_STYLE;
}

/** The class the client page wears. One place, so the CSS and the TS agree. */
export function quoteStyleClass(style: QuoteStyle): string {
  return `qstyle-${style}`;
}

export type QuoteStyleMeta = {
  /** What the contractor sees in the picker. */
  name: string;
  /** One line, in their terms, about the impression it makes. */
  tagline: string;
  /** Who it is actually for — the sentence that makes the choice easy. */
  bestFor: string;
};

export const QUOTE_STYLE_META: Record<QuoteStyle, QuoteStyleMeta> = {
  classic: {
    name: 'Classic',
    tagline: 'A printed proposal. Serif headings, ruled lines, no decoration.',
    bestFor: 'Established trades quoting larger jobs, where the document itself is part of the reassurance — roofing, remodels, restoration.',
  },
  signature: {
    name: 'Signature',
    tagline: 'Editorial and warm. Soft brand wash, generous spacing, a big clear total.',
    bestFor: 'Most trades, most jobs. The safe choice if you are not sure — it reads modern without reading like a startup.',
  },
  bold: {
    name: 'Bold',
    tagline: 'Your colour, full strength. Oversized type and high contrast.',
    bestFor: 'Trades that win on energy and speed — pressure washing, lawn care, junk removal, mobile detailing.',
  },
};
