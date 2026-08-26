import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listContractorCredentials,
  saveContractorCredential,
  deleteContractorCredential,
  getCredentialsForAuthority,
} from '../src/lib/permit-intel/credentials-vault';

describe('Contractor Credentials & Licensing Vault Domain Service', () => {
  const mockAccountId = 'acc-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes credential expiration status accurately', async () => {
    const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiringSoonDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pastDate = '2020-01-01';

    const mockRows = [
      {
        id: 'c1',
        account_id: mockAccountId,
        credential_type: 'state_license',
        trade_discipline: 'building',
        holder_name: 'Master Builder',
        issuing_authority: 'Michigan LARA',
        expires_at: futureDate,
      },
      {
        id: 'c2',
        account_id: mockAccountId,
        credential_type: 'liability_insurance',
        trade_discipline: 'general',
        holder_name: 'Cincinnati Insurance',
        issuing_authority: 'Cincinnati Financial',
        expires_at: expiringSoonDate,
      },
      {
        id: 'c3',
        account_id: mockAccountId,
        credential_type: 'state_license',
        trade_discipline: 'electrical',
        holder_name: 'Old Master',
        issuing_authority: 'Michigan LARA',
        expires_at: pastDate,
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      }),
    } as any;

    const creds = await listContractorCredentials(mockSupabase, mockAccountId);
    expect(creds.length).toBe(3);
    expect(creds[0].status).toBe('active');
    expect(creds[1].status).toBe('expiring_soon');
    expect(creds[2].status).toBe('expired');
  });

  it('saves new credential and computes status on insert', async () => {
    const insertedRow = {
      id: 'c-new',
      account_id: mockAccountId,
      credential_type: 'municipal_registration',
      trade_discipline: 'building',
      holder_name: 'Royal Roofing LLC',
      issuing_authority: 'City of Royal Oak',
      authority_id: 'mi-royal-oak',
      contractor_pin: '9841',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
          }),
        }),
      }),
    } as any;

    const saved = await saveContractorCredential(mockSupabase, mockAccountId, {
      credentialType: 'municipal_registration',
      holderName: 'Royal Roofing LLC',
      issuingAuthority: 'City of Royal Oak',
      authorityId: 'mi-royal-oak',
      contractorPin: '9841',
    });

    expect(saved.id).toBe('c-new');
    expect(saved.contractorPin).toBe('9841');
    expect(saved.authorityId).toBe('mi-royal-oak');
  });

  it('resolves active credentials for a municipality to prefill applications', async () => {
    const mockRows = [
      {
        id: 'c1',
        account_id: mockAccountId,
        credential_type: 'state_license',
        trade_discipline: 'building',
        holder_name: 'John Builder',
        license_number: '2101999999',
        issuing_authority: 'Michigan LARA',
        expires_at: '2028-01-01',
      },
      {
        id: 'c2',
        account_id: mockAccountId,
        credential_type: 'municipal_registration',
        trade_discipline: 'building',
        holder_name: 'John Builder',
        issuing_authority: 'City of Royal Oak',
        authority_id: 'mi-royal-oak',
        contractor_pin: '8821',
      },
      {
        id: 'c3',
        account_id: mockAccountId,
        credential_type: 'liability_insurance',
        trade_discipline: 'general',
        holder_name: 'John Builder',
        issuing_authority: 'Carrier',
        insurance_carrier: 'Cincinnati Insurance',
        policy_number: 'CPP-1111',
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      }),
    } as any;

    const resolved = await getCredentialsForAuthority(
      mockSupabase,
      mockAccountId,
      'mi-royal-oak',
      'building',
    );

    expect(resolved.stateLicense?.licenseNumber).toBe('2101999999');
    expect(resolved.municipalRegistration?.contractorPin).toBe('8821');
    expect(resolved.liabilityInsurance?.insuranceCarrier).toBe('Cincinnati Insurance');
  });
});
