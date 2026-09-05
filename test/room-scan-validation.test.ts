import { describe, expect, it } from 'vitest';
import { measuredRoom } from './fixtures/room-scan';
import { parseCustomScanJson, MAX_ROOM_SCAN_BYTES } from '@/lib/property-intel/room-scan-validation';
import { calculateRoomSummary } from '@/lib/property-intel/room-spatial-intel';
import { pointDistance, polygonArea } from '@/lib/property-intel/room-scan-geometry';

const parse = (value: unknown) => parseCustomScanJson(JSON.stringify(value));

describe('room geometry import boundary', () => {
  it('preserves measured dimensions without inventing confidence or point counts', () => {
    const scan = parse(measuredRoom);
    expect(scan.isSample).toBe(false);
    expect(scan.confidenceScore).toBe(0);
    expect(scan.pointCount).toBe(0);
    expect(scan.scannedAt).toBe('Capture time not provided');
    expect(calculateRoomSummary(scan)).toMatchObject({ floorAreaSqFt: 120, baseboardLinearFt: 41, perimeterLinearFt: 44, openingsAreaSqFt: 20, netPaintableWallSqFt: 332 });
    expect(parse(scan)).toEqual(scan);
  });

  it.each([
    ['sample', { ...measuredRoom, isSample: true }],
    ['units', { ...measuredRoom, units: 'meters' }],
    ['version', { ...measuredRoom, schemaVersion: 2 }],
    ['missing polygon', { ...measuredRoom, floorShape: undefined }],
    ['missing dimension', { ...measuredRoom, walls: [{ heightInches: 96 }, ...measuredRoom.walls.slice(1)] }],
    ['one wall', { ...measuredRoom, walls: measuredRoom.walls.slice(0, 1) }],
    ['null wall', { ...measuredRoom, walls: [null, ...measuredRoom.walls.slice(1)] }],
    ['negative dimension', { ...measuredRoom, ceilingHeightInches: -10 }],
    ['numeric string', { ...measuredRoom, ceilingHeightInches: '96' }],
    ['confidence range', { ...measuredRoom, confidenceScore: 101 }],
    ['invalid wall reference', { ...measuredRoom, openings: [{ ...measuredRoom.openings[0], wallIndex: 4 }] }],
    ['fractional wall reference', { ...measuredRoom, openings: [{ ...measuredRoom.openings[0], wallIndex: 0.5 }] }],
    ['opening beyond wall', { ...measuredRoom, openings: [{ ...measuredRoom.openings[0], offsetInches: 115 }] }],
    ['duplicate opening', { ...measuredRoom, openings: [measuredRoom.openings[0], measuredRoom.openings[0]] }],
    ['invented fixture', { ...measuredRoom, objects: [{}] }],
    ['inconsistent rectangle', { ...measuredRoom, walls: [120, 144, 121, 144].map(lengthInches => ({ lengthInches, heightInches: 96 })) }],
  ])('rejects %s', (_, input) => { expect(() => parse(input)).toThrow(); });

  it('rejects non-finite numbers, invalid JSON, arrays and oversized input', () => {
    expect(() => parseCustomScanJson(JSON.stringify(measuredRoom).replace('96', '1e999'))).toThrow();
    expect(() => parseCustomScanJson('{')).toThrow();
    expect(() => parse([])).toThrow();
    expect(() => parseCustomScanJson(' '.repeat(MAX_ROOM_SCAN_BYTES + 1))).toThrow(/1 MB/);
  });

  it('calculates a concave L-shaped floor from vertices instead of its bounding rectangle', () => {
    const floorPolygon = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 120 }, { x: 120, z: 120 }, { x: 120, z: 240 }, { x: 0, z: 240 }];
    const walls = floorPolygon.map((p, i) => ({ lengthInches: Math.hypot(p.x - floorPolygon[(i + 1) % 6].x, p.z - floorPolygon[(i + 1) % 6].z), heightInches: 96 }));
    const scan = parse({ ...measuredRoom, floorShape: undefined, floorPolygon, walls, openings: [] });
    expect(calculateRoomSummary(scan).floorAreaSqFt).toBe(300);
    expect(polygonArea([...floorPolygon].reverse())).toBe(43200);
    expect(polygonArea(floorPolygon.map(p => ({ x: p.x + 100000, z: p.z - 100000 })))).toBe(43200);
  });

  it('rejects self-crossing and repeated floor vertices', () => {
    expect(() => parse({ ...measuredRoom, floorPolygon: [{ x: 0, z: 0 }, { x: 120, z: 144 }, { x: 120, z: 0 }, { x: 0, z: 144 }] })).toThrow();
    expect(() => parse({ ...measuredRoom, floorPolygon: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 120, z: 144 }, { x: 0, z: 144 }] })).toThrow();
  });

  it('measures in world inches, including height, without viewport or zoom inputs', () => {
    expect(pointDistance({ x: 0, y: 0, z: 0 }, { x: 36, y: 0, z: 48 })).toBe(60);
    expect(pointDistance({ x: 100, y: 0, z: -100 }, { x: 100, y: 96, z: -100 })).toBe(96);
  });
});
