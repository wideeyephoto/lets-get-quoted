'use client';

import { useEffect, useState } from 'react';
import LeadRadiusMap from '@/components/lead-radius-map';
import { updateLeadAddressAction } from '../actions';
import { QuickEditAddressModal, quickEditStyles } from '@/components/quick-edit';
import styles from '../leads.module.css';

type LeadAddressCardProps = {
  leadId: string;
  initialAddress: string | null | undefined;
  radiusMiles?: number;
};

export default function LeadAddressCard({
  leadId,
  initialAddress,
  radiusMiles = 10,
}: LeadAddressCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState<string | null>(initialAddress ?? null);

  useEffect(() => {
    setAddress(initialAddress ?? null);
  }, [initialAddress]);

  return (
    <div className={styles.heroContactItem}>
      <div className={styles.heroAddressHead}>
        <span>Project address</span>
        <button
          type="button"
          className={quickEditStyles.quickEditBtn}
          onClick={() => setIsEditing(true)}
          aria-label="Quick edit project address"
        >
          Edit
        </button>
      </div>
      <strong>{address || 'Not provided'}</strong>
      <LeadRadiusMap address={address} radiusMiles={radiusMiles} size="mini" />

      <QuickEditAddressModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit project address"
        label="Project address"
        initialAddress={address}
        onSave={async (newAddress) => {
          await updateLeadAddressAction(leadId, newAddress);
          setAddress(newAddress);
        }}
      />
    </div>
  );
}
