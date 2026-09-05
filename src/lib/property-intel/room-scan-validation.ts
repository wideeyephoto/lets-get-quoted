import type { RoomObject3D, RoomOpening, RoomSpatialScan, WallSegment } from './room-spatial-intel';
import { getRoomFloorPolygon, isSimplePolygon } from './room-scan-geometry';

export const MAX_ROOM_SCAN_BYTES = 1024 * 1024;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string, min = 0.01, max = 120000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  }
  return value;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be an array with at most ${max} entries.`);
  return value;
}

/** LGQ normalized geometry, in inches. Native RoomPlan requires a separate adapter. */
export function parseCustomScanJson(raw: string): RoomSpatialScan {
  if (new TextEncoder().encode(raw).length > MAX_ROOM_SCAN_BYTES) throw new Error('Scan JSON must be 1 MB or smaller.');
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error('Invalid JSON format.'); }
  const parsed = record(input, 'Scan');
  if (parsed.isSample === true) throw new Error('Sample models cannot be imported as job measurements.');
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) throw new Error('Unsupported scan schema version.');
  if (parsed.units !== undefined && parsed.units !== 'inches') throw new Error('Normalize all scan coordinates and dimensions to inches before importing.');
  const rawWalls = array(parsed.walls, 'Walls', 128);
  if (rawWalls.length < 3) throw new Error('Room must contain at least 3 walls.');
  const walls: WallSegment[] = rawWalls.map((value, i) => {
    const w = record(value, `Wall ${i + 1}`);
    return {
      id: `w-${i + 1}`, label: text(w.label, `Wall ${i + 1}`),
      lengthInches: number(w.lengthInches, `Wall ${i + 1} lengthInches`),
      heightInches: number(w.heightInches, `Wall ${i + 1} heightInches`),
      isExterior: w.isExterior === true,
    };
  });
  const ceilingHeightInches = parsed.ceilingHeightInches === undefined
    ? Math.max(...walls.map(w => w.heightInches))
    : number(parsed.ceilingHeightInches, 'ceilingHeightInches');
  // This format describes a flat ceiling. Slopes need explicit surface geometry.
  if (walls.some(w => Math.abs(w.heightInches - ceilingHeightInches) > 0.1)) {
    throw new Error('This importer requires a flat ceiling with matching wall heights.');
  }
  const floorPolygon = parsed.floorPolygon === undefined ? undefined
    : array(parsed.floorPolygon, 'floorPolygon', 128).map((value, i) => {
      const p = record(value, `Floor vertex ${i + 1}`);
      return { x: number(p.x, 'Floor x', -120000), z: number(p.z, 'Floor z', -120000) };
    });
  const scan: RoomSpatialScan = {
    id: text(parsed.id, `import-${crypto.randomUUID()}`),
    title: text(parsed.title, 'Imported room'),
    roomType: ['bathroom', 'kitchen', 'bedroom', 'living', 'basement', 'garage'].includes(String(parsed.roomType))
      ? parsed.roomType as RoomSpatialScan['roomType'] : 'living',
    scannedAt: text(parsed.scannedAt, 'Capture time not provided'),
    device: text(parsed.device, 'Source not provided'),
    pointCount: parsed.pointCount === undefined ? 0 : number(parsed.pointCount, 'pointCount', 0, 1e9),
    confidenceScore: parsed.confidenceScore === undefined ? 0 : number(parsed.confidenceScore, 'confidenceScore', 0, 100),
    schemaVersion: 1, units: 'inches', floorPolygon,
    floorShape: parsed.floorShape === 'rectangle' ? 'rectangle' : undefined,
    ceilingHeightInches, walls, openings: [], objects: [], isSample: false,
  };
  const polygon = getRoomFloorPolygon(scan);
  if (polygon.length !== walls.length || !isSimplePolygon(polygon)) throw new Error('Supply a simple, closed floor polygon with one vertex per wall (without repeating the first vertex).');
  polygon.forEach((p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    if (Math.abs(Math.hypot(next.x - p.x, next.z - p.z) - walls[i].lengthInches) > 0.1) {
      throw new Error(`Wall ${i + 1} length does not match its floor polygon edge.`);
    }
  });
  scan.floorPolygon = polygon;
  scan.openings = array(parsed.openings ?? [], 'Openings', 256).map((value, i): RoomOpening => {
    const op = record(value, `Opening ${i + 1}`);
    if (!['door', 'window', 'opening'].includes(String(op.type))) throw new Error('Opening type must be door, window, or opening.');
    const wallIndex = number(op.wallIndex, 'Opening wallIndex', 0, walls.length - 1);
    if (!Number.isInteger(wallIndex)) throw new Error('Opening wallIndex must be an integer.');
    const widthInches = number(op.widthInches, 'Opening widthInches');
    const heightInches = number(op.heightInches, 'Opening heightInches');
    const offsetInches = number(op.offsetInches, 'Opening offsetInches', 0);
    if (offsetInches + widthInches > walls[wallIndex].lengthInches + 0.1 || heightInches > walls[wallIndex].heightInches) {
      throw new Error(`Opening ${i + 1} extends beyond its wall.`);
    }
    return { id: `op-${i + 1}`, type: op.type as RoomOpening['type'], wallIndex, widthInches, heightInches, offsetInches };
  });
  for (let i = 0; i < scan.openings.length; i++) {
    const a = scan.openings[i];
    if (scan.openings.slice(i + 1).some(b => a.wallIndex === b.wallIndex &&
      a.offsetInches < b.offsetInches + b.widthInches && b.offsetInches < a.offsetInches + a.widthInches)) {
      throw new Error('Overlapping openings are not supported; they would double-count deductions.');
    }
  }
  scan.objects = array(parsed.objects ?? [], 'Objects', 256).map((value, i): RoomObject3D => {
    const obj = record(value, `Object ${i + 1}`);
    if (!['bathtub', 'shower', 'vanity', 'toilet', 'cabinet', 'appliance', 'closet'].includes(String(obj.category))) {
      throw new Error('Unsupported object category.');
    }
    const dims = record(obj.dimensionsInches, 'Object dimensionsInches');
    const pos = record(obj.position, 'Object position');
    return {
      id: `obj-${i + 1}`, category: obj.category as RoomObject3D['category'], label: text(obj.label, `Fixture ${i + 1}`),
      dimensionsInches: { width: number(dims.width, 'Object width'), depth: number(dims.depth, 'Object depth'), height: number(dims.height, 'Object height') },
      position: { x: number(pos.x, 'Object x', -120000), y: number(pos.y, 'Object y', 0), z: number(pos.z, 'Object z', -120000) },
    };
  });
  return scan;
}
