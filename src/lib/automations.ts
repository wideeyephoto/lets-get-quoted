// The automations that are backed by a single boolean column on `accounts`, and
// can therefore be flipped straight from the Automations list without opening the
// card and saving a form.
//
// Deliberately NOT in here: "Intake AI" (genuinely always on, no column) and
// "Online booking" (its on/off is derived from the booking weekday set, so a
// switch would have to guess which days to restore). Those stay status pills.
export const AUTOMATION_COLUMNS = {
  'extra-stop': 'extra_stop_enabled',
  'missed-call': 'call_textback_enabled',
  reviews: 'auto_review_request',
  followups: 'quote_followups_enabled',
  reminders: 'appointment_reminders_enabled',
  'daily-digest': 'daily_digest_enabled',
} as const;

export type AutomationKey = keyof typeof AUTOMATION_COLUMNS;

export function isAutomationKey(value: string): value is AutomationKey {
  return Object.prototype.hasOwnProperty.call(AUTOMATION_COLUMNS, value);
}
