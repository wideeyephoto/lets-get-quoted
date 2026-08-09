import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const SCHEDULE_FIELDS = read('src', 'app', 'dashboard', 'jobs', '[id]', 'JobScheduleFields.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const LEAD_ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
const LEAD_PAGE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx');

/**
 * Booking a job without texting the customer.
 *
 * The scheduling card on a job was titled "Send 3 Start Dates" and held one
 * form: a mobile number, three options, a consent checkbox. Fine, and not the
 * only way to book work — not even the common one for a contractor whose
 * customers do not text, or whose date was agreed on the phone before the quote
 * went out. For them the pipeline step named "Schedule the work" pointed
 * straight at a form they could not use, and the way to put a date on a job was
 * buried inside "edit client details", under a heading about the customer.
 */

describe('the scheduling card is named for the outcome', () => {
  const section = JOB_PAGE.slice(
    JOB_PAGE.indexOf('<details id="job-scheduling"'),
    JOB_PAGE.indexOf('<section id="job-costs"'),
  );

  it('says what it is for, not which channel it uses', () => {
    expect(section).toContain('<h2>Set the start date</h2>');
    expect(section).not.toContain('<h2>Send 3 Start Dates</h2>');
    expect(section).toContain('<p className="eyebrow">Scheduling</p>');
  });

  it('leads with the route that always works', () => {
    const pickerAt = section.indexOf('<JobScheduleFields');
    const textAt = section.indexOf('job-schedule-alt');
    expect(pickerAt).toBeGreaterThan(-1);
    expect(textAt).toBeGreaterThan(pickerAt);
  });

  it('still offers the text route, one press away', () => {
    expect(section).toContain('Or let the client pick from 3 dates');
    expect(section).toContain('Text 3 start dates');
    expect(section).toContain('name="scheduleSmsConsent"');
  });

  it('says which job it is describing before asking for a date', () => {
    expect(section).toContain('Booked for ${formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)}');
    expect(section).toContain('Nobody is booked in yet');
  });

  /**
   * A phone field and a consent box for a text that cannot be sent is an
   * interface making a promise on the app's behalf that the app cannot keep.
   */
  it('stops offering the text route when it cannot be used', () => {
    expect(section).toContain('{clientCanBeTexted ? (');
    expect(section).toContain("No mobile on file for ${job.client_name}");
    expect(section).toContain('use the date picker above');
  });

  it('routes the manual save to the action that already existed', () => {
    expect(JOB_PAGE).toContain('const boundScheduleJob = scheduleJobAction.bind(null, job.id);');
    expect(section).toContain('<form action={boundScheduleJob}');
  });

  it('has its own quiet styling, so it does not read as a second card', () => {
    expect(GLOBALS).toContain('.job-schedule-alt {');
    expect(GLOBALS).toContain('.job-schedule-alt[open] > summary::before { content: \'−\'; }');
  });
});

/**
 * ScheduledDatePicker submits through a HIDDEN input, and a hidden input cannot
 * be `required` — the browser skips validation on it. An empty submit would
 * reach scheduleJobAction, which reads a missing date as "send me to the
 * unscheduled queue": right when the schedule board calls it, a silent bounce
 * off the job page when this form does.
 */
describe('the date picker cannot submit nothing', () => {
  it('holds the date itself and disables the button until there is one', () => {
    expect(SCHEDULE_FIELDS).toContain("const [date, setDate] = useState(scheduledFor);");
    expect(SCHEDULE_FIELDS).toContain('value={date} onChange={setDate}');
    expect(SCHEDULE_FIELDS).toContain('disabled={!date}');
  });

  it('names the button for what pressing it does', () => {
    expect(SCHEDULE_FIELDS).toContain("{scheduledFor ? 'Move this job' : 'Put it on the calendar'}");
  });

  /**
   * It used to POINT at the field: "Running over more than one day? Set an end
   * date in Job details." The field is here now — see test/job-day-load — so
   * the pointer is gone rather than left aiming at a place the work no longer
   * happens.
   */
  it('handles multi-day work itself instead of pointing at another form', () => {
    expect(SCHEDULE_FIELDS).not.toContain('Set an end date in Job details');
    expect(SCHEDULE_FIELDS).toContain('name="scheduledUntil"');
    expect(SCHEDULE_FIELDS).toContain('Leave blank for a one-day job');
  });
});

/**
 * A form that empties itself and stays put is indistinguishable from one that
 * silently failed — and re-pressing is the obvious next move, which makes a
 * duplicate.
 */
describe('adding a lead ends on the lead', () => {
  it('keeps the row it creates and lands on it', () => {
    const action = LEAD_ACTIONS.slice(
      LEAD_ACTIONS.indexOf('export async function createLeadAction('),
      LEAD_ACTIONS.indexOf('export async function updateLeadStatusAction('),
    );
    expect(action).toContain('const lead = await createLead(');
    expect(action).toContain('redirect(`/dashboard/leads/${lead.id}?added=1`)');
    // redirect() signals by throwing, so it must not be inside a try.
    expect(action).not.toContain('try {');
  });

  it('and says what just happened when it gets there', () => {
    expect(LEAD_PAGE).toContain('searchParams.added');
    expect(LEAD_PAGE).toContain('was added.');
    expect(LEAD_PAGE).toContain('added?: string');
  });
});
