import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadRosterData } from '@/lib/crew-rows';

vi.mock('@/lib/crew', () => ({
  listCrew: vi.fn(),
  listCrewAssignmentsForJobs: vi.fn(),
}));

vi.mock('@/lib/arrival', () => ({
  arrivalPermissionsFromCrew: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/crew-photo-storage', () => ({
  createCrewPhotoUrls: vi.fn().mockResolvedValue({ 'path1.jpg': 'http://photo' }),
}));

vi.mock('@/lib/jobs', () => ({
  formatMoney: vi.fn().mockReturnValue('$100.00'),
  listJobs: vi.fn(),
}));

vi.mock('@/lib/phone', () => ({
  formatPhoneDashes: vi.fn().mockReturnValue('123-456-7890'),
}));

vi.mock('@/lib/pay-types', () => ({
  payBasisFromCrew: vi.fn().mockReturnValue({ payType: 'hourly', hourlyRate: 20 }),
  payRateLabel: vi.fn().mockReturnValue('$20/hr'),
}));

vi.mock('@/lib/crew-invite', () => ({
  fieldAppDetail: vi.fn().mockReturnValue('linked_app'),
  fieldAppState: vi.fn().mockReturnValue('linked'),
}));

vi.mock('@/lib/labor-data', () => ({
  laborTotalsByCrew: vi.fn(),
}));

vi.mock('@/lib/subcontractors', () => ({
  shapeSubcontractorProfile: vi.fn().mockReturnValue({ workerType: 'employee' }),
  subDisplayName: vi.fn().mockReturnValue('John Doe'),
}));

describe('Crew Rows Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadRosterData', () => {
    it('returns formatted roster data', async () => {
      const listCrewMock = (await import('@/lib/crew')).listCrew;
      (listCrewMock as any).mockResolvedValue([
        { id: 'c1', name: 'John Doe', active: true, photo_path: 'path1.jpg', phone: '1234567890' },
        { id: 'c2', name: 'Jane Smith', active: false, photo_path: null }
      ]);

      const listJobsMock = (await import('@/lib/jobs')).listJobs;
      (listJobsMock as any).mockResolvedValue([
        { id: 'j1', ref: 'JOB-1', client_name: 'Client 1', status: 'in_progress' },
        { id: 'j2', ref: 'JOB-2', client_name: 'Client 2', status: 'complete' }
      ]);

      const listCrewAssignmentsForJobsMock = (await import('@/lib/crew')).listCrewAssignmentsForJobs;
      (listCrewAssignmentsForJobsMock as any).mockResolvedValue({
        'j1': ['c1']
      });

      const laborTotalsByCrewMock = (await import('@/lib/labor-data')).laborTotalsByCrew;
      (laborTotalsByCrewMock as any).mockResolvedValue(new Map([['c1', { hours: 10, pay: 200 }]]));

      const res = await loadRosterData({} as any, 'acct_1', { startIso: '2023-01-01', endIso: '2023-01-07' }, { withPhotos: true });

      expect(res.activeCount).toBe(1);
      expect(res.onJobCount).toBe(1);
      expect(res.assignableJobs.length).toBe(1);
      expect(res.rows.length).toBe(2);

      const john = res.rows.find(r => r.id === 'c1');
      expect(john?.initials).toBe('JD');
      expect(john?.photoUrl).toBe('http://photo');
      expect(john?.jobs.length).toBe(1);
      expect(john?.periodHours).toBe(10);
      expect(john?.periodPay).toBe(200);
      expect(john?.phoneLabel).toBe('123-456-7890');

      const jane = res.rows.find(r => r.id === 'c2');
      expect(jane?.initials).toBe('JS');
      expect(jane?.photoUrl).toBeNull();
      expect(jane?.jobs.length).toBe(0);
      expect(jane?.periodHours).toBe(0);
      expect(jane?.phoneLabel).toBeNull();
    });

    it('skips photo urls when options.withPhotos is false', async () => {
      const listCrewMock = (await import('@/lib/crew')).listCrew;
      (listCrewMock as any).mockResolvedValue([{ id: 'c1', name: 'John', active: true }]);
      const listJobsMock = (await import('@/lib/jobs')).listJobs;
      (listJobsMock as any).mockResolvedValue([]);
      const listCrewAssignmentsForJobsMock = (await import('@/lib/crew')).listCrewAssignmentsForJobs;
      (listCrewAssignmentsForJobsMock as any).mockResolvedValue({});
      const laborTotalsByCrewMock = (await import('@/lib/labor-data')).laborTotalsByCrew;
      (laborTotalsByCrewMock as any).mockResolvedValue(new Map());

      const res = await loadRosterData({} as any, 'acct', { startIso: '2023-01-01', endIso: '2023-01-07' }, { withPhotos: false });
      
      const createCrewPhotoUrlsMock = (await import('@/lib/crew-photo-storage')).createCrewPhotoUrls;
      expect(createCrewPhotoUrlsMock).not.toHaveBeenCalled();
      
      expect(res.rows[0].photoUrl).toBeNull();
    });
  });
});
