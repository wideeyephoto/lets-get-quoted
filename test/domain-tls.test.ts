import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connect, checkServerIdentity } from 'node:tls';
import { lookup } from 'node:dns/promises';
import { checkDomainTls } from '@/lib/domain-tls';

vi.mock('node:tls', async (original) => ({ ...await original<typeof import('node:tls')>(), connect: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
let socket: EventEmitter & { authorized: boolean; destroy: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(connect).mockReset();
  socket = Object.assign(new EventEmitter(), { authorized: true, destroy: vi.fn() });
  vi.mocked(connect).mockReturnValue(socket as unknown as ReturnType<typeof connect>);
});
afterEach(() => vi.useRealTimers());

async function runLookup(addresses: Array<{ address: string; family: number }>) {
  vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<import('node:dns').LookupAddress[]>).mockResolvedValue(addresses);
  const pending = checkDomainTls('www.contractor.com');
  const options = vi.mocked(connect).mock.calls[0][0] as import('node:tls').ConnectionOptions;
  const callback = vi.fn();
  options.lookup!('www.contractor.com', { all: true }, callback);
  await Promise.resolve();
  await Promise.resolve();
  socket.emit('error', new Error('stop probe'));
  await pending;
  return callback;
}

describe('custom-domain TLS handshake', () => {
  it('uses the actual domain as SNI and enforces trust and hostname verification', async () => {
    const pending = checkDomainTls('www.contractor.com');
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: 'www.contractor.com', servername: 'www.contractor.com', port: 443, rejectUnauthorized: true, checkServerIdentity }));
    socket.emit('secureConnect');
    expect(await pending).toBe(true);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('rejects an unauthorized certificate', async () => {
    socket.authorized = false;
    const pending = checkDomainTls('www.contractor.com');
    socket.emit('secureConnect');
    expect(await pending).toBe(false);
  });

  it.each(['ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'ECONNRESET'])('keeps %s pending', async (code) => {
    const pending = checkDomainTls('www.contractor.com');
    socket.emit('error', Object.assign(new Error(code), { code }));
    expect(await pending).toBe(false);
  });

  it('bounds stalled handshakes and DNS lookups', async () => {
    const pending = checkDomainTls('www.contractor.com');
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBe(false);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it.each(['127.0.0.1', '169.254.169.254', '10.0.0.1', '::1', '::ffff:7f00:1', '64:ff9b::a00:1'])('blocks restricted DNS answer %s at socket lookup', async (address) => {
    const callback = await runLookup([{ address, family: address.includes(':') ? 6 : 4 }]);
    expect(callback).toHaveBeenCalledWith(expect.any(Error), '');
  });

  it('rejects mixed public/private answers', async () => {
    const callback = await runLookup([{ address: '76.76.21.21', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    expect(callback).toHaveBeenCalledWith(expect.any(Error), '');
  });

  it('returns only the already-validated addresses to the socket', async () => {
    const addresses = [{ address: '76.76.21.21', family: 4 }];
    const callback = await runLookup(addresses);
    expect(callback).toHaveBeenCalledWith(null, addresses);
  });

  it.each(['127.0.0.1', 'localhost', 'user@contractor.com', 'contractor.com:8443'])('refuses non-domain probe input %s', async (domain) => {
    expect(await checkDomainTls(domain)).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });
});
