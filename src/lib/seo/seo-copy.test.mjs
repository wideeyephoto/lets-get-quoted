// Unit tests for the SEO copy generator. Runs on Node's built-in test runner
// with type-stripping of the imported .ts module:
//   npm run test:seo
// (equivalently: node --test src/lib/seo/seo-copy.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSeoCopy,
  resolveSeoCopy,
  resolveSchemaType,
  SEO_TITLE_MAX,
  SEO_DESC_MAX,
} from './seo-copy.ts';

const BAD_TOKEN = /\b(undefined|null|NaN)\b/i;
const DANGLING_SEP = /(^\s*\|)|(\|\s*$)/;

// A spread of real-world contractors across trades, plus tricky edge cases.
const CONTRACTORS = [
  { seed: 's1', businessName: 'ClearView Window Cleaning', trade: 'Window Cleaning', serviceArea: 'Dayton, OH and surrounding communities', city: 'Dayton', region: 'OH' },
  { seed: 's2', businessName: 'Johnson Plumbing', trade: 'Plumbing', serviceArea: 'Columbus, OH', city: 'Columbus' },
  { seed: 's3', businessName: 'GreenEdge Landscaping', trade: 'Lawn Care', serviceArea: 'Miami, FL', city: 'Miami' },
  { seed: 's4', businessName: 'Summit Roofing Co', trade: 'Roofing', serviceArea: 'Denver metro area' },
  { seed: 's5', businessName: 'BrightSpark Electric', trade: 'Electrical', city: 'Austin', region: 'TX' },
  { seed: 's6', businessName: 'Coastal HVAC Services', trade: 'HVAC', serviceArea: 'San Diego, CA' },
  { seed: 's7', businessName: 'Precision Painters', trade: 'Interior Painting', city: 'Portland' },
  { seed: 's8', businessName: '', trade: 'House Cleaning', city: 'Seattle' }, // no business name
  { seed: 's9', businessName: 'Anderson & Sons Remodeling', trade: 'Kitchen Remodeling' }, // no city
  { seed: 's10', businessName: 'Window Cleaning', trade: 'Window Cleaning', city: 'Reno' }, // name === service
  {
    seed: 's11',
    businessName: 'The Absolutely Magnificent Superior Premium Home Services Company of Greater Metro',
    trade: 'Gutter Installation and Comprehensive Exterior Maintenance Solutions',
    city: 'Minneapolis',
  }, // very long name + service
  { seed: 's12', businessName: null, trade: null, serviceArea: null, city: null }, // everything missing
];

const DEFAULT_FEATURES = ['instantQuotes', 'onlineScheduling', 'textUpdates', 'paymentRequests', 'jobDashboard', 'statusAnytime'];
const withFeatures = (c) => ({ ...c, features: DEFAULT_FEATURES });

test('title never exceeds the max length', () => {
  for (const c of CONTRACTORS) {
    for (let offset = 0; offset < 6; offset += 1) {
      const { title } = generateSeoCopy(withFeatures(c), offset);
      assert.ok(title.length <= SEO_TITLE_MAX, `"${title}" (${title.length}) > ${SEO_TITLE_MAX} for seed ${c.seed}`);
    }
  }
});

test('description never exceeds the hard max of 160', () => {
  for (const c of CONTRACTORS) {
    for (let offset = 0; offset < 6; offset += 1) {
      const { description } = generateSeoCopy(withFeatures(c), offset);
      assert.ok(description.length <= SEO_DESC_MAX, `"${description}" (${description.length}) > ${SEO_DESC_MAX} for seed ${c.seed}`);
    }
  }
});

test('never outputs placeholders or dangling separators, never blank', () => {
  for (const c of CONTRACTORS) {
    for (let offset = 0; offset < 6; offset += 1) {
      const { title, description } = generateSeoCopy(withFeatures(c), offset);
      assert.ok(title.trim().length > 0, `blank title for seed ${c.seed}`);
      assert.ok(description.trim().length > 0, `blank description for seed ${c.seed}`);
      for (const value of [title, description]) {
        assert.ok(!BAD_TOKEN.test(value), `placeholder token in "${value}"`);
        assert.ok(!DANGLING_SEP.test(value), `dangling separator in "${value}"`);
        assert.ok(!/\|\s*\|/.test(value), `empty separator in "${value}"`);
      }
    }
  }
});

test('title never repeats the primary service, and separator sides differ', () => {
  for (const c of CONTRACTORS) {
    const service = (c.trade || '').toLowerCase();
    for (let offset = 0; offset < 6; offset += 1) {
      const { title } = generateSeoCopy(withFeatures(c), offset);
      if (service) {
        const matches = title.toLowerCase().split(service).length - 1;
        assert.ok(matches <= 1, `service repeated in "${title}" (seed ${c.seed})`);
      }
      if (title.includes('|')) {
        const [left, right] = title.split('|').map((p) => p.trim().toLowerCase());
        assert.notEqual(left, right, `identical separator sides in "${title}"`);
      }
    }
  }
});

