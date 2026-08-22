// The automations that are backed by a single boolean column on `accounts`, and
// can therefore be flipped straight from the Automations list without opening the
// card and saving a form.
//
// Deliberately NOT in here: Smart Intake. Smart-vs-classic is an either/or
// website method stored in site content, not an automation that can be toggled
// independently from this list.
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
  selections: 'selection_reminders_enabled',
  'daily-digest': 'daily_digest_enabled',
  'quote-confirmation': 'quote_confirmation_email',
  'payment-confirmation': 'payment_confirmation_email',
  'review-confirmation': 'review_confirmation_email',
  'reminder-confirmation': 'reminder_confirmation_email',
} as const;

export type AutomationKey = keyof typeof AUTOMATION_COLUMNS;

/**
 * Switches whose advertised behavior can initiate a customer text without the
 * owner pressing a separate send button.
 *
 * A configured boolean is not delivery readiness. Until the workspace owns an
 * active, assigned, inbound-ready contractor number, letting one of these move
 * from off to on would promise an automation the delivery worker must suppress.
 * Keep this policy shared by the page and the Server Action so a crafted action
 * request cannot bypass the disabled control.
 *
 * Online Booking and Quick Stop are intentionally absent: their switches expose
 * useful intake/marketplace surfaces before a later, explicit owner decision to
 * send. Those individual sends still pass through the durable sender-readiness
 * boundary.
 */
export const DEDICATED_MESSAGING_AUTOMATION_KEYS = [
  'missed-call',
  'reviews',
  'followups',
  'reminders',
  'arrival',
  'selections',
] as const satisfies readonly AutomationKey[];

const DEDICATED_MESSAGING_AUTOMATIONS = new Set<AutomationKey>(
  DEDICATED_MESSAGING_AUTOMATION_KEYS,
);

export function automationRequiresDedicatedMessaging(key: AutomationKey): boolean {
  return DEDICATED_MESSAGING_AUTOMATIONS.has(key);
}

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
  selections: 'Choice reminders',
  'daily-digest': 'Daily digest',
  'quote-confirmation': 'Quote confirmation emails',
  'payment-confirmation': 'Payment request confirmations',
  'review-confirmation': 'Review request confirmations',
  'reminder-confirmation': 'Appointment reminder summary',
};
