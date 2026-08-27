'use client';

import { useState } from 'react';
import VoiceCaptureModal from './VoiceCaptureModal';
import styles from './voice-capture.module.css';

export type VoiceCaptureButtonProps = {
  targetType: 'lead' | 'job';
  targetId?: string;
  contextTitle?: string;
  label?: string;
  className?: string;
  onSuccess?: (resultId?: string) => void;
};

export default function VoiceCaptureButton({
  targetType,
  targetId,
  contextTitle,
  label,
  className,
  onSuccess,
}: VoiceCaptureButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const buttonLabel = label || (targetId ? 'Voice Update' : (targetType === 'lead' ? 'Voice Add Lead' : 'Voice Update'));

  return (
    <>
      <button
        type="button"
        className={className || styles.triggerBtn}
        onClick={() => setIsOpen(true)}
        title="Speak to add or update details with AI"
      >
        <span className={styles.triggerIcon}>🎙️</span>
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <VoiceCaptureModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          targetType={targetType}
          targetId={targetId}
          contextTitle={contextTitle}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
}
