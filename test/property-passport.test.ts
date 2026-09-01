import { describe, it, expect } from 'vitest';
import {
  generatePassportCode,
  calculatePropertyHealthScore,
  buildPropertyPassportPlacardHtml,
  type EquipmentPassportItem,
} from '@/lib/property-passport';

describe('Durable Property & Equipment Passports', () => {
  describe('generatePassportCode', () => {
    it('generates a clean uppercase formatted code from an address', () => {
      const code1 = generatePassportCode('1428 Elm Street, Austin, TX');
      expect(code1).toMatch(/^PROP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      const code2 = generatePassportCode('1428 Elm Street, Austin, TX');
      // Deterministic for same address
      expect(code1).toBe(code2);
    });
  });

  describe('calculatePropertyHealthScore', () => {
    const today = '2026-09-01';

    it('returns high A+ score for newly installed, well-maintained equipment with warranties', () => {
      const equipment: EquipmentPassportItem[] = [
        {
          id: 'eq_1',
          passportId: 'pass_1',
          accountId: 'acc_1',
          jobId: null,
          warrantyId: 'war_1',
          category: 'hvac_cooling',
          name: 'Carrier Infinity 19VS AC',
          brand: 'Carrier',
          modelNumber: '24VNA936A003',
          serialNumber: '1224E48912',
          location: 'East Yard',
          installedOn: '2025-06-15', // ~1 yr old
          expectedLifespanYears: 15,
          estimatedAgeYears: 1.2,
          condition: 'excellent',
          specs: {
            filterSize: '20x25x4 MERV 11',
            filterChangeIntervalMonths: 6,
            lastFilterChangedOn: '2026-07-01',
          },
          maintenanceIntervalMonths: 12,
          lastServicedOn: '2026-05-10',
          nextServiceDue: '2027-05-10',
          manualUrl: null,
          photos: [],
          notes: null,
        },
        {
          id: 'eq_2',
          passportId: 'pass_1',
          accountId: 'acc_1',
          jobId: null,
          warrantyId: 'war_2',
          category: 'water_heater',
          name: 'Navien NPE-240A2 Tankless Water Heater',
          brand: 'Navien',
          modelNumber: 'NPE-240A2',
          serialNumber: '7412984120',
          location: 'Basement Mechanical Room',
          installedOn: '2024-03-10',
          expectedLifespanYears: 20,
          estimatedAgeYears: 2.5,
          condition: 'excellent',
          specs: {
            fuelType: 'gas',
          },
          maintenanceIntervalMonths: 12,
          lastServicedOn: '2026-04-01',
          nextServiceDue: '2027-04-01',
          manualUrl: null,
          photos: [],
          notes: null,
        },
      ];

      const health = calculatePropertyHealthScore(equipment, 2, today);
      expect(health.score).toBeGreaterThanOrEqual(95);
      expect(health.grade).toBe('A+');
      expect(health.summaryText).toContain('Outstanding condition');
      expect(health.factors.some((f) => f.category === 'Warranty Protection')).toBe(true);
    });

    it('penalizes aging equipment operating past normal lifespan and overdue maintenance', () => {
      const equipment: EquipmentPassportItem[] = [
        {
          id: 'eq_old_furnace',
          passportId: 'pass_2',
          accountId: 'acc_1',
          jobId: null,
          warrantyId: null,
          category: 'hvac_heating',
          name: 'Old Goodman 80% Furnace',
          brand: 'Goodman',
          modelNumber: 'GMVC80704BX',
          serialNumber: '0204192841',
          location: 'Attic',
          installedOn: '2004-01-10', // ~22 yrs old (past 18 yr lifespan)
          expectedLifespanYears: 18,
          estimatedAgeYears: 22.6,
          condition: 'poor',
          specs: {
            filterSize: '16x25x1',
            filterChangeIntervalMonths: 3,
            lastFilterChangedOn: '2025-01-10', // filter overdue by 1+ year
          },
          maintenanceIntervalMonths: 12,
          lastServicedOn: '2023-01-10',
          nextServiceDue: '2024-01-10', // service overdue by 2+ years
          manualUrl: null,
          photos: [],
          notes: null,
        },
      ];

      const health = calculatePropertyHealthScore(equipment, 0, today);
      expect(health.score).toBeLessThanOrEqual(65);
      expect(['C', 'D']).toContain(health.grade);
      expect(health.factors.some((f) => f.status === 'critical')).toBe(true);
      expect(health.factors.some((f) => f.title.includes('Past Expected Lifespan'))).toBe(true);
      expect(health.factors.some((f) => f.title.includes('Service Overdue'))).toBe(true);
    });
  });

  describe('buildPropertyPassportPlacardHtml', () => {
    it('generates high-DPI printable HTML placard for mechanical room / panel with QR code', () => {
      const passport = {
        passportCode: 'PROP-7K99-M410',
        address: '742 Evergreen Terrace, Springfield, OR',
        passportPublicUrl: 'https://letsgetquoted.com/passport/PROP-7K99-M410',
        equipment: [
          {
            id: 'eq_1',
            passportId: 'pass_1',
            accountId: 'acc_1',
            jobId: null,
            warrantyId: null,
            category: 'hvac_cooling' as const,
            name: 'Trane XR14 Heat Pump',
            brand: 'Trane',
            modelNumber: '4TWR4036G1000A',
            serialNumber: '2104591041',
            location: 'South Side',
            installedOn: '2024-05-12',
            expectedLifespanYears: 15,
            estimatedAgeYears: 2.3,
            condition: 'excellent' as const,
            specs: { filterSize: '20x20x1 MERV 8' },
            maintenanceIntervalMonths: 12,
            lastServicedOn: '2026-05-12',
            nextServiceDue: '2027-05-12',
            manualUrl: null,
            photos: [],
            notes: null,
          },
        ],
      };

      const brand = {
        businessName: 'Evergreen Heating & Air',
        phone: '(555) 789-0123',
        siteUrl: 'https://evergreenheating.com',
      };

      const html = buildPropertyPassportPlacardHtml(passport, brand);
      expect(html).toContain('Evergreen Heating &amp; Air');
      expect(html).toContain('742 Evergreen Terrace');
      expect(html).toContain('PROP-7K99-M410');
      expect(html).toContain('Trane XR14 Heat Pump');
      expect(html).toContain('20x20x1 MERV 8');
      expect(html).toContain('(555) 789-0123');
      expect(html).toContain('<svg');
    });
  });
});
