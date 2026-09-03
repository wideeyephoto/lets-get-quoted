'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPhoneDashes } from '@/lib/phone';
import { updateJobContactAction } from '../actions';
import { QuickEditContactModal, quickEditStyles } from '@/components/quick-edit';
import MailIcon from '@/components/MailIcon';

export default function JobContactHeader({
  jobId,
  clientPhone,
  clientEmail,
}: {
  jobId: string;
  clientPhone: string | null | undefined;
  clientEmail: string | null | undefined;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      {clientPhone ? (
        <a href={`tel:${clientPhone}`} className="hero-phone-link" aria-label={`Call ${clientPhone}`}>
          <span aria-hidden="true">📞</span> {formatPhoneDashes(clientPhone)}
        </a>
      ) : null}
      {clientEmail ? (
        <a href={`mailto:${clientEmail}`} className="hero-email-link" aria-label={`Email ${clientEmail}`}>
          <MailIcon /> {clientEmail}
        </a>
      ) : null}
      {!clientPhone && !clientEmail ? (
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No contact details on file</span>
      ) : null}
      <button
        type="button"
        className={quickEditStyles.quickEditBtn}
        onClick={() => setIsEditing(true)}
        aria-label="Quick edit contact info"
      >
        Edit contact
      </button>

      <QuickEditContactModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit contact details"
        initialPhone={clientPhone}
        initialEmail={clientEmail}
        onSave={async (phone, email) => {
          await updateJobContactAction(jobId, phone, email);
          router.refresh();
        }}
      />
    </div>
  );
}
