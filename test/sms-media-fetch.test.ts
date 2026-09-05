import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSmsMedia, SmsMediaBlockedError } from '@/lib/sms-media-fetch';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), status: 200, body: 'photo', all: false }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = 200;
  mocks.all = false;
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.request.mockImplementation((url: URL, options: RequestOptions, receive: (res: IncomingMessage) => void) => {
    const req = new EventEmitter();
    Object.assign(req, { end() {
      options.lookup!(url.hostname, { all: mocks.all }, (error) => {
        if (error) { req.emit('error', error); return; }
        const res = Object.assign(Readable.from([Buffer.from(mocks.body)]), {
          statusCode: mocks.status, headers: { 'content-type': 'image/jpeg', location: 'https://127.0.0.1/private' },
        });
        receive(res as unknown as IncomingMessage);
      });
    } });
    return req;
  });
});
const fetchMedia = () => fetchSmsMedia('https://cdn.example/photo', { signal: AbortSignal.timeout(1000) });

describe('DNS-bound MMS transport', () => {
  it.each([
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '169.254.169.254', family: 4 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: '::ffff:7f00:1', family: 6 }],
    [{ address: 'fc00::1', family: 6 }],
  ])('rejects DNS answers containing restricted addresses: %j', async (...addresses) => {
    mocks.lookup.mockResolvedValue(addresses);
    await expect(fetchMedia()).rejects.toBeInstanceOf(SmsMediaBlockedError);
  });
  it.each([false, true])('uses only checked DNS results for the socket (all=%s)', async (all) => {
    mocks.all = all;
    expect(await (await fetchMedia()).text()).toBe('photo');
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][1].agent).toBe(false);
  });
  it('returns redirects to the route without following them', async () => {
    mocks.status = 302;
    const response = await fetchMedia();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://127.0.0.1/private');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('blocks restricted literal IPs before opening a socket', async () => {
    await expect(fetchSmsMedia('https://[::ffff:127.0.0.1]/photo', { signal: AbortSignal.timeout(1000) })).rejects.toBeInstanceOf(SmsMediaBlockedError);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rejects invalid upstream status codes without throwing from a response callback', async () => {
    mocks.status = 600;
    await expect(fetchMedia()).rejects.toThrow('Invalid media response status.');
  });
});
