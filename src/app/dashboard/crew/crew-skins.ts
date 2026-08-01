import type { ViewOption } from '@/components/view-gear';
import { CREW_SKINS, type CrewSkin } from '@/lib/dashboard-views';

// The skin options, in one place because both tabs' gears offer them and a
// list that drifted between the two would be a page that disagrees with itself
// about what it can look like.
//
// Hints say what the skin is FOR, not what it looks like — "cooler surfaces"
// tells nobody whether to pick it.
export const CREW_SKIN_OPTIONS: ViewOption<CrewSkin>[] = [
  { id: 'standard', label: 'Standard', hint: 'The dashboard as it is everywhere else' },
  { id: 'daylight', label: 'Daylight', hint: 'Brighter and crisper — easier in a lit cab' },
  { id: 'blueprint', label: 'Blueprint', hint: 'Drawing-sheet navy, cyan rules, monospaced figures' },
];

/**
 * Put the skin on the shell.
 *
 * The class lives on <main>, which the page renders above both tab components,
 * so neither can set it through React. The server writes it from the cookie for
 * the first paint; this keeps it in step the moment somebody picks one, instead
 * of making a colour change wait for a round trip.
 *
 * Shared rather than written twice: the roster and the pay tab both offer the
 * picker, and two copies of this would eventually disagree about the class
 * names.
 */
export function applyCrewSkin(next: CrewSkin): void {
  const main = document.querySelector('main.workspace-shell');
  if (!main) return;
  main.classList.remove('crew-skin', ...CREW_SKINS.map((skin) => `crew-skin-${skin}`));
  if (next !== 'standard') main.classList.add('crew-skin', `crew-skin-${next}`);
}
