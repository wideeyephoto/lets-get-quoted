import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileToDataUrl, extractVideoKeyframes, extractMediaDataUrls } from '@/lib/client-media-frames';

vi.mock('@/lib/client-images', () => ({
  compressImage: vi.fn().mockImplementation((file) => Promise.resolve(new File(['data'], 'compressed.webp', { type: 'image/webp' }))),
}));

describe('Client Media Frames Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (global as any).window = {};
    (global as any).URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:url'),
      revokeObjectURL: vi.fn(),
    };

    const mockFileReader = {
      readAsDataURL: vi.fn(function(this: any) {
        setTimeout(() => {
          this.result = 'data:image/webp;base64,123';
          this.onload && this.onload();
        }, 0);
      }),
    };
    (global as any).FileReader = vi.fn(() => mockFileReader);
  });

  describe('fileToDataUrl', () => {
    it('reads file to base64', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const res = await fileToDataUrl(file);
      expect(res).toBe('data:image/webp;base64,123');
    });
  });

  describe('extractVideoKeyframes', () => {
    it('returns empty if no window', async () => {
      delete (global as any).window;
      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      const res = await extractVideoKeyframes(file);
      expect(res).toEqual([]);
    });

    it('extracts frames successfully', async () => {
      (global as any).window = {};
      
      const mockCanvasCtx = {
        drawImage: vi.fn(),
      };
      
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(mockCanvasCtx),
        toDataURL: vi.fn().mockReturnValue('data:image/webp;base64,frame'),
        width: 100,
        height: 100,
      };

      const mockVideo = {
        src: '',
        muted: false,
        playsInline: false,
        preload: '',
        duration: 10,
        videoWidth: 100,
        videoHeight: 100,
        remove: vi.fn(),
        currentTime: 0,
        addEventListener: vi.fn((event, cb) => {
          if (event === 'seeked') setTimeout(cb, 0);
        }),
        removeEventListener: vi.fn(),
        onloadedmetadata: null as any,
      };

      (global as any).document = {
        createElement: vi.fn((tag) => {
          if (tag === 'video') return mockVideo;
          if (tag === 'canvas') return mockCanvas;
          return {};
        }),
      };

      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      const promise = extractVideoKeyframes(file, 2);
      
      // simulate load
      setTimeout(() => {
        mockVideo.onloadedmetadata && mockVideo.onloadedmetadata();
      }, 0);

      const res = await promise;
      expect(res.length).toBe(2);
      expect(res[0]).toBe('data:image/webp;base64,frame');
    });
  });

  describe('extractMediaDataUrls', () => {
    it('processes mixed files', async () => {
      // Setup video mock
      (global as any).window = {};
      const mockCanvas = { getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => 'data:frame', width: 0, height: 0 };
      const mockVideo = {
        remove: vi.fn(), duration: 10, addEventListener: (e: any, cb: any) => setTimeout(cb, 0), removeEventListener: vi.fn(),
        set onloadedmetadata(cb: any) { setTimeout(cb, 0); }
      };
      (global as any).document = { createElement: (tag: string) => tag === 'video' ? mockVideo : mockCanvas };

      const files = [
        new File([''], 'vid.mp4', { type: 'video/mp4' }),
        new File([''], 'img.png', { type: 'image/png' })
      ];

      const res = await extractMediaDataUrls(files, 2);
      expect(res.length).toBe(2);
      // first is from video, second is from video (because video takes up to 3 frames, limit is 2)
      expect(res[0]).toBe('data:frame');
      expect(res[1]).toBe('data:frame');
    });
    
    it('processes image only', async () => {
      const files = [new File([''], 'img.png', { type: 'image/png' })];
      const res = await extractMediaDataUrls(files, 2);
      expect(res.length).toBe(1);
      expect(res[0]).toBe('data:image/webp;base64,123'); // from fileToDataUrl mock
    });
  });
});
