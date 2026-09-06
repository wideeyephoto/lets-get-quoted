import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sms = readFileSync('src/lib/sms.ts', 'utf8');
const voiceTriage = readFileSync('src/lib/voice/triage.ts', 'utf8');
const migration = readFileSync('migrations/20260906130000_sms_campaign_purpose_boundary.sql', 'utf8');

describe('SMS Campaign purpose boundary', () => {
  it('keeps every owner voice alert off the crew/subcontractor dispatch Campaign', () => {
    expect(voiceTriage).not.toMatch(
      /billingCategory:\s*'owner_alert'[\s\S]{0,160}?senderPurpose:\s*'lgq_dispatch'/,
    );
    expect(sms).not.toMatch(
      /category:\s*'owner_alert'[\s\S]{0,160}?senderPurpose:\s*'lgq_dispatch'/,
    );
  });

  it('routes the crew welcome through the dispatch Campaign', () => {
    const crewWelcome = sms.slice(
      sms.indexOf('export async function sendCrewWelcomeSms'),
      sms.indexOf('export async function getSharedFieldPhoneNumber'),
    );
    expect(crewWelcome).toContain("category: 'crew_message'");
    expect(crewWelcome).toContain("senderPurpose: 'lgq_dispatch'");
    expect(crewWelcome).not.toContain("senderPurpose: 'lgq_shared'");
  });

  it('installs the same fail-closed pairing and field-reply routing in PostgreSQL', () => {
    expect(migration).toContain("(p_sender_purpose = 'lgq_dispatch')");
    expect(migration).toContain("(p_billing_category = 'crew_message')");
    expect(migration).toContain("using errcode = '22023'");
    expect(migration).toContain(
      "p_sender_purpose => case when v_crew.id is not null then 'lgq_dispatch' else 'lgq_shared' end",
    );
    expect(migration).toContain(
      'p_sender_number_id => case when v_crew.id is not null then null::uuid else v_task.sender_number_id end',
    );
    expect(migration).toContain('pg_catalog.pg_get_functiondef');
    expect(migration).toContain('v_occurrences <> 1');
    expect(migration).toContain('sms_events_dispatch_category_match');
    expect(migration).toContain('validate constraint sms_events_dispatch_category_match');
  });
});
