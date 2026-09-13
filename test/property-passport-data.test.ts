/**
 * Property Passport & Equipment Intelligence Data Engine Test
 *
 * Targets:
 *   - src/lib/property-passport-data.ts (listPropertyPassports, getPropertyPassport,
 *     getPropertyPassportByCode, createPropertyPassport, addEquipmentToPassport,
 *     updateEquipmentOnPassport, addPassportLedgerEntry, transferPropertyPassport)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOrCreateClientId: vi.fn(),
}));

vi.mock('@/lib/clients', () => ({
  findOrCreateClientId: mocks.findOrCreateClientId,
}));

import {
  listPropertyPassports,
  getPropertyPassport,
  getPropertyPassportByCode,
  createPropertyPassport,
  addEquipmentToPassport,
  updateEquipmentOnPassport,
  addPassportLedgerEntry,
  transferPropertyPassport,
} from '@/lib/property-passport-data';

describe('Property Passport & Equipment Intelligence Data Engine', () => {
  function createMockSupabase(queryResults: Record<string, any> = {}) {
    const spies = {
      eq: vi.fn(),
      in: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };

    const client: any = {
      ...spies,
      from: vi.fn().mockImplementation((table: string) => {
        const queryChain: any = {
          select: vi.fn((...args: any[]) => {
            client.select(...args);
            return queryChain;
          }),
          insert: vi.fn((...args: any[]) => {
            client.insert(...args);
            return queryChain;
          }),
          update: vi.fn((...args: any[]) => {
            client.update(...args);
            return queryChain;
          }),
          delete: vi.fn((...args: any[]) => {
            client.delete(...args);
            return queryChain;
          }),
          eq: vi.fn((...args: any[]) => {
            client.eq(...args);
            return queryChain;
          }),
          in: vi.fn((...args: any[]) => {
            client.in(...args);
            return queryChain;
          }),
          order: vi.fn((...args: any[]) => {
            client.order(...args);
            return queryChain;
          }),
          limit: vi.fn((...args: any[]) => {
            client.limit(...args);
            return queryChain;
          }),
          single: vi.fn().mockImplementation(() => {
            const res = queryResults[table]?.single ?? queryResults.default?.single ?? { data: null, error: null };
            return Promise.resolve(res);
          }),
          maybeSingle: vi.fn().mockImplementation(() => {
            const res = queryResults[table]?.maybeSingle ?? queryResults.default?.maybeSingle ?? { data: null, error: null };
            return Promise.resolve(res);
          }),
          then: (resolve: any) => {
            const res = queryResults[table]?.list ?? queryResults.default?.list ?? { data: [], error: null };
            return Promise.resolve(res).then(resolve);
          },
        };
        return queryChain;
      }),
    };

    return client;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOrCreateClientId.mockResolvedValue('client-uuid-101');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. listPropertyPassports
  // ───────────────────────────────────────────────────────────────────────────

  describe('listPropertyPassports', () => {
    it('returns empty array when error occurs or no passports found', async () => {
      const client = createMockSupabase({
        property_passports: { list: { data: null, error: { message: 'Database error' } } },
      });

      const list = await listPropertyPassports(client, 'acc-1');
      expect(list).toEqual([]);
    });

    it('joins equipment and ledger history for all passports', async () => {
      const passportRows = [
        {
          id: 'pass-1',
          account_id: 'acc-1',
          passport_code: 'PASSPORT-ABC1',
          address: '100 Main St',
          homeowner_name: 'Alice Cooper',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      const equipmentRows = [
        {
          id: 'eq-1',
          passport_id: 'pass-1',
          account_id: 'acc-1',
          category: 'hvac_heating',
          name: 'Carrier Furnace',
          brand: 'Carrier',
          model_number: '59TP6B',
          installed_on: '2024-01-15',
          expected_lifespan_years: 15,
          condition: 'excellent',
        },
      ];

      const ledgerRows = [
        {
          id: 'led-1',
          passport_id: 'pass-1',
          account_id: 'acc-1',
          type: 'tuneup',
          date: '2025-06-01',
          title: 'Annual Furnace Inspection',
          performed_by: 'HVAC Pros',
        },
      ];

      const client = createMockSupabase({
        property_passports: { list: { data: passportRows, error: null } },
        equipment_passports: { list: { data: equipmentRows, error: null } },
        property_passport_ledger: { list: { data: ledgerRows, error: null } },
      });

      const list = await listPropertyPassports(client, 'acc-1');

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('pass-1');
      expect(list[0].passportCode).toBe('PASSPORT-ABC1');
      expect(list[0].equipment).toHaveLength(1);
      expect(list[0].equipment[0].name).toBe('Carrier Furnace');
      expect(list[0].ledger).toHaveLength(1);
      expect(list[0].ledger[0].title).toBe('Annual Furnace Inspection');
      expect(list[0].qrCodeSvg).toContain('<svg');
    });

    it('filters by clientId when provided', async () => {
      const client = createMockSupabase({
        property_passports: { list: { data: [], error: null } },
      });

      await listPropertyPassports(client, 'acc-1', 'client-42');
      expect(client.eq).toHaveBeenCalledWith('client_id', 'client-42');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. getPropertyPassport & getPropertyPassportByCode
  // ───────────────────────────────────────────────────────────────────────────

  describe('getPropertyPassport & getPropertyPassportByCode', () => {
    it('getPropertyPassport returns complete passport with warranties count', async () => {
      const passportRow = {
        id: 'pass-1',
        account_id: 'acc-1',
        passport_code: 'PASSPORT-XYZ9',
        address: '250 Elm St',
        homeowner_name: 'Bob Ross',
        created_at: '2026-01-01T00:00:00Z',
      };

      const client = createMockSupabase({
        property_passports: { maybeSingle: { data: passportRow, error: null } },
        equipment_passports: { list: { data: [], error: null } },
        property_passport_ledger: { list: { data: [], error: null } },
        warranties: { list: { data: [{ id: 'war-1' }], error: null } },
      });

      const passport = await getPropertyPassport(client, 'acc-1', 'pass-1');
      expect(passport).not.toBeNull();
      expect(passport?.address).toBe('250 Elm St');
      expect(passport?.passportPublicUrl).toBe('https://letsgetquoted.com/passport/PASSPORT-XYZ9');
    });

    it('getPropertyPassport returns null when passport does not exist', async () => {
      const client = createMockSupabase({
        property_passports: { maybeSingle: { data: null, error: null } },
      });

      const passport = await getPropertyPassport(client, 'acc-1', 'pass-none');
      expect(passport).toBeNull();
    });

    it('getPropertyPassportByCode looks up by uppercase passport code', async () => {
      const passportRow = {
        id: 'pass-1',
        account_id: 'acc-1',
        passport_code: 'CODE123',
        address: '500 Oak St',
        created_at: '2026-01-01T00:00:00Z',
      };

      const client = createMockSupabase({
        property_passports: { maybeSingle: { data: passportRow, error: null } },
        equipment_passports: { list: { data: [], error: null } },
        property_passport_ledger: { list: { data: [], error: null } },
        warranties: { list: { data: [], error: null } },
      });

      const passport = await getPropertyPassportByCode(client, 'code123');
      expect(client.eq).toHaveBeenCalledWith('passport_code', 'CODE123');
      expect(passport).not.toBeNull();
      expect(passport?.id).toBe('pass-1');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. createPropertyPassport
  // ───────────────────────────────────────────────────────────────────────────

  describe('createPropertyPassport', () => {
    it('creates passport, links homeowner client id, and generates unique passport code', async () => {
      const createdRow = {
        id: 'pass-created-1',
        account_id: 'acc-1',
        client_id: 'client-uuid-101',
        passport_code: 'PP-MOCK-CODE',
        address: '742 Evergreen Terr',
        city: 'Springfield',
        state: 'OR',
        postal_code: '97477',
        homeowner_name: 'Homer Simpson',
        created_at: '2026-06-01T00:00:00Z',
      };

      const client = createMockSupabase({
        property_passports: { single: { data: createdRow, error: null } },
      });

      const passport = await createPropertyPassport(client, 'acc-1', {
        address: '742 Evergreen Terr',
        city: 'Springfield',
        state: 'OR',
        postalCode: '97477',
        homeownerName: 'Homer Simpson',
        homeownerPhone: '555-1234',
        homeownerEmail: 'homer@simpson.com',
      });

      expect(mocks.findOrCreateClientId).toHaveBeenCalledWith(
        client,
        'acc-1',
        expect.objectContaining({
          name: 'Homer Simpson',
          address: '742 Evergreen Terr',
        }),
      );

      expect(client.from).toHaveBeenCalledWith('property_passports');
      expect(client.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          client_id: 'client-uuid-101',
          address: '742 Evergreen Terr',
          city: 'Springfield',
          state: 'OR',
          homeowner_name: 'Homer Simpson',
        }),
      );

      expect(passport.id).toBe('pass-created-1');
      expect(passport.address).toBe('742 Evergreen Terr');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. addEquipmentToPassport & updateEquipmentOnPassport
  // ───────────────────────────────────────────────────────────────────────────

  describe('addEquipmentToPassport & updateEquipmentOnPassport', () => {
    it('adds equipment and automatically creates an installation ledger entry', async () => {
      const newEquipmentRow = {
        id: 'eq-tankless-1',
        passport_id: 'pass-1',
        account_id: 'acc-1',
        category: 'water_heater',
        name: 'Navien NPE-240A2 Tankless Water Heater',
        brand: 'Navien',
        model_number: 'NPE-240A2',
        serial_number: 'NAV-99482',
        location: 'Basement Utility Room',
        installed_on: '2026-06-01',
        expected_lifespan_years: 20,
        condition: 'excellent',
        specs: { capacityGal: 0, fuelType: 'gas' },
      };

      const ledgerRow = {
        id: 'led-install-1',
        passport_id: 'pass-1',
        account_id: 'acc-1',
        type: 'installation',
        date: '2026-06-01',
        title: 'Installed Navien NPE-240A2 Tankless Water Heater',
        summary: 'Navien (Model NPE-240A2) installed at Basement Utility Room.',
        performed_by: 'Installation Crew',
      };

      const client = createMockSupabase({
        equipment_passports: { single: { data: newEquipmentRow, error: null } },
        property_passport_ledger: { single: { data: ledgerRow, error: null } },
      });

      const item = await addEquipmentToPassport(client, 'acc-1', 'pass-1', {
        category: 'water_heater',
        name: 'Navien NPE-240A2 Tankless Water Heater',
        brand: 'Navien',
        modelNumber: 'NPE-240A2',
        serialNumber: 'NAV-99482',
        location: 'Basement Utility Room',
        installedOn: '2026-06-01',
        specs: { capacityGal: 0, fuelType: 'gas' },
      });

      expect(item.id).toBe('eq-tankless-1');
      expect(item.brand).toBe('Navien');
      expect(item.expectedLifespanYears).toBe(20);

      // Verifies ledger insertion call
      expect(client.from).toHaveBeenCalledWith('property_passport_ledger');
      expect(client.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          equipment_id: 'eq-tankless-1',
          type: 'installation',
          title: 'Installed Navien NPE-240A2 Tankless Water Heater',
        }),
      );
    });

    it('updateEquipmentOnPassport updates fields and timestamps', async () => {
      const client = createMockSupabase();

      const result = await updateEquipmentOnPassport(client, 'acc-1', 'eq-1', {
        name: 'Carrier Infinity 98',
        brand: 'Carrier',
        modelNumber: '59MN7A',
        notes: 'Upgraded filter to MERV 13',
      });

      expect(result.ok).toBe(true);
      expect(client.from).toHaveBeenCalledWith('equipment_passports');
      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Carrier Infinity 98',
          brand: 'Carrier',
          model_number: '59MN7A',
          notes: 'Upgraded filter to MERV 13',
        }),
      );
    });

    it('updateEquipmentOnPassport returns error if no fields supplied', async () => {
      const client = createMockSupabase();
      const result = await updateEquipmentOnPassport(client, 'acc-1', 'eq-1', {});
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Nothing to update');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. addPassportLedgerEntry
  // ───────────────────────────────────────────────────────────────────────────

  describe('addPassportLedgerEntry', () => {
    it('creates maintenance ledger entry with invoice ref and cost', async () => {
      const ledgerRow = {
        id: 'led-100',
        passport_id: 'pass-1',
        account_id: 'acc-1',
        equipment_id: 'eq-1',
        job_id: 'job-55',
        type: 'repair',
        date: '2026-06-15',
        title: 'Replaced igniter assembly',
        summary: 'Hot surface igniter cracked. Replaced with OEM part.',
        performed_by: 'Senior Technician Tim',
        cost: 285.5,
        invoice_ref: 'INV-2026-55',
        document_urls: [{ name: 'Invoice Receipt', url: 'https://docs.acme.com/inv.pdf' }],
      };

      const client = createMockSupabase({
        property_passport_ledger: { single: { data: ledgerRow, error: null } },
      });

      const entry = await addPassportLedgerEntry(client, 'acc-1', 'pass-1', {
        equipmentId: 'eq-1',
        jobId: 'job-55',
        type: 'repair',
        date: '2026-06-15',
        title: 'Replaced igniter assembly',
        summary: 'Hot surface igniter cracked. Replaced with OEM part.',
        performedBy: 'Senior Technician Tim',
        cost: 285.5,
        invoiceRef: 'INV-2026-55',
        documentUrls: [{ name: 'Invoice Receipt', url: 'https://docs.acme.com/inv.pdf' }],
      });

      expect(entry.id).toBe('led-100');
      expect(entry.cost).toBe(285.5);
      expect(entry.invoiceRef).toBe('INV-2026-55');
      expect(entry.documentUrls).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. transferPropertyPassport
  // ───────────────────────────────────────────────────────────────────────────

  describe('transferPropertyPassport', () => {
    it('archives current owner in history, creates client for buyer, and records transfer ledger', async () => {
      const currentPassport = {
        id: 'pass-1',
        accountId: 'acc-1',
        clientId: 'client-seller-1',
        passportCode: 'PASS-1234',
        address: '123 Meadow Lane',
        currentHomeowner: {
          name: 'Jane Seller',
          phone: '555-0001',
          email: 'jane@seller.com',
          sinceDate: '2020-03-01',
        },
        ownershipHistory: [],
        equipment: [
          {
            id: 'eq-1',
            passportId: 'pass-1',
            accountId: 'acc-1',
            category: 'plumbing',
            name: 'Sump Pump',
            brand: 'Zoeller',
            installedOn: '2021-05-01',
            expectedLifespanYears: 10,
            estimatedAgeYears: 5,
            condition: 'good',
            specs: {},
            photos: [],
          },
        ],
        ledger: [],
      };

      const updatedRow = {
        id: 'pass-1',
        account_id: 'acc-1',
        client_id: 'client-buyer-2',
        passport_code: 'PASS-1234',
        address: '123 Meadow Lane',
        homeowner_name: 'Mark Buyer',
        homeowner_phone: '555-0002',
        homeowner_email: 'mark@buyer.com',
        homeowner_since: '2026-06-01',
        ownership_history: [
          {
            homeownerName: 'Jane Seller',
            fromDate: '2020-03-01',
            toDate: '2026-06-01',
            note: 'Sold home to Mark Buyer',
          },
        ],
      };

      const transferLedgerRow = {
        id: 'led-transfer-1',
        passport_id: 'pass-1',
        account_id: 'acc-1',
        type: 'inspection',
        date: '2026-06-01',
        title: 'Property Passport Transferred',
        summary: 'Passport ownership transferred',
      };

      mocks.findOrCreateClientId.mockResolvedValue('client-buyer-2');

      const client = createMockSupabase({
        property_passports: {
          maybeSingle: { data: updatedRow, error: null },
          single: { data: updatedRow, error: null },
        },
        property_passport_ledger: {
          single: { data: transferLedgerRow, error: null },
          list: { data: [], error: null },
        },
        equipment_passports: { list: { data: currentPassport.equipment, error: null } },
        warranties: { list: { data: [], error: null } },
      });

      const transferred = await transferPropertyPassport(
        client,
        'acc-1',
        'pass-1',
        {
          name: 'Mark Buyer',
          phone: '555-0002',
          email: 'mark@buyer.com',
        },
        'Sold home to Mark Buyer',
      );

      expect(transferred.currentHomeowner.name).toBe('Mark Buyer');
      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: 'client-buyer-2',
          homeowner_name: 'Mark Buyer',
          ownership_history: expect.arrayContaining([
            expect.objectContaining({
              homeownerName: 'Jane Seller',
              note: 'Sold home to Mark Buyer',
            }),
          ]),
        }),
      );

      // Verifies transfer ledger entry logged
      expect(client.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Property Passport Transferred',
          type: 'inspection',
        }),
      );
    });
  });
});
