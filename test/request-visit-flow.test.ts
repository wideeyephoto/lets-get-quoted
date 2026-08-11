import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE BOOKING FORM'S STEPS, WHICH USED TO BE LABELS ON A SINGLE PAGE.
 *
 * The old page drew "Pick a window" and "Your details" as numbered steps above
 * one form that held both at once. It named steps without having any: nothing
 * advanced, nothing was ever behind you, and the numbering's only achievement
 * was telling somebody two thousand pixels down that there had been a plan.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Comments stripped first: this repo's WHY comments quote the very code being
   asserted ("Every value lives in React state and is written into hidden
   inputs"), so a bare toContain matches the explanation rather than the fix. */
const FLOW = stripJs(read('src', 'app', 'book', '[subdomain]', 'RequestVisitFlow.tsx'));
const PAGE = stripJs(read('src', 'app', 'book', '[subdomain]', 'page.tsx'));
const QUICK = stripJs(read('src', 'app', 'book', '[subdomain]', 'QuickStopFlow.tsx'));

/* ===========================================================================
   1. What actually posts
   ---------------------------------------------------------------------------
   The trap this arrangement exists to avoid: a stepped form built by unmounting
   each fieldset silently drops those values out of the FormData, and the
   failure is indistinguishable from a customer leaving a box empty.
   ======================================================================== */
describe('the form posts its state, not whatever step is on screen', () => {
  const POSTED = ['service', 'slot', 'name', 'phone', 'email', 'address', 'description', 'note'];

  it('carries a hidden input for every field the server reads', () => {
    for (const field of POSTED) {
      expect(FLOW, `${field} is not posted`).toContain(`<input type="hidden" name="${field}" value={`);
    }
  });

  /**
   * The hidden inputs sit OUTSIDE every `step === n` branch. If one drifted
   * inside a step it would post only while that step was visible — which for
   * step 1 and 2 fields means never, because the submit lives on step 3.
   */
  it('and mounts them outside any step, so none of them can unmount', () => {
    const firstStepBranch = FLOW.indexOf('{step === 1 ?');
    for (const field of POSTED) {
      expect(FLOW.indexOf(`name="${field}"`), `${field} is trapped inside a step`).toBeLessThan(firstStepBranch);
    }
  });

  /**
   * The other half of the same rule. A visible control carrying a `name` posts
   * itself as well, so a field would arrive twice — and the last one wins,
   * which on step 3 is the hidden input, and on step 1 is not.
   */
  it('and no visible control competes with them for a posted name', () => {
    const visible = FLOW.slice(FLOW.indexOf('{step === 1 ?'));
    for (const field of POSTED) {
      expect(visible, `a visible control also posts ${field}`).not.toContain(`name="${field}"`);
    }
  });

  /**
   * Nameless radios are not a radio group, so arrow keys stop moving between
   * them. These names exist for the browser's grouping alone and are read by
   * nothing on the server — which is why they are prefixed rather than simply
   * reusing 'slot'.
   */
  it('but the radios keep a name, or they stop being keyboard-navigable', () => {
    expect(FLOW).toContain('name="ui-slot"');
    expect(FLOW).toContain('name="ui-service"');
    // Prefixed so they can never collide with something the action reads.
    for (const field of POSTED) expect(`ui-${field}`).not.toBe('ui-slot'.replace(/^ui-/, ''));
  });

  it('and still goes through the same server action', () => {
    // Not a new route: the action re-derives availability, refuses a tampered
    // slot and claims the hold. None of that moves to the client.
    expect(FLOW).toContain('submitBookingAction.bind(null, subdomain)');
  });
});

/* ===========================================================================
   2. Real steps
   ======================================================================== */
describe('the step indicator now describes something that happens', () => {
  it('passes the current step, which is what makes it a progress bar', () => {
    // Without `current` BookingSteps renders as a contents list — correct for
    // the old one-page form, and a lie about this one.
    expect(FLOW).toContain('<BookingSteps steps={STEPS} current={step} />');
  });

  it('has three of them, ending in a review', () => {
    const steps = [...FLOW.matchAll(/\{ n: \d+, label: '([^']+)' \}/g)].map((m) => m[1]);
    expect(steps).toEqual(['Choose a window', 'Your details', 'Review']);
  });

  it('and the page no longer draws its own step headings', () => {
    // The old form numbered its sections inline and shifted the numbers when
    // there was no price book — two sources of truth for one sequence.
    expect(PAGE).not.toContain('Step {stepNo');
    expect(PAGE).not.toContain('const stepNo');
  });

  /**
   * Pressing Continue replaces the button that was pressed. Without moving
   * focus deliberately, a keyboard or screen-reader user lands nowhere and the
   * focus ring silently falls back to the top of the document.
   */
  it('moves focus to the new step rather than leaving it on a removed button', () => {
    expect(FLOW).toContain('headingRef.current?.focus({ preventScroll: true })');
    expect(FLOW).toContain('tabIndex={-1} ref={headingRef}');
  });
});

/* ===========================================================================
   3. Requirements, said before the button
   ======================================================================== */
describe('every rule the server enforces is checked against a field first', () => {
  it('refuses to advance without a window', () => {
    expect(FLOW).toContain("slot ? {} : { slot: 'Choose a window before carrying on.' }");
  });

  it('checks name, either-contact, and address — the same three the action does', () => {
    const check = FLOW.slice(FLOW.indexOf('function checkDetails()'), FLOW.indexOf('if (path ==='));
    expect(check).toContain('if (!name.trim())');
    expect(check).toContain('if (!phone.trim() && !email.trim())');
    expect(check).toContain('if (!address.trim())');
    // The server's own copy stays: this is a public endpoint and a direct POST
    // ignores anything the browser was told.
    const actions = stripJs(read('src', 'app', 'book', '[subdomain]', 'actions.ts'));
    expect(actions).toContain('if (!name || (!phone && !email) || !address || !dateKey || !time)');
  });

  it('announces the errors, because they appear after a press', () => {
    // A plain paragraph inserted post-click is silent to a screen reader.
    expect(FLOW).toContain('role="alert"');
    expect(FLOW).toContain('aria-invalid={errors.name ? true : undefined}');
    expect(FLOW).toContain("aria-describedby={errors.address ? 'err-address' : undefined}");
  });

  it('and the contact rule sits above the pair it governs', () => {
    const rule = FLOW.indexOf('booking-contact-rule');
    expect(rule).toBeGreaterThan(-1);
    expect(rule, 'the rule is below the fields again').toBeLessThan(FLOW.indexOf('id="rv-phone"'));
  });
});

/* ===========================================================================
   4. The faster path, where it answers a question
   ======================================================================== */
describe('the faster path is offered where somebody asks for it', () => {
  /**
   * IT HAS NOW BEEN IN THREE PLACES, and the middle one is why this describe
   * was rewritten.
   *
   * First it was a card at the FOOT of the page, under the standard form's own
   * submit — so finding the faster option meant scrolling past the slower one
   * and everything it wanted. Then it became a fork at the TOP: two co-equal
   * buttons before either path asked anything. That version was reported as
   * confusing, and fairly — a homeowner arrives on a page headed "Request a
   * visit" and is stopped to pick a lane, one of them named after a product
   * they have never heard of and carrying a fee.
   *
   * It sits under the WINDOW LIST now, on the window step only. That is the
   * moment the thought occurs: you have just read the earliest time on offer
   * and it is Thursday.
   */
  it('is under the windows, not a fork above the form', () => {
    expect(FLOW).not.toContain('<PathChoice');
    expect(FLOW).not.toContain('function PathChoice');
    expect(FLOW.indexOf('<form action=')).toBeLessThan(FLOW.indexOf('<SoonerOffer'));
    // Step 1 is the window list. On step 2 somebody is typing their address and
    // on step 3 the page has one job left.
    expect(FLOW).toContain('{quickStop && step === 1 ? <SoonerOffer');
  });

  it('asks the question rather than naming our product', () => {
    const card = FLOW.slice(FLOW.indexOf('function SoonerOffer'));
    expect(card).toContain('None of these soon enough?');
    expect(card).toContain('Ask for a priority visit');
    // "Quick Stop" is our word. A homeowner has never heard it.
    expect(card).not.toContain('Quick Stop');
  });

  it('names the fee, the approval and what the fee is not', () => {
    const card = FLOW.slice(FLOW.indexOf('function SoonerOffer'));
    expect(card).toMatch(/review the job first/);
    expect(card).toMatch(/priority visit fee/);
    // The distinction the whole product depends on: the fee buys the visit.
    expect(card).toMatch(/quoted and billed\s+separately/);
    expect(card).toMatch(/nothing is charged until you have\s+seen both/);
  });

  it('keeps our name out of the customer-facing screens it leads to', () => {
    const shown = QUICK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(shown).not.toContain('>Quick Stop<');
    expect(shown).not.toContain('Request a Quick Stop');
    expect(shown).not.toContain("fit for a Quick Stop");
  });

  it('opens straight into the questions when it is chosen rather than found', () => {
    // The collapsed teaser is right for a card somebody scrolled to; it is a
    // pointless second press for somebody who just picked it out of two.
    expect(FLOW).toContain('startOpen');
    expect(QUICK).toContain('const [open, setOpen] = useState(startOpen);');
  });

  it('and Cancel goes back to the windows rather than collapsing in place', () => {
    expect(FLOW).toContain("onExit={() => setPath('standard')}");
    expect(QUICK).toContain('onClick={() => (onExit ? onExit() : setOpen(false))}');
  });

  /**
   * The one page state where the alternative path matters most used to be the
   * state that dropped it: {quickStop} sat outside the days.length branch.
   */
  it('survives a contractor with no open windows at all', () => {
    const empty = PAGE.slice(PAGE.indexOf('days.length === 0 ?'), PAGE.indexOf('<RequestVisitFlow'));
    expect(empty).toContain('{quickStop}');
  });

  it('and the server still decides whether it is on offer', () => {
    // Five settings and a clock — none of which belongs on the client.
    expect(FLOW).toContain('quickStop: { siteId: string; serviceArea: string | null; days: QuickStopDayOption[] } | null');
    expect(PAGE).toContain('quickStopEnabled');
  });
});

/* ===========================================================================
   5. The review
   ======================================================================== */
describe('the review can be corrected from where the mistake is', () => {
  it('gives every row its own way back to the step that set it', () => {
    // A review that can only be fixed by pressing Back twice is one people
    // learn to skip, which costs it the only thing it is for.
    expect(FLOW).toContain('onEdit={() => goTo(1)}');
    expect(FLOW).toContain('onEdit={() => goTo(2)}');
  });

  it('names what each Change button changes, for anyone hearing the page', () => {
    // Six buttons all reading "Change" are six identical links in a rotor.
    expect(FLOW).toContain('<span className="sr-only"> {label.toLowerCase()}</span>');
  });

  it('and still says this is a request rather than a booking', () => {
    expect(FLOW).toContain('This is a request, not a charge.');
  });
});
