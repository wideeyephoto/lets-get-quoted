'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import ModalDialog from '@/components/modal-dialog';
import { CloseOnSuccess } from '@/components/modal-dialog';
import PersistentMessageIntent from './PersistentMessageIntent';

// Starting a conversation with somebody who hasn't texted first.
//
// The inbox could only ever reply. Everything else in the product sends texts —
// quotes, reminders, arrival — but there was no way to just message a customer
// you already have, which is what a contractor does twenty times a day.
//
// Picking from the current consent ledger beats typing a number: a lead/job
// phone is not permission, and a typo could send a stranger a contractor-
// branded text. The server rechecks consent atomically at enqueue time.

type Contact = { phone: string; name: string };

export default function ComposeMessage({
  contacts,
  action,
  fallbackIntentId,
  intentStorageKey,
  resetToken,
  availableCredits,
}: {
  contacts: Contact[];
  action: (formData: FormData) => void | Promise<void>;
  fallbackIntentId: string;
  intentStorageKey: string;
  resetToken?: string | null;
  availableCredits?: number | null;
}) {
  const [phone, setPhone] = useState('');

  return (
    <ModalDialog triggerLabel="New message" triggerClassName="btn primary" title="New message">
      <form action={action} className="cash-bill-form">
        <PersistentMessageIntent
          storageKey={intentStorageKey}
          fallbackId={fallbackIntentId}
          resetToken={resetToken}
        />
        <p className="cash-bill-form-head">Text a customer</p>

        {contacts.length > 0 ? (
          <label className="cash-bill-field wide">
            <span>Who</span>
            <select name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} required>
              <option value="">Pick a customer…</option>
              {contacts.map((contact) => (
                <option key={contact.phone} value={contact.phone}>
                  {contact.name} · {contact.phone}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="cash-bill-note" role="status">
            No contacts currently have recorded SMS consent. Capture consent through the customer workflow,
            or have the customer send your business a message. If they previously opted out, they must text
            START before you can reply.
          </p>
        )}

        <label className="cash-bill-field wide">
          <span>Message</span>
          <textarea name="body" rows={4} placeholder="Hi — quick update on your job…" required />
        </label>

        <div className="cash-bill-form-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          {typeof availableCredits === 'number' ? (
            <span style={{ fontSize: '0.8125rem', color: availableCredits <= 25 ? 'var(--amber-10, #f59e0b)' : 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>
              💬 {availableCredits.toLocaleString('en-US')} credits available
            </span>
          ) : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SaveButton
              className="btn primary"
              pendingLabel="Queueing…"
              savedLabel="Queued ✓"
              disabled={contacts.length === 0}
            >
              Send text
            </SaveButton>
            <CloseOnSuccess />
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
