'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateJobAddressAction } from '../actions';
import { QuickEditAddressModal, quickEditStyles } from '@/components/quick-edit';

export default function JobAddressHeader({
  jobId,
  address,
}: {
  jobId: string;
  address: string | null | undefined;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', verticalAlign: 'middle' }}>
      <span>{address || 'No address on file yet'}</span>
      <button
        type="button"
        className={quickEditStyles.quickEditBtn}
        onClick={() => setIsEditing(true)}
        aria-label="Quick edit job address"
      >
        Edit address
      </button>

      <QuickEditAddressModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit job address"
        label="Job address"
        initialAddress={address}
        onSave={async (newAddress) => {
          await updateJobAddressAction(jobId, newAddress);
          router.refresh();
        }}
      />
    </span>
  );
}
