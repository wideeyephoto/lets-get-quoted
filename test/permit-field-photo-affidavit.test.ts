import { describe, it, expect } from 'vitest';
import {
  validatePhotoGeofence,
  compileInspectionPhotoAffidavit,
} from '../src/lib/permit-intel/field-photo-affidavit';

describe('Geotagged Field Photo Inspection Affidavit Engine', () => {
  const royalOakJobCoords = {
    latitude: 42.48948,
    longitude: -83.14465,
  };

  it('validates photo GPS geofence within 150m (500ft) threshold', () => {
    // 20 meters away (on property roof/driveway)
    const onSitePhoto = {
      latitude: 42.48955,
      longitude: -83.14470,
    };
    const validResult = validatePhotoGeofence(onSitePhoto, royalOakJobCoords, 150);
    expect(validResult.isWithinGeoFence).toBe(true);
    expect(validResult.distanceMeters).toBeLessThan(50);

    // 10 miles away (fake/stock photo)
    const offSitePhoto = {
      latitude: 42.3314,
      longitude: -83.0458,
    };
    const invalidResult = validatePhotoGeofence(offSitePhoto, royalOakJobCoords, 150);
    expect(invalidResult.isWithinGeoFence).toBe(false);
    expect(invalidResult.distanceMeters).toBeGreaterThan(5000);
  });

  it('compiles a complete municipal inspection photo affidavit with attestation of perjury', () => {
    const affidavit = compileInspectionPhotoAffidavit({
      permitNumber: 'ROOF-2026-9914',
      authorityName: 'City of Royal Oak',
      jobAddress: '211 S Williams St, Royal Oak, MI 48067',
      jobCoordinates: royalOakJobCoords,
      contractor: {
        companyName: 'Apex Roofing & Solar LLC',
        qualifyingOfficer: 'Marcus Builder',
        licenseNumber: 'MI-210199482',
      },
      tradeMilestone: 'ice_barrier_dryin',
      rawPhotos: [
        {
          photoId: 'photo-1',
          photoUrl: 'https://storage.example.com/photos/ice-barrier-eave.jpg',
          milestone: 'ice_barrier_dryin',
          caption: '2 runs of self-adhering modified bitumen ice barrier installed 36 inches inside exterior wall line',
          takenAt: '2026-08-26T14:30:00Z',
          coordinates: { latitude: 42.48950, longitude: -83.14467 },
        },
        {
          photoId: 'photo-2',
          photoUrl: 'https://storage.example.com/photos/drip-edge-valley.jpg',
          milestone: 'ice_barrier_dryin',
          caption: 'Valley ice & water shield liner and aluminum drip edge fastened at 12 inch intervals',
          takenAt: '2026-08-26T14:35:00Z',
          coordinates: { latitude: 42.48952, longitude: -83.14468 },
        },
      ],
    });

    expect(affidavit.affidavitId).toContain('AFF-ROOF20269914');
    expect(affidavit.verificationSummary.totalPhotos).toBe(2);
    expect(affidavit.verificationSummary.allWithinGeoFence).toBe(true);
    expect(affidavit.photos[0].distanceFromJobMeters).toBeDefined();
    expect(affidavit.attestationText).toContain('under penalty of perjury');
    expect(affidavit.attestationText).toContain('Marcus Builder');
    expect(affidavit.signatory.signatureDate).toBeDefined();
  });
});
