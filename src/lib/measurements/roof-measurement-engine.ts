export type RoofComplexity = 'simple' | 'moderate' | 'complex';

export type RoofPitchPreset =
  | 'flat' // 0/12 - 2/12
  | 'low_slope' // 3/12 - 4/12
  | 'standard' // 5/12 - 7/12
  | 'steep' // 8/12 - 9/12
  | 'extreme'; // 10/12 - 12/12+

export type RoofGeometryInput = {
  footprintSqFt: number;
  pitchNumerator?: number; // e.g. 6 for 6/12
  complexity?: RoofComplexity;
  stories?: number;
  overhangInches?: number;
  hasGarageAttached?: boolean;
};

export type RoofMeasurementReport = {
  summary: {
    groundFootprintSqFt: number;
    trueRoofSurfaceSqFt: number;
    trueRoofSquares: number;
    suggestedWastePercent: number;
    grossSquaresWithWaste: number;
    bundleCount: number; // 3 bundles per square for standard architectural shingles
  };
  pitch: {
    numerator: number;
    denominator: 12;
    slopeRatio: string; // e.g. "6/12"
    multiplier: number; // e.g. 1.118
    category: RoofPitchPreset;
    degrees: number;
  };
  linearMeasurements: {
    eavesFeet: number;
    rakesFeet: number;
    ridgeFeet: number;
    valleysFeet: number;
    hipsFeet: number;
    dripEdgeFeet: number;
    starterStripFeet: number;
    stepFlashingFeet: number;
    wallFlashingFeet: number;
  };
  materialTakeoffEstimates: {
    shingleBundles: number;
    syntheticUnderlaymentRolls: number; // 10 sq per roll (1000 sq ft)
    iceAndWaterRolls: number; // 2 sq per roll (200 sq ft)
    ridgeCapBundles: number; // 33 linear ft per bundle
    dripEdgePieces: number; // 10 ft per piece
    starterStripBundles: number; // 105 linear ft per bundle
    roofingNailsBoxes: number; // ~1 box (7,200 nails) per 25-30 squares
    pipeBootFlashings: number;
  };
  complexity: RoofComplexity;
  estimatedRoofAgeYears?: number;
};

/**
 * Calculates the geometric surface area multiplier for a given roof pitch (X/12).
 * Formula: sqrt(1 + (X/12)^2)
 */
export function calculatePitchMultiplier(pitchNumerator: number): number {
  const clampedPitch = Math.max(0, Math.min(24, pitchNumerator));
  const multiplier = Math.sqrt(1 + Math.pow(clampedPitch / 12, 2));
  return Math.round(multiplier * 1000) / 1000;
}

/**
 * Categorizes roof pitch into industry contractor presets.
 */
export function categorizePitch(pitchNumerator: number): { category: RoofPitchPreset; degrees: number } {
  const degrees = Math.round((Math.atan(pitchNumerator / 12) * (180 / Math.PI)) * 10) / 10;

  if (pitchNumerator <= 2) {
    return { category: 'flat', degrees };
  }
  if (pitchNumerator <= 4) {
    return { category: 'low_slope', degrees };
  }
  if (pitchNumerator <= 7) {
    return { category: 'standard', degrees };
  }
  if (pitchNumerator <= 9) {
    return { category: 'steep', degrees };
  }
  return { category: 'extreme', degrees };
}

/**
 * Calculates complete 3D rooftop geometry, surface area, and linear measurements
 * from 2D ground footprint and pitch parameters.
 */
