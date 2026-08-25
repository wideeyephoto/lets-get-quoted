// Geometry and roof pitch calculation helpers for contractor estimates

export const SQ_METERS_TO_SQ_FT = 10.7639104;
export const STEEP_PITCH_THRESHOLD_DEGREES = 30.0; // ~7/12 pitch triggers steep slope surcharge

/**
 * Converts pitch in degrees (from Google Solar API) to standard contractor rise/run notation (e.g. "8/12").
 */
export function pitchDegreesToRatio(degrees: number): string {
  if (!Number.isFinite(degrees) || degrees <= 0.5) return 'Flat (0/12)';
  const rad = (degrees * Math.PI) / 180;
  const rise = Math.round(12 * Math.tan(rad));
  if (rise <= 0) return 'Flat (0/12)';
  return `${rise}/12`;
}

/**
 * Checks if a pitch angle is considered steep slope (>= 7/12 rise or >= 30°), which typically requires
 * fall arrest harnesses and a steep pitch labor adder.
 */
export function isSteepPitch(degrees: number): boolean {
  return Number.isFinite(degrees) && degrees >= STEEP_PITCH_THRESHOLD_DEGREES;
}

/**
 * Converts azimuth angle (0-360°) to cardinal / intercardinal compass direction.
 */
export function degreesToCompass(azimuth: number): string {
  if (!Number.isFinite(azimuth)) return 'N';
  const normalized = ((azimuth % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(normalized / 45) % 8;
  return directions[index] ?? 'N';
}

/**
 * Classifies roof structure complexity based on the number of distinct planes/segments.
 */
export function classifyRoofComplexity(segmentCount: number): {
  complexity: 'simple' | 'moderate' | 'complex';
  complexityLabel: string;
} {
  if (segmentCount <= 2) {
    return {
      complexity: 'simple',
      complexityLabel: `Simple Gable / Shed (${segmentCount} plane${segmentCount === 1 ? '' : 's'})`,
    };
  }
  if (segmentCount <= 5) {
    return {
      complexity: 'moderate',
      complexityLabel: `Moderate Hip / Gable (${segmentCount} planes)`,
    };
  }
  return {
    complexity: 'complex',
    complexityLabel: `Complex Hip & Valley (${segmentCount} planes)`,
  };
}

/**
 * Converts square meters to square feet.
 */
export function sqMetersToSqFt(sqMeters: number): number {
  if (!Number.isFinite(sqMeters) || sqMeters < 0) return 0;
  return Math.round(sqMeters * SQ_METERS_TO_SQ_FT);
}

/**
 * Converts square feet to roofing squares (1 square = 100 sq ft), rounded to 1 decimal.
 */
export function sqFtToRoofingSquares(sqFt: number): number {
  if (!Number.isFinite(sqFt) || sqFt < 0) return 0;
  return Math.round((sqFt / 100) * 10) / 10;
}
