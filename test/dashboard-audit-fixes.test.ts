import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('dashboard audit repairs', () => {
  it('returns a test campaign to the composer that owns its confirmation', () => {
    const actions = read('src', 'app', 'dashboard', 'marketing', 'actions.ts');
    expect(actions).toContain("redirect('/dashboard/marketing/campaigns?test=1')");
    expect(actions).not.toContain("redirect('/dashboard/marketing?test=1')");
  });

  it('opens review setup through the Website Builder deep-link contract', () => {
    const button = read('src', 'app', 'dashboard', 'jobs', '[id]', 'RequestReviewButton.tsx');
    expect(button).toContain('href="/dashboard/sites?open=reviews"');
    expect(button).not.toContain('href="/dashboard/sites?tab=page#testimonials"');
  });

  it('passes a requested recurring plan into the existing card jump', () => {
    const page = read('src', 'app', 'dashboard', 'recurring', 'page.tsx');
    const screen = read('src', 'app', 'dashboard', 'recurring', 'RecurringScreen.tsx');
    const workspace = read('src', 'app', 'dashboard', 'recurring', 'RecurringWorkspace.tsx');
    expect(page).toContain('focusPlanId={searchParams.plan ?? null}');
    expect(screen).toContain('focusPlanId={focusPlanId}');
    expect(workspace).toContain('focusPlanId && rows.some((row) => row.id === focusPlanId) ? focusPlanId : null');
  });

  it('uses one account-local day for each affected page', () => {
    const auth = read('src', 'lib', 'auth.ts');
    const clients = read('src', 'app', 'dashboard', 'clients', 'page.tsx');
    const booking = read('src', 'app', 'dashboard', 'schedule', 'booking', 'page.tsx');

    expect(auth).toContain('accountTimeZone:');
    expect(clients).toContain('const todayKey = todayIn(accountTimeZone);');
    expect(clients).toContain('listClientsWithStats(supabase, accountId, { todayKey })');
    expect(clients).toContain('todayKey={todayKey}');
    expect(booking).toContain('const todayKey = todayIn(availability.timezone);');
    expect(booking).toContain('listUpcomingBlocks(supabase, accountId, todayKey)');
  });

  it('routes crew shortcuts to tabs the Crew page actually supports', () => {
    const roster = read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx');
    const payroll = read('src', 'lib', 'cash-forecast-payroll.ts');

    expect(roster).toContain('href="/dashboard/crew?tab=jobs">Labor by job</Link>');
    expect(roster).not.toContain('/dashboard/crew?tab=labor');
    expect(payroll).toContain("href: '/dashboard/crew?tab=hours'");
    expect(payroll).not.toContain("href: '/dashboard/crew?tab=pay'");
  });

  it('uses US English labor copy in the jobs smoothie preview', () => {
    const smoothie = read('src', 'app', 'dashboard', 'jobs', 'JobSmoothieView.tsx');
    expect(smoothie).toContain("'No labor estimate on this job yet.'");
    expect(smoothie).toContain('hrs of labor.');
    expect(smoothie).not.toContain('labour');
  });

  it('keeps mobile tab strip on a single horizontal line and stacks action buttons', () => {
    const focusCss = read('src', 'app', 'dashboard', 'focus.module.css');
    const smoothieCss = read('src', 'app', 'dashboard', 'smoothie.module.css');

    expect(focusCss).toContain('flex-wrap: nowrap;');
    expect(focusCss).toContain('overflow-x: auto;');
    expect(smoothieCss).toContain('.commsRow > * { flex: 1 1 100%;');
  });

  it('provides structured destination mode selection and verified profile status for automations#reviews', () => {
    const section = read('src', 'app', 'dashboard', 'settings', 'ReviewRequestSection.tsx');
    const css = read('src', 'app', 'globals.css');

    expect(section).toContain('role="radiogroup" aria-label="Review Destination Mode"');
    expect(section).toContain('review-badge-recommended');
    expect(section).toContain('Google Policy Compliant');
    expect(section).toContain('review-phone-status-bar');
    expect(css).toContain('.review-state-banner.is-active');
    expect(css).toContain('.review-mode-card.is-selected');
    expect(css).toContain('.review-phone-status-bar');
  });

  it('provides structured cards, feature highlights, and compliance containers for messages#texting-setup', () => {
    const setup = read('src', 'app', 'dashboard', 'messages', 'MessagingSetup.tsx');
    const form = read('src', 'app', 'dashboard', 'messages', 'OwnerAlertsForm.tsx');
    const css = read('src', 'app', 'globals.css');

    expect(setup).toContain('msg-setup-card');
    expect(setup).toContain('msg-setup-section-head');
    expect(setup).toContain('msg-setup-features');
    expect(setup).toContain('Two-way SMS inbox');
    expect(form).toContain('msg-setup-compliance-card');
    expect(form).toContain('msg-setup-toggle-card');
    expect(css).toContain('.app-modal:has(.msg-setup-sections)');
    expect(css).toContain('.msg-setup-card');
    expect(css).toContain('.msg-setup-compliance-card');
  });
});


