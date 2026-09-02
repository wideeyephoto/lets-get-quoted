'use client';

import { useEffect, useState, useTransition } from 'react';
import { formatPhoneDashes } from '@/lib/phone';
import { updateLeadContactAction } from '../actions';
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPhone(initialPhone ?? null);
  }, [initialPhone]);

  useEffect(() => {
    setEmail(initialEmail ?? null);
  }, [initialEmail]);

  useEffect(() => {
    if (!isEditing) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsEditing(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedPhone = (formData.get('phone') as string)?.trim() || null;
    const submittedEmail = (formData.get('email') as string)?.trim() || null;
    setError(null);

    startTransition(async () => {
      try {
        await updateLeadContactAction(leadId, submittedPhone, submittedEmail);
        setPhone(submittedPhone);
        setEmail(submittedEmail);
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save contact details.');
      }
    });
  }

  const hasPhone = Boolean(phone?.trim());
  const hasEmail = Boolean(email?.trim());

  return (
    <div className={styles.heroContactItem}>
      <div className={styles.heroAddressHead}>
        <span>Contact</span>
        <button
          type="button"
          className={styles.heroAddressEditBtn}
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

      {isEditing && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quickContactTitle"
          onClick={() => {
            if (!isPending) setIsEditing(false);
          }}
        >
          <div
            className={styles.quickAddressModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.editModalHeader}>
              <div>
                <p className="eyebrow">Quick update</p>
                <h2 id="quickContactTitle">Edit contact details</h2>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => {
                  if (!isPending) setIsEditing(false);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.quickAddressForm}>
              <div className="field">
                <label htmlFor="quick-edit-lead-phone">Phone</label>
                <input
                  id="quick-edit-lead-phone"
                  name="phone"
                  type="tel"
                  defaultValue={phone ?? ''}
                  placeholder="(248) 555-0117"
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="quick-edit-lead-email">Email</label>
                <input
                  id="quick-edit-lead-email"
                  name="email"
                  type="email"
                  defaultValue={email ?? ''}
                  placeholder="sarah@example.com"
                />
              </div>

              {error ? (
                <p className={styles.quickAddressError} role="alert">
                  {error}
                </p>
              ) : null}

              <div className={styles.editModalActions}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={isPending}
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : 'Save contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
