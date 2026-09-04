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
  sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  // A compass, which is what the button said in emoji before it said it in line.
  plan: '<circle cx="12" cy="12" r="8.8"/><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z"/>',

  // Campaign template starters — keyed by the same id as the template itself.
  'fill-next-week': '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3M16 3.5v3"/><path d="m8.5 13.5 2 2 4-4"/>',
  reconnect: '<path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5"/><path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5"/><path d="M17 3.5v3.5h-3.5"/><path d="M7 20.5V17h3.5"/>',
  'reward-repeat': '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M4 10h16"/><path d="M12 10v10"/><path d="M12 10c-1.8 0-3.6-1-3.6-3a2 2 0 0 1 3.6-1.2A2 2 0 0 1 15.6 7c0 2-1.8 3-3.6 3z"/>',
  'request-reviews': '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  'follow-up-quotes': '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/><path d="M13.7 11.7a2 2 0 0 0-1.8-1c-1.2 0-2 .6-2 1.6 0 2 3.7 1 3.7 3 0 1-.8 1.6-2 1.6a2 2 0 0 1-1.9-1.1M12 10.5v.6M12 16.4v.6"/>',
  // A receipt with a dollar — money that's been raised but not yet collected.
  'unpaid-invoices': '<path d="M6 3.4h12a1 1 0 0 1 1 1v16.2l-2.3-1.5-2.3 1.5-2.4-1.5-2.3 1.5L6 20.6V4.4a1 1 0 0 1 1-1z"/><path d="M13.6 8.6a2 2 0 0 0-1.7-.9c-1.1 0-1.9.6-1.9 1.5 0 1.9 3.5 1 3.5 2.9 0 .9-.8 1.5-1.9 1.5a2 2 0 0 1-1.8-1"/>',
  'seasonal-promotion': '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.5v2.2M12 18.3v2.2M4.5 12h2.2M17.3 12h2.2M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6"/>',
  'maintenance-reminder': '<path d="M14.7 6.3a4 4 0 0 0-5.4 4.6L4 16.2l2.8 2.8 5.3-5.3a4 4 0 0 0 4.6-5.4l-2.6 2.6-2-2z"/>',
  'announce-service': '<path d="M3.5 10v4h3l6 4V6l-6 4z"/><path d="M17 9.5a3.3 3.3 0 0 1 0 5"/><path d="M19.3 7.3a6.5 6.5 0 0 1 0 9.4"/>',
  referral: '<circle cx="8" cy="8" r="3"/><path d="M2.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.5" cy="7.5" r="2.4"/><path d="M15.3 12.2c2.4.3 4.2 2 4.2 4.3"/>',
  'we-miss-you': '<path d="M12 20s-7-4.5-9-9c-1.4-3.2.8-6.5 4-6.5 2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.2 0 5.4 3.3 4 6.5-2 4.5-9 9-9 9z"/>',
  custom: '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z"/><path d="M13 7l4 4"/>',
} as const;

export type ActionIconName = keyof typeof ACTION_ICON_PATHS;

// `name` is widened to accept any string (while keeping autocomplete for the
// known keys) because some callers pass an icon key that arrives as a plain
// `string` from a data model — e.g. an Opportunity's `icon`. An unrecognised key
// falls back to the neutral `custom` pencil rather than rendering an empty glyph.
// `Record<never, never>` is the loose-autocomplete idiom's `{}` without tripping
// the `ban-types` lint rule.
export default function ActionIcon({ name }: { name: ActionIconName | (string & Record<never, never>) }) {
  const path = ACTION_ICON_PATHS[name as ActionIconName] ?? ACTION_ICON_PATHS.custom;
  return (
    <svg
      className="action-btn-ic"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}
