// Known 10 ft × 12 ft room, 8 ft high, at world floor Y = -1 meter.
export function nativeMatrix(yaw: number, x: number, y: number, z: number): number[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1];
}

export function nativeSurface(identifier: string, kind: string, width: number, height: number,
  yaw: number, x: number, y: number, z: number, parentIdentifier?: string) {
  return { identifier, category: { [kind]: {} }, confidence: { medium: {} } as Record<string, object>,
    dimensions: [width, height, 0], transform: nativeMatrix(yaw, x, y, z), parentIdentifier };
}

type NativeObject = { identifier: string; category: Record<string, object>; confidence?: Record<string, object>; dimensions: number[]; transform: number[] };

export function nativeRoom() {
  return {
    version: 2, story: 0, identifier: 'known-room', referenceOriginTransform: nativeMatrix(0, 0, 0, 0),
    walls: [
      nativeSurface('south', 'wall', 3.048, 2.4384, 0, 1.524, 0.2192, 0),
      nativeSurface('north', 'wall', 3.048, 2.4384, Math.PI, 1.524, 0.2192, 3.6576),
      nativeSurface('west', 'wall', 3.6576, 2.4384, -Math.PI / 2, 0, 0.2192, 1.8288),
      nativeSurface('east', 'wall', 3.6576, 2.4384, Math.PI / 2, 3.048, 0.2192, 1.8288),
    ],
    doors: [nativeSurface('door', 'door', 0.9144, 2.032, 0, 0.762, 0.016, 0, 'south')],
    windows: [] as ReturnType<typeof nativeSurface>[], openings: [] as ReturnType<typeof nativeSurface>[],
    objects: [] as NativeObject[],
  };
}
