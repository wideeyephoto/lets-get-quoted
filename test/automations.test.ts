import { describe, it, expect } from 'vitest';
import {
  AUTOMATION_COLUMNS,
  DEDICATED_MESSAGING_AUTOMATION_KEYS,
  automationRequiresDedicatedMessaging,
  isAutomationKey,
} from '@/lib/automations';

describe('automation toggle map', () => {
  it('maps each switchable automation to its own accounts column', () => {
    expect(AUTOMATION_COLUMNS).toEqual({
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
    });
  });

  it('never points two automations at the same column', () => {
    const columns = Object.values(AUTOMATION_COLUMNS);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('uses url-safe keys', () => {
    // Most keys double as the card's <details id> deep-link anchor (#reviews,
    // #daily-digest); `booking` is the exception, anchored at
    // #booking-availability, so the key and anchor are tracked separately.
    for (const key of Object.keys(AUTOMATION_COLUMNS)) {
      expect(key).toMatch(/^[a-z-]+$/);
    }
  });

  it('rejects anything not on the list, so a bad key can never write a column', () => {
    expect(isAutomationKey('reviews')).toBe(true);
    expect(isAutomationKey('daily-digest')).toBe(true);
    expect(isAutomationKey('booking')).toBe(true);
    // Smart Intake vs classic form is a Website Builder method choice, not an
    // automation toggle, so the Automations page deliberately has no switch.
    expect(isAutomationKey('intake-ai')).toBe(false);
    // Junk and prototype-chain probes.
    expect(isAutomationKey('')).toBe(false);
    expect(isAutomationKey('suspended_at')).toBe(false);
    expect(isAutomationKey('toString')).toBe(false);
    expect(isAutomationKey('constructor')).toBe(false);
  });

  it('identifies every switch that can originate customer SMS without a later owner send', () => {
    expect(DEDICATED_MESSAGING_AUTOMATION_KEYS).toEqual([
      'missed-call', 'reviews', 'followups', 'reminders', 'selections',
    ]);
    for (const key of DEDICATED_MESSAGING_AUTOMATION_KEYS) {
      expect(automationRequiresDedicatedMessaging(key)).toBe(true);
    }
    expect(automationRequiresDedicatedMessaging('booking')).toBe(false);
    expect(automationRequiresDedicatedMessaging('extra-stop')).toBe(false);
    expect(automationRequiresDedicatedMessaging('daily-digest')).toBe(false);
    expect(automationRequiresDedicatedMessaging('arrival')).toBe(false);
  });
});

describe('automations page top banners', () => {
  it('does not stack the texting prereq banner and essentials recommendation banner together', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'automations', 'page.tsx'), 'utf8');

    // The essentials recommendation banner must be mutually exclusive with the
    // texting-prereq banner so unconfigured workspaces never see two stacked
    // amber banners both stating texting setup is required.
    expect(page).toMatch(/!customerTextingReady\s*\?\s*\([\s\S]*?automation-prereq[\s\S]*?\)\s*:\s*!allEssentialsOn\s*\?\s*\([\s\S]*?automation-recommend/);
    expect(page).not.toContain('Texting setup required');
  });
});

describe('automations page invariants', () => {
  it('does not couple hasDedicatedNumber for missed calls to customerTextingReady', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'automations', 'page.tsx'), 'utf8');

    // Coupling customerTextingReady to hasDedicatedNumber disables the customer-facing
    // number input on workspaces that only have SMS texting configured, leaving them in
    // an unreachable setup state.
    expect(page).not.toMatch(/hasDedicatedNumber\s*=\s*.*customerTextingReady/);
    expect(page).toMatch(/hasDedicatedNumber\s*=\s*voiceRouteReady/);
  });

  it('uses AutomationTestSend instead of raw form submissions that throw to error boundaries', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'automations', 'page.tsx'), 'utf8');

    expect(page).not.toMatch(/<form[^>]*action=\{sendFollowupTestAction\}/);
    expect(page).not.toMatch(/<form[^>]*action=\{sendReminderTestAction\}/);
    expect(page).not.toMatch(/<form[^>]*action=\{sendTestDigestAction\}/);
    expect(page).toContain('action={sendFollowupTestAction}');
    expect(page).toContain('action={sendReminderTestAction}');
    expect(page).toContain('action={sendTestDigestAction}');
  });
});

describe('arrival section SSR/client hydration consistency', () => {
  it('derives sampleDeparture using zonedInstant to avoid local timezone offset drift', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const section = readFileSync(
      join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'ArrivalSettingsSection.tsx'),
      'utf8',
    );

    // Bare Date without offset parses in process local time (UTC on server, visitor timezone in browser)
    expect(section).not.toMatch(/new Date\('2026-01-01T08:45:00'\)/);
    expect(section).toMatch(/zonedInstant\('2026-01-01',\s*'08:45',\s*timeZone\)/);
  });
});

describe('test actions return inline status contracts', () => {
  it('ensures sendReminderTestAction, sendFollowupTestAction, and sendTestDigestAction return { ok, message }', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const actions = readFileSync(
      join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'actions.ts'),
      'utf8',
    );

    expect(actions).toMatch(/export async function sendReminderTestAction\(\):\s*Promise<\{\s*ok:\s*boolean;\s*message:\s*string\s*\}>/);
    expect(actions).toMatch(/export async function sendFollowupTestAction\(\):\s*Promise<\{\s*ok:\s*boolean;\s*message:\s*string\s*\}>/);
    expect(actions).toMatch(/export async function sendTestDigestAction\(\):\s*Promise<\{\s*ok:\s*boolean;\s*message:\s*string\s*\}>/);
  });
});

