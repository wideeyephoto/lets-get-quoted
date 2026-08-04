'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import ModalDialog from '@/components/modal-dialog';
import { CloseOnSuccess } from '@/components/modal-dialog';

// Starting a conversation with somebody who hasn't texted first.
//
// The inbox could only ever reply. Everything else in the product sends texts —
// quotes, reminders, arrival — but there was no way to just message a customer
// you already have, which is what a contractor does twenty times a day.
//
// Picking from the contacts we already know beats typing a number: the numbers
// on file are the ones with consent behind them, and a typo sends a stranger a
// text signed with the contractor's business name.

type Contact = { phone: string; name: string };

export default function ComposeMessage({
  contacts,
  action,
}: {
  contacts: Contact[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [phone, setPhone] = useState('');

  return (
    <ModalDialog triggerLabel="New message" triggerClassName="btn primary" title="New message">
      <form action={action} className="cash-bill-form">
        <p className="cash-bill-form-head">Text a customer</p>

        {contacts.length > 0 ? (
          <label className="cash-bill-field wide">
            <span>Who</span>
            <select value={phone} onChange={(event) => setPhone(event.target.value)}>
              <option value="">Pick a customer…</option>
              {contacts.map((contact) => (
                <option key={contact.phone} value={contact.phone}>
                  {contact.name} · {contact.phone}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="cash-bill-field wide">
          <span>{contacts.length > 0 ? 'Or type a number' : 'Mobile number'}</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(248) 555-0100"
            required
          />
          {/* Said before they send, not after it bounces. */}
          <small className="cash-bill-note">
            Only text people who gave you their number. Anyone who has replied STOP can&rsquo;t be
            messaged until they text START.
          </small>
        </label>

        <label className="cash-bill-field wide">
          <span>Message</span>
          <textarea name="body" rows={4} placeholder="Hi — quick update on your job…" required />
        </label>

        <div className="cash-bill-form-actions">
          <SaveButton className="btn primary" pendingLabel="Sending…">Send text</SaveButton>
          <CloseOnSuccess />
        </div>
      </form>
    </ModalDialog>
  );
}
