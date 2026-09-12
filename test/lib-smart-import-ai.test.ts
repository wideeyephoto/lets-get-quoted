import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiDetectGenericColumns } from '@/lib/smart-import-ai';
import * as aiModelCallModule from '@/lib/ai-model-call';

vi.mock('@/lib/ai-model-call', () => ({
  callModel: vi.fn(),
}));

describe('Smart Import AI Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test_key';
  });

  it('returns null if no api key', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await aiDetectGenericColumns([['a']], [], 'contacts');
    expect(res).toBeNull();
  });

  it('returns null if grid empty', async () => {
    const res = await aiDetectGenericColumns([], [], 'contacts');
    expect(res).toBeNull();
  });

  it('returns null if width is 0', async () => {
    const res = await aiDetectGenericColumns([[]], [], 'contacts');
    expect(res).toBeNull();
  });

  it('returns null if fetch fails', async () => {
    (aiModelCallModule.callModel as any).mockResolvedValue({ ok: false, status: 500 });
    const res = await aiDetectGenericColumns([['Name']], [{ key: 'name', hint: 'Full Name', required: true }], 'contacts');
    expect(res).toBeNull();
  });

  it('parses valid output and returns mapping', async () => {
    (aiModelCallModule.callModel as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          has_header: true,
          columns: {
            name: [0],
            phone: [1]
          }
        })
      })
    });

    const res = await aiDetectGenericColumns(
      [['Name', 'Phone'], ['John', '555-1234']],
      [
        { key: 'name', hint: 'Full Name', required: true },
        { key: 'phone', hint: 'Phone', required: false }
      ],
      'contacts'
    );

    expect(res).not.toBeNull();
    expect(res?.hasHeader).toBe(true);
    expect(res?.sources).toEqual({ name: [0], phone: [1] });
  });

  it('filters invalid indices', async () => {
    (aiModelCallModule.callModel as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          has_header: false,
          columns: {
            name: [0, 99, -1, 1.5, "2"] // only 0 is valid for width 1
          }
        })
      })
    });

    // Width = 1 (grid is [['John']])
    const res = await aiDetectGenericColumns(
      [['John']],
      [{ key: 'name', hint: 'Name', required: true }],
      'contacts'
    );

    expect(res?.sources).toEqual({ name: [0] });
  });

  it('returns null if required fields not met', async () => {
    (aiModelCallModule.callModel as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          has_header: true,
          columns: { name: [] } // Required field missing
        })
      })
    });

    const res = await aiDetectGenericColumns(
      [['Name']],
      [{ key: 'name', hint: 'Full Name', required: true }],
      'contacts'
    );

    expect(res).toBeNull();
  });
});
