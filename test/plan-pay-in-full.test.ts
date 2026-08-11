import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A payment plan is an offer, not a requirement.
 *
 * The Send-the-quote form's payment terms are three mutually exclusive radios,
 * so choosing "Payment Plan" removed paying in full — from the HOMEOWNER's page,
 * not just from the contractor's form. Somebody who would happily have settled
 * the whole thing on the spot was shown a deposit, four dated installments and a
 * card authorization, with no way to say "I'll just pay it".
 *
 * There is no DOM here, so these read the source. The parts worth guarding are
 * the ones that move money: which statuses may be paid off, what closes the
 * plan, and the fact that an early payoff on a LIVE plan is never gated.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));
const raw = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const plans = read('src', 'lib', 'payment-plans.ts');

describe('the contractor decides whether the plan is a choice', () => {
  it('the quote form asks, and defaults to yes', () => {
    const field = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'DepositField.tsx');
    expect(field).toContain('name="planAllowPayInFull"');
    expect(field).toContain('defaultChecked');
    // Only inside the plan branch — it means nothing on the other two terms.
    const planBlock = field.slice(field.indexOf("terms === 'plan' ?"));
    expect(planBlock).toContain('planAllowPayInFull');
  });

  it('an unticked box reads as off, since a checkbox posts nothing when unchecked', () => {
    const actions = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
    expect(actions).toContain("allowPayInFull: formData.get('planAllowPayInFull') === 'on'");
  });

  it('the column and the loader both default to true, so existing plans gain the option', () => {
    const schema = raw('schema.sql');
    expect(schema).toContain('alter table payment_plans add column if not exists allow_pay_in_full boolean not null default true');
    const feed = read('src', 'lib', 'job-feed.ts');
    expect(feed).toContain('allowPayInFull: planRow.allow_pay_in_full !== false');
  });
});

describe('paying the whole thing works before the plan has started', () => {
  const payoff = plans.slice(plans.indexOf('export async function startPlanPayoff'), plans.indexOf('async function finalizePlanPayoff'));

  it('accepts a plan that is still awaiting its deposit', () => {
    // It used to hard-refuse anything that was not already active.
    expect(payoff).not.toContain("if (plan.status !== 'active') throw");
    expect(payoff).toContain("in('status', ['active', 'pending_deposit'])");
  });

  it('refuses a plan the contractor did not offer as a choice — but only before it starts', () => {
    expect(payoff).toMatch(/plan\.status === 'pending_deposit' && plan\.allow_pay_in_full === false/);
    // The guard must NOT be reachable for an active plan: paying off early is
    // promised to the client in writing on the authorization form, and a flag
    // set afterwards cannot withdraw it.
    expect(payoff).not.toMatch(/allow_pay_in_full === false[\s\S]{0,40}\}\s*\n\s*if \(plan\.status === 'active'/);
  });

  it('still refuses a plan that is finished or cancelled', () => {
    expect(payoff).toContain("if (plan.status === 'paid_off')");
    expect(payoff).toContain("if (plan.status === 'canceled') throw");
  });

  it('will not run twice — the lock is still an atomic compare-and-set', () => {
    expect(payoff).toContain(".is('payoff_locked_at', null)");
    expect(payoff).toContain('A payoff is already in progress');
  });

  it('will not fold in a payment that is already processing', () => {
    expect(payoff).toContain("list.some((row) => row.status === 'processing')");
  });

  it('carries the deposit request’s texting consent onto the payment that replaces it', () => {
    expect(payoff).toContain('consentSource');
    expect(payoff).toContain('sms_consent: consentSource?.sms_consent ?? false');
  });
});

describe('and the webhook closes it properly', () => {
  const finalize = plans.slice(plans.indexOf('async function finalizePlanPayoff'), plans.indexOf('async function releasePlanPayoffLock'));

  it('closes a plan that never reached active', () => {
    expect(finalize).toContain("in('status', ['active', 'pending_deposit'])");
  });

  it('is still idempotent — the close is a compare-and-set that only one delivery wins', () => {
    expect(finalize).toContain('if (!closedRow) return;');
  });

  it('cancels the deposit request nobody is going to pay now', () => {
    const deposit = finalize.slice(finalize.indexOf("eq('kind', 'deposit')"));
    expect(deposit).toBeTruthy();
    // Only an unstarted request, the same rule the owner's own cancel uses.
    expect(finalize).toMatch(/eq\('kind', 'deposit'\)[\s\S]{0,80}eq\('status', 'requested'\)/);
  });

  it('releases the lock on both live statuses when a payment is abandoned', () => {
    const release = plans.slice(plans.indexOf('async function releasePlanPayoffLock'));
    expect(release).toContain("in('status', ['active', 'pending_deposit'])");
  });
});

/**
 * The choice moved into its own component when the page was redesigned around a
 * summary rail — it is a control, not a paragraph, and it needed local state to
 * reveal the route somebody picked. What is guarded here did not change: both
 * prices named, the offer only where the contractor made one, and neither route
 * pre-selected.
 */
describe('the homeowner is shown both prices, not just the schedule', () => {
  const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
  const choice = read('src', 'app', 'client', 'jobs', '[token]', 'PayChoice.tsx');
  const start = page.indexOf("{plan.status === 'pending_deposit' ? (");
  const pending = page.slice(start, page.indexOf("plan.status === 'active' ?", start));

  it('is still what the pending-deposit branch renders', () => {
    expect(pending).toContain('<PayChoice');
    expect(pending).toContain('allowPayInFull={plan.allowPayInFull}');
    expect(pending).toContain('payInFullInFlight={plan.payInFullInFlight}');
  });

  it('names the full total and the deposit side by side', () => {
    expect(pending).toContain('formatMoney(plan.totalCents / 100)');
    expect(pending).toContain('formatMoney(plan.depositCents / 100)');
    expect(choice).toContain('Pay in full');
    expect(choice).toContain('Pay over time');
    expect(choice).toContain('{totalLabel}');
    expect(choice).toContain('{depositLabel} today');
  });

  it('offers it only when the contractor did', () => {
    expect(choice).toContain('const showChoice = allowPayInFull;');
    // With no choice on offer, the plan route still renders — losing the
    // schedule because the contractor declined to offer a payoff would be a
    // worse bug than the one this file exists for.
    expect(choice).toContain('{!showChoice || payMode === ');
  });

  it('stops offering it once a full payment is at checkout', () => {
    expect(choice).toContain('if (payInFullInFlight)');
    expect(choice).toContain('A full payment is being processed');
  });

  it('leaves the plan route exactly where it was, under its own heading', () => {
    expect(pending).toContain('authorizePaymentPlanAction');
    expect(choice).toContain('authorize automatic installment payments');
  });

  it('pre-selects neither, because a default here is a thumb on the scale', () => {
    // The page only pre-selects when there is genuinely nothing to choose.
    expect(page).toContain("const initialPayMode: PayMode | null = plan && !plan.allowPayInFull ? 'plan' : null;");
  });
});
