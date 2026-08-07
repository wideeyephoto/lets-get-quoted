/**
 * The per-account switches staff may flip, and what each one means.
 *
 * These seven columns were already rendered on the account page as read-only
 * On/Off pills: the console showed you exactly which switch the customer was
 * asking about and gave you no way to move it. They are not read-only in the
 * product — src/app/dashboard/settings/actions.ts writes every one of them from
 * the owner's own settings page — so "flip that for them" meant opening the
 * Supabase table editor, which bypasses logAdminAction entirely and leaves no
 * record of who changed what or why.
 *
 * This list is the allowlist the server action validates against. It has to be
 * a closed set and it has to live outside the page: a column name arriving from
 * a form and reaching an UPDATE unchecked is how a support user turns
 * `connect_onboarded` on.
 */

export const ACCOUNT_FLAGS = [
  {
    key: 'instant_book_enabled',
    label: 'Instant booking',
    help: 'Customers can book a slot directly from the site instead of requesting a quote.',
  },
  {
    key: 'extra_stop_enabled',
    label: 'Quick Stop',
    // Worth spelling out, because the console has a second, similar-looking
    // lever and using the wrong one is a support call: the lock suppresses Quick
    // Stop temporarily under account.enforce and clears itself, while this is the
    // customer's own on/off switch and stays where it is put.
    help: 'The feature itself. Separate from the Quick Stop lock, which is a temporary enforcement hold.',
  },
  {
    key: 'deposit_on_approval',
    label: 'Deposit on approval',
    help: 'Collects the deposit at the moment a quote is approved rather than later.',
  },
  {
    key: 'quote_followups_enabled',
    label: 'Quote follow-ups',
    help: 'Chases customers who were sent a quote and have not approved it.',
  },
  {
    key: 'appointment_reminders_enabled',
    label: 'Appointment reminders',
    help: 'Reminds customers the day before a scheduled job.',
  },
  {
    key: 'daily_digest_enabled',
    label: 'Daily digest',
    help: 'Emails the owner a morning summary of their business.',
  },
  {
    key: 'auto_review_request',
    label: 'Auto review requests',
    help: 'Asks the customer for a review after a job completes.',
  },
] as const;

export type AccountFlagKey = (typeof ACCOUNT_FLAGS)[number]['key'];

export function isAccountFlag(value: string): value is AccountFlagKey {
  return ACCOUNT_FLAGS.some((f) => f.key === value);
}

export function accountFlag(key: AccountFlagKey): (typeof ACCOUNT_FLAGS)[number] {
  return ACCOUNT_FLAGS.find((f) => f.key === key)!;
}
