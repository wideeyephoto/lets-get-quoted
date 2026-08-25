import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, processPages } from '@/lib/pagination';

describe('fetchAllPages', () => {
  it('returns all items when results fit in a single page', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const queryRunner = vi.fn().mockResolvedValue({ data: items, error: null });

    const result = await fetchAllPages<{ id: number }>(queryRunner, 10);

    expect(result).toEqual(items);
    expect(queryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunner).toHaveBeenCalledWith(0, 9);
  });

  it('iterates through multiple pages until the last page has fewer than pageSize items', async () => {
    const page1 = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const page2 = Array.from({ length: 5 }, (_, i) => ({ id: i + 6 }));
    const page3 = [{ id: 11 }, { id: 12 }]; // partial page => done

    const queryRunner = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })
      .mockResolvedValueOnce({ data: page3, error: null });

    const result = await fetchAllPages<{ id: number }>(queryRunner, 5);

    expect(result).toHaveLength(12);
    expect(result[0].id).toBe(1);
    expect(result[11].id).toBe(12);
    expect(queryRunner).toHaveBeenCalledTimes(3);
    expect(queryRunner).toHaveBeenNthCalledWith(1, 0, 4);
    expect(queryRunner).toHaveBeenNthCalledWith(2, 5, 9);
    expect(queryRunner).toHaveBeenNthCalledWith(3, 10, 14);
  });

  it('handles empty results cleanly', async () => {
    const queryRunner = vi.fn().mockResolvedValue({ data: [], error: null });

    const result = await fetchAllPages<{ id: number }>(queryRunner, 100);

    expect(result).toEqual([]);
    expect(queryRunner).toHaveBeenCalledTimes(1);
  });

  it('propagates query errors', async () => {
    const queryRunner = vi.fn().mockResolvedValue({ data: null, error: new Error('DB Connection Failed') });

    await expect(fetchAllPages<{ id: number }>(queryRunner, 100)).rejects.toThrow('DB Connection Failed');
  });
});

describe('processPages', () => {
  it('streams batches sequentially through callback', async () => {
    const page1 = [{ id: 1 }, { id: 2 }];
    const page2 = [{ id: 3 }];

    const queryRunner = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const processedBatches: { batch: { id: number }[]; pageIndex: number }[] = [];
    const total = await processPages<{ id: number }>(
      queryRunner,
      (batch, pageIndex) => {
        processedBatches.push({ batch, pageIndex });
      },
      2,
    );

    expect(total).toBe(3);
    expect(processedBatches).toHaveLength(2);
    expect(processedBatches[0]).toEqual({ batch: page1, pageIndex: 0 });
    expect(processedBatches[1]).toEqual({ batch: page2, pageIndex: 1 });
  });
});
