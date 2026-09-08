import { describe, it, expect } from 'vitest';
import { loadHeldCapabilities } from '@/lib/auth';
import {
  navTreatment,
  resolveVisibleNav,
  CAPABILITY_MAP,
  NAV_RAIL_ORDER,
  type NavSignals,
} from '@/lib/nav-visibility';

describe('Navigation visibility and persona gating (nav-visibility.ts)', () => {
  describe('§1 The sentinel trap verification', () => {
    it('proves owner capability sentinel returns true for has() but yields empty on enumeration', async () => {
      const ownerCaps = await loadHeldCapabilities('owner');

      // The live predicate works for any capability, including non-existent ones
      expect(ownerCaps.has('leads.read')).toBe(true);
      expect(ownerCaps.has('payments.read')).toBe(true);
      expect(ownerCaps.has('nonexistent.capability')).toBe(true);

      // BUT enumeration silently produces [] — which is why sets must NEVER be serialized!
      expect([...ownerCaps]).toEqual([]);
      expect(Array.from(ownerCaps)).toEqual([]);
      expect(JSON.stringify([...ownerCaps])).toBe('[]');
    });
  });

  describe('Owner visibility — tested against real sentinel from loadHeldCapabilities("owner")', () => {
    it('owner sees every row and has 0 hidden rows', async () => {
      const ownerCaps = await loadHeldCapabilities('owner');
      const ownerSignals: NavSignals = {
        role: 'owner',
        can: (cap) => ownerCaps.has(cap),
        trade: null,
        emptySections: new Set(),
      };

      const result = resolveVisibleNav(ownerSignals);

      expect(result.hiddenCount).toBe(0);
      expect(result.visible.length).toBe(NAV_RAIL_ORDER.length);
      expect(result.visible).toEqual([...NAV_RAIL_ORDER]);
      expect(result.demoted).toEqual([]);
    });

    it('owner sees every row even if can predicate was called with unknown keys', async () => {
      const ownerCaps = await loadHeldCapabilities('owner');
      const ownerSignals: NavSignals = {
        role: 'owner',
        can: (cap) => ownerCaps.has(cap),
        trade: 'roofing',
        emptySections: new Set(),
      };

      for (const href of NAV_RAIL_ORDER) {
        expect(navTreatment(href, ownerSignals)).toBe('show');
      }
    });
  });

  describe('Office user capability gating', () => {
    it('office user with specific capabilities sees only mapped rows and has correct hidden count', () => {
      const granted = new Set(['leads.read', 'jobs.read', 'messages.read']);
      const officeSignals: NavSignals = {
        role: 'office',
        can: (cap) => granted.has(cap),
        trade: null,
        emptySections: new Set(),
      };

      expect(navTreatment('/dashboard/leads', officeSignals)).toBe('show');
      expect(navTreatment('/dashboard/messages', officeSignals)).toBe('show');
      expect(navTreatment('/dashboard/jobs', officeSignals)).toBe('show');
      expect(navTreatment('/dashboard/schedule', officeSignals)).toBe('show'); // mapped to jobs.read
      expect(navTreatment('/dashboard/schedule/booking', officeSignals)).toBe('show'); // mapped to jobs.read

      // Forbidden sections
      expect(navTreatment('/dashboard/crew', officeSignals)).toBe('hide'); // needs crew.read
      expect(navTreatment('/dashboard/clients', officeSignals)).toBe('hide'); // needs clients.read
      expect(navTreatment('/dashboard/payments', officeSignals)).toBe('hide'); // needs payments.read
      expect(navTreatment('/dashboard/insights', officeSignals)).toBe('hide'); // needs payments.read
      expect(navTreatment('/dashboard/cash-flow', officeSignals)).toBe('hide'); // needs payments.read
      expect(navTreatment('/dashboard/inventory', officeSignals)).toBe('hide'); // needs inventory.read
      expect(navTreatment('/dashboard/recurring', officeSignals)).toBe('hide'); // needs invoices.read
      expect(navTreatment('/dashboard/marketing', officeSignals)).toBe('hide'); // needs marketing.read
      expect(navTreatment('/dashboard/reviews', officeSignals)).toBe('hide'); // needs marketing.read

      const result = resolveVisibleNav(officeSignals);
      expect(result.visible).toEqual([
        '/dashboard/leads',
        '/dashboard/messages',
        '/dashboard/jobs',
        '/dashboard/schedule',
      ]);
      expect(result.visible.length).toBe(4);
      expect(result.hiddenCount).toBe(NAV_RAIL_ORDER.length - result.visible.length);
      expect(result.hiddenCount).toBe(14 - 4);
    });

    it('office user with settings.write can see /dashboard/sites', () => {
      const officeSignals: NavSignals = {
        role: 'office',
        can: (cap) => cap === 'settings.write',
        trade: null,
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/sites', officeSignals)).toBe('show');

      const noWriteSignals: NavSignals = {
        role: 'office',
        can: () => false,
        trade: null,
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/sites', noWriteSignals)).toBe('hide');
    });

    it('every one of the unmapped rows defaults to owner-only', () => {
      const unmappedRows = [
        '/dashboard/claims',
        '/dashboard/quick-stops',
        '/dashboard/text-to-job',
        '/dashboard/automations',
        '/dashboard/services',
        '/dashboard/expenses',
        '/dashboard/merchandise',
        '/dashboard/voice-calls',
      ];

      // Even an office user granted all 31 office capabilities cannot reach owner-only rows
      const allOfficePermsSignals: NavSignals = {
        role: 'office',
        can: () => true, // simulates having every office capability
        trade: null,
        emptySections: new Set(),
      };

      for (const href of unmappedRows) {
        expect(CAPABILITY_MAP[href]).toBe('owner');
        expect(navTreatment(href, allOfficePermsSignals)).toBe('hide');
      }
    });

    it('Account and Dashboard are always visible', () => {
      const minimalSignals: NavSignals = {
        role: 'office',
        can: () => false,
        trade: null,
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/settings', minimalSignals)).toBe('show');
      expect(navTreatment('/dashboard', minimalSignals)).toBe('show');
    });
  });

  describe('Failsafe defaults', () => {
    it('unknown href defaults to show', () => {
      const officeSignals: NavSignals = {
        role: 'office',
        can: () => false,
        trade: null,
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/future-feature-xyz', officeSignals)).toBe('show');
    });

    it('trade: null defaults to show (never demotes)', () => {
      const ownerNullTrade: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: null,
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', ownerNullTrade)).toBe('show');
    });

    it('unmeasured section (not in emptySections) defaults to show', () => {
      const ownerSignals: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: null,
        emptySections: new Set(), // empty set means unmeasured/unproven
      };
      expect(navTreatment('/dashboard/crew', ownerSignals)).toBe('show');
      expect(navTreatment('/dashboard/inventory', ownerSignals)).toBe('show');
      expect(navTreatment('/dashboard/recurring', ownerSignals)).toBe('show');
    });
  });

  describe('Trade demotion (Insurance Claims)', () => {
    it('demotes Insurance Claims for non-insurance trades like lawn care or cleaning', () => {
      const lawnCareOwner: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'lawn-care',
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', lawnCareOwner)).toBe('demote');

      const landscapingOwner: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'Landscaping & Grounds',
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', landscapingOwner)).toBe('demote');
    });

    it('keeps Insurance Claims shown for insurance eligible trades (roofing, restoration, tree services)', () => {
      const roofingOwner: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'roofers',
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', roofingOwner)).toBe('show');

      const restorationOwner: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'Water Damage Restoration',
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', restorationOwner)).toBe('show');
    });
  });

  describe('Zero-usage demotion', () => {
    it('demotes crew, inventory, and recurring when proven empty', () => {
      const ownerWithEmpty: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: null,
        emptySections: new Set(['/dashboard/crew', 'inventory', '/dashboard/recurring']),
      };

      expect(navTreatment('/dashboard/crew', ownerWithEmpty)).toBe('demote');
      expect(navTreatment('/dashboard/inventory', ownerWithEmpty)).toBe('demote');
      expect(navTreatment('/dashboard/recurring', ownerWithEmpty)).toBe('demote');

      // Unrelated items are unaffected
      expect(navTreatment('/dashboard/jobs', ownerWithEmpty)).toBe('show');
      expect(navTreatment('/dashboard/leads', ownerWithEmpty)).toBe('show');

      const result = resolveVisibleNav(ownerWithEmpty);
      expect(result.demoted).toContain('/dashboard/crew');
      expect(result.demoted).toContain('/dashboard/inventory');
      expect(result.demoted).toContain('/dashboard/recurring');
      expect(result.visible).not.toContain('/dashboard/crew');
      expect(result.visible).not.toContain('/dashboard/inventory');
      expect(result.visible).not.toContain('/dashboard/recurring');
    });
  });

  describe('Precedence: hide -> demote -> show', () => {
    it('row that is both hidden by capability and demoted by usage is HIDDEN, not demoted', () => {
      // Office user has no crew capability, AND crew is empty
      const officeSignals: NavSignals = {
        role: 'office',
        can: (cap) => cap !== 'crew.read',
        trade: null,
        emptySections: new Set(['/dashboard/crew']),
      };

      // Treatment must be 'hide' because capability security outranks demotion preference
      expect(navTreatment('/dashboard/crew', officeSignals)).toBe('hide');

      const result = resolveVisibleNav(officeSignals);
      expect(result.demoted).not.toContain('/dashboard/crew');
      expect(result.visible).not.toContain('/dashboard/crew');
      expect(result.hiddenCount).toBeGreaterThan(0);
    });

    it('claims for office user is hidden (owner-only) even if trade is lawn-care (which would demote)', () => {
      const officeSignals: NavSignals = {
        role: 'office',
        can: () => true,
        trade: 'lawn-care',
        emptySections: new Set(),
      };
      expect(navTreatment('/dashboard/claims', officeSignals)).toBe('hide');
    });
  });

  describe('Trade-driven promotion and protection', () => {
    it('promotes Claims to top-of-Work for auto-glass, roofing, and restoration', () => {
      const glassSignals: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'auto-glass',
        emptySections: new Set(),
      };

      const result = resolveVisibleNav(glassSignals);
      expect(result.promoted).toContain('/dashboard/claims');
      // Claims is placed right after Leads at top-of-Work
      const leadsIdx = result.visible.indexOf('/dashboard/leads');
      const claimsIdx = result.visible.indexOf('/dashboard/claims');
      expect(claimsIdx).toBe(leadsIdx + 1);
    });

    it('protects Inventory from zero-usage demotion for auto-glass (windshields/sheets are core)', () => {
      const glassSignals: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'auto-glass',
        emptySections: new Set(['/dashboard/inventory']), // even when empty!
      };

      expect(navTreatment('/dashboard/inventory', glassSignals)).toBe('show');
      const result = resolveVisibleNav(glassSignals);
      expect(result.visible).toContain('/dashboard/inventory');
      expect(result.demoted).not.toContain('/dashboard/inventory');
      expect(result.promoted).toContain('/dashboard/inventory');
    });

    it('protects Recurring from zero-usage demotion and demotes Claims for lawn-care', () => {
      const lawnSignals: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'lawn-care',
        emptySections: new Set(['/dashboard/recurring']), // even when empty!
      };

      expect(navTreatment('/dashboard/recurring', lawnSignals)).toBe('show');
      expect(navTreatment('/dashboard/claims', lawnSignals)).toBe('demote');

      const result = resolveVisibleNav(lawnSignals);
      expect(result.visible).toContain('/dashboard/recurring');
      expect(result.demoted).toContain('/dashboard/claims');
      expect(result.promoted).toContain('/dashboard/recurring');
    });
  });

  describe('Owner pinning', () => {
    it('pinned items are never demoted by zero-usage or trade', () => {
      // Lawn care owner pins Claims and Crew (even though Claims is non-trade and Crew is empty)
      const ownerSignals: NavSignals = {
        role: 'owner',
        can: () => true,
        trade: 'lawn-care',
        emptySections: new Set(['/dashboard/crew']),
        pinned: new Set(['/dashboard/claims', '/dashboard/crew']),
      };

      expect(navTreatment('/dashboard/claims', ownerSignals)).toBe('show');
      expect(navTreatment('/dashboard/crew', ownerSignals)).toBe('show');

      const result = resolveVisibleNav(ownerSignals);
      expect(result.visible).toContain('/dashboard/claims');
      expect(result.visible).toContain('/dashboard/crew');
      expect(result.demoted).not.toContain('/dashboard/claims');
      expect(result.demoted).not.toContain('/dashboard/crew');
    });

    it('pinned item is still hidden if office user lacks capability (security outranks pin)', () => {
      const officeSignals: NavSignals = {
        role: 'office',
        can: (cap) => cap !== 'crew.read',
        trade: null,
        emptySections: new Set(),
        pinned: new Set(['/dashboard/crew']),
      };

      expect(navTreatment('/dashboard/crew', officeSignals)).toBe('hide');
    });
  });
});
