'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadNameAction } from '../actions';
import { QuickEditNameModal, quickEditStyles } from '@/components/quick-edit';

type LeadTitleHeaderProps = {
  leadId: string;
  initialName: string;
};

export default function LeadTitleHeader({ leadId, initialName }: LeadTitleHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  return (
    <div className={quickEditStyles.headerTitleRow}>
      <h1 className="workspace-title" style={{ margin: 0 }}>
        {initialName || 'Unnamed lead'}
      </h1>
      <button
        type="button"
        className={quickEditStyles.quickEditBtn}
        onClick={() => setIsEditing(true)}
        aria-label="Quick edit lead name"
      >
        Edit name
      </button>

      <QuickEditNameModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit lead name"
        label="Client name"
        initialName={initialName}
        onSave={async (newName) => {
          await updateLeadNameAction(leadId, newName);
          router.refresh();
        }}
      />
    </div>
  );
}
