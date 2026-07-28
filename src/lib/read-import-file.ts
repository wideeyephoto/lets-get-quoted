import { gridToCsv, vcardsToCsv } from './import-formats';

// Turn any supported upload into CSV text for the smart-import pipeline, so the
// server side only ever deals with one format. Runs in the browser:
//   .vcf        -> parsed to name/phone/email/address
//   .xlsx/.xls  -> read into a grid (reader dynamically imported so it never
//                  ships in the main bundle) and serialized to CSV
//   everything else -> treated as delimited text and passed straight through.
export async function readImportFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.vcf') || file.type === 'text/vcard') {
    return vcardsToCsv(await file.text());
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const readXlsxFile = (await import('read-excel-file')).default;
    const rows = await readXlsxFile(file);
    return gridToCsv(rows.map((row) => row.map(cellToString)));
  }

  return file.text();
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10); // date cells -> YYYY-MM-DD
  return String(cell);
}
