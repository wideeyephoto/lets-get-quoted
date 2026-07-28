// Minimal ambient types for read-excel-file (the package ships none). We only use
// the browser default export: read the first sheet of an uploaded file into a
// grid of cells.
declare module 'read-excel-file' {
  type Cell = string | number | boolean | Date | null;
  type Row = Cell[];
  export default function readXlsxFile(
    file: File | Blob,
    options?: { sheet?: number | string },
  ): Promise<Row[]>;
}
