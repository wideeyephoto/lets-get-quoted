import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { buildClientsCsv, buildInvoicesCsv, buildJobsCsv, buildServicesCsv } from '@/lib/data-export';
import { EXPORT_SETS, exportArchiveName, parseExportSets, type ExportSetId } from '@/lib/data-export-sets';
import { zipText } from '@/lib/zip';

const BUILDERS: Record<ExportSetId, typeof buildClientsCsv> = {
  clients: buildClientsCsv,
  services: buildServicesCsv,
  jobs: buildJobsCsv,
  invoices: buildInvoicesCsv,
};

/**
 * Everything the owner picked, as one archive.
 *
 * One file rather than four downloads: a button that fires four gets two of
 * them blocked by the browser's popup rules and the contractor never learns
 * which two. The CSVs inside are byte-identical to the single-file routes, so
 * the "anything you export can be re-imported as-is" promise still holds.
 */
export async function GET(request: Request) {
  const { supabase, accountId } = await requireOwnerContext();
  const sets = parseExportSets(new URL(request.url).searchParams.get('sets'));

  // Sequential rather than parallel: four full-table reads at once on a big
  // account is a spike for a file somebody is going to open once.
  const files: { name: string; text: string }[] = [];
  for (const id of sets) {
    const set = EXPORT_SETS.find((candidate) => candidate.id === id);
    if (!set) continue;
    files.push({ name: set.filename, text: await BUILDERS[id](supabase, accountId) });
  }

  const now = new Date();
  const archive = zipText(files, now);
  return new NextResponse(Buffer.from(archive), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportArchiveName(now.toISOString().slice(0, 10))}"`,
      'Content-Length': String(archive.length),
      // It is a snapshot of live data — a cached copy is a stale copy.
      'Cache-Control': 'no-store',
    },
  });
}
