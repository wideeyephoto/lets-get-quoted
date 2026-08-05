'use client';

import SaveButton from '@/components/save-button';
import ModalDialog, { CloseOnSuccess } from '@/components/modal-dialog';
import { formatPhoneDashes } from '@/lib/phone';

// The one thing the context rail was missing: a way to act on what it told you.
//
// Only the name is asked for. Everything else about a customer — email,
// address, notes — can be filled in later from their profile, and asking for it
// here turns "who is this" into a form you abandon halfway through a text.
export default function AddAsCustomer({
  phone,
  action,
}: {
  phone: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <ModalDialog triggerLabel="Add as customer" triggerClassName="btn secondary" title="Add as customer">
      <form action={action} className="cash-bill-form">
        <p className="cash-bill-form-head">{formatPhoneDashes(phone)}</p>
        <label className="cash-bill-field wide">
          <span>Their name</span>
          <input name="name" autoComplete="off" placeholder="e.g. Dana Whitfield" required maxLength={160} autoFocus />
          <small className="cash-bill-note">
            Saves them against this number, so the thread, their jobs and their invoices all line up
            from here on.
          </small>
        </label>
        <div className="cash-bill-form-actions">
          <SaveButton className="btn primary" pendingLabel="Adding…">Add customer</SaveButton>
          <CloseOnSuccess />
        </div>
      </form>
    </ModalDialog>
  );
}
