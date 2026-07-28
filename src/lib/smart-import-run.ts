// Server-side orchestration shared by every entity's import actions: turn raw
// text into a preview (rule-based -> AI -> positional), and re-apply an edited
// mapping without any AI. Not a 'use server' module itself — it's called from
// the entity action files, which are.
import {
  parseTable,
  columnLabels,
  applyGenericMapping,
  deterministicGenericMapping,
  positionalGenericMapping,
  sanitizeSources,
  type ImportField,
  type FieldSources,
  type SmartMapping,
  type SmartImportPreview,
  type MappedRow,
} from '@/lib/smart-import';
import { aiDetectGenericColumns } from '@/lib/smart-import-ai';

export async function runAnalyze(text: string, fields: ImportField[], entity: string): Promise<SmartImportPreview> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const grid = parseTable(trimmed);
  if (grid.length === 0) return { ok: false, error: 'norows' };

  let usedAi = false;
  let mapping: SmartMapping | null = deterministicGenericMapping(grid, fields);
  if (!mapping) {
    mapping = await aiDetectGenericColumns(grid, fields, entity);
    if (mapping) usedAi = true;
  }
  if (!mapping) mapping = positionalGenericMapping(grid, fields);

  const rows = applyGenericMapping(grid, fields, mapping);
  if (rows.length === 0) return { ok: false, error: 'norows' };

  return {
    ok: true,
    usedAi,
    hasHeader: mapping.hasHeader,
    sources: mapping.sources,
    columnLabels: columnLabels(grid, mapping.hasHeader),
    sampleRows: rows.slice(0, 6),
    totalRows: rows.length,
  };
}

// Re-apply an (optionally user-edited) mapping — no AI. Source of truth for both
// the live preview and commit.
export function runApply(text: string, fields: ImportField[], sources: FieldSources, hasHeader: boolean): MappedRow[] {
  const grid = parseTable((text ?? '').trim());
  const width = grid.reduce((max, r) => Math.max(max, r.length), 0);
  return applyGenericMapping(grid, fields, { hasHeader, sources: sanitizeSources(sources, fields, width) });
}
