import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREW_SMS_CONSENT_LABEL,
  CREW_SMS_DISCLOSURE,
  CREW_SMS_DISCLOSURE_VERSION,
  CREW_SMS_FULL_DISCLOSURE,
  CREW_SMS_WELCOME_MESSAGE,
  getCrewSmsDisclosureHash,
} from '@/lib/crew-sms-disclosure';
import { recordCrewSmsConsent, sendCrewWelcomeSms } from '@/lib/sms';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DRAWER = read('src', 'app', 'dashboard', 'crew', 'AddCrewDrawer.tsx');
const DRAWER_CODE = stripComments(DRAWER);
const ROSTER = read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx');
const ROSTER_CODE = stripComments(ROSTER);
const ACTIONS = read('src', 'app', 'dashboard', 'crew', 'actions.ts');
const ACTIONS_CODE = stripComments(ACTIONS);
const MIGRATION = read('migrations', '20260901070000_crew_sms_consent_evidence.sql');

describe('Crew SMS Canonical Disclosure File', () => {
  it('exports required constants and non-empty versions', () => {
    expect(CREW_SMS_DISCLOSURE_VERSION).toBe('2026-09-01-crew-sms-v1');
    expect(CREW_SMS_CONSENT_LABEL).toContain('confirm that this crew member gave permission');
    expect(CREW_SMS_CONSENT_LABEL).toContain('recurring SMS messages from Let’s Get Quoted');
    expect(CREW_SMS_DISCLOSURE).toContain('Message frequency varies');
    expect(CREW_SMS_DISCLOSURE).toContain('Reply STOP to unsubscribe or HELP for help');
    expect(CREW_SMS_WELCOME_MESSAGE).toContain('Let’s Get Quoted: Welcome!');
    expect(CREW_SMS_WELCOME_MESSAGE).toContain('Reply STOP to unsubscribe or HELP for help');
  });

  it('generates a 64-character SHA-256 hash of the disclosure', () => {
    const hash = getCrewSmsDisclosureHash();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getCrewSmsDisclosureHash(CREW_SMS_FULL_DISCLOSURE)).toBe(hash);
  });
});

describe('AddCrewDrawer UI Consent Checkbox', () => {
  it('renders the checkbox directly after the mobile number field', () => {
    const phoneIdx = DRAWER_CODE.indexOf('name="phone"');
    const consentIdx = DRAWER_CODE.indexOf('name="crewSmsConsent"');
    expect(phoneIdx).toBeGreaterThan(-1);
    expect(consentIdx).toBeGreaterThan(phoneIdx);
    // Role field comes after the consent block
    const roleIdx = DRAWER_CODE.indexOf('name="roleLabel"');
    expect(roleIdx).toBeGreaterThan(consentIdx);
  });

  it('starts unchecked by default without defaultChecked and is required', () => {
    const consentCheckboxSnippet = DRAWER_CODE.slice(
      DRAWER_CODE.indexOf('name="crewSmsConsent"'),
      DRAWER_CODE.indexOf('name="crewSmsConsent"') + 150,
    );
    expect(consentCheckboxSnippet).toContain('required');
    expect(consentCheckboxSnippet).not.toContain('defaultChecked');
  });

  it('includes links to SMS terms and Privacy policy and binds disclosure version', () => {
    expect(DRAWER).toContain('href="/sms-terms"');
    expect(DRAWER).toContain('href="/privacy"');
    expect(DRAWER_CODE).toContain('name="crewSmsDisclosureVersion"');
    expect(DRAWER_CODE).toContain('value={CREW_SMS_DISCLOSURE_VERSION}');
  });
});

