export const AI_LOGO_DIRECTIONS = [
  {
    id: 'art_director',
    label: "Art director's surprise",
    shortLabel: 'Surprise me',
    description: 'The most distinctive, ownable visual idea—not another contractor badge.',
    prompt: 'Find one unexpected but commercially credible visual metaphor. Favor clever negative space, an ownable silhouette, and a concept that rewards a second look.',
  },
  {
    id: 'bold_symbol',
    label: 'Bold signal mark',
    shortLabel: 'Bold mark',
    description: 'A sharp, memorable symbol built to read instantly on trucks and uniforms.',
    prompt: 'Create a bold symbol-led identity with a powerful silhouette, confident geometry, and extremely clear recognition from a distance.',
  },
  {
    id: 'premium_wordmark',
    label: 'Premium wordmark',
    shortLabel: 'Premium',
    description: 'Custom-feeling typography with an elegant signature detail.',
    prompt: 'Create a refined wordmark-led identity with bespoke letterform details, disciplined spacing, and one subtle signature motif tied to the trade.',
  },
  {
    id: 'modern_heritage',
    label: 'Modern heritage',
    shortLabel: 'Heritage',
    description: 'Established craftsmanship without the generic vintage-stamp look.',
    prompt: 'Blend trustworthy heritage cues with contemporary restraint. Use layered emblem construction only where it improves recognition; avoid generic clip-art badges.',
  },
  {
    id: 'character_mascot',
    label: 'Iconic mascot',
    shortLabel: 'Mascot',
    description: 'A charismatic original character with serious brand presence.',
    prompt: 'Create an original, charismatic mascot mark with expressive attitude, a clean silhouette, and professional sports-brand-level polish. Keep it reproducible, not illustrative scene art.',
  },
] as const;

export type AiLogoDirection = (typeof AI_LOGO_DIRECTIONS)[number]['id'];

export type AiLogoPromptInput = {
  businessName: string;
  trade?: string | null;
  tagline?: string | null;
  establishedYear?: string | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  emblem?: string | null;
  direction: AiLogoDirection;
  creativeBrief?: string | null;
  revisionInstructions?: string | null;
  parentPrompt?: string | null;
};

function clean(value: string | null | undefined, maxLength: number) {
  return (value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function color(value: string | null | undefined, fallback: string) {
  const normalized = clean(value, 7);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function quoted(value: string) {
  return value.replace(/"/g, '”');
}

export function isAiLogoDirection(value: string): value is AiLogoDirection {
  return AI_LOGO_DIRECTIONS.some((direction) => direction.id === value);
}

/**
 * A deliberately production-minded image prompt. The generated file is used
 * directly in website headers and downloads, so it asks for a single isolated
 * identity—not a mood board or a photorealistic logo mockup.
 */
export function buildAiLogoPrompt(input: AiLogoPromptInput) {
  const businessName = clean(input.businessName, 80) || 'Local Service Company';
  const trade = clean(input.trade, 80) || 'home services';
  const tagline = clean(input.tagline, 80);
  const year = clean(input.establishedYear, 4);
  const emblem = clean(input.emblem, 40);
  const brief = clean(input.creativeBrief, 600);
  const revision = clean(input.revisionInstructions, 500);
  const parentPrompt = clean(input.parentPrompt, 400);
  const primary = color(input.accentColor, '#2563EB');
  const secondary = color(input.secondaryColor, '#F59E0B');
  const direction = AI_LOGO_DIRECTIONS.find((item) => item.id === input.direction)
    ?? AI_LOGO_DIRECTIONS[0];

  const exactText = tagline
    ? `Business name: "${quoted(businessName)}". Tagline: "${quoted(tagline)}".`
    : `Business name: "${quoted(businessName)}". No tagline.`;
  const optionalDetails = [
    year ? `A small "EST. ${quoted(year)}" may be used only if it strengthens the composition.` : '',
    emblem ? `The owner selected "${quoted(emblem)}" as a possible emblem cue; reinterpret it inventively rather than drawing a stock icon.` : '',
    brief ? `Owner's creative brief: ${brief}` : '',
    parentPrompt ? `Reference prior design concept: "${quoted(parentPrompt)}".` : '',
    revision ? `CREATIVE REVISION INSTRUCTIONS: Maintain the core design silhouette, metaphor, and visual DNA of the referenced concept, but execute these specific revisions: "${quoted(revision)}".` : '',
  ].filter(Boolean);

  return [
    'Use case: logo-brand',
    'Asset type: production website header logo and real-world contractor brand mark',
    `Primary request: Create one original, world-class logo identity for ${businessName}, a ${trade} business.`,
    `Creative direction: ${direction.label}. ${direction.prompt}`,
    `Brand text (render verbatim): ${exactText}`,
    optionalDetails.join(' '),
    'Style/medium: exceptionally polished vector-first logo design with crisp edges, sophisticated shape language, and agency-quality art direction; flat or subtly dimensional only when it strengthens the concept',
    'Composition/framing: one complete landscape-oriented logo lockup, centered with generous transparent padding; strong primary mark plus highly legible wordmark; balanced at small website-header size',
    `Color palette: primary ${primary}, secondary ${secondary}, plus neutral black or white only as needed; excellent contrast`,
    'Background: genuinely transparent with clean alpha edges; no scene, paper, wall, vehicle, clothing, shadow-box, presentation board, or mockup',
    'Constraints: render the business name exactly once and spell it exactly; render the tagline exactly once only when supplied; no other words; no duplicate logo options; no grid, mood board, labels, color swatches, signature, watermark, trademark, or recognizable existing brand; original design only',
    'Practical quality bar: instantly recognizable at a distance, readable at 48px high, embroidery-friendly silhouette, printable in one color, premium enough for a national brand, and distinctive enough to own',
    'Avoid: generic crossed-tools clip art, generic house-roof swooshes, random shields, illegible microtype, excessive flourishes, stock-logo aesthetics, visual clutter',
  ].filter(Boolean).join('\n');
}
