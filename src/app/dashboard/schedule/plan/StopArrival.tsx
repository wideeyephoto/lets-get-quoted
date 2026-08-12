'use client';

import { useRef, useState } from 'react';
import FloatingPanel from '@/components/floating-panel';
import ArrivalPanel, { type ArrivalPanelJob, type ArrivalPanelTrip } from '@/components/arrival-panel';
import type { WindowStyle } from '@/lib/arrival';

/**
 * "I'm on my way", on the row of the day you are actually working through.
 *
 * WHY IT IS A POPOVER AROUND THE EXISTING PANEL rather than a second send flow.
 * ArrivalPanel is where the four ways this goes wrong are handled — promising a
 * time you cannot keep, promising it to the wrong customer, promising it twice,
 * and not knowing whether it was delivered. Its own file says two copies of a
 * send flow means two copies of the safeguards, and the copy that rots is the
 * one nobody is standing in a driveway using. So this adds a trigger and a
 * surface for it, and no logic of its own.
 *
 * WHAT THE BUTTON SAYS IS THE TRIP'S STATE, not a fixed label. A row where the
 * customer has already been told reads "On the way" and opens straight onto the
 * revise-and-arrive controls; sending twice from a list of ten stops is exactly
 * the mistake this screen would otherwise invite.
 *
 * AND IT IS NOT CALLED WHAT THE SEND IS CALLED. This read "I'm on my way", and
 * pressing it opened a panel headed "On my way" whose own button read "I'm on my
 * way" with a pin on it - the same sentence three times, and the first press
 * appearing to do nothing except produce a second copy of itself. The trigger
 * names what the panel is FOR; the button inside it is the one that sends.
 */

export type StopArrivalProps = {
  job: ArrivalPanelJob;
  trip: ArrivalPanelTrip | null;
  business: string;
  template: string;
  timeZone: string;
  windowStyle: WindowStyle;
  windowMinutes: number;
  defaultMinutes: number | null;
  sendAction: (formData: FormData) => Promise<void>;
  statusAction: (formData: FormData) => Promise<void>;
};

/** Wide enough for the ETA grid and the message box without a scrollbar. */
const PANEL_WIDTH = 372;

export default function StopArrival(props: StopArrivalProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const status = props.trip?.status ?? null;
  const live = status != null && status !== 'arrived';
  const arrived = status === 'arrived';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn secondary plan-stop-otw${live ? ' is-live' : ''}${arrived ? ' is-done' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {arrived ? 'Arrived' : live ? 'On the way' : 'Text an ETA'}
      </button>

      <FloatingPanel
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        className="plan-stop-arrival"
        width={PANEL_WIDTH}
      >
        <ArrivalPanel
          {...props}
          surface="dashboard"
          crewName={props.trip?.sentBy || props.business}
          // Sent from the plan screen, which is a desk or a phone in a van
          // either way — but not necessarily AT the job, so there is nothing
          // honest to put on a map from here. Same call the job page makes.
          canShareLocation={false}
          shareDefaultsOn={false}
          canReschedule
          canSend
        />
      </FloatingPanel>
    </>
  );
}