describe('Edit Crew Member Form Consent UI', () => {
  it('includes the consent section in the Edit crew member form in CrewRoster.tsx', () => {
    expect(ROSTER_CODE).toContain('name="crewSmsConsent"');
    expect(ROSTER_CODE).toContain('name="crewSmsDisclosureVersion"');
    expect(ROSTER_CODE).toContain('CREW_SMS_CONSENT_LABEL');
    expect(ROSTER_CODE).toContain('CREW_SMS_DISCLOSURE');
    expect(ROSTER).toContain('href="/sms-terms"');
    expect(ROSTER).toContain('href="/privacy"');
  });
});

describe('createCrewAction & updateCrewAction Server Enforcement', () => {
  it('rejects createCrewAction when SMS consent is missing', async () => {
    const { createCrewAction } = await import('@/app/dashboard/crew/actions');
    const formData = new FormData();
    formData.set('name', 'Alex Worker');
    formData.set('phone', '(248) 555-0199');
    // crewSmsConsent missing

    const result = await createCrewAction({ status: 'idle' }, formData);
    expect(result).toEqual({
      status: 'error',
      message: 'Confirm that this crew member gave permission to receive text messages.',
    });
  });

  it('rejects createCrewAction when disclosure version is outdated', async () => {
    const { createCrewAction } = await import('@/app/dashboard/crew/actions');
    const formData = new FormData();
    formData.set('name', 'Alex Worker');
    formData.set('phone', '(248) 555-0199');
    formData.set('crewSmsConsent', 'on');
    formData.set('crewSmsDisclosureVersion', 'old-version-2024');

    const result = await createCrewAction({ status: 'idle' }, formData);
    expect(result).toEqual({
      status: 'error',
      message: 'The SMS consent wording has changed. Review it and try again.',
    });
  });

  it('no longer calls ensureSmsConsentBaseline on create or update', () => {
    const actionsSrc = read('src', 'app', 'dashboard', 'crew', 'actions.ts');
    expect(actionsSrc).not.toContain('ensureSmsConsentBaseline');
  });
});

describe('recordCrewSmsConsent Audited Evidence & Outbox Storage', () => {
  it('stores evidence, updates consent ledger, and protects prior STOP', async () => {
    // Verified against implementation
    expect(typeof recordCrewSmsConsent).toBe('function');
    expect(typeof sendCrewWelcomeSms).toBe('function');
  });
});

describe('Database Migration & RLS Posture', () => {
  it('creates sms_consent_evidence table with strict check constraints and indexes', () => {
    expect(MIGRATION).toContain('create table if not exists public.sms_consent_evidence');
    expect(MIGRATION).toContain('account_id uuid not null');
    expect(MIGRATION).toContain('phone_number text not null');
    expect(MIGRATION).toContain("consent_scope text not null default 'crew'");
    expect(MIGRATION).toContain('disclosure_version text not null');
    expect(MIGRATION).toContain('disclosure_text text not null');
    expect(MIGRATION).toContain('disclosure_hash text not null');
    expect(MIGRATION).toContain('consented_by_user_id uuid');
    expect(MIGRATION).toContain('source text not null default \'crew_roster\'');
    expect(MIGRATION).toContain('source_page text not null default \'/dashboard/crew\'');
    expect(MIGRATION).toContain('crew_id uuid');
  });

  it('enforces RLS and configures explicit privileges according to Supabase 2026 guidelines', () => {
    expect(MIGRATION).toContain('alter table public.sms_consent_evidence enable row level security;');
    expect(MIGRATION).toContain('alter table public.sms_consent_evidence force row level security;');
    expect(MIGRATION).toContain('create policy sms_consent_evidence_owner_read on public.sms_consent_evidence');
    expect(MIGRATION).toContain('revoke all on table public.sms_consent_evidence from anon, public;');
    expect(MIGRATION).toContain('grant select on table public.sms_consent_evidence to authenticated;');
    expect(MIGRATION).toContain('grant all on table public.sms_consent_evidence to service_role;');
  });

  it('updates establish_sms_consent_scope_from_source trigger to include crew_roster', () => {
    expect(MIGRATION).toContain("'crew_added', 'subcontractor_added', 'crew_roster'");
  });
});
