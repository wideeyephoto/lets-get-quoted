import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import * as smartImportModule from '@/lib/smart-import';
import * as smartImportAiModule from '@/lib/smart-import-ai';

vi.mock('@/lib/smart-import', async (importOriginal) => ({
  ...(await importOriginal<typeof smartImportModule>()),
  parseTable: vi.fn(),
  deterministicGenericMapping: vi.fn(),
  positionalGenericMapping: vi.fn(),
  applyGenericMapping: vi.fn(),
  columnLabels: vi.fn(),
  sanitizeSources: vi.fn((s) => s),
}));

vi.mock('@/lib/smart-import-ai', () => ({
  aiDetectGenericColumns: vi.fn(),
}));

describe('Smart Import Run Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runAnalyze', () => {
    it('returns empty error if text is empty', async () => {
      const res = await runAnalyze('   ', [], 'entity');
      expect(res).toEqual({ ok: false, error: 'empty' });
    });

    it('returns norows error if grid empty', async () => {
      (smartImportModule.parseTable as any).mockReturnValue([]);
      const res = await runAnalyze('text', [], 'entity');
      expect(res).toEqual({ ok: false, error: 'norows' });
    });

    it('uses deterministic mapping if available', async () => {
      (smartImportModule.parseTable as any).mockReturnValue([['a']]);
      (smartImportModule.deterministicGenericMapping as any).mockReturnValue({ hasHeader: true, sources: {} });
      (smartImportModule.applyGenericMapping as any).mockReturnValue([{ a: 1 }]);
      (smartImportModule.columnLabels as any).mockReturnValue(['a']);

      const res = await runAnalyze('text', [], 'entity');
      
      expect(res).toEqual({
        ok: true,
        usedAi: false,
        hasHeader: true,
        sources: {},
        columnLabels: ['a'],
        sampleRows: [{ a: 1 }],
        totalRows: 1
      });
      expect(smartImportAiModule.aiDetectGenericColumns).not.toHaveBeenCalled();
    });

    it('falls back to ai mapping', async () => {
      (smartImportModule.parseTable as any).mockReturnValue([['a']]);
      (smartImportModule.deterministicGenericMapping as any).mockReturnValue(null);
      (smartImportAiModule.aiDetectGenericColumns as any).mockResolvedValue({ hasHeader: true, sources: {} });
      (smartImportModule.applyGenericMapping as any).mockReturnValue([{ a: 1 }]);
      (smartImportModule.columnLabels as any).mockReturnValue(['a']);

      const res = await runAnalyze('text', [], 'entity');
      
      expect(res).toEqual({
        ok: true,
        usedAi: true,
        hasHeader: true,
        sources: {},
        columnLabels: ['a'],
        sampleRows: [{ a: 1 }],
        totalRows: 1
      });
    });

    it('falls back to positional mapping if ai fails', async () => {
      (smartImportModule.parseTable as any).mockReturnValue([['a']]);
      (smartImportModule.deterministicGenericMapping as any).mockReturnValue(null);
      (smartImportAiModule.aiDetectGenericColumns as any).mockResolvedValue(null);
      (smartImportModule.positionalGenericMapping as any).mockReturnValue({ hasHeader: false, sources: {} });
      (smartImportModule.applyGenericMapping as any).mockReturnValue([{ a: 1 }]);
      (smartImportModule.columnLabels as any).mockReturnValue(['a']);

      const res = await runAnalyze('text', [], 'entity');
      
      expect(res).toEqual({
        ok: true,
        usedAi: false,
        hasHeader: false,
        sources: {},
        columnLabels: ['a'],
        sampleRows: [{ a: 1 }],
        totalRows: 1
      });
    });

    it('returns norows error if applied mapping yields no rows', async () => {
      (smartImportModule.parseTable as any).mockReturnValue([['a']]);
      (smartImportModule.deterministicGenericMapping as any).mockReturnValue({ hasHeader: true, sources: {} });
      (smartImportModule.applyGenericMapping as any).mockReturnValue([]); // no output rows

      const res = await runAnalyze('text', [], 'entity');
      expect(res).toEqual({ ok: false, error: 'norows' });
    });
  });

  describe('runApply', () => {
    it('applies mapping', () => {
      (smartImportModule.parseTable as any).mockReturnValue([['a']]);
      (smartImportModule.applyGenericMapping as any).mockReturnValue([{ a: 1 }]);

      const res = runApply('text', [], {}, true);
      expect(res).toEqual([{ a: 1 }]);
      expect(smartImportModule.parseTable).toHaveBeenCalledWith('text');
      expect(smartImportModule.applyGenericMapping).toHaveBeenCalledWith(
        [['a']],
        [],
        { hasHeader: true, sources: {} }
      );
    });
  });
});
