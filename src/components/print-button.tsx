'use client';

export default function PrintButton({ label = '🖨 Print / Save PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn secondary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
