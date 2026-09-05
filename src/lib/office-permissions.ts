/**
 * What an office user is allowed to do, as a list of switches that are all off.
 *
 * WHY A CATALOG AND NOT A ROLE. "Office manager" is not one job. It is a
 * bookkeeper who needs invoices and must never see crew pay rates; a scheduler
 * who needs the calendar and nothing financial; a partner who needs everything
 * except the ability to cancel the subscription. A single role would force every
 * contractor into whichever of those LGQ imagined, and the ones it fits worst
 * are the ones who would hand out an owner login instead — which is the outcome
 * this whole feature exists to prevent.
 *
 * So the unit is a capability, and the decision is which capabilities an office
 * user may ever hold. That decision is NOT made here. Every switch below ships
 * `false`, `office_can()` returns false for all of them, and no RLS policy
 * references it yet.
 *
 * THE GROUPING IS THE POINT. Twenty flat toggles is not a decision anybody can
 * make well. Five bands of consequence is: a contractor deciding about
 * `crew_pay.read` is deciding whether this person sees what everyone earns, and
 * the list says so in those words rather than leaving it to be inferred from a
 * column name.
 *
 * Pure module: no imports, safe from client code, and read by the migration's
 * own test to prove the database seeds exactly these and nothing else.
 */

export type OfficeCapabilityBand =
  /** The daily work. Wrong here is inconvenient. */
  | 'work'
  /** Numbers that describe money already agreed or owed. */
  | 'money_visible'
  /** Actions that move money, or change what a customer will be charged. */
  | 'money_moving'
  /** What individual people are paid. Sensitive to the crew, not the customer. */
  | 'people'
  /** Control of the account itself. Wrong here can end the business's access. */
  | 'account';

export type OfficeCapability = Readonly<{
  key: string;
  label: string;
  band: OfficeCapabilityBand;
  /** Said plainly, in terms of what this person would then be able to see or do. */
  grants: string;
}>;

export const OFFICE_CAPABILITY_BANDS: Readonly<Record<OfficeCapabilityBand, string>> = Object.freeze({
  work: 'Day-to-day work',
  money_visible: 'Money they can see',
  money_moving: 'Money they can move',
  people: 'What people are paid',
  account: 'Control of the account',
});

/**
 * Every capability, in the order a contractor should be asked about them:
 * least consequential first, so the list gets more serious as it goes rather
 * than burying `billing.manage` between two calendar toggles.
 */
