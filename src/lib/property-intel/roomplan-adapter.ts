import { isSimplePolygon, polygonArea, type FloorPoint } from './room-scan-geometry';

// CapturedRoom uses meters and column-major simd_float4x4 transforms.
// This joins floating-point copies of the same corner, not gaps in a scan.
const METERS_TO_INCHES = 1 / 0.0254;
const JOIN_TOLERANCE_METERS = 0.001;
const MATRIX_TOLERANCE = 0.0001;
type RecordValue = Record<string, unknown>;
type Confidence = 'low' | 'medium' | 'high';
type Surface = {
  id: string;
  width: number;
  height: number;
  matrix: number[];
  start: FloorPoint;
  end: FloorPoint;
  bottom: number;
  confidence?: Confidence;
  parent?: string;
};

function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`RoomPlan ${label} must be an object.`);
  return value as RecordValue;
}

function list(value: unknown, label: string, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`RoomPlan ${label} must contain at most ${limit} entries.`);
  return value;
}

function vector(value: unknown, size: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== size || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 3048)) {
    throw new Error(`RoomPlan ${label} must contain ${size} finite numbers.`);
  }
  return value as number[];
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('RoomPlan element identifier is missing or invalid.');
  return value;
}

function enumName(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0 && value.length <= 100) return value;
  const keys = Object.keys(object(value, label));
  if (keys.length !== 1) throw new Error(`RoomPlan ${label} must identify one value.`);
  return keys[0];
}

function confidence(value: unknown): Confidence | undefined {
  if (value === undefined) return undefined;
  const label = enumName(value, 'confidence');
  if (label !== 'low' && label !== 'medium' && label !== 'high') throw new Error('Unsupported RoomPlan confidence label.');
  return label;
}

function transform(value: unknown, upright: boolean): number[] {
  const m = vector(value, 16, 'transform (column-major 4x4 matrix)');
  const dot = (a: number, b: number) => m[a] * m[b] + m[a + 1] * m[b + 1] + m[a + 2] * m[b + 2];
  const determinant = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  if ([m[3], m[7], m[11], m[15] - 1, dot(0, 0) - 1, dot(4, 4) - 1, dot(8, 8) - 1,
    dot(0, 4), dot(0, 8), dot(4, 8), determinant - 1].some(v => Math.abs(v) > MATRIX_TOLERANCE)) {
    throw new Error('RoomPlan transform must be a rigid rotation and translation; scaled or mirrored geometry is not supported.');
  }
  if (upright && [m[1], m[4], m[5] - 1, m[6], m[9]].some(v => Math.abs(v) > MATRIX_TOLERANCE)) {
    throw new Error('Tilted RoomPlan walls or objects are not supported. Export an upright room with a flat ceiling.');
  }
  return m;
}

