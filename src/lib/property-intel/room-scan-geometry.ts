import type { RoomSpatialScan } from './room-spatial-intel';

export type FloorPoint = { x: number; z: number };
export type SpatialPoint = FloorPoint & { y: number };

export function pointDistance(a: SpatialPoint, b: SpatialPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function polygonArea(points: FloorPoint[]): number {
  // Translate to the first vertex to avoid cancellation with survey coordinates.
  const origin = points[0];
  return Math.abs(points.reduce((area, p, i) => {
    const q = points[(i + 1) % points.length];
    return area + (p.x - origin.x) * (q.z - origin.z) - (q.x - origin.x) * (p.z - origin.z);
  }, 0)) / 2;
}

function cross(a: FloorPoint, b: FloorPoint, c: FloorPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment(a: FloorPoint, b: FloorPoint, p: FloorPoint): boolean {
  return Math.abs(cross(a, b, p)) < 1e-6 &&
    p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
    p.z >= Math.min(a.z, b.z) && p.z <= Math.max(a.z, b.z);
}

export function isSimplePolygon(points: FloorPoint[]): boolean {
  if (points.length < 3 || polygonArea(points) < 1) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.01) return false;
    const next = points[(i + 2) % points.length];
    if (Math.abs(cross(a, b, next)) < 1e-6 &&
      (b.x - a.x) * (next.x - b.x) + (b.z - a.z) * (next.z - b.z) < 0) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) return false;
    }
  }
  return true;
}

export function getRoomFloorPolygon(scan: RoomSpatialScan): FloorPoint[] {
  if (scan.floorPolygon) return scan.floorPolygon;
  if (scan.floorShape !== 'rectangle' && !scan.isSample) {
    throw new Error('Floor geometry is missing. Supply floorPolygon or explicitly set floorShape to rectangle.');
  }
  const width = scan.walls[0].lengthInches, depth = scan.walls[1].lengthInches;
  return [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }];
}
