'use client';

import pageStyles from './clients-page.module.css';

export const OPEN_ADD_CLIENT_EVENT = 'lgq:open-add-client';

export default function ClientHeaderActions({ basePath: _basePath }: { basePath?: string }) {
  return (
    <button
      type="button"
      className={pageStyles.addCustomerBtn}
      onClick={() => window.dispatchEvent(new Event(OPEN_ADD_CLIENT_EVENT))}
    >
      + Add customer
    </button>
  );
}
