'use client';

import { useState } from 'react';

/**
 * THE TEXT, AS IT ARRIVES.
 *
 * The one moment the whole page is about: a phone lights up on a jobsite and
 * the answer has to be worth the interruption. So the message shows the number
 * and the distance BEFORE it asks anything, and the ask is two buttons wide.
 *
 * A drawing, not a demo of the real messaging — nothing here sends. The reply
 * line says what the app does with each answer, which is the part a contractor
 * is actually deciding about: "Later" has to be safe, or the alert isn't.
 */

type Choice = 'now' | 'later';

const REPLY: Record<Choice, string> = {
  now: 'Opening the request — photos, answers and the homeowner’s number.',
  later: 'Saved. It stays at the top of your queue and comes back this evening.',
};

export default function TextAlertDemo() {
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <div className="hiq-phone" role="img" aria-label="Example text alert from Let’s Get Quoted">
      <span className="hiq-phone-speaker" aria-hidden="true" />
      <div className="hiq-phone-status" aria-hidden="true">
        <span>9:41</span>
        <span>● ● ▮</span>
      </div>
      <div className="hiq-phone-app">LET&rsquo;S GET QUOTED</div>

      <div className="hiq-bubble">
        <span className="hiq-bubble-from">LET&rsquo;S GET QUOTED</span>
        <strong>$8,600 panel upgrade + EV charger</strong>
        <p>Royal Oak · 4.2 miles</p>
        <p>Hot lead · Best match</p>
        <p>Want to respond now?</p>

        <div className="hiq-answers" role="group" aria-label="Reply to the $8,600 panel upgrade alert">
          <button
            type="button"
            aria-pressed={choice === 'now'}
            data-selected={choice === 'now' ? 'true' : 'false'}
            onClick={() => setChoice('now')}
          >
            Respond now
          </button>
          <button
            type="button"
            className="hiq-later"
            aria-pressed={choice === 'later'}
            data-selected={choice === 'later' ? 'true' : 'false'}
            onClick={() => setChoice('later')}
          >
            Later
          </button>
        </div>

        <p className="hiq-said" role="status">
          {choice ? REPLY[choice] : ''}
        </p>
      </div>

      <div className="hiq-phone-field" aria-hidden="true">Text Message</div>
    </div>
  );
}
