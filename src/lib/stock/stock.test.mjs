// Unit tests for the stock-image plan + assignment (pure modules).
//   npm run test:stock   (node --test src/lib/stock/stock.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePlan, planQueries } from './image-plan.ts';
import { assignStockImages } from './assign.ts';

// A mixed candidate pool: landscape + portrait, unique ids.
function makePool(n = 16) {
  const pool = [];
  for (let i = 0; i < n; i += 1) {
    const landscape = i % 3 !== 0; // ~2/3 landscape
    pool.push({
      id: 1000 + i,
      imageUrl: `https://images.pexels.com/photos/${1000 + i}/photo.jpg`,
      thumbnailUrl: `https://images.pexels.com/photos/${1000 + i}/tiny.jpg`,
      width: landscape ? 1920 : 1080,
      height: landscape ? 1080 : 1620,
      orientation: landscape ? 'landscape' : 'portrait',
      alt: `stock photo ${i}`,
      photographerName: `Photographer ${i}`,
      photographerUrl: `https://www.pexels.com/@photographer-${i}`,
      sourceUrl: `https://www.pexels.com/photo/${1000 + i}/`,
    });
  }
  return pool;
}

const WINDOW_SERVICES = ['Exterior Window Cleaning', 'Interior Window Cleaning', 'Screen Cleaning'];

test('buildImagePlan always returns a plan, even with no trade/services', () => {
  const plan = buildImagePlan('', []);
  assert.ok(plan.primaryTrade.length > 0);
  assert.ok(plan.images.length >= 6, 'expected hero + slots + gallery');
  assert.ok(plan.images.every((image) => image.searchQuery.trim().length > 0));
});

test('queries relate to the trade', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  const hero = plan.images.find((image) => image.role === 'hero');
  assert.match(hero.searchQuery, /window cleaning/i);
  assert.equal(plan.primaryTrade, 'Window Cleaning');
});

test('service cards receive service-specific (distinct) queries, not one generic photo', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  const gallery = plan.images.filter((image) => image.role === 'gallery');
  const queries = gallery.map((image) => image.searchQuery);
  assert.equal(new Set(queries).size, queries.length, `gallery queries not distinct: ${queries.join(' | ')}`);
  assert.ok(queries.some((q) => /exterior/i.test(q)) && queries.some((q) => /interior/i.test(q) || /screen/i.test(q)));
});

test('a niche/empty service falls back to the trade completed-work query', () => {
  const plan = buildImagePlan('Roofing', ['Roof Replacement']); // only 1 service -> pad
  const gallery = plan.images.filter((image) => image.role === 'gallery');
  assert.equal(gallery.length, 4);
  assert.ok(gallery.slice(1).some((image) => /roofing/i.test(image.searchQuery)));
});

test('assign populates image roles from a pool', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  const assignments = assignStockImages(makePool(), plan, 'site-abc', '2026-01-01');
  assert.ok(assignments.length >= 5, 'expected several roles populated');
  assert.ok(assignments.some((a) => a.role === 'hero'));
  assert.ok(assignments.filter((a) => a.role === 'gallery').length >= 2);
});

test('no photo id is assigned to two visible roles', () => {
  const plan = buildImagePlan('Plumbing', ['Drain Cleaning', 'Water Heaters', 'Leak Repair']);
  const assignments = assignStockImages(makePool(20), plan, 'site-xyz', '2026-01-01');
  const ids = assignments.map((a) => a.providerImageId);
  assert.equal(new Set(ids).size, ids.length, `duplicate photo across roles: ${ids.join(',')}`);
});

test('selection is stable for the same seed across calls (survives refresh)', () => {
  const plan = buildImagePlan('HVAC', ['AC Repair', 'Furnace Install']);
  const a = assignStockImages(makePool(), plan, 'stable-seed', 'FIXED');
  const b = assignStockImages(makePool(), plan, 'stable-seed', 'FIXED');
  assert.deepEqual(a, b);
});

test('different website ids get different selections', () => {
  const plan = buildImagePlan('Landscaping', ['Lawn Care', 'Tree Trimming', 'Mulching']);
  const a = assignStockImages(makePool(), plan, 'site-1', 'FIXED');
  const b = assignStockImages(makePool(), plan, 'site-2', 'FIXED');
  const aHero = a.find((x) => x.role === 'hero')?.providerImageId;
  const bHero = b.find((x) => x.role === 'hero')?.providerImageId;
  // With a decent pool the two seeds should differ somewhere.
  const same = JSON.stringify(a.map((x) => x.providerImageId)) === JSON.stringify(b.map((x) => x.providerImageId));
  assert.ok(!same || aHero !== bHero, 'two different site ids produced identical selections');
});

test('hero image is landscape-oriented when landscape candidates exist', () => {
  const plan = buildImagePlan('Roofing', ['Roof Replacement', 'Repairs']);
  for (const seed of ['s1', 's2', 's3', 's4']) {
    const assignments = assignStockImages(makePool(), plan, seed, 'FIXED');
    const hero = assignments.find((a) => a.role === 'hero');
    assert.ok(hero, `no hero for ${seed}`);
    assert.ok(hero.width >= hero.height, `hero not landscape for ${seed}: ${hero.width}x${hero.height}`);
  }
});

test('empty pool (Pexels failure) yields no assignments and does not throw', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  const assignments = assignStockImages([], plan, 'site-abc', 'FIXED');
  assert.deepEqual(assignments, []);
});

test('attribution metadata is retained for every assignment', () => {
  const plan = buildImagePlan('Painting', ['Interior Painting', 'Exterior Painting']);
  const assignments = assignStockImages(makePool(), plan, 'site-paint', 'FIXED');
  for (const a of assignments) {
    assert.equal(a.provider, 'pexels');
    assert.ok(a.providerImageId, 'missing providerImageId');
    assert.ok(a.sourceUrl && /pexels\.com/.test(a.sourceUrl), 'missing/invalid sourceUrl');
    assert.ok(a.photographerName, 'missing photographerName');
    assert.ok(a.photographerUrl, 'missing photographerUrl');
    assert.equal(a.selectedAutomatically, true);
    assert.equal(a.selectedAt, 'FIXED');
  }
});

test('planQueries dedupes so we do not hit the API once per near-identical query', () => {
  const plan = buildImagePlan('Cleaning', ['House Cleaning', 'House Cleaning']); // dup service
  const queries = planQueries(plan);
  assert.equal(new Set(queries.map((q) => q.toLowerCase())).size, queries.length);
});

test('decorative background/stats roles carry empty alt text', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  for (const role of ['heroBackground', 'stats']) {
    const img = plan.images.find((image) => image.role === role);
    assert.equal(img.alt, '', `${role} should be decorative (empty alt)`);
  }
});

test('alt text is natural and not keyword-stuffed', () => {
  const plan = buildImagePlan('Window Cleaning', WINDOW_SERVICES);
  const hero = plan.images.find((image) => image.role === 'hero');
  assert.ok(hero.alt.length > 0 && hero.alt.length < 90);
  assert.ok(!/\b(near me|best|instant quote|company)\b/i.test(hero.alt));
});
