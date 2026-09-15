import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackDemoEvent, getDemoSessionEvents } from '@/lib/demo-analytics';

describe('Demo Analytics Lib', () => {
  let mockSessionStorage: Record<string, string> = {};
  let originalWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage = {};
    
    const mockStorage = {
      getItem: vi.fn((key) => mockSessionStorage[key] || null),
      setItem: vi.fn((key, value) => { mockSessionStorage[key] = value; }),
    };

    originalWindow = (global as any).window;
    (global as any).window = {
      innerWidth: 1024,
      location: { pathname: '/test' },
      dispatchEvent: vi.fn(),
      sessionStorage: mockStorage,
    };
    
    (global as any).sessionStorage = mockStorage;
    Object.defineProperty(global, 'navigator', { value: { sendBeacon: vi.fn() }, writable: true, configurable: true });
    (global as any).fetch = vi.fn().mockResolvedValue({});
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    delete (global as any).sessionStorage;
    delete (global as any).navigator;
    delete (global as any).fetch;
  });

  describe('trackDemoEvent', () => {
    it('does nothing if window is undefined', () => {
      delete (global as any).window;
      trackDemoEvent('tour_started');
      expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('creates a session id, saves event to sessionStorage and fetches', () => {
      trackDemoEvent('tour_started', { tourKey: 'my_tour' });

      expect(mockSessionStorage['lgq_demo_session_id']).toBeTruthy();
      
      const events = JSON.parse(mockSessionStorage['lgq_demo_tour_events']);
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('tour_started');
      expect(events[0].tourKey).toBe('my_tour');
      expect(events[0].device_type).toBe('tablet'); // 1024 width

      expect((global as any).fetch).toHaveBeenCalledWith('/api/demo-tour/events', expect.any(Object));
      
      const fetchCall = (global as any).fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.event_type).toBe('tour_started');
      expect(body.tour_key).toBe('my_tour');
      expect(body.anonymous_session_id).toBeTruthy();
    });

    it('uses beacon for exit events if available', () => {
      trackDemoEvent('tour_exited', { stepId: 'step_1' });
      
      expect((global as any).navigator.sendBeacon).toHaveBeenCalledWith('/api/demo-tour/events', expect.any(String));
      expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('handles missing beacon gracefully', () => {
      delete (global as any).navigator.sendBeacon;
      trackDemoEvent('tour_exited', { stepId: 'step_1' });
      expect((global as any).fetch).toHaveBeenCalled();
    });

    it('catches and ignores storage errors', () => {
      (global as any).sessionStorage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
      expect(() => trackDemoEvent('tour_started')).not.toThrow();
    });
    
    it('sets deviceType correctly based on window width', () => {
      (global as any).window.innerWidth = 500;
      trackDemoEvent('tour_started');
      const events = JSON.parse(mockSessionStorage['lgq_demo_tour_events']);
      expect(events[0].device_type).toBe('mobile');
      
      (global as any).window.innerWidth = 1500;
      trackDemoEvent('step_viewed');
      const events2 = JSON.parse(mockSessionStorage['lgq_demo_tour_events']);
      expect(events2[1].device_type).toBe('desktop');
    });
  });

  describe('getDemoSessionEvents', () => {
    it('returns empty array if window is undefined', () => {
      delete (global as any).window;
      expect(getDemoSessionEvents()).toEqual([]);
    });

    it('returns empty array if nothing in storage', () => {
      expect(getDemoSessionEvents()).toEqual([]);
    });

    it('returns parsed events from storage', () => {
      mockSessionStorage['lgq_demo_tour_events'] = JSON.stringify([{ event: 'test' }]);
      expect(getDemoSessionEvents()).toEqual([{ event: 'test' }]);
    });
    
    it('handles parse error', () => {
      mockSessionStorage['lgq_demo_tour_events'] = 'invalid json';
      expect(getDemoSessionEvents()).toEqual([]);
    });
  });
});
