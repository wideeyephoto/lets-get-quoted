import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const LIB = read('src', 'lib', 'weather-data.ts');
const PAGE = read('src', 'app', 'dashboard', 'schedule', 'page.tsx');
const SUMMARY = read('src', 'app', 'dashboard', 'schedule', 'ScheduleDaySummary.tsx');
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * The header deliberately has no weather card: a thirty-day count of "weather
 * conflicts" is not a number anybody acts on. The forecast belongs on the day
 * you are looking at, which is what this is.
 */
describe('weather on the Day view', () => {
  /** An account with the feature off must not pay for a query it will not use,
   *  so the gate is on a column the page already selects. */
  it('costs nothing when the account has it switched off', () => {
    expect(PAGE).toContain('weatherAccount?.weather_alerts_enabled');
    expect(PAGE).toContain('weather_alerts_enabled, service_center_lat, service_center_lng');
  });

  /**
   * jobsAtRisk already answers "which booked work is in trouble" and fetches a
   * forecast per grid cell across up to 200 jobs — a digest's shape. One point
   * answers the Day view's smaller question.
   */
  it('asks about one point, not about every job', () => {
    expect(LIB).toContain('export async function outlookByDay(');
    const fn = LIB.slice(LIB.indexOf('export async function outlookByDay('));
    expect(fn).toContain('const forecasts = await getForecast(createAdminClient(), lat, lng);');
    expect(fn).not.toContain('from(\'jobs\')');
  });

  /** No coordinates, no forecast, feature off — the Day view shows nothing
   *  rather than a shrug. */
  it('returns nothing rather than an unknown', () => {
    const fn = LIB.slice(LIB.indexOf('export async function outlookByDay('));
    expect(fn).toContain('if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};');
    expect(fn).toContain('if (!enabled) return {};');
    expect(fn).toContain('if (forecasts.length === 0) return {};');
  });

  /** Keyed by date, because the anchor day is client state — stepping a day
   *  must not need a round trip. */
  it('is keyed by day so stepping the day is free', () => {
    expect(PAGE).toContain('weatherByDay={weatherByDay}');
    expect(read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx'))
      .toContain('weather={weatherByDay[anchorDayKey] ?? null}');
  });

  /**
   * 'clear' is the answer on most days, and a line reading "Looks fine" every
   * day is furniture you stop seeing — which is what makes the one bad Tuesday
   * invisible.
   */
  it('says nothing on a day worth saying nothing about', () => {
    expect(SUMMARY).toContain("{weather && weather.level !== 'clear' ? (");
  });

  /** "1.1in of rain" and "gusts to 31mph" are what decides whether the crew
   *  goes out; the NWS sentence is kept in the title. */
  it('prints the reasons rather than the poetry', () => {
    expect(SUMMARY).toContain("{weather.reasons.join(' · ') || weather.summary}");
    expect(SUMMARY).toContain('title={weather.summary}');
  });

  /** "Don't plan on it" is the one state where the answer is to move the work,
   *  so it is a different signal and not a louder amber. */
  it('separates the day to watch from the day to move', () => {
    expect(GLOBALS).toContain(".sched-daysum-weather[data-level='unworkable']");
  });
});

/**
 * A media query adds no specificity, so one written ABOVE the declaration it
 * means to override loses on source order and never fires. Three grids in this
 * file had exactly that, and the booking page had already found it and patched
 * around it inside .book-scope while noting the shared fix was owed.
 */
describe('the narrow-screen grid collapses actually fire', () => {
  it('collapses .form-grid below the rule that sets two columns', () => {
    const base = GLOBALS.search(/\.form-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*1fr 1fr;/);
    const collapse = GLOBALS.search(/\.form-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(base).toBeGreaterThan(0);
    expect(collapse).toBeGreaterThan(base);
  });

  /** `1fr` is `minmax(auto, 1fr)`, so the track cannot go under its content's
   *  min-content — and a bare <input> will not shrink below 20 characters. */
  it('lets the fields inside it actually shrink', () => {
    expect(GLOBALS).toMatch(/\.form-grid\s*>\s*\*\s*\{\s*min-width:\s*0;/);
  });

  it('collapses the job intake schedule grid too', () => {
    const base = GLOBALS.search(/\.job-intake-schedule-grid\s*\{\s*display:\s*grid;/);
    const collapse = GLOBALS.search(/\.job-intake-schedule-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(base).toBeGreaterThan(0);
    expect(collapse).toBeGreaterThan(base);
  });

  /** The dead entry is gone from the block that never applied it, so nobody
   *  reads that list and believes .form-grid is handled there. */
  it('drops the entry that never did anything', () => {
    const block = GLOBALS.slice(GLOBALS.indexOf('@media (max-width: 900px) {\n  .hero-grid,'), GLOBALS.indexOf('.hours-metric { grid-column: auto; }'));
    expect(block).not.toContain('\n  .form-grid,');
  });
});

/**
 * TURNING IT ON HAD NO VISIBLE EFFECT, AND THEN HANDED YOU A BUTTON.
 *
 * updateWeatherSettingsAction was the only action in its directory with no
 * revalidatePath, so pressing "Turn it on" wrote weather_alerts_enabled = true
 * and re-rendered the route from cache — which still said false. Measured
 * against a real account: the column flipped and twenty-five seconds later the
 * card on screen was still the off card, offering to turn it on.
 *
 * Reported as "I turned it on, it froze for ten seconds, then it just has this
 * manual check weather button now" — the button being the enabled panel,
 * reached by reloading, which was the only thing that produced a fresh render.
 */
describe('turning the forecast on', () => {
  const ACTIONS = read('src', 'app', 'dashboard', 'schedule', 'weather-actions.ts');
  const PANEL = read('src', 'app', 'dashboard', 'schedule', 'WeatherPanel.tsx');
  const SETTINGS = read('src', 'app', 'dashboard', 'schedule', 'settings', 'page.tsx');

  it('revalidates the page it just changed', () => {
    expect(ACTIONS).toContain("revalidatePath('/dashboard/schedule/settings')");
    // The calendar reads the same setting.
    expect(ACTIONS).toContain("revalidatePath('/dashboard/schedule')");
  });

  it('comes back with the flag that means "just now"', () => {
    expect(ACTIONS).toContain("redirect('/dashboard/schedule/settings?weather=on#weather-panel')");
    expect(SETTINGS).toContain("justEnabled={searchParams?.weather === 'on'}");
    expect(PANEL).toContain('justEnabled?: boolean;');
  });

  /**
   * The first check runs itself, because being handed another button is not
   * being turned on. Only then: checking on every render would be two requests
   * to a free public service per location every time somebody opens their
   * settings, which is what the on-demand design exists to avoid.
   */
  it('runs the first check itself, once, and only then', () => {
    expect(PANEL).toContain('if (!justEnabled || !enabled || autoChecked.current) return;');
    expect(PANEL).toContain('autoChecked.current = true;');
    // A ref rather than state: an effect runs twice under strict mode in
    // development, and this one costs a network round trip.
    expect(PANEL).toContain('const autoChecked = useRef(false);');
  });

  it('says what it is doing while it does it', () => {
    expect(PANEL).toContain('Reading the forecast for every day you have work booked.');
  });
});

describe('interactive weather reschedule and SMS flow', () => {
  const SMS = read('src', 'lib', 'sms.ts');
  const ACTIONS = read('src', 'app', 'dashboard', 'schedule', 'weather-actions.ts');
  const PANEL = read('src', 'app', 'dashboard', 'schedule', 'WeatherPanel.tsx');
  const GLOBALS = read('src', 'app', 'globals.css');
  const DATA = read('src', 'lib', 'weather-data.ts');

  it('queries client_phone for weather jobs to enable SMS outreach', () => {
    expect(DATA).toContain("select('id, ref, client_name, client_phone, scheduled_for, lat, lng, weather_sensitive')");
  });

  it('exports weather reschedule SMS helper in sms.ts', () => {
    expect(SMS).toContain('export async function sendWeatherRescheduleSms(');
    expect(SMS).toContain("messageKind: 'weather-reschedule'");
    expect(SMS).toContain("category: 'customer_message'");
  });

  it('provides dedicated server actions for SMS dispatch, direct moves, and batching', () => {
    expect(ACTIONS).toContain('export async function sendWeatherRescheduleSmsAction(');
    expect(ACTIONS).toContain('export async function moveJobToWeatherDateAction(');
    expect(ACTIONS).toContain('export async function batchSendWeatherRescheduleSmsAction(');
  });

  it('logs weather reschedule events to job_feed and account_events', () => {
    expect(ACTIONS).toContain("kind: 'weather_reschedule_sent'");
    expect(ACTIONS).toContain("kind: 'job_rescheduled'");
    expect(ACTIONS).toContain('createJobFeedEvent(');
    expect(ACTIONS).toContain('recordAccountEvent(');
  });

  it('renders interactive alternative chips, SMS send, direct move, and batch options in WeatherPanel', () => {
    expect(PANEL).toContain('weather-alt-selector');
    expect(PANEL).toContain('weather-alt-pill');
    expect(PANEL).toContain('weather-batch-bar');
    expect(PANEL).toContain('handleSendSms');
    expect(PANEL).toContain('handleMoveJob');
    expect(PANEL).toContain('handleBatchSend');
  });

  it('defines visual styling for pills, actions, and badges in globals.css', () => {
    expect(GLOBALS).toContain('.weather-alt-pill.is-active');
    expect(GLOBALS).toContain('.weather-sent-badge');
    expect(GLOBALS).toContain('.weather-batch-bar');
    expect(GLOBALS).toContain('.weather-logged-badge');
  });

  it('supports logging weather advisory notes to job timeline', () => {
    expect(ACTIONS).toContain('export async function logWeatherRiskToTimelineAction(');
    expect(ACTIONS).toContain("kind: 'weather_risk_flagged'");
    expect(PANEL).toContain('handleLogTimeline');
    expect(PANEL).toContain('Log to Timeline');
  });

  it('records weather events into immutable tenant audit ledger', () => {
    expect(ACTIONS).toContain('recordTenantAuditEvent(');
    expect(ACTIONS).toContain("action: 'weather_reschedule_notified'");
    expect(ACTIONS).toContain("action: 'weather_job_rescheduled'");
  });

  it('provides rich feed labels, display titles, and icons for weather events', () => {
    const LABELS = read('src', 'lib', 'job-detail-labels.ts');
    expect(LABELS).toContain("weather_reschedule_sent: '⛈️'");
    expect(LABELS).toContain("job_rescheduled: '📅'");
    expect(LABELS).toContain("weather_risk_flagged: '⚠'");
    expect(LABELS).toContain("weather_reschedule_sent: 'Weather reschedule'");
    expect(LABELS).toContain("if (event.kind === 'weather_reschedule_sent')");
  });

  it('surfaces weather reschedules in automation activity and health dashboards', () => {
    const AUTO = read('src', 'lib', 'automation-activity.ts');
    const HEALTH = read('src', 'app', 'dashboard', 'home', 'AutomationHealth.tsx');
    expect(AUTO).toContain('weatherRescheduleCount: number;');
    expect(AUTO).toContain("'weather_reschedule_sent'");
    expect(AUTO).toContain("'Weather reschedule outreach'");
    expect(HEALTH).toContain("item.kind === 'weather_reschedule'");
    expect(HEALTH).toContain('Weather reschedules');
  });

  it('enforces TCPA / Mini-TCPA quiet hours and supports delayed morning delivery', () => {
    expect(SMS).toContain('availableAt?: Date | string | null;');
    expect(SMS).toContain('availableAt: input.availableAt,');
    expect(ACTIONS).toContain('getTcpaCompliantSendTime(');
    expect(ACTIONS).toContain('resolveRecipientTimeZone(');
    expect(ACTIONS).toContain('getJurisdictionTcpaRules(');
    expect(ACTIONS).toContain('availableAt: quietCheck.isDelayed ? quietCheck.sendAt : null,');
    expect(PANEL).toContain('sentInfo.isDelayed ?');
    expect(PANEL).toContain('🌙 Queued for');
  });

  it('uses deterministic idempotency keys to protect against duplicate send clicks', () => {
    expect(ACTIONS).toContain('const idempotencyKey = `weather-resched:${job.id}:${origDay}:${targetDay}`;');
  });

  it('tracks offers sent within 24 hours to prevent duplicate blasting and offers re-send', () => {
    expect(ACTIONS).toContain('alreadySentToday: boolean;');
    expect(ACTIONS).toContain('lastSentAt: string | null;');
    expect(ACTIONS).toContain("eq('kind', 'weather_reschedule_sent')");
    expect(PANEL).toContain('risk.alreadySentToday ?');
    expect(PANEL).toContain('Offer sent today');
    expect(PANEL).toContain('Re-send SMS');
  });

  it('integrates automated affirmative inbound reply handling in webhook ingress', () => {
    const INBOUND_ROUTE = read('src', 'app', 'api', 'sms', 'inbound', 'route.ts');
    const INBOUND_LIB = read('src', 'lib', 'weather-inbound.ts');
    expect(INBOUND_ROUTE).toContain('handleWeatherRescheduleInboundReply(');
    expect(INBOUND_LIB).toContain('export async function handleWeatherRescheduleInboundReply(');
    expect(INBOUND_LIB).toContain('export function isAffirmativeReply(');
    expect(INBOUND_LIB).toContain("kind: 'job_rescheduled'");
    expect(INBOUND_LIB).toContain('appointment_confirmed_at: nowIso');
  });
});


