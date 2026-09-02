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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

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
      const makeQueryBuilder = () => {
        const builder: any = {
          eq: () => builder,
          neq: () => builder,
          limit: () => builder,
          order: () => builder,
          maybeSingle: async () => ({
            data: { phone: '(248) 555-0000', company_name: 'Test Builder Co', business_name: 'Test Builder Co' },
            error: null,
          }),
          single: async () => ({
            data: { id: '22222222-2222-2222-2222-222222222222', name: 'John Builder', phone: '(248) 555-0000' },
            error: null,
          }),
        };
        return builder;
      };

      return {
        select: () => makeQueryBuilder(),
        insert: (payload: any) => ({
          select: () => ({
            single: async () => ({
              data: { id: '22222222-2222-2222-2222-222222222222', name: payload?.name ?? 'John Builder', ...(Array.isArray(payload) ? payload[0] : payload) },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
  requireOfficeContext: async () => {
    const makeQueryBuilder = () => {
      const builder: any = {
        eq: () => builder,
        neq: () => builder,
        limit: () => builder,
        order: () => builder,
        maybeSingle: async () => ({
          data: { phone: '(248) 555-0000', company_name: 'Test Builder Co', business_name: 'Test Builder Co' },
          error: null,
        }),
        single: async () => ({
          data: { id: '22222222-2222-2222-2222-222222222222', name: 'John Builder', phone: '(248) 555-0000' },
          error: null,
        }),
      };
      return builder;
    };

    return {
      supabase: {
        from: (table: string) => ({
          select: () => makeQueryBuilder(),
          insert: (payload: any) => ({
            select: () => ({
              single: async () => ({
                data: { id: '22222222-2222-2222-2222-222222222222', name: payload?.name ?? 'John Builder', ...(Array.isArray(payload) ? payload[0] : payload) },
                error: null,
              }),
            }),
          }),
          update: () => {
            const updateBuilder: any = {
              eq: () => updateBuilder,
              is: () => updateBuilder,
              select: () => updateBuilder,
              single: async () => ({
                data: { id: '22222222-2222-2222-2222-222222222222', name: 'John Builder', phone: '(248) 555-9999' },
                error: null,
              }),
            };
            return updateBuilder;
          },
        }),
      },
      accountId: '00000000-0000-0000-0000-000000000001',
      userId: '11111111-1111-1111-1111-111111111111',
    };
  },
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

describe('createCrewAction and updateCrewAction server validation and execution', () => {
  it('rejects createCrewAction when disclosure version is missing or invalid', async () => {
    const { createCrewAction } = await import('@/app/dashboard/crew/actions');

    const missingVerForm = new FormData();
    missingVerForm.set('name', 'John Builder');
    missingVerForm.set('phone', '(248) 555-0199');
    missingVerForm.set('crewSmsConsent', 'on');

    const res1 = await createCrewAction({ status: 'idle' }, missingVerForm);
    expect(res1).toEqual({
      status: 'error',
      message: 'The SMS consent wording has changed. Review it and try again.',
    });

    const invalidVerForm = new FormData();
    invalidVerForm.set('name', 'John Builder');
    invalidVerForm.set('phone', '(248) 555-0199');
    invalidVerForm.set('crewSmsConsent', 'on');
    invalidVerForm.set('crewSmsDisclosureVersion', '2024-invalid-ver');

    const res2 = await createCrewAction({ status: 'idle' }, invalidVerForm);
    expect(res2).toEqual({
      status: 'error',
      message: 'The SMS consent wording has changed. Review it and try again.',
    });
  });

  it('rejects updateCrewAction when phone number changes and disclosure version is missing or invalid', async () => {
    const { updateCrewAction } = await import('@/app/dashboard/crew/actions');

    const missingVerForm = new FormData();
    missingVerForm.set('name', 'John Builder');
    missingVerForm.set('phone', '(248) 555-9999');
    missingVerForm.set('crewSmsConsent', 'on');

    await expect(updateCrewAction('22222222-2222-2222-2222-222222222222', missingVerForm)).rejects.toThrow(
      'The SMS consent wording has changed. Review it and try again.',
    );

    const invalidVerForm = new FormData();
    invalidVerForm.set('name', 'John Builder');
    invalidVerForm.set('phone', '(248) 555-9999');
    invalidVerForm.set('crewSmsConsent', 'on');
    invalidVerForm.set('crewSmsDisclosureVersion', 'wrong-version');

    await expect(updateCrewAction('22222222-2222-2222-2222-222222222222', invalidVerForm)).rejects.toThrow(
      'The SMS consent wording has changed. Review it and try again.',
    );
  });

  it('succeeds on createCrewAction with valid consent and disclosure version', async () => {
    const { createCrewAction } = await import('@/app/dashboard/crew/actions');

    const validForm = new FormData();
    validForm.set('name', 'John Builder');
    validForm.set('phone', '(248) 555-0199');
    validForm.set('crewSmsConsent', 'on');
    validForm.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

    const res = await createCrewAction({ status: 'idle' }, validForm);
    expect(res.status).toBe('added');
    expect(res.name).toBe('John Builder');
  });

  it('succeeds on updateCrewAction with valid consent and disclosure version when phone changes', async () => {
    const { updateCrewAction } = await import('@/app/dashboard/crew/actions');

    const validForm = new FormData();
    validForm.set('name', 'John Builder');
    validForm.set('phone', '(248) 555-9999');
    validForm.set('crewSmsConsent', 'on');
    validForm.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

    await expect(updateCrewAction('22222222-2222-2222-2222-222222222222', validForm)).resolves.not.toThrow();
  });
});
