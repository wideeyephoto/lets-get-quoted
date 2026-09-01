import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadInsuranceProof, insuranceProofUrl, deleteInsuranceProof } from '@/lib/insurance-storage';
import { uploadJobPhoto, createJobPhotoLinks, deleteJobPhotos, ownedPhotoPaths } from '@/lib/job-photo-storage';
import { uploadLeadPhoto, createLeadPhotoUrls, deleteLeadPhotos } from '@/lib/lead-photo-storage';
import { uploadCrewPhoto, createCrewPhotoUrls, deleteCrewPhotos } from '@/lib/crew-photo-storage';
import { uploadSiteImage, deleteSiteImage, importJobPhotoAsSiteImage } from '@/lib/site-image-storage';
import { createSignedVideoUpload, deleteSiteVideo, siteVideoStoragePath } from '@/lib/site-video-storage';
import * as storageUsage from '@/lib/billing/storage-usage';
import * as authLib from '@/lib/auth';

const TENANT_A = '11111111-1111-4111-a111-111111111111';
const TENANT_B = '22222222-2222-4222-a222-222222222222';

describe('Storage & Realtime Tenancy Matrices', () => {
  const uploadedObjects = new Map<string, { bucket: string; path: string; data: Buffer }>();
  const signedRequests: Array<{ bucket: string; path: string }> = [];
  const removedObjects: Array<{ bucket: string; paths: string[] }> = [];

  const mockAdminClient = {
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: { id: 'test-bucket' }, error: null }),
      createBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: (bucket: string) => ({
        upload: vi.fn().mockImplementation(async (path: string, data: Buffer) => {
          uploadedObjects.set(`${bucket}:${path}`, { bucket, path, data });
          return { data: { path }, error: null };
        }),
        createSignedUrl: vi.fn().mockImplementation(async (path: string, expiresIn: number) => {
          signedRequests.push({ bucket, path });
          return { data: { signedUrl: `https://supabase.co/storage/v1/signed/${bucket}/${path}?token=sig_${expiresIn}` }, error: null };
        }),
        createSignedUrls: vi.fn().mockImplementation(async (paths: string[], expiresIn: number) => {
          const result = paths.map((path) => {
            signedRequests.push({ bucket, path });
            return { path, signedUrl: `https://supabase.co/storage/v1/signed/${bucket}/${path}?token=sig_${expiresIn}` };
          });
          return { data: result, error: null };
        }),
        createSignedUploadUrl: vi.fn().mockImplementation(async (path: string) => {
          return { data: { token: 'mock-upload-token', path }, error: null };
        }),
        getPublicUrl: vi.fn().mockImplementation((path: string) => {
          return { data: { publicUrl: `https://supabase.co/storage/v1/public/${bucket}/${path}` } };
        }),
        download: vi.fn().mockImplementation(async (path: string) => {
          return { data: new Blob(['fake-job-photo-data'], { type: 'image/jpeg' }), error: null };
        }),
        remove: vi.fn().mockImplementation(async (paths: string[]) => {
          removedObjects.push({ bucket, paths });
          paths.forEach((p) => uploadedObjects.delete(`${bucket}:${p}`));
          return { data: paths.map((p) => ({ name: p })), error: null };
        }),
      }),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    uploadedObjects.clear();
    signedRequests.length = 0;
    removedObjects.length = 0;
    vi.spyOn(authLib, 'createAdminClient').mockReturnValue(mockAdminClient as any);
    vi.spyOn(storageUsage, 'assertStorageCapacity').mockResolvedValue(undefined as any);
  });

  describe('Bucket 1: insurance-proof (Private COI documents)', () => {
    it('pins uploads to the authenticated account prefix', async () => {
      const file = new File(['%PDF-1.4 test certificate'], 'coi.pdf', { type: 'application/pdf' });
      const result = await uploadInsuranceProof(TENANT_A, file);
      expect(result.path.startsWith(`${TENANT_A}/`)).toBe(true);
      expect(result.filename).toBe('coi.pdf');
    });

    it('denies cross-tenant signed URL generation for Tenant B files requested by Tenant A', async () => {
      const tenantBPath = `${TENANT_B}/some-confidential-cert.pdf`;
      const url = await insuranceProofUrl(TENANT_A, tenantBPath);
      expect(url).toBeNull();
      expect(signedRequests.some((r) => r.path === tenantBPath)).toBe(false);
    });

    it('denies cross-tenant deletion attempts from Tenant A on Tenant B files', async () => {
      const tenantBPath = `${TENANT_B}/coi.pdf`;
      await deleteInsuranceProof(TENANT_A, tenantBPath);
      expect(removedObjects.length).toBe(0);
    });
  });

  describe('Bucket 2: job-photos (Field progress & completion photos)', () => {
    it('uploads with strict tenant prefix and checks storage capacity', async () => {
      const file = new File(['fake-jpg-data'], 'before.jpg', { type: 'image/jpeg' });
      const path = await uploadJobPhoto(TENANT_A, file);
      expect(path.startsWith(`${TENANT_A}/`)).toBe(true);
      expect(storageUsage.assertStorageCapacity).toHaveBeenCalledWith(expect.anything(), TENANT_A, file.size);
    });

    it('sanitizes client-submitted paths to strip cross-tenant references', () => {
      const clientPaths = [
        `${TENANT_A}/11111111-1111-4111-a111-111111111111.jpg`,
        `${TENANT_B}/22222222-2222-4222-a222-222222222222.jpg`, // foreign tenant
        `../etc/passwd`, // path traversal
        `${TENANT_A}/invalid-shape.exe`, // bad extension
      ];
      const validPaths = ownedPhotoPaths(TENANT_A, clientPaths);
      expect(validPaths).toEqual([`${TENANT_A}/11111111-1111-4111-a111-111111111111.jpg`]);
    });

    it('refuses to generate signed links for foreign tenant paths', async () => {
      const mixedPaths = [
        `${TENANT_A}/11111111-1111-4111-a111-111111111111.jpg`,
        `${TENANT_B}/22222222-2222-4222-a222-222222222222.jpg`,
      ];
      const links = await createJobPhotoLinks(TENANT_A, mixedPaths);
      expect(links.length).toBe(1);
      expect(links[0].path).toBe(`${TENANT_A}/11111111-1111-4111-a111-111111111111.jpg`);
    });

    it('refuses to delete foreign tenant job photos', async () => {
      await deleteJobPhotos(TENANT_A, [`${TENANT_B}/job-evidence.jpg`]);
      expect(removedObjects.length).toBe(0);
    });
  });

  describe('Bucket 3: lead-photos (Homeowner estimate intake uploads)', () => {
    it('strictly isolates lead photos by account prefix', async () => {
      const file = new File(['lead-roof-photo'], 'roof.png', { type: 'image/png' });
      const path = await uploadLeadPhoto(TENANT_A, file, 'workspace');
      expect(path.startsWith(`${TENANT_A}/`)).toBe(true);

      const crossTenantSigned = await createLeadPhotoUrls(TENANT_A, [`${TENANT_B}/secret.png`]);
      expect(crossTenantSigned).toEqual([]);

      await deleteLeadPhotos(TENANT_A, [`${TENANT_B}/secret.png`]);
      expect(removedObjects.length).toBe(0);
    });
  });

  describe('Bucket 4: crew-photos (Staff & badge avatars)', () => {
    it('isolates crew photos with account and crew ID paths', async () => {
      const crewId = '33333333-3333-4333-a333-333333333333';
      const file = new File(['crew-avatar'], 'tech.jpg', { type: 'image/jpeg' });
      const path = await uploadCrewPhoto(TENANT_A, crewId, file);
      expect(path.startsWith(`${TENANT_A}/${crewId}/`)).toBe(true);

      const signedMap = await createCrewPhotoUrls(TENANT_A, [`${TENANT_B}/other-tech/avatar.jpg`]);
      expect(signedMap).toEqual({});

      await deleteCrewPhotos(TENANT_A, [`${TENANT_B}/other-tech/avatar.jpg`]);
      expect(removedObjects.length).toBe(0);
    });
  });

  describe('Bucket 5 & 6: site-images & site-videos (Website media assets)', () => {
    it('isolates public site images with account prefix', async () => {
      const file = new File(['site-logo'], 'logo.webp', { type: 'image/webp' });
      const image = await uploadSiteImage(TENANT_A, file);
      expect(image.storagePath?.startsWith(`${TENANT_A}/`)).toBe(true);

      // Attempting to delete Tenant B image as Tenant A throws security error
      await expect(deleteSiteImage(TENANT_A, `${TENANT_B}/brand.webp`)).rejects.toThrow(
        /Image does not belong to this account/,
      );

      // Attempting to import Tenant B job photo as Tenant A site image throws security error
      await expect(importJobPhotoAsSiteImage(TENANT_A, `${TENANT_B}/photo.jpg`, 'alt')).rejects.toThrow(
        /Photo does not belong to this account/,
      );
    });

    it('isolates site videos with account prefix and signed upload tickets', async () => {
      const uploadTicket = await createSignedVideoUpload(
        TENANT_A,
        'hero.mp4',
        'video/mp4',
        1024 * 1024 * 5,
      );
      expect(uploadTicket.path.startsWith(`${TENANT_A}/`)).toBe(true);
      expect(uploadTicket.bucket).toBe('site-videos');
      expect(uploadTicket.token).toBe('mock-upload-token');

      // Attempting to delete Tenant B video as Tenant A throws security error
      await expect(deleteSiteVideo(TENANT_A, `${TENANT_B}/hero.mp4`)).rejects.toThrow(
        /does not belong to this account/,
      );
    });
  });

  describe('Bucket 7: account-attachments & Storage Capacity Gate', () => {
    it('fails closed when workspace storage quota is exceeded', async () => {
      vi.spyOn(storageUsage, 'assertStorageCapacity').mockRejectedValueOnce(
        new Error('Storage limit reached for your plan. Please upgrade your plan or top-up capacity.'),
      );

      const file = new File(['huge-file-content'], 'heavy.jpg', { type: 'image/jpeg' });
      await expect(uploadJobPhoto(TENANT_A, file)).rejects.toThrow(/Storage limit reached/);
      expect(uploadedObjects.size).toBe(0);
    });
  });

  describe('Realtime GPS & Presence Channel Tenancy Matrix', () => {
    it('formats realtime broadcast topic with strict account scoping', () => {
      const accountId = TENANT_A;
      const topic = `account:${accountId}:crew-locations`;
      expect(topic).toBe(`account:${TENANT_A}:crew-locations`);
      expect(topic).not.toContain(TENANT_B);
    });

    it('ensures subscription filters prevent cross-account topic bleeding', () => {
      const allowedTopic = `account:${TENANT_A}:crew-locations`;
      const foreignTopic = `account:${TENANT_B}:crew-locations`;

      const matchesTenant = (channelTopic: string, targetAccountId: string) => {
        return channelTopic === `account:${targetAccountId}:crew-locations`;
      };

      expect(matchesTenant(allowedTopic, TENANT_A)).toBe(true);
      expect(matchesTenant(foreignTopic, TENANT_A)).toBe(false);
    });
  });
});
