import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/v1/openapi.json/route';

vi.mock('@/lib/public-api/openapi-spec', () => ({
  getOpenApiSpec: vi.fn().mockReturnValue({ spec: 'foo' }),
}));

describe('V1 OpenAPI JSON Route', () => {
  it('returns spec', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.spec).toBe('foo');
  });
});
