import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CREW_SMS_DISCLOSURE_VERSION,
  CREW_SMS_FULL_DISCLOSURE,
  CREW_SMS_WELCOME_MESSAGE,
} from '@/lib/crew-sms-disclosure';

type Row = Record<string, unknown> | null;
type TableResponses = {
  evidenceInsertError?: { message: string } | null;
  consentUpdateData?: Array<{ id: string }> | null;
  consentUpdateError?: { message: string } | null;
  consentSelectData?: { status: string } | null;
  consentSelectError?: { message: string } | null;
  consentInsertError?: { code?: string; message: string } | null;
  scopesUpsertError?: { message: string } | null;
};

let tableResponses: TableResponses = {};
let recordedEvidencePayloads: any[] = [];
let recordedConsentUpdates: any[] = [];
let recordedConsentInserts: any[] = [];
let recordedScopesUpserts: any[] = [];

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'sms_consent_evidence') {
        return {
          insert: async (payload: any) => {
            recordedEvidencePayloads.push(payload);
            if (tableResponses.evidenceInsertError) {
              return { error: tableResponses.evidenceInsertError };
            }
            return { error: null };
          },
        };
      }
      if (table === 'sms_consent') {
        const chain = {
          update: (payload: any) => {
            recordedConsentUpdates.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  neq: () => ({
                    select: async () => ({
                      data: tableResponses.consentUpdateData ?? [{ id: 'consent-1' }],
                      error: tableResponses.consentUpdateError ?? null,
                    }),
                  }),
                }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: tableResponses.consentSelectData ?? null,
                  error: tableResponses.consentSelectError ?? null,
                }),
              }),
            }),
          }),
          insert: async (payload: any) => {
            recordedConsentInserts.push(payload);
            if (tableResponses.consentInsertError) {
              return { error: tableResponses.consentInsertError };
            }
            return { error: null };
          },
        };
        return chain;
      }
      if (table === 'sms_consent_scopes') {
        return {
          upsert: async (payload: any, options: any) => {
            recordedScopesUpserts.push({ payload, options });
            return { error: tableResponses.scopesUpsertError ?? null };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      };
    },
  }),
  requireOfficeContext: async () => ({
    supabase: {},
    accountId: '00000000-0000-0000-0000-000000000001',
    userId: '11111111-1111-1111-1111-111111111111',
  }),
}));

const { recordCrewSmsConsent, sendCrewWelcomeSms } = await import('@/lib/sms');

beforeEach(() => {
  tableResponses = {};
  recordedEvidencePayloads = [];
  recordedConsentUpdates = [];
  recordedConsentInserts = [];
  recordedScopesUpserts = [];
});

describe('recordCrewSmsConsent Audited Evidence Behavior', () => {
  const accountId = '00000000-0000-0000-0000-000000000001';
  const phone = '(248) 555-0123';
  const normalized = '+12485550123';
  const userId = '11111111-1111-1111-1111-111111111111';
  const crewId = '22222222-2222-2222-2222-222222222222';

  it('records durable consent evidence with exact required columns', async () => {
    tableResponses.consentUpdateData = [{ id: 'consent-row-1' }];

    const outcome = await recordCrewSmsConsent({
      accountId,
      phone,
      disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
      userId,
      crewId,
      sourcePage: '/dashboard/crew',
      source: 'crew_roster',
    });

    expect(outcome).toBe('recorded');
    expect(recordedEvidencePayloads.length).toBe(1);

    const evidence = recordedEvidencePayloads[0];
    expect(evidence.account_id).toBe(accountId);
    expect(evidence.phone_number).toBe(normalized);
    expect(evidence.consent_scope).toBe('crew');
    expect(evidence.disclosure_version).toBe(CREW_SMS_DISCLOSURE_VERSION);
    expect(evidence.disclosure_text).toBe(CREW_SMS_FULL_DISCLOSURE);
    expect(evidence.disclosure_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.consented_by_user_id).toBe(userId);
    expect(evidence.source).toBe('crew_roster');
    expect(evidence.source_page).toBe('/dashboard/crew');
    expect(evidence.crew_id).toBe(crewId);
    expect(evidence.consented_at).toBeDefined();
  });

  it('fails closed when evidence insertion fails, never authorizing SMS', async () => {
    tableResponses.evidenceInsertError = { message: 'Database disk full or constraint violation' };

    const outcome = await recordCrewSmsConsent({
      accountId,
      phone,
      disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
      userId,
      crewId,
    });

    expect(outcome).toBe('failed');
    // Did NOT attempt to update sms_consent
    expect(recordedConsentUpdates.length).toBe(0);
  });

  it('never overrides a prior STOP and returns suppressed', async () => {
    // Update returned 0 rows (blocked by .neq('status', 'opted_out'))
    tableResponses.consentUpdateData = [];
    // Existing row is opted_out
    tableResponses.consentSelectData = { status: 'opted_out' };

    const outcome = await recordCrewSmsConsent({
      accountId,
      phone,
      disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
      userId,
      crewId,
    });

    expect(outcome).toBe('suppressed');
    expect(recordedEvidencePayloads.length).toBe(1);
    // Did not perform an insert of opted_in over opted_out
    expect(recordedConsentInserts.length).toBe(0);
  });

  it('inserts new consent row and crew scope when no prior record exists', async () => {
    tableResponses.consentUpdateData = [];
    tableResponses.consentSelectData = null; // No row exists

    const outcome = await recordCrewSmsConsent({
      accountId,
      phone,
      disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
      userId,
      crewId,
    });

    expect(outcome).toBe('recorded');
    expect(recordedConsentInserts.length).toBe(1);
    expect(recordedConsentInserts[0]).toMatchObject({
      account_id: accountId,
      phone_number: normalized,
      status: 'opted_in',
      source: 'crew_roster',
      disclosure_version: CREW_SMS_DISCLOSURE_VERSION,
    });
    expect(recordedScopesUpserts.length).toBe(1);
    expect(recordedScopesUpserts[0].payload).toMatchObject({
      account_id: accountId,
      phone_number: normalized,
      consent_scope: 'crew',
      evidence_source: 'crew_roster',
    });
  });
});
