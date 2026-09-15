import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { looksOffline, payloadFor, queueFieldSubmission } from '@/lib/field-offline-client';

describe('Field Offline Client Lib', () => {
  let originalNavigator: any;
  let originalCrypto: any;
  let originalFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    originalNavigator = (global as any).navigator;
    originalCrypto = (global as any).crypto;
    originalFetch = (global as any).fetch;
    
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(global, 'crypto', { value: { randomUUID: () => '123-abc' }, writable: true, configurable: true });
    (global as any).fetch = vi.fn();
    
    (global as any).FormData = class FormData {
      data: Record<string, string>;
      constructor(form?: any) { 
        this.data = form?.mockData || {}; 
      }
      get(name: string) { return this.data[name] ?? null; }
      append(name: string, value: string) { this.data[name] = value; }
    };
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true });
    Object.defineProperty(global, 'crypto', { value: originalCrypto, writable: true, configurable: true });
    (global as any).fetch = originalFetch;
    delete (global as any).FormData;
  });

  describe('looksOffline', () => {
    it('returns false if online', () => {
      (global as any).navigator.onLine = true;
      expect(looksOffline()).toBe(false);
    });

    it('returns true if offline', () => {
      (global as any).navigator.onLine = false;
      expect(looksOffline()).toBe(true);
    });

    it('returns false if navigator undefined', () => {
      Object.defineProperty(global, 'navigator', { value: undefined, writable: true, configurable: true });
      expect(looksOffline()).toBe(false);
    });
  });

  describe('payloadFor', () => {
    it('extracts clock-in', () => {
      const form = { mockData: {} };
      expect(payloadFor('clock-in', form as any)).toEqual({});
    });

    it('extracts clock-out', () => {
      const form = { mockData: { description: 'done' } };
      expect(payloadFor('clock-out', form as any)).toEqual({ note: 'done' });
    });

    it('extracts time', () => {
      const form = { mockData: { description: 'worked', hours: '5.5' } };
      expect(payloadFor('time', form as any)).toEqual({ description: 'worked', hours: 5.5 });
    });

    it('extracts material', () => {
      const form = { mockData: { description: 'wood', amount: '100' } };
      expect(payloadFor('material', form as any)).toEqual({ description: 'wood', amount: 100 });
    });

    it('extracts note', () => {
      const form = { mockData: { body: 'hello', share: 'on' } };
      expect(payloadFor('note', form as any)).toEqual({ body: 'hello', share: true });
    });
  });

  describe('queueFieldSubmission', () => {
    it('returns queued for 202', async () => {
      (global as any).fetch.mockResolvedValue({ status: 202 });
      const res = await queueFieldSubmission('clock-in', 'job1', {});
      expect(res).toEqual({ state: 'queued' });
      
      const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
      expect(body.key).toBe('123-abc');
      expect(body.kind).toBe('clock-in');
    });

    it('generates fallback key if crypto not available', async () => {
      delete (global as any).crypto;
      (global as any).fetch.mockResolvedValue({ status: 202 });
      await queueFieldSubmission('clock-in', 'job1', {});
      
      const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
      expect(body.key).toMatch(/^k[a-z0-9]+-[a-z0-9]+$/);
    });

    it('returns sent for 200', async () => {
      (global as any).fetch.mockResolvedValue({ status: 200, ok: true });
      const res = await queueFieldSubmission('clock-in', 'job1', {});
      expect(res).toEqual({ state: 'sent' });
    });

    it('returns failed for 400', async () => {
      (global as any).fetch.mockResolvedValue({ status: 400, ok: false, json: () => Promise.resolve({ error: 'bad' }) });
      const res = await queueFieldSubmission('clock-in', 'job1', {});
      expect(res).toEqual({ state: 'failed', message: 'bad' });
    });

    it('returns failed on fetch exception (no sw)', async () => {
      (global as any).fetch.mockRejectedValue(new Error('network'));
      const res = await queueFieldSubmission('clock-in', 'job1', {});
      expect(res.state).toBe('failed');
      expect((res as any).message).toContain('You’re offline');
    });
  });
});
