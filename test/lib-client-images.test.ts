
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressImage } from '@/lib/client-images';

describe('Client Images Lib', () => {
  let mockContext: any;
  let mockCanvas: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      drawImage: vi.fn(),
    };

    mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext),
      toBlob: vi.fn().mockImplementation((cb) => cb(new Blob(['data'], { type: 'image/webp' }))),
      width: 0,
      height: 0,
    };

    (global as any).document = {
      createElement: vi.fn().mockReturnValue(mockCanvas),
    };

    global.createImageBitmap = vi.fn().mockResolvedValue({
      width: 4000,
      height: 2000,
      close: vi.fn(),
    });
  });

  it('rejects non-images', async () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    await expect(compressImage(file)).rejects.toThrow('Choose an image file.');
  });

  it('rejects if no context', async () => {
    mockCanvas.getContext.mockReturnValue(null);
    const file = new File([''], 'test.png', { type: 'image/png' });
    await expect(compressImage(file)).rejects.toThrow('This browser cannot prepare the image.');
  });

  it('rejects if toBlob fails', async () => {
    mockCanvas.toBlob.mockImplementation((cb: any) => cb(null));
    const file = new File([''], 'test.png', { type: 'image/png' });
    await expect(compressImage(file)).rejects.toThrow('Unable to compress image.');
  });

  it('compresses and scales image', async () => {
    const file = new File([''], 'test_img.png', { type: 'image/png' });
    const res = await compressImage(file, 1800);
    
    expect(res.name).toBe('test_img.webp');
    expect(res.type).toBe('image/webp');
    expect(mockCanvas.width).toBe(1800);
    expect(mockCanvas.height).toBe(900);
    expect(mockContext.drawImage).toHaveBeenCalled();
  });
});
