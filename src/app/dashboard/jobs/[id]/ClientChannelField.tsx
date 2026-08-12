'use client';

import { useState } from 'react';
import ChannelToggles from '@/components/channel-toggles';
import { CLIENT_CHANNEL_HINT, type ClientChannelPreference } from '@/lib/client-channel';
import { formatPhoneDashes } from '@/lib/phone';

/**
 * The same two switches as the quote form, on the job.
 *
 * This was a <select> here and a tick-box there — one setting, two shapes,
 * neither of which looked like the other. Now the control that decides it up
 * front and the control that changes it afterwards are the same control.
 */
export default function ClientChannelField({
  initial,
  phone,
  email,
  optedOut,
}: {
  initial: ClientChannelPreference;
  phone: string | null;
  email: string | null;
  optedOut: boolean;
}) {
  const [channel, setChannel] = useState<ClientChannelPreference>(initial);

  return (
    <div className="field full">
      <ChannelToggles value={channel} onChange={setChannel} phone={phone} email={email} formatPhone={formatPhoneDashes} />
      <p className="job-meta">
        {CLIENT_CHANNEL_HINT[channel]}
        {optedOut ? ' This number has replied STOP, so no text can reach it whatever you pick.' : ''}
      </p>
    </div>
  );
}
