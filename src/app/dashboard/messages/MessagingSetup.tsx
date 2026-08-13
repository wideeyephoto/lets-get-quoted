import ModalDialog from '@/components/modal-dialog';
import { aggregateChip, ownerAlertChip, registrationChip, canSaveOwnerAlerts, type MessagingSetup as Setup } from '@/lib/owner-sms';
import OwnerAlertsForm from './OwnerAlertsForm';

/**
 * Texting setup, as a strip rather than as a card.
 *
 * WHERE IT SITS AND WHY IT IS THIS SMALL. Between the inbox header and the
 * conversation list — which is the one place it can be, because it is about the
 * inbox and not about the customer whose thread happens to be open. Everything
 * else about it follows from a single measurement: at 511x648 an expanded setup
 * panel pushes the first conversation off the bottom of the screen, and this
 * page exists to show conversations. So its resting state is one row, ~68px,
 * and everything it could say lives behind it in a dialog.
 *
 * TWO STATUSES, NEVER ONE. "Texting" is two unrelated questions — may we text
 * YOU about your account, and may you text YOUR CUSTOMERS from your own number
 * — with separate storage, separate consent and separate answers. A single
 * "texting: ready" chip would be true for one of them and a lie about the
 * other. On a phone there is room for one chip, so the aggregate reports the
 * WORSE of the two: a summary that shows the good half is a summary that hides
 * the only thing it is for.
 *
 * IT IS NOT IN THE HEADER. That row already carries search, four filters and
 * New message, and it is the row that has to stay usable on a laptop. Nor is it
 * in the customer context rail — nothing about a carrier registration belongs
 * beside the person you are talking to.
 */
export default function MessagingSetup({ setup, openOnLoad }: { setup: Setup; openOnLoad: boolean }) {
  const alerts = ownerAlertChip(setup.alerts);
  const registration = registrationChip(setup.registration);
  const summary = aggregateChip(setup.alerts, setup.registration);

  return (
    // The anchor the automations page links to. On the wrapper rather than the
    // strip, and with scroll-margin in the stylesheet, so landing here does not
    // park the row under the mobile navigation.
    <div className="msg-setup" id="texting-setup">
      <ModalDialog
        triggerClassName="msg-setup-strip"
        title="Texting setup"
        // ?setup=1 arrives from the automations page. `defaultOpen` is
        // initial-state only by design, which is exactly right here: a server
        // action revalidating the inbox underneath must not shove the dialog
        // back open after somebody has closed it.
        defaultOpen={openOnLoad}
        // This dialog opens over the inbox and is the one that gets
        // screenshotted for a carrier campaign submission. The ordinary scrim
        // leaves customer names, numbers and message text readable behind it.
        obscureBackdrop
        triggerLabel={
          <>
            <span className="msg-setup-copy">
              <b>Texting setup</b>
              <small>Your alerts and customer texting number</small>
            </span>

            {/* Both statuses at desktop widths. Hidden below 720 in CSS rather
                than dropped from the markup — the dialog is where the detail
                lives either way, and two sources of truth for which chips
                exist is one more than this needs. */}
            <span className="msg-setup-chips">
              <Chip prefix="LGQ alerts" label={alerts.label} tone={alerts.tone} />
              <Chip prefix="Customer texting" label={registration.label} tone={registration.tone} />
            </span>

            {/* The phone's single chip. Same data, worst-of-the-two. */}
            <span className="msg-setup-chips is-compact">
              <Chip prefix="Texting" label={summary.label} tone={summary.tone} />
            </span>

            <span className="msg-setup-manage" aria-hidden="true">
              Manage <i>›</i>
            </span>
          </>
        }
      >
        <div className="msg-setup-sections">
          <section className="msg-setup-section">
            <h3>Your Let&rsquo;s Get Quoted notifications</h3>
            {/* The four traffic types, named, and in the same order as the
                consent label and the registered campaign. This used to say "a
                high-value lead landing, a homeowner accepting an estimate",
                which described two messages rather than the categories the
                consent covers — and a description narrower than the permission
                it sits above is the mismatch a carrier reviewer looks for.
                The last sentence is here for the same reason: the single most
                common misreading of this dialog is that it turns on texting to
                customers. */}
            <p className="msg-setup-lead">
              Texts to <b>you</b> about your own Let&rsquo;s Get Quoted account &mdash; account, billing,
              support, and quote-request notifications, such as a high-value lead landing or a homeowner
              accepting an estimate. <b>This does not text your customers</b> and does not set up customer
              texting; that is separate, and it is the section beside this one.
            </p>
            <OwnerAlertsForm
              phone={setup.alerts.kind === 'ok' ? setup.alerts.phone : null}
              enabled={setup.alerts.kind === 'ok' ? setup.alerts.enabled : false}
              consent={setup.alerts.kind === 'ok' ? setup.alerts.consent : 'none'}
              consentedAt={setup.alerts.kind === 'ok' ? setup.alerts.consentedAt : null}
              consentVersion={setup.alerts.kind === 'ok' ? setup.alerts.consentVersion : null}
              disabled={!canSaveOwnerAlerts(setup.alerts)}
            />
          </section>

          {/* Inactive, and stays inactive. Nothing in this section takes input,
              writes anything, or shares state with the consent form above it —
              the two are adjacent on screen and unrelated everywhere else. */}
          <section className="msg-setup-section">
            <h3>Customer texting &mdash; coming soon</h3>
            <p className="msg-setup-lead">
              Texting your own customers needs a dedicated two-way number, and a number can only send to
              them once your business is registered with the mobile carriers. That is a legal requirement
              in the US, not our rule.
            </p>

            <p className={`msg-setup-status is-${registration.tone}`}>
              <span className="msg-setup-status-label">Registration</span>
              <b>{registration.label}</b>
            </p>
            {registration.detail ? <p className="msg-setup-note">{registration.detail}</p> : null}

            {/**
             * NO BUTTON HERE, AND THAT IS THE FEATURE.
             *
             * The obvious thing to ship is a "Start registration" button, and
             * it would do nothing — the provider has not confirmed the process
             * for registering businesses underneath our account, so there is no
             * submission to make. A button that opens a form nobody can file is
             * a worse answer than a sentence saying not yet.
             *
             * When the states below become reachable each gets exactly one
             * contextual action — Continue, Fix issue, or Manage — and it goes
             * here.
             */}
            {setup.registration.kind === 'ok' && setup.registration.status === 'not_started' ? (
              <p className="msg-setup-note">
                Nothing to do yet, and nothing you have missed. We will open registration here as soon as
                our messaging provider confirms the process, and email you when it does.
              </p>
            ) : null}

            {setup.registration.kind === 'ok' && setup.registration.assignedNumber ? (
              <p className="msg-setup-status is-ready">
                <span className="msg-setup-status-label">Your number</span>
                <b>{setup.registration.assignedNumber}</b>
              </p>
            ) : null}

            {setup.registration.kind === 'unavailable' ? (
              <p className="msg-setup-note is-attention">
                We could not check your registration just now, so this is not a statement that you have
                none. Reload in a moment.
              </p>
            ) : null}
          </section>
        </div>
      </ModalDialog>
    </div>
  );
}

function Chip({ prefix, label, tone }: { prefix: string; label: string; tone: string }) {
  return (
    <span className={`msg-setup-chip is-${tone}`}>
      <i>{prefix}</i>
      {label}
    </span>
  );
}
