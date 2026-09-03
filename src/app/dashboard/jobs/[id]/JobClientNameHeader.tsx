'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateJobClientNameAction } from '../actions';
import { QuickEditNameModal, quickEditStyles } from '@/components/quick-edit';

export default function JobClientNameHeader({
  jobId,
  clientName,
}: {
  jobId: string;
  clientName: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', verticalAlign: 'middle' }}>
      <strong>{clientName || 'Untitled client'}</strong>
      <button
        type="button"
        className={quickEditStyles.quickEditBtn}
        onClick={() => setIsEditing(true)}
        aria-label="Quick edit client name"
      >
        Edit name
      </button>

      <QuickEditNameModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit client name"
        label="Client name"
        initialName={clientName}
        onSave={async (newName) => {
          await updateJobClientNameAction(jobId, newName);
          router.refresh();
        }}
      />
    </span>
  );
}