export function calculateRoofGeometry(input: RoofGeometryInput): RoofMeasurementReport {
  const footprint = Math.max(200, input.footprintSqFt);
  const pitchNumerator = input.pitchNumerator != null ? input.pitchNumerator : 6; // Default to standard 6/12
  const complexity = input.complexity || 'moderate';
  const overhangInches = input.overhangInches != null ? input.overhangInches : 12;

  // 1. Account for eave overhang perimeter expansion
  // Assume a rectangular aspect ratio of ~1.4 : 1
  const widthEst = Math.sqrt(footprint / 1.4);
  const lengthEst = widthEst * 1.4;
  const overhangFeet = overhangInches / 12;

  const adjustedFootprint = (widthEst + 2 * overhangFeet) * (lengthEst + 2 * overhangFeet);

  // 2. Pitch multiplier calculation
  const multiplier = calculatePitchMultiplier(pitchNumerator);
  const { category, degrees } = categorizePitch(pitchNumerator);

  // 3. True 3D surface area
  const trueRoofSurfaceSqFt = Math.round(adjustedFootprint * multiplier);
  const trueRoofSquares = Math.round((trueRoofSurfaceSqFt / 100) * 10) / 10;

  // 4. Waste factor based on complexity
  const wastePercent = complexity === 'simple' ? 10 : complexity === 'moderate' ? 12.5 : 15;
  const grossSquaresWithWaste = Math.round(trueRoofSquares * (1 + wastePercent / 100) * 10) / 10;
  const bundleCount = Math.ceil(grossSquaresWithWaste * 3);

  // 5. Linear footage estimations
  // Eaves = 2 * lengthEst
  const eavesFeet = Math.round(2 * (lengthEst + 2 * overhangFeet));
  // Rakes = 2 * widthEst * multiplier (for gable) or hips (for hip roof)
  const rakesFeet = complexity === 'simple' ? Math.round(2 * (widthEst + 2 * overhangFeet) * multiplier) : Math.round(widthEst * multiplier);
  const ridgeFeet = Math.round((lengthEst + 2 * overhangFeet) * 0.75);

  let valleysFeet = 0;
  let hipsFeet = 0;
  if (complexity === 'moderate') {
    valleysFeet = Math.round(2 * Math.sqrt(Math.pow(widthEst / 2, 2) + Math.pow(widthEst / 2, 2)) * multiplier);
    hipsFeet = Math.round(2 * Math.sqrt(Math.pow(widthEst / 2, 2) + Math.pow(widthEst / 2, 2)) * multiplier);
  } else if (complexity === 'complex') {
    valleysFeet = Math.round(4 * Math.sqrt(Math.pow(widthEst / 2, 2) + Math.pow(widthEst / 2, 2)) * multiplier);
    hipsFeet = Math.round(4 * Math.sqrt(Math.pow(widthEst / 2, 2) + Math.pow(widthEst / 2, 2)) * multiplier);
  }

  const dripEdgeFeet = eavesFeet + rakesFeet;
  const starterStripFeet = eavesFeet + rakesFeet;
  const stepFlashingFeet = Math.round(rakesFeet * 0.5);
  const wallFlashingFeet = Math.round(widthEst * 0.3);

  // 6. Material Takeoff Estimates
  const syntheticUnderlaymentRolls = Math.ceil(trueRoofSurfaceSqFt / 1000); // 10 sq per roll
  // Ice & water shield covers eaves (min 2 runs in snow states) + valleys
  const iceAndWaterSqFt = (eavesFeet * 3) + (valleysFeet * 3);
  const iceAndWaterRolls = Math.max(1, Math.ceil(iceAndWaterSqFt / 200)); // 200 sq ft per roll
  const ridgeCapBundles = Math.ceil((ridgeFeet + hipsFeet) / 33);
  const dripEdgePieces = Math.ceil(dripEdgeFeet / 10);
  const starterStripBundles = Math.ceil(starterStripFeet / 105);
  const roofingNailsBoxes = Math.max(1, Math.ceil(grossSquaresWithWaste / 25));
  const pipeBootFlashings = 3;

  return {
    summary: {
      groundFootprintSqFt: Math.round(footprint),
      trueRoofSurfaceSqFt,
      trueRoofSquares,
      suggestedWastePercent: wastePercent,
      grossSquaresWithWaste,
      bundleCount,
    },
    pitch: {
      numerator: pitchNumerator,
      denominator: 12,
      slopeRatio: `${pitchNumerator}/12`,
      multiplier,
      category,
      degrees,
    },
    linearMeasurements: {
      eavesFeet,
      rakesFeet,
      ridgeFeet,
      valleysFeet,
      hipsFeet,
      dripEdgeFeet,
      starterStripFeet,
      stepFlashingFeet,
      wallFlashingFeet,
    },
    materialTakeoffEstimates: {
      shingleBundles: bundleCount,
      syntheticUnderlaymentRolls,
      iceAndWaterRolls,
      ridgeCapBundles,
      dripEdgePieces,
      starterStripBundles,
      roofingNailsBoxes,
      pipeBootFlashings,
    },
    complexity,
  };
}

/**
 * Estimates building footprint from property square footage and story count,
 * then computes the full aerial roof geometry report.
 */
export function measureRoofFromAddress(
  propertyAddress: string,
  options?: {
    livingSquareFootage?: number;
    stories?: number;
    pitchNumerator?: number;
    complexity?: RoofComplexity;
  },
): RoofMeasurementReport & { propertyAddress: string } {
  const livingSqFt = options?.livingSquareFootage || 2000;
  const stories = options?.stories || 1;

  // Approximate ground footprint = (living area / stories) + attached garage allowance (400 sq ft)
  const groundFootprint = Math.round((livingSqFt / stories) + 400);

  const report = calculateRoofGeometry({
    footprintSqFt: groundFootprint,
    pitchNumerator: options?.pitchNumerator != null ? options.pitchNumerator : 6,
    complexity: options?.complexity || 'moderate',
    stories,
  });

  return {
    ...report,
    propertyAddress,
  };
}
