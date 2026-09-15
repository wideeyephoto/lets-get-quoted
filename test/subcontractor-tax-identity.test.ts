/**
 * Subcontractor Tax Identity & Tax Vault Encryption Test
 *
 * Targets:
 *   - src/lib/subcontractor-tax-identity.ts (loadSubcontractorTaxIdentity, saveSubcontractorTaxIdentity,
 *     decryptSubcontractorTin, TAX_CLASSIFICATIONS, TAX_CLASSIFICATION_LABELS)
 *   - End-to-end integration with src/lib/tax-vault-crypto.ts (AES-256-GCM envelope encryption,
 *     TIN masking, W-9 status synchronization on the public crew roster)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSubcontractorTaxIdentity,
  saveSubcontractorTaxIdentity,
  decryptSubcontractorTin,
  TAX_CLASSIFICATIONS,
  TAX_CLASSIFICATION_LABELS,
  type SaveSubcontractorTaxIdentityInput,
} from '@/lib/subcontractor-tax-identity';
import { encryptTin } from '@/lib/tax-vault-crypto';

describe('Subcontractor Tax Identity & Tax Vault Security', () => {
  function createMockSupabase(data: any = null, error: any = null) {
    const chain: any = {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      then: (resolve: any) => Promise.resolve({ data, error }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Classification & Dictionary Integrity
  // ───────────────────────────────────────────────────────────────────────────

  describe('tax classifications and IRS entity definitions', () => {
    it('defines standard IRS entity classifications with complete labels', () => {
      expect(TAX_CLASSIFICATIONS).toContain('individual_sole_proprietor');
      expect(TAX_CLASSIFICATIONS).toContain('c_corporation');
      expect(TAX_CLASSIFICATIONS).toContain('s_corporation');
      expect(TAX_CLASSIFICATIONS).toContain('partnership');
      expect(TAX_CLASSIFICATIONS).toContain('llc_s');

      for (const classification of TAX_CLASSIFICATIONS) {
        expect(TAX_CLASSIFICATION_LABELS[classification]).toBeDefined();
        expect(typeof TAX_CLASSIFICATION_LABELS[classification]).toBe('string');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. loadSubcontractorTaxIdentity
  // ───────────────────────────────────────────────────────────────────────────

  describe('loadSubcontractorTaxIdentity', () => {
    it('queries private tax_vault schema and normalizes masked output', async () => {
      const storedRow = {
        id: 'tax-id-1',
        account_id: 'acc-1',
        crew_id: 'crew-1',
        legal_name: 'Apex Electrical LLC',
        business_name: 'Apex Electric',
        tax_classification: 'llc_s',
        tin_type: 'ein',
        tin_last_four: '7890',
        tax_address_line1: '100 North Main',
        tax_address_line2: 'Suite 200',
        tax_city: 'Austin',
        tax_region: 'TX',
        tax_postal_code: '78701',
        exempt_payee_code: null,
        fatca_code: null,
        backup_withholding_required: false,
        w9_document_path: 'vault/w9-crew-1.pdf',
        w9_signed_at: '2026-01-15T10:00:00Z',
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T10:00:00Z',
      };

      const client = createMockSupabase(storedRow);
      const result = await loadSubcontractorTaxIdentity(client, 'acc-1', 'crew-1');

      expect(client.schema).toHaveBeenCalledWith('tax_vault');
      expect(client.from).toHaveBeenCalledWith('subcontractor_tax_identities');
      expect(result).not.toBeNull();
      expect(result?.legalName).toBe('Apex Electrical LLC');
      expect(result?.tinMasked).toBe('••-•••7890');
      expect(result?.tinLastFour).toBe('7890');
      expect(result?.taxRegion).toBe('TX');
      expect(result?.w9DocumentPath).toBe('vault/w9-crew-1.pdf');
    });

    it('returns null when no tax record exists', async () => {
      const client = createMockSupabase(null);
      const result = await loadSubcontractorTaxIdentity(client, 'acc-1', 'crew-999');

      expect(result).toBeNull();
    });

    it('throws when database query returns error', async () => {
      const client = createMockSupabase(null, { message: 'permission denied for schema tax_vault' });

      await expect(
        loadSubcontractorTaxIdentity(client, 'acc-1', 'crew-1'),
      ).rejects.toThrow('Unable to load subcontractor tax identity: permission denied for schema tax_vault');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. saveSubcontractorTaxIdentity
  // ───────────────────────────────────────────────────────────────────────────

  describe('saveSubcontractorTaxIdentity', () => {
    it('encrypts raw TIN, upserts into tax_vault, and sets crew w9_status to on_file', async () => {
      const savedRow = {
        id: 'tax-id-10',
        account_id: 'acc-1',
        crew_id: 'crew-1',
        legal_name: 'Bob Miller Plumbing',
        business_name: null,
        tax_classification: 'individual_sole_proprietor',
        tin_type: 'ssn',
        tin_last_four: '4321',
        tax_address_line1: '456 Oak Lane',
        tax_address_line2: null,
        tax_city: 'Fort Worth',
        tax_region: 'TX',
        tax_postal_code: '76102',
        exempt_payee_code: null,
        fatca_code: null,
        backup_withholding_required: false,
        w9_document_path: null,
        w9_signed_at: '2026-06-01T12:00:00Z',
        created_at: '2026-06-01T12:00:00Z',
        updated_at: '2026-06-01T12:00:00Z',
      };

      const client = createMockSupabase(savedRow);

      const input: SaveSubcontractorTaxIdentityInput = {
        accountId: 'acc-1',
        crewId: 'crew-1',
        legalName: 'Bob Miller Plumbing',
        taxClassification: 'individual_sole_proprietor',
        rawTin: '987-65-4321',
        tinType: 'ssn',
        taxAddressLine1: '456 Oak Lane',
        taxCity: 'Fort Worth',
        taxRegion: 'tx',
        taxPostalCode: '76102',
      };

      const saved = await saveSubcontractorTaxIdentity(client, input);

      expect(client.schema).toHaveBeenCalledWith('tax_vault');
      expect(client.from).toHaveBeenCalledWith('subcontractor_tax_identities');
      expect(client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          crew_id: 'crew-1',
          legal_name: 'Bob Miller Plumbing',
          tax_classification: 'individual_sole_proprietor',
          tin_type: 'ssn',
          tin_last_four: '4321',
          tax_region: 'TX', // normalized to uppercase
        }),
        { onConflict: 'account_id, crew_id' },
      );

      // Verifies cipher metadata is captured
      const upsertArgs = client.upsert.mock.calls[0][0];
      expect(upsertArgs.encrypted_tin).toBeDefined();
      expect(upsertArgs.tin_iv).toBeDefined();
      expect(upsertArgs.tin_auth_tag).toBeDefined();

      // Verifies public crew roster is updated with w9_status = 'on_file'
      expect(client.from).toHaveBeenCalledWith('crew');
      expect(client.update).toHaveBeenCalledWith({ w9_status: 'on_file' });
      expect(client.eq).toHaveBeenCalledWith('account_id', 'acc-1');
      expect(client.eq).toHaveBeenCalledWith('id', 'crew-1');

      // Returned record has masked representation
      expect(saved.tinMasked).toBe('•••-••-4321');
      expect(saved.legalName).toBe('Bob Miller Plumbing');
    });

    it('rejects invalid TIN before reaching database', async () => {
      const client = createMockSupabase();

      const input: SaveSubcontractorTaxIdentityInput = {
        accountId: 'acc-1',
        crewId: 'crew-1',
        legalName: 'Test Bad TIN',
        taxClassification: 'partnership',
        rawTin: '1234', // invalid length
        taxAddressLine1: '123 Main',
        taxCity: 'Dallas',
        taxRegion: 'TX',
        taxPostalCode: '75001',
      };

      await expect(
        saveSubcontractorTaxIdentity(client, input),
      ).rejects.toThrow('Taxpayer Identification Number must be a valid 9-digit identifier');

      expect(client.upsert).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. decryptSubcontractorTin
  // ───────────────────────────────────────────────────────────────────────────

  describe('decryptSubcontractorTin', () => {
    it('reads encrypted payload from tax_vault and decrypts back to plaintext TIN', async () => {
      const originalTin = '123456789';
      const encrypted = encryptTin(originalTin, 'ein');

      const storedRow = {
        encrypted_tin: encrypted.ciphertext,
        tin_iv: encrypted.iv,
        tin_auth_tag: encrypted.authTag,
      };

      const client = createMockSupabase(storedRow);

      const decrypted = await decryptSubcontractorTin(client, 'acc-1', 'crew-1');

      expect(client.schema).toHaveBeenCalledWith('tax_vault');
      expect(client.from).toHaveBeenCalledWith('subcontractor_tax_identities');
      expect(decrypted).toBe(originalTin);
    });

    it('throws if tax record is not found for decryption', async () => {
      const client = createMockSupabase(null);

      await expect(
        decryptSubcontractorTin(client, 'acc-1', 'crew-missing'),
      ).rejects.toThrow('Tax identity not found for decryption: missing record');
    });

    it('fails decryption if auth tag is corrupted', async () => {
      const encrypted = encryptTin('123456789', 'ein');
      const corruptedRow = {
        encrypted_tin: encrypted.ciphertext,
        tin_iv: encrypted.iv,
        tin_auth_tag: Buffer.from('corruptedtag1234').toString('base64'),
      };

      const client = createMockSupabase(corruptedRow);

      await expect(
        decryptSubcontractorTin(client, 'acc-1', 'crew-1'),
      ).rejects.toThrow();
    });
  });
});
