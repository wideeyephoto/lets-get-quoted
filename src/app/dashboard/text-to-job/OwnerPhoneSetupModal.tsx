'use client';

import type { ReactNode } from 'react';
import ModalDialog from '@/components/modal-dialog';
import OwnerAlertsForm from '@/app/dashboard/messages/OwnerAlertsForm';

export type OwnerPhoneSetupData = {
  phone: string | null;
  enabled: boolean;
  consent: 'opted_in' | 'opted_out' | 'none';
  consentedAt: string | null;
  consentVersion: string | null;
  disabled: boolean;
  disabledReason?: string | null;
};

export default function OwnerPhoneSetupModal({
  setup,
  sharedPhoneNumber,
  triggerClassName,
  triggerLabel,
}: {
  setup: OwnerPhoneSetupData;
  sharedPhoneNumber?: string;
  triggerClassName?: string;
  triggerLabel: ReactNode;
}) {
  if (setup.disabled) {
    return (
      <button
        type="button"
        className={triggerClassName}
        disabled
        title={setup.disabledReason ?? 'Phone setup is unavailable right now.'}
      >
        {triggerLabel}
        <span className="sr-only"> — {setup.disabledReason ?? 'Phone setup is unavailable right now.'}</span>
      </button>
    );
  }

  return (
    <ModalDialog
      title="Connect your mobile number"
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      obscureBackdrop
    >
      <section className="msg-setup-section msg-setup-card">
        <div className="msg-setup-section-head">
          <div className="msg-setup-section-badge is-alert" aria-hidden="true">
            📱
          </div>
          <div className="msg-setup-section-titles">
            <h3>Verify your field phone here</h3>
            <span className="msg-setup-subhead">You will stay on the Text-to-Job page</span>
          </div>
        </div>

        <p className="msg-setup-lead">
          Add the mobile number you will use in the field, leave field access enabled, enter the six-digit
          text code, and save. Your AI Copilot hotline unlocks as soon as those settings are stored.
        </p>

        <OwnerAlertsForm
          phone={setup.phone}
          enabled={setup.enabled}
          consent={setup.consent}
          consentedAt={setup.consentedAt}
          consentVersion={setup.consentVersion}
          disabled={setup.disabled}
          sharedPhoneNumber={sharedPhoneNumber}
          showTextToJobLink={false}
          fieldLineSetup
        />
      </section>
    </ModalDialog>
  );
}