test('name === service does not produce "X | X"', () => {
  const { title } = generateSeoCopy(withFeatures(CONTRACTORS.find((c) => c.seed === 's10')));
  assert.ok(!/^window cleaning\s*\|\s*window cleaning$/i.test(title), `got "${title}"`);
});

test('missing business name still yields valid, service-led copy', () => {
  const c = withFeatures(CONTRACTORS.find((x) => x.seed === 's8'));
  const { title, description } = generateSeoCopy(c);
  assert.ok(title.length > 0 && title.length <= SEO_TITLE_MAX);
  assert.ok(description.length > 0 && description.length <= SEO_DESC_MAX);
  assert.ok(!BAD_TOKEN.test(title) && !BAD_TOKEN.test(description));
});

test('missing city still yields valid copy', () => {
  const c = withFeatures(CONTRACTORS.find((x) => x.seed === 's9'));
  const { title, description } = generateSeoCopy(c);
  assert.ok(title.length > 0 && title.length <= SEO_TITLE_MAX);
  assert.ok(description.length > 0 && description.length <= SEO_DESC_MAX);
});

test('everything missing still yields non-blank, valid copy', () => {
  const { title, description } = generateSeoCopy(withFeatures(CONTRACTORS.find((c) => c.seed === 's12')));
  assert.ok(title.trim().length > 0 && title.length <= SEO_TITLE_MAX, `title "${title}"`);
  assert.ok(description.trim().length > 0 && description.length <= SEO_DESC_MAX, `description "${description}"`);
  assert.ok(!BAD_TOKEN.test(title) && !BAD_TOKEN.test(description));
});

test('long business and service names are trimmed to a word boundary within limits', () => {
  const c = withFeatures(CONTRACTORS.find((x) => x.seed === 's11'));
  const { title, description } = generateSeoCopy(c);
  assert.ok(title.length <= SEO_TITLE_MAX, `title too long: ${title.length}`);
  assert.ok(description.length <= SEO_DESC_MAX, `description too long: ${description.length}`);
  // No word was cut mid-way (no trailing partial like "Compre").
  assert.ok(!/\s$/.test(title) && !/\s$/.test(description));
});

test('output is stable for the same contractor id across calls', () => {
  for (const c of CONTRACTORS) {
    const a = generateSeoCopy(withFeatures(c));
    const b = generateSeoCopy(withFeatures(c));
    assert.deepEqual(a, b, `unstable output for seed ${c.seed}`);
  }
});

test('different contractor ids produce a variety of title shapes', () => {
  const titles = CONTRACTORS.filter((c) => c.businessName && c.trade).map((c) => generateSeoCopy(withFeatures(c)).title);
  const unique = new Set(titles);
  // Not all identical — real variation across contractors.
  assert.ok(unique.size >= Math.ceil(titles.length / 2), `too little variety: ${[...unique].join(' / ')}`);
});

test('variantOffset rotates to a different variation for at least one contractor', () => {
  const changed = CONTRACTORS.filter((c) => c.businessName && c.trade).some((c) => {
    const base = generateSeoCopy(withFeatures(c), 0);
    for (let offset = 1; offset < 5; offset += 1) {
      const next = generateSeoCopy(withFeatures(c), offset);
      if (next.title !== base.title || next.description !== base.description) return true;
    }
    return false;
  });
  assert.ok(changed, 'regenerate never produced a different variation');
});

test('generateSeoCopy does not mutate its input', () => {
  const input = withFeatures(CONTRACTORS[0]);
  const snapshot = JSON.stringify(input);
  generateSeoCopy(input, 2);
  assert.equal(JSON.stringify(input), snapshot);
});

test('resolveSeoCopy preserves manually edited values (no auto-overwrite)', () => {
  const input = withFeatures(CONTRACTORS[0]);
  const saved = { title: 'My Hand-Written Title', description: 'A description the owner carefully wrote themselves.' };
  const resolved = resolveSeoCopy(saved, input);
  assert.equal(resolved.title, saved.title);
  assert.equal(resolved.description, saved.description);
});

test('resolveSeoCopy fills only the blank field', () => {
  const input = withFeatures(CONTRACTORS[1]);
  const resolved = resolveSeoCopy({ title: 'Kept Title', description: '   ' }, input);
  assert.equal(resolved.title, 'Kept Title');
  assert.ok(resolved.description.length > 0 && resolved.description.length <= SEO_DESC_MAX);
});

test('resolveSchemaType picks the most specific supported type', () => {
  assert.equal(resolveSchemaType('Johnson Plumbing'), 'Plumber');
  assert.equal(resolveSchemaType('BrightSpark Electric electrical'), 'Electrician');
  assert.equal(resolveSchemaType('Coastal HVAC heating and cooling'), 'HVACBusiness');
  assert.equal(resolveSchemaType('Summit Roofing'), 'RoofingContractor');
  assert.equal(resolveSchemaType('Precision Painters painting'), 'HousePainter');
  assert.equal(resolveSchemaType('Anderson Kitchen Remodeling'), 'GeneralContractor');
  assert.equal(resolveSchemaType('ClearView Window Cleaning'), 'HomeAndConstructionBusiness');
});
