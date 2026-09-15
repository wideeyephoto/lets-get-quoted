import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiDetectColumns } from '@/lib/client-import-ai';

vi.mock('@/lib/ai-model-call', () => ({
  callModel: vi.fn(),
}));

describe('Client Import AI Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test_key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('aiDetectColumns', () => {
    it('returns null if no api key', async () => {
      vi.unstubAllEnvs();
      const res = await aiDetectColumns([['a', 'b']]);
      expect(res).toBeNull();
    });

    it('returns null if empty grid', async () => {
      const res = await aiDetectColumns([]);
      expect(res).toBeNull();
    });

    it('returns null on fetch error', async () => {
      const callModelMock = (await import('@/lib/ai-model-call')).callModel;
      (callModelMock as any).mockResolvedValue({ ok: false, status: 500 });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await aiDetectColumns([['First Name', 'Phone'], ['John', '555']]);
      expect(res).toBeNull();
      consoleSpy.mockRestore();
    });

    it('parses valid json output', async () => {
      const callModelMock = (await import('@/lib/ai-model-call')).callModel;
      const jsonResponse = {
        has_header: true,
        columns: {
          name: [0, 1],
          phone: [2],
          email: [],
          address: [3, 4]
        }
      };
      
      (callModelMock as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ output_text: JSON.stringify(jsonResponse) })
      });

      const grid = [
        ['First', 'Last', 'Phone', 'City', 'State'],
        ['J', 'D', '123', 'NY', 'NY']
      ];
      const res = await aiDetectColumns(grid);
      
      expect(res).not.toBeNull();
      expect(res?.hasHeader).toBe(true);
      expect(res?.sources.name).toEqual([0, 1]);
      expect(res?.sources.phone).toEqual([2]);
      expect(res?.sources.email).toEqual([]);
      expect(res?.sources.address).toEqual([3, 4]);
    });

    it('handles nested output format', async () => {
      const callModelMock = (await import('@/lib/ai-model-call')).callModel;
      const jsonResponse = { has_header: false, columns: { phone: [0] } };
      
      (callModelMock as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(jsonResponse) }] }]
        })
      });

      const grid = [['555-1234']];
      const res = await aiDetectColumns(grid);
      
      expect(res?.hasHeader).toBe(false);
      expect(res?.sources.phone).toEqual([0]);
    });

    it('filters out invalid indices', async () => {
      const callModelMock = (await import('@/lib/ai-model-call')).callModel;
      const jsonResponse = { has_header: false, columns: { phone: [0, 99, -1, 'bad'] } };
      
      (callModelMock as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ output_text: JSON.stringify(jsonResponse) })
      });

      const grid = [['555-1234']]; // width = 1
      const res = await aiDetectColumns(grid);
      
      expect(res?.sources.phone).toEqual([0]); // Only 0 is valid (0 <= i < 1)
    });

    it('returns null if no fields mapped', async () => {
      const callModelMock = (await import('@/lib/ai-model-call')).callModel;
      const jsonResponse = { has_header: false, columns: { address: [0] } }; // address alone is not enough
      
      (callModelMock as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ output_text: JSON.stringify(jsonResponse) })
      });

      const grid = [['123 Main St']];
      const res = await aiDetectColumns(grid);
      
      expect(res).toBeNull();
    });
  });
});
