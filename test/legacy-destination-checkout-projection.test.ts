import { describe, expect, it } from 'vitest';
import {
  LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG,
  legacyDestinationCheckoutProjectionEnabled,
  legacyDestinationCompareAndSetStandsDown,
  legacyDestinationSettlementOwner,
  type LegacyDestinationRailKind,
} from '@/lib/billing/legacy-destination-checkout-projection';

const RAIL_KINDS: readonly LegacyDestinationRailKind[] = ['allowed', 'blocked', 'not_found'];

describe('legacy destination Checkout projection gate', () => {
  it('recognizes only the exact string 1', () => {
    expect(legacyDestinationCheckoutProjectionEnabled({
      [LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG]: '1',
    })).toBe(true);
    // A settlement authority handover must not be triggerable by a truthy-looking
    // deploy value. Anything but the literal keeps the route in charge.
    for (const value of ['0', '', ' 1', '1 ', '01', '1.0', 'true', 'TRUE', 'yes', 'on', 'enabled']) {
      expect(legacyDestinationCheckoutProjectionEnabled({
        [LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG]: value,
      })).toBe(false);
    }
    expect(legacyDestinationCheckoutProjectionEnabled({})).toBe(false);
    expect(legacyDestinationCheckoutProjectionEnabled({
      [LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG]: undefined,
    })).toBe(false);
  });

  it('is a distinct flag from generation, so neither implies the other', () => {
    expect(LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG)
      .toBe('LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED');
    // Generation being on must never hand settlement over on its own: the
    // classifier projects nothing for a payment with no operation row, so a
    // shared flag would strand in-flight settlement the moment it flipped.
    expect(legacyDestinationCheckoutProjectionEnabled({
      LGQ_LEGACY_DESTINATION_CHECKOUT_GENERATION_ENABLED: '1',
    })).toBe(false);
  });
});

describe('legacy destination settlement ownership', () => {
  it('gives every rail and flag combination exactly one owner', () => {
    const owners = RAIL_KINDS.flatMap((railKind) => [true, false].map((projectionEnabled) => ({
      railKind,
      projectionEnabled,
      owner: legacyDestinationSettlementOwner({ railKind, projectionEnabled }),
    })));
    expect(owners).toHaveLength(6);
    for (const entry of owners) {
      expect(['route_compare_and_set', 'checkout_generation_ledger', 'neither'])
        .toContain(entry.owner);
    }
  });

  it('hands the rail to the ledger only while the flag is on', () => {
    expect(legacyDestinationSettlementOwner({ railKind: 'allowed', projectionEnabled: false }))
      .toBe('route_compare_and_set');
    expect(legacyDestinationSettlementOwner({ railKind: 'allowed', projectionEnabled: true }))
      .toBe('checkout_generation_ledger');
  });

  it('never lets either mechanism claim a payment off this rail', () => {
    // A direct-charge or missing row belongs to the direct projector. Neither
    // authority here may touch it, whatever the flag says.
    for (const railKind of ['blocked', 'not_found'] as const) {
      for (const projectionEnabled of [true, false]) {
        expect(legacyDestinationSettlementOwner({ railKind, projectionEnabled })).toBe('neither');
      }
    }
  });

  it('stands the compare-and-set down in exactly the non-owner cases', () => {
    for (const railKind of RAIL_KINDS) {
      for (const projectionEnabled of [true, false]) {
        const owner = legacyDestinationSettlementOwner({ railKind, projectionEnabled });
        expect(legacyDestinationCompareAndSetStandsDown({ railKind, projectionEnabled }))
          .toBe(owner !== 'route_compare_and_set');
      }
    }
  });

  it('leaves the compare-and-set in charge when the flag is absent', () => {
    // The single case that runs in production right now.
    expect(legacyDestinationCompareAndSetStandsDown({
      railKind: 'allowed',
      projectionEnabled: legacyDestinationCheckoutProjectionEnabled({}),
    })).toBe(false);
  });
});
