import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { addDomainToVercel, getProjectDomain, getVercelDomainConfig, verifyVercelDomain, removeDomainFromVercel } from '@/lib/vercel-domains';

const request = vi.fn();
const domain = 'www.contractor.com';
const binding = { name: domain, apexName: 'contractor.com', projectId: 'prj_test', verified: true };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv('VERCEL_AUTH_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test');
  vi.stubEnv('VERCEL_TEAM_ID', 'team_test');
  vi.stubGlobal('fetch', request);
  request.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Vercel domains API', () => {
  it('attaches a missing domain to the scoped project', async () => {
    request.mockResolvedValueOnce(response({}, 404)).mockResolvedValueOnce(response(binding));
    expect(await addDomainToVercel(domain)).toEqual(binding);
    const [url, options] = request.mock.calls[1];
    expect(String(url)).toBe('https://api.vercel.com/v10/projects/prj_test/domains?teamId=team_test');
    expect(options).toMatchObject({ method: 'POST', body: JSON.stringify({ name: domain }), cache: 'no-store' });
  });

  it('reuses an existing binding without duplicate registration', async () => {
    request.mockResolvedValue(response(binding));
    expect(await addDomainToVercel(domain)).toEqual(binding);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent attachment only when the project binding actually exists', async () => {
    request.mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ error: { code: 'domain_already_in_use' } }, 400))
      .mockResolvedValueOnce(response(binding));
    expect(await addDomainToVercel(domain)).toEqual(binding);
  });

  it('surfaces rejected attachment instead of treating an error body as success', async () => {
    request.mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ error: { code: 'forbidden' } }, 403))
      .mockResolvedValueOnce(response({}, 404));
    await expect(addDomainToVercel(domain)).rejects.toThrow('403');
  });

  it('does not register when the initial lookup fails authorization', async () => {
    request.mockResolvedValue(response({}, 401));
    await expect(addDomainToVercel(domain)).rejects.toThrow('401');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('surfaces verify errors and rejects malformed project responses', async () => {
    request.mockResolvedValueOnce(response({}, 500));
    await expect(verifyVercelDomain(domain)).rejects.toThrow('500');
    request.mockResolvedValueOnce(response({ name: domain }));
    await expect(getProjectDomain(domain)).rejects.toThrow('Invalid project domain response');
  });

  it('parses documented DNS recommendations without inventing SSL status', async () => {
    request.mockResolvedValue(response({
      misconfigured: false,
      recommendedCNAME: [{ rank: 2, value: 'old.vercel-dns.com.' }, { rank: 1, value: 'new.vercel-dns.com.' }],
      recommendedIPv4: [{ rank: 1, value: ['216.198.79.1'] }],
    }));
    expect(await getVercelDomainConfig(domain)).toEqual({ configured: true, misconfigured: false, recommendedCname: 'new.vercel-dns.com', recommendedIp: '216.198.79.1' });
    expect(String(request.mock.calls[0][0])).toContain('projectIdOrName=prj_test&teamId=team_test');
  });

  it('fails closed when the DNS response omits misconfigured', async () => {
    request.mockResolvedValue(response({}));
    expect(await getVercelDomainConfig(domain)).toMatchObject({ configured: false, misconfigured: true });
  });

  it('treats a removed domain as successful idempotent cleanup', async () => {
    request.mockResolvedValue(response({}, 404));
    expect(await removeDomainFromVercel(domain)).toBe(true);
  });
});
