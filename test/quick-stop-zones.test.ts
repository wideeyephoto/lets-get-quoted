import { describe, it, expect } from 'vitest';
import { detourAllowance, detourVerdict, zoneContains, type PriorityZone } from '../src/lib/quick-stop-zones';

// Royal Oak, MI — the demo's patch.
const CENTER = { lat: 42.4895, lng: -83.1446 };
// ~3 miles north.
const NEAR = { lat: 42.5330, lng: -83.1446 };
// ~20 miles away.
const FAR = { lat: 42.7800, lng: -83.1446 };

const zone = (over: Partial<PriorityZone> = {}): PriorityZone => ({
  id: 'z1',
  label: 'Birmingham',
  centerLat: CENTER.lat,
  centerLng: CENTER.lng,
  radiusMiles: 5,
  maxDetourMiles: 20,
  ...over,
});

describe('zoneContains', () => {
  it('includes a point inside the radius and excludes one outside', () => {
    expect(zoneContains(zone(), NEAR)).toBe(true);
    expect(zoneContains(zone(), FAR)).toBe(false);
  });

  it('is false for a zone with no usable geometry', () => {
    expect(zoneContains(zone({ radiusMiles: 0 }), CENTER)).toBe(false);
    expect(zoneContains(zone({ centerLat: Number.NaN }), CENTER)).toBe(false);
  });

  it('measures radiusMiles from the middle — it is a RADIUS, not a width', () => {
    // Pinned because the form used to call this field "miles across", which is
    // a diameter, while every consumer treats it as a radius. An owner reading
    // the label and typing 4 got an area eight miles wide. The label was the
    // thing that was wrong, so this states the meaning the code actually has
    // and would fail if anyone ever "fixed" it the other way round.
    //
    // NEAR is ~3 miles from CENTER, so a 4-mile zone contains it on the radius
    // reading and would NOT on the diameter reading (which allows only 2).
    expect(zoneContains(zone({ radiusMiles: 4 }), NEAR)).toBe(true);
    expect(zoneContains(zone({ radiusMiles: 2 }), NEAR)).toBe(false);
  });
});

describe('detourAllowance', () => {
  it('is the account limit with no zones', () => {
    expect(detourAllowance(NEAR, [], 6)).toEqual({ maxDetourMiles: 6, zone: null });
  });

  it('is the account limit outside every zone', () => {
    expect(detourAllowance(FAR, [zone()], 6).maxDetourMiles).toBe(6);
    expect(detourAllowance(FAR, [zone()], 6).zone).toBeNull();
  });

  it('widens inside a zone, and names the zone that did it', () => {
    const result = detourAllowance(NEAR, [zone()], 6);
    expect(result.maxDetourMiles).toBe(20);
    expect(result.zone?.label).toBe('Birmingham');
  });

  it('takes the MOST generous of overlapping zones', () => {
    // Two zones on the same ground means that ground matters twice over. Taking
    // the smaller would let adding a zone REDUCE what was already allowed.
    const zones = [zone({ id: 'a', maxDetourMiles: 12 }), zone({ id: 'b', label: 'Bloomfield', maxDetourMiles: 25 })];
    expect(detourAllowance(NEAR, zones, 6).maxDetourMiles).toBe(25);
    expect(detourAllowance(NEAR, zones, 6).zone?.label).toBe('Bloomfield');
  });

  it('never LOWERS the account limit', () => {
    // A zone's job is to widen. A stingier one is silently ignored rather than
    // quietly shrinking coverage from a control called "priority".
    const result = detourAllowance(NEAR, [zone({ maxDetourMiles: 2 })], 6);
    expect(result.maxDetourMiles).toBe(6);
    expect(result.zone).toBeNull();
  });

  it('falls back to the account limit when the point is unknown', () => {
    expect(detourAllowance(null, [zone()], 6).maxDetourMiles).toBe(6);
  });

  it('treats a missing or nonsense account limit as zero, not as infinite', () => {
    expect(detourAllowance(NEAR, [], 0).maxDetourMiles).toBe(0);
    expect(detourAllowance(NEAR, [], Number.NaN).maxDetourMiles).toBe(0);
  });
});

describe('detourVerdict', () => {
  it('says nothing when there is nothing to judge', () => {
    // "Unknown" and "outside" are different answers; a card must not show one
    // as the other.
    expect(detourVerdict(null, NEAR, [zone()], 6)).toBeNull();
    expect(detourVerdict(4, NEAR, [], 0)).toBeNull();
  });

  it('judges against the account limit outside a zone', () => {
    expect(detourVerdict(4, FAR, [zone()], 6)).toMatchObject({ within: true, limitMiles: 6, zone: null });
    expect(detourVerdict(9, FAR, [zone()], 6)).toMatchObject({ within: false, limitMiles: 6 });
  });

  it('a detour that would be too far becomes acceptable inside a zone', () => {
    // The whole point of the feature.
    expect(detourVerdict(14, FAR, [zone()], 6)?.within).toBe(false);
    const inside = detourVerdict(14, NEAR, [zone()], 6);
    expect(inside?.within).toBe(true);
    expect(inside?.limitMiles).toBe(20);
    expect(inside?.zone?.label).toBe('Birmingham');
  });

  it('is inclusive at exactly the limit', () => {
    expect(detourVerdict(6, FAR, [], 6)?.within).toBe(true);
  });
});
