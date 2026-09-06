'use client';

import { useActionState } from 'react';
import { submitNeighborHaloClaimAction, type ClaimFormState } from './claim-actions';
import styles from './halo-claim.module.css';

const initialState: ClaimFormState = {
  success: false,
};

type Props = {
  campaignId: string;
  claimToken: string;
  streetName: string;
  city: string;
  businessName: string;
};

export default function HaloClaimForm({ campaignId, claimToken, streetName, city, businessName }: Props) {
  const [state, formAction, isPending] = useActionState(submitNeighborHaloClaimAction, initialState);

  if (state.success) {
    return (
      <div className={styles.successBox}>
        <div className={styles.successIcon}>🎉</div>
        <h3 className={styles.successTitle}>Discount Voucher Claimed!</h3>
        <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: '0 0 1rem' }}>
          We sent a confirmation text with your voucher details. A specialist from {businessName} will contact you shortly to coordinate your free neighbor estimate.
        </p>
        <div className={styles.voucherChip}>{state.voucherCode}</div>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          Valid for projects on or adjacent to {streetName}, {city}.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.formCard}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="claimToken" value={claimToken} />
      <h3 className={styles.formTitle}>Claim Your Neighbor Discount</h3>
      <p className={styles.formSubtitle}>
        While our trucks and crews are staged on {streetName}, lock in your group rate estimate with zero obligation.
      </p>

      {state.error ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
          {state.error}
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">Your Name *</label>
        <input className={styles.input} id="name" name="name" type="text" placeholder="Jane Doe" required />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="phone">Phone Number (for instant SMS code) *</label>
        <input className={styles.input} id="phone" name="phone" type="tel" placeholder="(555) 000-0000" required />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="address">Your Street Address</label>
        <input className={styles.input} id="address" name="address" type="text" placeholder={`e.g. 1420 ${streetName}`} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">Email Address (Optional)</label>
        <input className={styles.input} id="email" name="email" type="email" placeholder="jane@example.com" />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="notes">Project Details / Scope</label>
        <textarea className={styles.textarea} id="notes" name="notes" rows={3} placeholder="Briefly describe what you need done..." />
      </div>

      <button className={styles.submitButton} type="submit" disabled={isPending}>
        {isPending ? 'Claiming Voucher…' : 'Claim $250 Neighbor Discount →'}
      </button>

      <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', margin: '0.75rem 0 0' }}>
        🔒 Privacy guaranteed. We never sell your info or spam your phone.
      </p>
    </form>
  );
}
