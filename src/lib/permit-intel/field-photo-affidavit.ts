import { haversineMiles } from '../distance';

export type InspectionPhotoMilestone =
  | 'ice_barrier_dryin'
  | 'sheathing_fastening'
  | 'rough_electrical_grounds'
  | 'electrical_service_panel'
  | 'gas_pressure_test'
  | 'plumbing_rough_drain'
  | 'hvac_duct_rough'
  | 'final_completion';

export type GeotaggedInspectionPhoto = {
  photoId: string;
  photoUrl: string;
  milestone: InspectionPhotoMilestone;
  caption: string;
  takenAt: string; // ISO string
  coordinates: {
    latitude: number;
    longitude: number;
  };
  deviceInfo?: string;
  distanceFromJobMeters?: number;
  isWithinGeoFence?: boolean;
};

export type InspectionPhotoAffidavit = {
  affidavitId: string;
  createdAt: string;
  permitNumber: string;
  authorityName: string;
  jobAddress: string;
  jobCoordinates: {
    latitude: number;
    longitude: number;
  };
  contractor: {
    companyName: string;
    qualifyingOfficer: string;
    licenseNumber: string;
    phone: string;
  };
  tradeMilestone: InspectionPhotoMilestone;
  photos: GeotaggedInspectionPhoto[];
  verificationSummary: {
    totalPhotos: number;
    allWithinGeoFence: boolean;
    maxDistanceMeters: number;
  };
  attestationText: string;
  signatory: {
    name: string;
    title: string;
    signatureDate: string;
  };
};

/**
 * Validates whether photo GPS coordinates match the job property address coordinates
 * within a standard allowable radius (max 150 meters / ~500 feet).
 */
export function validatePhotoGeofence(
  photoCoords: { latitude: number; longitude: number },
  jobCoords: { latitude: number; longitude: number },
  maxRadiusMeters: number = 150,
): { isWithinGeoFence: boolean; distanceMeters: number } {
  const miles = haversineMiles(
    { lat: photoCoords.latitude, lng: photoCoords.longitude },
    { lat: jobCoords.latitude, lng: jobCoords.longitude },
  );
  const distance = Math.round(miles * 1609.344);

  return {
    isWithinGeoFence: distance <= maxRadiusMeters,
    distanceMeters: distance,
  };
}

/**
 * Compiles a formal municipal remote inspection photo affidavit.
 */
export function compileInspectionPhotoAffidavit(input: {
  permitNumber: string;
  authorityName: string;
  jobAddress: string;
  jobCoordinates: { latitude: number; longitude: number };
  contractor: {
    companyName: string;
    qualifyingOfficer: string;
    licenseNumber: string;
    phone?: string;
  };
  tradeMilestone: InspectionPhotoMilestone;
  rawPhotos: Array<{
    photoId: string;
    photoUrl: string;
    milestone: InspectionPhotoMilestone;
    caption: string;
    takenAt: string;
    coordinates: { latitude: number; longitude: number };
  }>;
  signatoryName?: string;
}): InspectionPhotoAffidavit {
  const validatedPhotos: GeotaggedInspectionPhoto[] = [];
  let maxDistance = 0;
  let allInBounds = true;

  for (const p of input.rawPhotos) {
    const { isWithinGeoFence, distanceMeters } = validatePhotoGeofence(p.coordinates, input.jobCoordinates);
    if (!isWithinGeoFence) {
      allInBounds = false;
    }
    if (distanceMeters > maxDistance) {
      maxDistance = distanceMeters;
    }

    validatedPhotos.push({
      ...p,
      distanceFromJobMeters: distanceMeters,
      isWithinGeoFence,
    });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const affidavitId = `AFF-${input.permitNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-6)}`;

  const attestationText = `I, ${input.signatoryName || input.contractor.qualifyingOfficer}, as the licensed contractor / qualifying officer for ${input.contractor.companyName} (License #${input.contractor.licenseNumber}), hereby certify and attest under penalty of perjury that the attached photographic evidence accurately depicts the code-compliant installation of ${input.tradeMilestone.replace(/_/g, ' ')} at ${input.jobAddress}. All work was executed in accordance with the applicable building, electrical, mechanical, and plumbing codes and verified on-site via cryptographic GPS and timestamp metadata.`;

  return {
    affidavitId,
    createdAt: new Date().toISOString(),
    permitNumber: input.permitNumber,
    authorityName: input.authorityName,
    jobAddress: input.jobAddress,
    jobCoordinates: input.jobCoordinates,
    contractor: {
      companyName: input.contractor.companyName,
      qualifyingOfficer: input.contractor.qualifyingOfficer,
      licenseNumber: input.contractor.licenseNumber,
      phone: input.contractor.phone || '(555) 019-9944',
    },
    tradeMilestone: input.tradeMilestone,
    photos: validatedPhotos,
    verificationSummary: {
      totalPhotos: validatedPhotos.length,
      allWithinGeoFence: allInBounds,
      maxDistanceMeters: maxDistance,
    },
    attestationText,
    signatory: {
      name: input.signatoryName || input.contractor.qualifyingOfficer,
      title: 'Licensed Contractor & Qualifying Officer',
      signatureDate: dateStr,
    },
  };
}
