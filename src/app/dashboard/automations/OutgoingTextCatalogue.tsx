import Link from 'next/link';
import {
  AUDIENCE_LABEL,
  SENDER_LANE_LABEL,
  SMS_CATALOGUE,
  senderLaneForAudience,
  type SmsCatalogueEntry,
} from '@/lib/sms-catalogue';
import { automationAnchorFor } from '@/lib/nav-helpers';

/**
 * System text examples, using the actual sending copy and sample inputs.
 *
 * WHY IT EXISTS. The product sends through contractor, LGQ alert, and LGQ
 * dispatch lanes, and there was nowhere to read those messages together. The
 * only way to inspect an automation was to wait for it to reach somebody.
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
        {control.kind === 'manual' ? 'Only when you send it' : control.kind === 'configured' ? 'When enabled' : 'Always on'}
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
          <span className="btn secondary">System text examples · {SMS_CATALOGUE.length}</span>
          <span className="workspace-details-copy">
            Review message wording, recipients and sending triggers.
          </span>
        </summary>

        <p className="workspace-card-copy">
          {SMS_CATALOGUE.length} examples using the same wording as the sending paths.
          Names, dates and links are made up. Full-length sample links help illustrate text credit usage;
          actual message lengths vary. This catalogue covers common messages and selected variants.
        </p>

        {/* A table on a wide screen and a stack of cards on a phone, from one set
            of rows: the header is hidden below the breakpoint and each cell
            carries its own label. A real <table> that scrolls sideways would put
            the message — the thing you came to read — off the edge. */}
        <div className="sms-cat-table" role="table" aria-label="Outgoing system text examples">
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
                <span className="sms-cat-who">From: {SENDER_LANE_LABEL[senderLaneForAudience(entry.audience)]}</span>
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
          Every automated message to a customer carries <strong>Reply STOP to opt out</strong>, and a STOP is
          honoured for good. The verification code and a contractor&rsquo;s manual reply are the two narrow
          conversational exceptions; neither enrolls somebody in an automated subscription.
        </p>
      </details>
    </section>
  );
}
