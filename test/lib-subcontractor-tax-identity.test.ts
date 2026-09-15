import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  loadSubcontractorTaxIdentity, 
  saveSubcontractorTaxIdentity,
  decryptSubcontractorTin
} from '@/lib/subcontractor-tax-identity';
import * as cryptoModule from '@/lib/tax-vault-crypto';

vi.mock('@/lib/tax-vault-crypto', () => ({
  encryptTin: vi.fn(() => ({
    tinType: 'ein',
    lastFour: '1234',
    ciphertext: 'encrypted',
    iv: 'iv',
    authTag: 'tag'
  })),
  decryptTin: vi.fn(() => '99-9991234'),
  formatTinMasked: vi.fn(() => 'XX-XXX1234')
}));

describe('Subcontractor Tax Identity Lib', () => {
  let adminMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    queryMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      then: vi.fn((resolve) => resolve({ error: null })),
    };

    adminMock = {
      schema: vi.fn(() => adminMock),
      from: vi.fn(() => queryMock),
    };
  });

  describe('loadSubcontractorTaxIdentity', () => {
    it('returns null if not found', async () => {
      queryMock.maybeSingle.mockResolvedValue({ data: null, error: null });
      const res = await loadSubcontractorTaxIdentity(adminMock, 'acct1', 'crew1');
      expect(res).toBeNull();
    });

    it('throws on error', async () => {
      queryMock.maybeSingle.mockResolvedValue({ error: new Error('db err') });
      await expect(loadSubcontractorTaxIdentity(adminMock, 'acct1', 'crew1')).rejects.toThrow('Unable to load');
    });

    it('returns normalized data', async () => {
      queryMock.maybeSingle.mockResolvedValue({
        data: {
          id: '1', account_id: 'acct1', crew_id: 'crew1', legal_name: 'Bob',
          tax_classification: 'individual_sole_proprietor',
          tin_type: 'ssn', tin_last_four: '1234',
          tax_address_line1: '123 Main', tax_city: 'City', tax_region: 'CA', tax_postal_code: '90001'
        },
        error: null
      });

      const res = await loadSubcontractorTaxIdentity(adminMock, 'acct1', 'crew1');
      expect(res?.tinMasked).toBe('XX-XXX1234');
      expect(res?.legalName).toBe('Bob');
    });
  });

  describe('saveSubcontractorTaxIdentity', () => {
    it('encrypts and upserts', async () => {
      queryMock.single.mockResolvedValue({
        data: {
          id: '1', account_id: 'acct1', crew_id: 'crew1', legal_name: 'Bob',
          tax_classification: 'individual_sole_proprietor',
          tin_type: 'ssn', tin_last_four: '1234',
          tax_address_line1: '123 Main', tax_city: 'City', tax_region: 'CA', tax_postal_code: '90001'
        },
        error: null
      });

      const res = await saveSubcontractorTaxIdentity(adminMock, {
        accountId: 'acct1', crewId: 'crew1', legalName: 'Bob',
        taxClassification: 'individual_sole_proprietor',
        rawTin: 'raw', taxAddressLine1: '123 Main', taxCity: 'City', taxRegion: 'CA', taxPostalCode: '90001'
      });

      expect(res.id).toBe('1');
      expect(cryptoModule.encryptTin).toHaveBeenCalled();
      expect(queryMock.upsert).toHaveBeenCalled();
      // Should also update the crew w9_status
      expect(queryMock.update).toHaveBeenCalledWith({ w9_status: 'on_file' });
    });

    it('throws if save fails', async () => {
      queryMock.single.mockResolvedValue({ error: new Error('fail') });
      await expect(saveSubcontractorTaxIdentity(adminMock, {
        accountId: 'acct1', crewId: 'crew1', legalName: 'Bob',
        taxClassification: 'individual_sole_proprietor',
        rawTin: 'raw', taxAddressLine1: '123 Main', taxCity: 'City', taxRegion: 'CA', taxPostalCode: '90001'
      })).rejects.toThrow('Unable to save');
    });
  });

  describe('decryptSubcontractorTin', () => {
    it('returns decrypted tin', async () => {
      queryMock.maybeSingle.mockResolvedValue({
        data: { encrypted_tin: 'enc', tin_iv: 'iv', tin_auth_tag: 'tag' },
        error: null
      });

      const res = await decryptSubcontractorTin(adminMock, 'acct1', 'crew1');
      expect(res).toBe('99-9991234');
      expect(cryptoModule.decryptTin).toHaveBeenCalledWith({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' });
    });

    it('throws if not found', async () => {
      queryMock.maybeSingle.mockResolvedValue({ data: null, error: null });
      await expect(decryptSubcontractorTin(adminMock, 'acct1', 'crew1')).rejects.toThrow('Tax identity not found');
    });
  });
});
