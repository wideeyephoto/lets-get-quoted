// Leading glyphs for `.action-btn` (see globals.css). Stroke paths on a 24 grid
// in the same drawing style as the sidebar rail — see components/nav-icons.tsx,
// which this deliberately mirrors: `job` is the Jobs rail item's own briefcase,
// so "open the job" is marked with the thing it opens.
//
// Shared rather than defined next to each button because the same button now
// appears on the job pane and the schedule bar, and two sets of paths would
// drift into two slightly different briefcases.
//
// The markup is a static string, so there is no hydration mismatch and this
// stays usable from server components.
export const ACTION_ICON_PATHS = {
  job: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
  payment: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v9.6"/><path d="M14.4 9.5a2.6 2.6 0 0 0-2.4-1.3c-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.6 2a2.7 2.7 0 0 1-2.5-1.4"/>',
  expense: '<path d="M6 3.4h12a1 1 0 0 1 1 1v16.2l-2.6-1.6-2.6 1.6-2.6-1.6-2.6 1.6L5 20.6V4.4a1 1 0 0 1 1-1z"/><path d="M9 8.4h6M9 12.4h6"/>',
  // A compass, which is what the button said in emoji before it said it in line.
  plan: '<circle cx="12" cy="12" r="8.8"/><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z"/>',
} as const;

export type ActionIconName = keyof typeof ACTION_ICON_PATHS;

export default function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      className="action-btn-ic"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ACTION_ICON_PATHS[name] }}
    />
  );
}
