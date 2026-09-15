import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Google Maps Loader Lib', () => {
  let originalWindow: any;
  let originalDocument: any;

  beforeEach(() => {
    vi.resetModules();
    
    originalWindow = global.window;
    originalDocument = global.document;

    (global as any).window = {
      setTimeout: vi.fn((fn) => setTimeout(fn, 1)),
      google: undefined
    };

    (global as any).document = {
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockImplementation(() => ({})),
      head: {
        appendChild: vi.fn()
      }
    };
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    (global as any).document = originalDocument;
  });

  it('loads script if not present', async () => {
    const { loadGoogleMapsScript } = await import('@/lib/google-maps-loader');
    
    const scriptObj: any = {};
    (global.document.createElement as any).mockReturnValue(scriptObj);

    const promise = loadGoogleMapsScript('KEY123');

    expect(global.document.createElement).toHaveBeenCalledWith('script');
    expect(scriptObj.src).toContain('key=KEY123');
    expect(global.document.head.appendChild).toHaveBeenCalledWith(scriptObj);

    // Simulate load
    (global.window as any).google = { maps: { importLibrary: vi.fn() } };
    scriptObj.onload();

    await promise;
  });

  it('uses existing script if present and waits for ready', async () => {
    const { loadGoogleMapsScript } = await import('@/lib/google-maps-loader');
    
    const existingScript = { addEventListener: vi.fn() };
    (global.document.getElementById as any).mockReturnValue(existingScript);

    const promise = loadGoogleMapsScript('KEY123');
    
    expect(global.document.createElement).not.toHaveBeenCalled();

    (global.window as any).google = { maps: { importLibrary: vi.fn() } };
    
    await promise;
  });

  it('immediately resolves if already ready', async () => {
    const { loadGoogleMapsScript } = await import('@/lib/google-maps-loader');
    
    (global.window as any).google = { maps: { importLibrary: vi.fn() } };
    
    await loadGoogleMapsScript('KEY123');
    expect(global.document.getElementById).not.toHaveBeenCalled();
    expect(global.document.createElement).not.toHaveBeenCalled();
  });

  it('loadMapsLibrary caches promises and imports library', async () => {
    const { loadMapsLibrary } = await import('@/lib/google-maps-loader');
    
    const scriptObj: any = {};
    (global.document.createElement as any).mockReturnValue(scriptObj);
    
    const promise = loadMapsLibrary('KEY123', 'places');
    
    const mockLibrary = { PlacesService: {} };
    (global.window as any).google = { maps: { importLibrary: vi.fn().mockResolvedValue(mockLibrary) } };
    scriptObj.onload();
    
    const result = await promise;
    expect(result).toBe(mockLibrary);
    
    // Second call should return cached promise
    const promise2 = loadMapsLibrary('KEY123', 'places');
    expect(promise).toBe(promise2);
  });
});