function distance(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function rectangularSurface(raw: RecordValue, kind: string): Surface {
  if (enumName(raw.category, 'surface category') !== kind) throw new Error(`Expected a RoomPlan ${kind} surface.`);
  if (raw.curve != null) throw new Error('Curved RoomPlan surfaces are not supported for takeoffs.');
  const [width, height, depth] = vector(raw.dimensions, 3, 'surface dimensions');
  if (width <= 0 || height <= 0 || Math.abs(depth) > JOIN_TOLERANCE_METERS) throw new Error('RoomPlan surfaces must have positive width/height and zero plane depth.');
  const matrix = transform(raw.transform, true);
  const corners = list(raw.polygonCorners ?? [], 'surface polygonCorners', 128);
  if (corners.length) {
    // A bounding box cannot stand in for a sloped/polygonal wall's actual area.
    const quadrants = new Set<string>();
    if (corners.length !== 4) throw new Error('Nonrectangular RoomPlan walls or openings are not supported.');
    for (const value of corners) {
      const [x, y, z] = vector(value, 3, 'surface polygon corner');
      if (Math.abs(Math.abs(x) - width / 2) > JOIN_TOLERANCE_METERS || Math.abs(Math.abs(y) - height / 2) > JOIN_TOLERANCE_METERS || Math.abs(z) > JOIN_TOLERANCE_METERS) {
        throw new Error('Nonrectangular RoomPlan walls or openings are not supported.');
      }
      quadrants.add(`${Math.sign(x)},${Math.sign(y)}`);
    }
    const outline = corners.map(value => { const [x, y] = value as number[]; return { x: x * METERS_TO_INCHES, z: y * METERS_TO_INCHES }; });
    if (quadrants.size !== 4 || !isSimplePolygon(outline)) throw new Error('RoomPlan surface corners are duplicated or self-intersecting.');
  }
  return {
    id: identifier(raw.identifier), width, height, matrix,
    start: { x: matrix[12] - matrix[0] * width / 2, z: matrix[14] - matrix[2] * width / 2 },
    end: { x: matrix[12] + matrix[0] * width / 2, z: matrix[14] + matrix[2] * width / 2 },
    bottom: matrix[13] - height / 2, confidence: confidence(raw.confidence),
    parent: raw.parentIdentifier == null ? undefined : identifier(raw.parentIdentifier),
  };
}

/** Order an unambiguous, single closed loop without assuming a rectangle. */
function perimeter(walls: Surface[]): { vertices: FloorPoint[]; ordered: Surface[] } {
  const endpoints = walls.flatMap(w => [w.start, w.end]);
  const partner = endpoints.map((p, i) => {
    const matches = endpoints.flatMap((q, j) => Math.floor(i / 2) !== Math.floor(j / 2) && distance(p, q) <= JOIN_TOLERANCE_METERS ? [j] : []);
    if (matches.length !== 1) throw new Error('RoomPlan walls do not form one unambiguous closed room. Export a complete single-room scan without gaps or internal partitions.');
    return matches[0];
  });
  const vertices: FloorPoint[] = [];
  const ordered: Surface[] = [];
  const visited = new Set<number>();
  let endpoint = 0;
  while (!visited.has(Math.floor(endpoint / 2))) {
    const index = Math.floor(endpoint / 2);
    visited.add(index);
    const p = endpoints[endpoint], q = endpoints[partner[endpoint]];
    vertices.push({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    ordered.push(walls[index]);
    endpoint = partner[endpoint ^ 1];
  }
  if (endpoint !== 0 || visited.size !== walls.length) throw new Error('RoomPlan contains multiple or disconnected room boundaries. Import one room at a time.');
  if (!isSimplePolygon(vertices.map(p => ({ x: p.x * METERS_TO_INCHES, z: p.z * METERS_TO_INCHES })))) {
    throw new Error('RoomPlan room boundary intersects itself or has no usable floor area.');
  }
  return { vertices, ordered };
}

function openingLocation(surface: Surface, vertices: FloorPoint[], index: number) {
  const a = vertices[index], b = vertices[(index + 1) % vertices.length];
  const length = distance(a, b), ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
  const dx = surface.matrix[12] - a.x, dz = surface.matrix[14] - a.z;
  return {
    offset: dx * ux + dz * uz - surface.width / 2,
    aligned: Math.abs(ux * surface.matrix[0] + uz * surface.matrix[2]) > 1 - MATRIX_TOLERANCE,
    onPlane: [surface.start, surface.end].every(p => Math.abs((p.x - a.x) * uz - (p.z - a.z) * ux) <= JOIN_TOLERANCE_METERS),
    length,
  };
}

function checkFloor(raw: RecordValue, vertices: FloorPoint[], floorY: number) {
  if (enumName(raw.category, 'floor category') !== 'floor' || raw.curve != null) throw new Error('Unsupported RoomPlan floor surface.');
  const m = transform(raw.transform, false);
  const corners = list(raw.polygonCorners ?? [], 'floor polygonCorners', 128);
  if (!corners.length) return; // Older CapturedRoom exports derive the floor from walls.
  const floor = corners.map(value => {
    const [x, y, z] = vector(value, 3, 'floor polygon corner');
    const worldY = m[1] * x + m[5] * y + m[9] * z + m[13];
    if (Math.abs(worldY - floorY) > JOIN_TOLERANCE_METERS) throw new Error('RoomPlan floor elevation does not match the wall bases.');
    return { x: m[0] * x + m[4] * y + m[8] * z + m[12], z: m[2] * x + m[6] * y + m[10] * z + m[14] };
  });
  const boundaryDistance = (p: FloorPoint) => Math.min(...vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / distance(a, b) ** 2));
    return distance(p, { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
  }));
  if (!isSimplePolygon(floor.map(p => ({ x: p.x * METERS_TO_INCHES, z: p.z * METERS_TO_INCHES }))) ||
    floor.some(p => boundaryDistance(p) > JOIN_TOLERANCE_METERS) ||
    Math.abs(polygonArea(floor) - polygonArea(vertices)) > polygonArea(vertices) * 0.001) {
    throw new Error('RoomPlan floor polygon does not agree with the wall boundary.');
  }
}

export function isRoomPlanJson(input: RecordValue): boolean {
  return Array.isArray(input.walls) && input.walls.some(value => value && typeof value === 'object' &&
    ('transform' in value || 'dimensions' in value));
}

/** Returns normalized input for the shared validator; it never bypasses that validator. */
export function adaptRoomPlan(input: RecordValue): RecordValue {
  if (input.version !== undefined && input.version !== 1 && input.version !== 2) throw new Error('Unsupported RoomPlan JSON version. Use a CapturedRoom v1 or v2 export.');
  if (input.units !== undefined && input.units !== 'meters') throw new Error('Native RoomPlan dimensions must be in meters.');
  const wallRecords = list(input.walls, 'walls', 128).map(value => object(value, 'wall'));
  if (wallRecords.length < 3) throw new Error('RoomPlan must contain at least three measured walls.');
  const openingRecords = (['doors', 'windows', 'openings'] as const).flatMap(key =>
    list(input[key] ?? [], key, 256).map(value => ({ kind: key === 'doors' ? 'door' : key === 'windows' ? 'window' : 'opening', raw: object(value, key) })));
  const objectRecords = list(input.objects ?? [], 'objects', 256).map(value => object(value, 'object'));
  const floorRecords = list(input.floors ?? [], 'floors', 1).map(value => object(value, 'floor'));
  const records = [...wallRecords, ...openingRecords.map(o => o.raw), ...objectRecords, ...floorRecords];
  const ids = records.map(r => identifier(r.identifier));
  if (new Set(ids).size !== ids.length) throw new Error('RoomPlan element identifiers must be unique.');
  const stories = [input.story, ...records.map(r => r.story)].filter(value => value !== undefined);
  if (stories.some(v => typeof v !== 'number' || !Number.isInteger(v)) || new Set(stories).size > 1) throw new Error('Import a RoomPlan scan from one floor at a time.');

  const walls = wallRecords.map(raw => rectangularSurface(raw, 'wall'));
  const floorY = walls[0].bottom;
  const height = walls[0].height;
  if (walls.some(w => Math.abs(w.bottom - floorY) > JOIN_TOLERANCE_METERS || Math.abs(w.height - height) > JOIN_TOLERANCE_METERS)) {
    throw new Error('RoomPlan wall bases and heights must describe a single level room with a flat ceiling.');
  }
  const { vertices, ordered } = perimeter(walls);
  floorRecords.forEach(raw => checkFloor(raw, vertices, floorY));
  const openings = openingRecords.map(({ kind, raw }) => {
    const surface = rectangularSurface(raw, kind);
    const candidates = ordered.flatMap((wall, i) => {
      if (surface.parent !== undefined && wall.id !== surface.parent) return [];
      const p = openingLocation(surface, vertices, i);
      return p.aligned && p.onPlane && p.offset >= -JOIN_TOLERANCE_METERS && p.offset + surface.width <= p.length + JOIN_TOLERANCE_METERS ? [i] : [];
    });
    if (candidates.length !== 1) throw new Error('RoomPlan door/window could not be matched to exactly one wall. Check its parentIdentifier and transform.');
    const wallIndex = candidates[0];
    const p = openingLocation(surface, vertices, wallIndex);
    const sill = surface.bottom - floorY;
    if (sill < -JOIN_TOLERANCE_METERS || sill + surface.height > ordered[wallIndex].height + JOIN_TOLERANCE_METERS) throw new Error('RoomPlan opening extends above or below its wall.');
    return {
      id: surface.id, type: kind, wallIndex, sourceConfidence: surface.confidence,
      widthInches: surface.width * METERS_TO_INCHES, heightInches: surface.height * METERS_TO_INCHES,
      offsetInches: Math.max(0, p.offset) * METERS_TO_INCHES,
      sillHeightInches: Math.max(0, sill) * METERS_TO_INCHES,
    };
  });
  const objects = objectRecords.map(raw => {
    const m = transform(raw.transform, true);
    const [width, objectHeight, depth] = vector(raw.dimensions, 3, 'object dimensions');
    if (width <= 0 || objectHeight <= 0 || depth <= 0) throw new Error('RoomPlan object dimensions must be positive.');
    const baseY = m[13] - objectHeight / 2 - floorY;
    if (baseY < -JOIN_TOLERANCE_METERS) throw new Error('RoomPlan object extends below the room floor.');
    const nativeCategory = enumName(raw.category, 'object category');
    const category = nativeCategory === 'bathtub' || nativeCategory === 'toilet' ? nativeCategory
      : nativeCategory === 'storage' ? 'cabinet'
      : ['oven', 'stove', 'refrigerator', 'dishwasher', 'washerDryer'].includes(nativeCategory) ? 'appliance'
      : ['chair', 'table', 'sofa', 'bed'].includes(nativeCategory) ? 'furniture' : 'other';
    return {
      id: identifier(raw.identifier), category, sourceCategory: nativeCategory, sourceConfidence: confidence(raw.confidence),
      label: nativeCategory.replace(/([a-z])([A-Z])/g, '$1 $2'),
      dimensionsInches: { width: width * METERS_TO_INCHES, height: objectHeight * METERS_TO_INCHES, depth: depth * METERS_TO_INCHES },
      position: { x: m[12] * METERS_TO_INCHES, y: Math.max(0, baseY) * METERS_TO_INCHES, z: m[14] * METERS_TO_INCHES },
      rotationYRadians: Math.atan2(m[2], m[0]),
    };
  });
  const sections = list(input.sections ?? [], 'sections', 128);
  const sectionLabel = sections.length === 1 ? object(sections[0], 'section').label : undefined;
  const roomType = sectionLabel === 'livingRoom' || sectionLabel === 'diningRoom' ? 'living'
    : ['bathroom', 'kitchen', 'bedroom', 'basement', 'garage'].includes(String(sectionLabel)) ? sectionLabel : 'living';
  return {
    schemaVersion: 1, units: 'inches', sourceFormat: 'apple-roomplan', sourceVersion: input.version,
    id: input.identifier, title: typeof input.title === 'string' ? input.title : 'Imported RoomPlan room', roomType,
    device: 'Apple RoomPlan export', scannedAt: input.scannedAt,
    ceilingHeightInches: height * METERS_TO_INCHES,
    floorPolygon: vertices.map(p => ({ x: p.x * METERS_TO_INCHES, z: p.z * METERS_TO_INCHES })),
    walls: ordered.map(w => ({ id: w.id, label: 'Scanned wall', lengthInches: w.width * METERS_TO_INCHES, heightInches: w.height * METERS_TO_INCHES, sourceConfidence: w.confidence })),
    openings, objects,
  };
}
