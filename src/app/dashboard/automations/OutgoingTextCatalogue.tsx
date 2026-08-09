import Link from 'next/link';
import { AUDIENCE_LABEL, SMS_CATALOGUE, type SmsCatalogueEntry } from '@/lib/sms-catalogue';
import { automationAnchorFor } from '@/lib/nav-helpers';

/**
 * Every text this app can send, as the customer will see it.
 *
 * WHY IT EXISTS. A contractor's number sends thirty-odd different messages under
 * their name and there was nowhere to read them. The only way to find out what
 * an automation says was to switch it on and wait for it to reach a customer.
 *
 * Three columns, because three things decide whether an owner is happy for a
 * message to go out: when it fires, what it says, and whether they can stop it.
 * Two of those are facts about the wiring and one is the message itself, so the
 * message gets the room and the other two are narrow.
 *
 * The bodies are NOT written here. Every one is the output of the same builder
 * the sender calls, given sample data — see lib/sms-catalogue. Transcriptions of
 * these messages have drifted from the real thing twice already.
 */

function ControlCell({ entry }: { entry: SmsCatalogueEntry }) {
  const { control } = entry;
  if (control.kind === 'automation') {
    // Straight to the CARD that holds the switch, on this page. It used to
    // point at /dashboard/settings#automations — a tab that no longer exists
    // since Automations became a page of its own, so all 8 of these links
    // landed on the first tab of Settings with no automation in sight.
    const anchor = automationAnchorFor(control.key);
    return (
      <>
        <Link className="sms-cat-switch" href={anchor ? `/dashboard/automations#${anchor}` : '/dashboard/automations'}>
          {control.label}
        </Link>
        <small>Automation — switch it off any time</small>
      </>
    );
  }
  return (
    <>
      <span className={`sms-cat-switch is-${control.kind}`}>
        {control.kind === 'manual' ? 'Only when you send it' : 'Always on'}
      </span>
      <small>{control.label}</small>
    </>
  );
}

export default function OutgoingTextCatalogue() {
  return (
    <section className="panel workspace-section-card sms-cat">
      {/* CLOSED BY DEFAULT, and that is the point of the move.
          Thirty-two messages written out in full is ~10,000px of page. Open on
          the inbox it buried the composer; open here it would bury the switches.
          It is reference material — you read it once, when you are deciding
          whether to let a message go out under your name — so it opens when you
          ask for it, including from a #outgoing-texts deep link, which
          OpenAnchoredCard forces open on arrival. No `name`: the automation
          cards above are an exclusive accordion and this must not close one. */}
      <details className="workspace-details sms-cat-details" id="outgoing-texts">
        <summary className="workspace-details-summary">
          <span className="btn secondary">Every text we send · {SMS_CATALOGUE.length}</span>
          <span className="workspace-details-copy">
            The real wording of every message that leaves under your name.
          </span>
        </summary>

        <p className="workspace-card-copy">
          All {SMS_CATALOGUE.length} of them, written out in full. These are the real messages, built by the
          same code that sends them — not examples. Names, dates and links below are made up.
        </p>

        {/* A table on a wide screen and a stack of cards on a phone, from one set
            of rows: the header is hidden below the breakpoint and each cell
            carries its own label. A real <table> that scrolls sideways would put
            the message — the thing you came to read — off the edge. */}
        <div className="sms-cat-table" role="table" aria-label="Every outgoing text message">
          <div className="sms-cat-head" role="row">
            <span role="columnheader">When it sends</span>
            <span role="columnheader">What they get</span>
            <span role="columnheader">Your control</span>
          </div>

          {SMS_CATALOGUE.map((entry) => (
            <div className="sms-cat-row" role="row" key={entry.id}>
              <div className="sms-cat-when" role="cell">
                <strong>{entry.title}</strong>
                <span>{entry.trigger}</span>
                <span className={`sms-cat-who is-${entry.audience}`}>To: {AUDIENCE_LABEL[entry.audience]}</span>
              </div>

              <div className="sms-cat-msg" role="cell">
                {/* A bubble, not a quote block. The point of the section is what it
                    looks like on a phone, and prose in a panel does not answer
                    that — the line breaks and the length are the answer. */}
                <p className="sms-cat-bubble">{entry.body}</p>
                {entry.ownerAuthored ? (
                  <small className="sms-cat-authored">
                    The wording is yours — we add your name and the opt-out line.
                  </small>
                ) : null}
              </div>

              <div className="sms-cat-control" role="cell">
                <ControlCell entry={entry} />
              </div>
            </div>
          ))}
        </div>

        <p className="sms-cat-foot">
          Every message to a customer carries <strong>Reply STOP to opt out</strong>, and a STOP is honoured
          for good — the one exception is the verification code, which expires in ten minutes and is the
          only text nobody can be subscribed to.
        </p>
      </details>
    </section>
  );
}
