'use client';

type Row = { name: string; roleLabel: string | null; hours: number; pay: number; jobCount: number };

// Client-side CSV download of the current period's payroll rows — no round-trip,
// so owners can paste straight into their payroll system.
export default function PayrollExport({ rows, label }: { rows: Row[]; label: string }) {
  function download() {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = ['Crew member', 'Role', 'Hours', 'Pay', 'Jobs'];
    const lines = [
      header,
      ...rows.map((row) => [row.name, row.roleLabel ?? '', row.hours, row.pay, row.jobCount]),
    ];
    const csv = lines.map((cols) => cols.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payroll-${label.toLowerCase().replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn secondary" onClick={download} disabled={rows.length === 0}>
      Download CSV
    </button>
  );
}
