'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import {
  ARRIVAL_TOKENS, arrivalWindowTimes, buildArrivalMessage, DEFAULT_ARRIVAL_TEMPLATE,
  formatArrivalWindow, unknownTokens, type LocationPolicy, type LocationPrecision, type WindowStyle,
} from '@/lib/arrival';

// Settings for arrival updates. Client-side so the preview moves as the owner
// types — the whole point of this screen is seeing the text their customer gets
// BEFORE a customer gets it, and a save-and-reload loop is not that.

type Props = {
  action: (formData: FormData) => Promise<void>;
  businessName: string;
  timeZone: string;
  locationPolicy: LocationPolicy;
  locationPrecision: LocationPrecision;
  windowStyle: WindowStyle;
  windowMinutes: number;
  linkHours: number;
  messageTemplate: string | null;
};

export default function ArrivalSettingsSection(props: Props) {
  const [policy, setPolicy] = useState<LocationPolicy>(props.locationPolicy);
  const [style, setStyle] = useState<WindowStyle>(props.windowStyle);
  const [windowMinutes, setWindowMinutes] = useState(props.windowMinutes);
  const [template, setTemplate] = useState(props.messageTemplate ?? '');

  // A worked example, not lorem: a real 20-minute promise rendered in this
  // account's own timezone.
  const times = arrivalWindowTimes(new Date(), 20, { windowStyle: style, windowMinutes });
  const preview = buildArrivalMessage({
    template: template || DEFAULT_ARRIVAL_TEMPLATE,
    business: props.businessName,
    crewName: 'Danny Fletcher',
    customerName: 'Maria Alvarez',
    times,
    trackingUrl: 'letsgetquoted.com/track/…',
    timeZone: props.timeZone,
  });
  const strays = unknownTokens(template);

  return (
    <form action={props.action} className="form-grid compact-form">
      <div className="field full">
        <label htmlFor="windowStyle">What the customer is told</label>
        <select id="windowStyle" name="windowStyle" value={style} onChange={(event) => setStyle(event.target.value as WindowStyle)}>
          <option value="window">An arrival window — safer</option>
          <option value="exact">One exact time</option>
        </select>
        <small className="field-hint">
          A window is the default because a single promised minute is a promise that gets broken. The window
          opens at the time your tech gives and runs later — never earlier, so nobody turns up before they said.
        </small>
      </div>

      {style === 'window' ? (
        <div className="field full">
          <label htmlFor="windowMinutes">How wide the window is</label>
          <input
            id="windowMinutes"
            name="windowMinutes"
            type="number"
            min="0"
            max="120"
            step="5"
            inputMode="numeric"
            value={windowMinutes}
            onChange={(event) => setWindowMinutes(Math.min(120, Math.max(0, Math.round(Number(event.target.value)) || 0)))}
          />
          <small className="field-hint">
            Minutes. Say your tech taps &ldquo;20 minutes&rdquo; &mdash; the customer is told{' '}
            <strong>{formatArrivalWindow(times, props.timeZone)}</strong>.
          </small>
        </div>
      ) : (
        <input type="hidden" name="windowMinutes" value={windowMinutes} />
      )}

      <div className="field full">
        <label htmlFor="locationPolicy">Sharing your crew&rsquo;s location</label>
        <select id="locationPolicy" name="locationPolicy" value={policy} onChange={(event) => setPolicy(event.target.value as LocationPolicy)}>
          <option value="ask">Ask each time &mdash; the tech decides per visit</option>
          <option value="on">On by default &mdash; pre-ticked, still removable</option>
          <option value="off">Never &mdash; arrival times only, no map</option>
        </select>
        <small className="field-hint">
          Location is only ever attached to a single trip, and it stops the moment the tech marks arrived (or
          after 90 minutes, whichever comes first). It is never a running feed of where your staff are.
        </small>
      </div>

      {policy !== 'off' ? (
        <div className="field full">
          <label htmlFor="locationPrecision">How precise the map is</label>
          <select id="locationPrecision" name="locationPrecision" defaultValue={props.locationPrecision}>
            <option value="street">Approximate &mdash; about a block</option>
            <option value="exact">Exact position</option>
          </select>
          <small className="field-hint">
            Approximate answers &ldquo;are they close?&rdquo; without answering &ldquo;are they parked outside
            number 42?&rdquo;. It&rsquo;s the right default for staff who didn&rsquo;t choose this job to be tracked in it.
          </small>
        </div>
      ) : (
        <input type="hidden" name="locationPrecision" value={props.locationPrecision} />
      )}

      <div className="field full">
        <label htmlFor="linkHours">How long the status link stays live</label>
        <input id="linkHours" name="linkHours" type="number" min="1" max="24" step="1" inputMode="numeric" defaultValue={props.linkHours} />
        <small className="field-hint">Hours. After this the link expires and shows nothing about the visit.</small>
      </div>

      <div className="field full">
        <label htmlFor="messageTemplate">Your wording</label>
        <textarea
          id="messageTemplate"
          name="messageTemplate"
          rows={3}
          value={template}
          placeholder={DEFAULT_ARRIVAL_TEMPLATE}
          onChange={(event) => setTemplate(event.target.value)}
        />
        <small className="field-hint">
          Leave blank to use ours. Available: {ARRIVAL_TOKENS.map((token) => `{{${token}}}`).join(', ')} &mdash;{' '}
          <em>name</em> is the tech&rsquo;s first name, <em>customer</em> is theirs. Your tech can still edit the
          text before it sends. The tracking link and the opt-out line are always added.
        </small>
        {strays.length > 0 ? (
          <small className="field-hint" style={{ color: 'var(--warn)' }}>
            {strays.map((token) => `{{${token}}}`).join(', ')} {strays.length === 1 ? "isn't" : "aren't"} a
            tag we recognise, so {strays.length === 1 ? 'it' : 'they'} will send exactly as typed.
          </small>
        ) : null}
      </div>

      <details className="automation-preview" open>
        <summary>What your customer gets</summary>
        <p className="automation-preview-bubble">{preview}</p>
      </details>

      <div className="form-actions">
        <SaveButton>Save arrival settings</SaveButton>
      </div>
    </form>
  );
}
