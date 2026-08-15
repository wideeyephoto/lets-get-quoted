'use client';

import Link from 'next/link';

export const OPEN_ADD_CLIENT_EVENT = 'lgq:open-add-client';

export default function ClientHeaderActions({ basePath }: { basePath: string }) {
  return (
    <>
      <Link href={`${basePath}/clients/import`} className="btn secondary">Import</Link>
      <button
        type="button"
        className="btn primary"
        onClick={() => window.dispatchEvent(new Event(OPEN_ADD_CLIENT_EVENT))}
      >
        + Add customer
      </button>
    </>
  );
}
