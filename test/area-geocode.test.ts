import { describe, it, expect } from 'vitest';
import { areaLabelFor, areaRadiusMiles } from '@/lib/geocode';

// Priority areas are added by typing a city or ZIP, which means two pure pieces
// decide what gets saved: what the area is CALLED, and how big it is. Both are
// read straight back off the owner's own settings later, so both are tested.

describe('areaRadiusMiles', () => {
  // Birmingham, MI — roughly the real bounding box Google returns for it.
  const ne = { lat: 42.5722, lng: -83.1795 };
  const sw = { lat: 42.5222, lng: -83.2455 };

  it('sizes a town from its own bounding box', () => {
    const radius = areaRadiusMiles(ne, sw);
    expect(radius).not.toBeNull();
    // ~3.45mi tall by ~3.35mi wide → equal-area radius just under 2 miles.
    expect(radius!).toBeGreaterThan(1.5);
    expect(radius!).toBeLessThan(2.5);
  });

  it('lands between the inscribed and circumscribed circles', () => {
    // The whole point of equal area: generous enough to keep the corners of the
    // place, tight enough not to spill into the next town. Anything outside
    // these two bounds is one of the readings this deliberately is not.
    const radius = areaRadiusMiles(ne, sw)!;
    const inscribed = 1.6; // ~half the shorter side
    const circumscribed = 2.4; // ~half the diagonal
    expect(radius).toBeGreaterThan(inscribed);
    expect(radius).toBeLessThan(circumscribed);
  });

  it('refuses a degenerate box rather than saving an area that matches nothing', () => {
    expect(areaRadiusMiles({ lat: 42.5, lng: -83.2 }, { lat: 42.5, lng: -83.2 })).toBeNull();
  });
});

describe('areaLabelFor', () => {
  it('names a city the way somebody would say it', () => {
    expect(
      areaLabelFor({
        formatted_address: 'Birmingham, MI, USA',
        address_components: [
          { long_name: 'Birmingham', short_name: 'Birmingham', types: ['locality', 'political'] },
          { long_name: 'Michigan', short_name: 'MI', types: ['administrative_area_level_1', 'political'] },
          { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        ],
      }),
    ).toBe('Birmingham, MI');
  });

  it('keeps a ZIP AND the town it covers', () => {
    // A contractor who typed 48009 still wants to recognise the row a month
    // later, and five digits on their own are not a place anybody pictures.
    expect(
      areaLabelFor({
        formatted_address: 'Birmingham, MI 48009, USA',
        address_components: [
          { long_name: '48009', short_name: '48009', types: ['postal_code'] },
          { long_name: 'Birmingham', short_name: 'Birmingham', types: ['locality', 'political'] },
          { long_name: 'Michigan', short_name: 'MI', types: ['administrative_area_level_1', 'political'] },
        ],
      }),
    ).toBe('48009 · Birmingham, MI');
  });

  it('falls back to the formatted address without the country tacked on', () => {
    expect(
      areaLabelFor({ formatted_address: 'Somewhere Unusual, USA', address_components: [] }),
    ).toBe('Somewhere Unusual');
  });

  it('never returns an empty name, because the row has to say something', () => {
    expect(areaLabelFor({})).toBe('Unnamed area');
  });
});
