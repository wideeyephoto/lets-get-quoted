// The automations that are backed by a single boolean column on `accounts`, and
// can therefore be flipped straight from the Automations list without opening the
// card and saving a form.
//
// Deliberately NOT in here: "Intake AI", which is genuinely always on and has no
// column behind it, so it keeps its status pill.
export const AUTOMATION_COLUMNS = {
  // Master switch only — the weekday/window setup underneath is untouched, so
  // turning booking back on restores exactly what was configured.
  booking: 'booking_enabled',
  'extra-stop': 'extra_stop_enabled',
  'missed-call': 'call_textback_enabled',
  reviews: 'auto_review_request',
  followups: 'quote_followups_enabled',
  reminders: 'appointment_reminders_enabled',
  arrival: 'arrival_updates_enabled',
  'daily-digest': 'daily_digest_enabled',
  'quote-confirmation': 'quote_confirmation_email',
  'payment-confirmation': 'payment_confirmation_email',
  'review-confirmation': 'review_confirmation_email',
  'reminder-confirmation': 'reminder_confirmation_email',
} as const;

export type AutomationKey = keyof typeof AUTOMATION_COLUMNS;

export function isAutomationKey(value: string): value is AutomationKey {
  return Object.prototype.hasOwnProperty.call(AUTOMATION_COLUMNS, value);
}

// Human-readable names for the audit trail, so a settings-history line reads
// "Online booking turned off" rather than leaking a column name at the owner.
export const AUTOMATION_LABELS: Record<AutomationKey, string> = {
  booking: 'Online booking',
  'extra-stop': 'Quick Stop',
  'missed-call': 'Missed-call text-back',
  reviews: 'Review requests',
  followups: 'Quote follow-ups',
  reminders: 'Appointment reminders',
  arrival: 'Arrival updates',
  'daily-digest': 'Daily digest',
  'quote-confirmation': 'Quote confirmation emails',
  'payment-confirmation': 'Payment request confirmations',
  'review-confirmation': 'Review request confirmations',
  'reminder-confirmation': 'Appointment reminder summary',
};
