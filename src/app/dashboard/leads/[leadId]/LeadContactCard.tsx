'use client';

import { useEffect, useState } from 'react';
import { formatPhoneDashes } from '@/lib/phone';
import { updateLeadContactAction } from '../actions';
import { QuickEditContactModal, quickEditStyles } from '@/components/quick-edit';
import styles from '../leads.module.css';

type LeadContactCardProps = {
  leadId: string;
  initialPhone: string | null | undefined;
  initialEmail: string | null | undefined;
  contactPreference?: string | null;
};

export default function LeadContactCard({
  leadId,
  initialPhone,
  initialEmail,
  contactPreference,
}: LeadContactCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [phone, setPhone] = useState<string | null>(initialPhone ?? null);
  const [email, setEmail] = useState<string | null>(initialEmail ?? null);

  useEffect(() => {
    setPhone(initialPhone ?? null);
  }, [initialPhone]);

  useEffect(() => {
    setEmail(initialEmail ?? null);
  }, [initialEmail]);

  const hasPhone = Boolean(phone?.trim());
  const hasEmail = Boolean(email?.trim());

  return (
    <div className={styles.heroContactItem}>
      <div className={styles.heroAddressHead}>
        <span>Contact</span>
        <button
          type="button"
          className={quickEditStyles.quickEditBtn}
          onClick={() => setIsEditing(true)}
          aria-label="Quick edit contact info"
        >
          Edit
        </button>
      </div>

      {hasPhone ? (
        contactPreference === 'text_only' ? (
          <>
            <a href={`sms:${phone}`} className={styles.heroPhoneLink} aria-label={`Text ${phone}`}>
              <span aria-hidden="true">💬</span> Text {formatPhoneDashes(phone)}
            </a>
            <a href={`tel:${phone}`} className={styles.heroPhoneLinkQuiet} aria-label={`Call ${phone} anyway — they asked not to be called`}>
              <span aria-hidden="true">📞</span> Call anyway
            </a>
          </>
        ) : (
          <a href={`tel:${phone}`} className={styles.heroPhoneLink} aria-label={`Call ${phone}`}>
            <span aria-hidden="true">📞</span> {formatPhoneDashes(phone)}
          </a>
        )
      ) : (
        <strong>No phone provided</strong>
      )}

      {hasPhone && contactPreference === 'text_only' ? (
        <small className={styles.contactWarn}>They asked for texts only.</small>
      ) : null}

      {hasEmail ? (
        <a href={`mailto:${email}`} className={styles.heroContactEmail} aria-label={`Email ${email}`}>
          <span aria-hidden="true">📧</span> {email}
        </a>
      ) : (
        <strong>No email provided</strong>
      )}

      {!hasPhone && hasEmail ? (
        <small className={styles.contactWarn}>Email-only — text tools won&apos;t reach this lead.</small>
      ) : null}

      <QuickEditContactModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit contact details"
        initialPhone={phone}
        initialEmail={email}
        onSave={async (newPhone, newEmail) => {
          await updateLeadContactAction(leadId, newPhone, newEmail);
          setPhone(newPhone);
          setEmail(newEmail);
        }}
      />
    </div>
  );
}
