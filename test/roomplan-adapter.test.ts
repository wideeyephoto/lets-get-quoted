import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';
import { calculateRoomSummary } from '@/lib/property-intel/room-spatial-intel';
import { getObjectFootprint, pointDistance } from '@/lib/property-intel/room-scan-geometry';
import { nativeRoom, nativeSurface, nativeMatrix } from './fixtures/roomplan/native-room';

const parse = (value: unknown) => parseCustomScanJson(JSON.stringify(value));
const reference = () => JSON.parse(readFileSync(new URL('./fixtures/roomplan/captured-room-v2.json', import.meta.url), 'utf8'));

describe('native Apple CapturedRoom import', () => {
  it('converts meters and unordered wall transforms into known takeoffs', () => {
    const scan = parse(nativeRoom());
    expect(scan.sourceFormat).toBe('apple-roomplan');
    expect(scan.sourceVersion).toBe(2);
    expect(scan.walls.map(w => w.id)).toEqual(['south', 'east', 'north', 'west']);
    expect(scan.ceilingHeightInches).toBeCloseTo(96);
    expect(scan.floorPolygon![2].x).toBeCloseTo(120);
    expect(scan.floorPolygon![2].z).toBeCloseTo(144);
    expect(scan.openings[0]).toMatchObject({ id: 'door', wallIndex: 0, sourceConfidence: 'medium' });
    expect(scan.openings[0].offsetInches).toBeCloseTo(12);
    expect(scan.openings[0].sillHeightInches).toBeCloseTo(0);
    expect(scan.confidenceScore).toBe(0);
    expect(scan.pointCount).toBe(0);
    expect(calculateRoomSummary(scan)).toMatchObject({ floorAreaSqFt: 120, baseboardLinearFt: 41, netPaintableWallSqFt: 332 });
    expect(parse(scan)).toEqual(scan);
  });

  it('preserves rotated/translated world geometry without applying referenceOriginTransform twice', () => {
    const room = nativeRoom();
    const angle = 0.73, c = Math.cos(angle), s = Math.sin(angle);
    for (const surface of [...room.walls, ...room.doors]) {
      const m = surface.transform;
      for (const i of [0, 4, 8, 12]) {
        const x = m[i], z = m[i + 2];
        m[i] = x * c - z * s; m[i + 2] = x * s + z * c;
      }
      m[12] += 20; m[14] -= 10; m[13] += 4;
    }
    room.referenceOriginTransform = nativeMatrix(0, 123, 234, -345);
    const scan = parse(room);
    expect(scan.floorPolygon![0].x).toBeCloseTo(20 / 0.0254);
    expect(scan.floorPolygon![0].z).toBeCloseTo(-10 / 0.0254);
    expect(calculateRoomSummary(scan).floorAreaSqFt).toBe(120);
    expect(scan.openings[0].offsetInches).toBeCloseTo(12);
    expect(scan.openings[0].sillHeightInches).toBeCloseTo(0);
  });

  it('finds openings geometrically when older exports omit parent identifiers', () => {
    const room = nativeRoom();
    room.version = 1;
    delete room.doors[0].parentIdentifier;
    expect(parse(room).openings[0].wallIndex).toBe(0);
  });

  it('supports reversed wall directions and a concave room without assuming a rectangle', () => {
    const vertices = [[0, 0], [6.096, 0], [6.096, 3.048], [3.048, 3.048], [3.048, 6.096], [0, 6.096]];
    const room = nativeRoom();
    room.doors = [];
    room.walls = vertices.map((a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      return nativeSurface(`wall-${i}`, 'wall', Math.hypot(b[0] - a[0], b[1] - a[1]), 2.4384,
        Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI, (a[0] + b[0]) / 2, 0.2192, (a[1] + b[1]) / 2);
    }).reverse();
    expect(calculateRoomSummary(parse(room)).floorAreaSqFt).toBe(300);
  });

  it('keeps sill elevations, permits vertically separate openings, and only deducts floor-level passages from trim', () => {
    const room = nativeRoom();
    room.windows = [nativeSurface('transom', 'window', 0.9144, 0.254, 0, 0.762, 1.2352, 0, 'south')];
    let scan = parse(room);
    expect(scan.openings[1].sillHeightInches).toBeCloseTo(83);
    expect(calculateRoomSummary(scan)).toMatchObject({ openingsAreaSqFt: 22.5, baseboardLinearFt: 41 });
    room.doors = [];
    room.openings = [nativeSurface('pass-through', 'opening', 0.9144, 0.508, 0, 0.762, 0.27, 0, 'south')];
    room.windows = [];
    scan = parse(room);
    expect(calculateRoomSummary(scan).baseboardLinearFt).toBe(44);
  });

  it('preserves native object centers, height/depth axes, yaw, categories and confidence', () => {
    const room = nativeRoom();
    room.objects = [{ identifier: 'sofa', category: { sofa: {} }, confidence: { low: {} }, dimensions: [1.524, 0.762, 0.508],
      transform: nativeMatrix(Math.PI / 2, 1, -0.619, 2) }];
    const object = parse(room).objects[0];
    expect(object).toMatchObject({ id: 'sofa', category: 'furniture', sourceCategory: 'sofa', sourceConfidence: 'low' });
    expect(object.dimensionsInches.width).toBeCloseTo(60);
    expect(object.dimensionsInches.height).toBeCloseTo(30);
    expect(object.dimensionsInches.depth).toBeCloseTo(20);
    expect(object.position.y).toBeCloseTo(0);
    const footprint = getObjectFootprint(object);
    expect(pointDistance(footprint[0], footprint[1])).toBeCloseTo(60);
    expect(footprint[0].x).toBeCloseTo(1 / 0.0254 + 10);
    expect(footprint[0].z).toBeCloseTo(2 / 0.0254 - 30);
  });

  it('imports the public CapturedRoom v2 geometry fixture including local-plane floor corners', () => {
    const raw = reference();
    const scan = parse(raw);
    expect(scan.walls).toHaveLength(4);
    expect(scan.openings).toHaveLength(4);
    expect(scan.objects).toHaveLength(5);
    expect(new Set(scan.walls.map(w => w.id))).toEqual(new Set(raw.walls.map((w: { identifier: string }) => w.identifier)));
    const expectedArea = Math.round(4.6183414 * 3.3277373 / 0.09290304 * 10) / 10;
    expect(calculateRoomSummary(scan).floorAreaSqFt).toBe(expectedArea);
    const window = scan.openings.find(o => o.id === raw.windows[0].identifier)!;
    expect(window.sillHeightInches).toBeCloseTo(1.123936185 / 0.0254, 3);
    expect(scan.objects[0].rotationYRadians).not.toBe(0);
    expect(parse(scan)).toEqual(scan);
  });

  it.each([
    ['unsupported version', (r: ReturnType<typeof nativeRoom>) => { r.version = 3; }, /version/],
    ['wrong units', (r) => Object.assign(r, { units: 'inches' }), /meters/],
    ['sample marker', (r) => Object.assign(r, { isSample: true }), /Sample/],
    ['multi-room wrapper', (r) => Object.assign(r, { rooms: [] }), /one CapturedRoom/],
    ['missing dimensions', (r) => { r.walls[0].dimensions = []; }, /dimensions/],
    ['numeric strings', (r) => { r.walls[0].transform[12] = '2' as unknown as number; }, /finite/],
    ['scaled transform', (r) => { r.walls[0].transform[0] = 2; }, /rigid/],
    ['mirrored transform', (r) => { r.walls[0].transform[0] = -1; }, /rigid/],
    ['nonhomogeneous transform', (r) => { r.walls[0].transform[15] = 0; }, /rigid/],
    ['tilted wall', (r) => { const m = r.walls[0].transform; m[5] = 0; m[6] = 1; m[9] = -1; m[10] = 0; }, /Tilted/],
    ['curved wall', (r) => Object.assign(r.walls[0], { curve: {} }), /Curved/],
    ['nonrectangular wall', (r) => Object.assign(r.walls[0], { polygonCorners: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }), /Nonrectangular/],
    ['duplicate IDs', (r) => { r.walls[0].identifier = r.walls[1].identifier; }, /unique/],
    ['unclosed wall gap', (r) => { r.walls[0].dimensions[0] -= 0.1; }, /closed room/],
    ['internal partition', (r) => { r.walls.push(nativeSurface('internal', 'wall', 1, 2.4384, 0, 1.5, 0.2192, 2)); }, /closed room/],
    ['inconsistent ceiling', (r) => { r.walls[0].dimensions[1] -= 0.1; }, /flat ceiling/],
    ['different stories', (r) => Object.assign(r.walls[0], { story: 1 }), /one floor/],
    ['unknown parent', (r) => { r.doors[0].parentIdentifier = 'absent'; }, /matched/],
    ['wrong plane', (r) => { r.doors[0].transform[14] += 0.1; }, /matched/],
    ['opening rotated off its wall', (r) => { r.doors[0].transform = nativeMatrix(0.01, 0.762, 0.016, 0); }, /matched/],
    ['opening beyond wall', (r) => { r.doors[0].transform[12] = -1; }, /matched/],
    ['opening too high', (r) => { r.doors[0].transform[13] = 2; }, /above or below/],
    ['overlapping openings', (r) => { r.doors.push({ ...r.doors[0], identifier: 'duplicate-door' }); }, /Overlapping/],
    ['invalid confidence', (r) => { r.doors[0].confidence = { precise: {} }; }, /confidence/],
  ])('rejects %s rather than fabricating geometry', (_, change, error) => {
    const room = nativeRoom();
    change(room);
    expect(() => parse(room)).toThrow(error);
  });

  it('rejects disjoint closed rooms instead of reporting only the first loop', () => {
    const room = nativeRoom();
    room.walls.push(...nativeRoom().walls.map(w => ({ ...w, identifier: `other-${w.identifier}`, transform: w.transform.map((v, i) => i === 12 ? v + 10 : v) })));
    expect(() => parse(room)).toThrow(/multiple or disconnected/);
  });

  it('rejects conflicting floor geometry and objects below the floor', () => {
    const raw = reference();
    raw.floors[0].transform[12] += 0.1;
    expect(() => parse(raw)).toThrow(/floor polygon/);
    const room = nativeRoom();
    room.objects = [{ identifier: 'chair', category: { chair: {} }, dimensions: [1, 1, 1], transform: nativeMatrix(0, 1, -2, 1) }];
    expect(() => parse(room)).toThrow(/below/);
  });
});