export const OFFICE_CAPABILITIES: readonly OfficeCapability[] = Object.freeze([
  // ── Day-to-day work ──────────────────────────────────────────────────────
  { key: 'leads.read', label: 'See leads', band: 'work',
    grants: 'Every enquiry that came in, including the customer\'s name, phone number and address.' },
  { key: 'leads.write', label: 'Work leads', band: 'work',
    grants: 'Reply to enquiries, change their status, and mark them won or lost.' },
  { key: 'clients.read', label: 'See customers', band: 'work',
    grants: 'The full customer list with contact details and job history.' },
  { key: 'clients.write', label: 'Edit customers', band: 'work',
    grants: 'Add customers and change their details, including where work happens.' },
  { key: 'jobs.read', label: 'See jobs', band: 'work',
    grants: 'Every job, its schedule, its notes and its photos.' },
  { key: 'jobs.write', label: 'Manage jobs', band: 'work',
    grants: 'Create and reschedule jobs, and change what is on them.' },
  { key: 'schedule.write', label: 'Move the calendar', band: 'work',
    grants: 'Book, move and cancel appointments the crew will turn up to.' },
  { key: 'messages.read', label: 'Read messages', band: 'work',
    grants: 'Text conversations with customers, including anything already sent.' },
  { key: 'messages.send', label: 'Send messages', band: 'work',
    grants: 'Text customers from the business number. Recipients cannot tell who typed it.' },
  { key: 'inventory.read', label: 'See inventory & fleet', band: 'work',
    grants: 'Every tool, fleet vehicle, stock level, depot location, and maintenance schedule.' },
  { key: 'inventory.custody', label: 'Manage tool custody & transfers', band: 'work',
    grants: 'Sign tools in and out to crew or jobs, transfer van stock, and log vehicle maintenance.' },
  { key: 'inventory.write', label: 'Manage inventory & fleet equipment', band: 'work',
    grants: 'Add, edit, retire, and remove tools, fleet vehicles, catalog stock, and depot locations.' },
  { key: 'marketing.read', label: 'See marketing & campaigns', band: 'work',
    grants: 'Campaign history, attribution, marketing performance and the seasonal calendar.' },
  { key: 'marketing.write', label: 'Run marketing campaigns', band: 'work',
    grants: 'Compose and send email and text campaigns, write blog posts, and configure ad campaigns.' },

  // ── Money they can see ───────────────────────────────────────────────────
  { key: 'quotes.read', label: 'See quotes', band: 'money_visible',
    grants: 'Every quote and its prices, including ones never sent.' },
  { key: 'invoices.read', label: 'See invoices', band: 'money_visible',
    grants: 'What has been billed, what is outstanding, and who is late paying.' },
  { key: 'payments.read', label: 'See payments', band: 'money_visible',
    grants: 'Every payment taken, and the platform and processing fees on each.' },
  { key: 'reports.read', label: 'See reports', band: 'money_visible',
    grants: 'Revenue, margin and job costing across the whole business.' },

  // ── Money they can move ──────────────────────────────────────────────────
  { key: 'quotes.write', label: 'Write quotes', band: 'money_moving',
    grants: 'Set prices and send quotes a customer can accept and be charged for.' },
  { key: 'invoices.write', label: 'Bill customers', band: 'money_moving',
    grants: 'Create and send invoices, and change amounts owed.' },
  { key: 'payments.collect', label: 'Take payments', band: 'money_moving',
    grants: 'Charge a customer\'s card and request payment. This moves real money.' },
  { key: 'payments.refund', label: 'Refund payments', band: 'money_moving',
    grants: 'Send money back to a customer. Irreversible once it leaves.' },

  // ── What people are paid ─────────────────────────────────────────────────
  { key: 'crew.read', label: 'See the crew list', band: 'people',
    grants: 'Who is on the roster and their contact details. Not their pay.' },
  { key: 'crew.write', label: 'Manage the crew', band: 'people',
    grants: 'Add and remove crew, and change who is assigned to what.' },
  { key: 'crew_pay.read', label: 'See what people earn', band: 'people',
    grants: 'Hourly rates, salaries, day rates and every payroll figure for every person.' },
  { key: 'crew_pay.write', label: 'Set what people earn', band: 'people',
    grants: 'Change pay rates and approve payroll runs.' },

  // ── Control of the account ───────────────────────────────────────────────
  { key: 'settings.write', label: 'Change business settings', band: 'account',
    grants: 'The public site, booking rules, automations and the business number.' },
  { key: 'team.manage', label: 'Invite and remove office users', band: 'account',
    grants: 'Give other people this same access, and take it away.' },
  { key: 'billing.read', label: 'See the LGQ bill', band: 'account',
    grants: 'The plan, what LGQ charges for it, and every top-up bought.' },
  { key: 'billing.manage', label: 'Change the LGQ plan', band: 'account',
    grants: 'Upgrade, downgrade, buy add-ons and cancel. Can end the business\'s access.' },
]);

export const OFFICE_CAPABILITY_KEYS: readonly string[] = Object.freeze(
  OFFICE_CAPABILITIES.map((capability) => capability.key),
);

export function officeCapabilitiesByBand(): ReadonlyArray<
Readonly<{ band: OfficeCapabilityBand; label: string; capabilities: readonly OfficeCapability[] }>
> {
  const order: OfficeCapabilityBand[] = ['work', 'money_visible', 'money_moving', 'people', 'account'];
  return Object.freeze(order.map((band) => Object.freeze({
    band,
    label: OFFICE_CAPABILITY_BANDS[band],
    capabilities: OFFICE_CAPABILITIES.filter((capability) => capability.band === band),
  })));
}

/**
 * Capabilities that must never be on by default, whatever else changes.
 *
 * Not a separate list of rules — a restatement of the ones that would be worst
 * to enable by accident, kept next to the catalog so a future edit that flips a
 * default has to walk past it. Each moves money, exposes what individuals earn,
 * or can end the account.
 */
export const OFFICE_CAPABILITIES_REQUIRING_DELIBERATION: readonly string[] = Object.freeze([
  'payments.collect',
  'payments.refund',
  'crew_pay.read',
  'crew_pay.write',
  'team.manage',
  'billing.manage',
]);
