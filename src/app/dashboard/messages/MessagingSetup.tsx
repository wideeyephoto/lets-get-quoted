import Link from 'next/link';
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
            <span className="msg-setup-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>

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
              <Chip prefix="Your texting number" label={registration.label} tone={registration.tone} />
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
          <section className="msg-setup-section msg-setup-card">
            <div className="msg-setup-section-head">
              <div className="msg-setup-section-badge is-alert" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="msg-setup-section-titles">
                <h3>Your Let&rsquo;s Get Quoted notifications</h3>
                <span className="msg-setup-subhead">Instant SMS alerts sent to you</span>
              </div>
              <span className={`msg-setup-status-pill is-${alerts.tone}`}>{alerts.label}</span>
            </div>

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
              accepting an estimate. <b>This does not authorize texts to your customers.</b> Contractor-to-homeowner
              messaging becomes available only after your business is carrier-approved and its dedicated
              number is active.
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

          {/* This section is intentionally separate from LGQ account alerts.
              The platform campaign cannot be used as a shortcut for traffic
              sent in a contractor's name. Carrier approval and an active,
              dedicated sender are the boundary for contractor-to-homeowner
              messages. */}
          <section className="msg-setup-section msg-setup-card">
            <div className="msg-setup-section-head">
              <div className="msg-setup-section-badge is-messaging" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="msg-setup-section-titles">
                <h3>Your customer texting number</h3>
                <span className="msg-setup-subhead">Dedicated 2-way homeowner messaging &amp; AI Voice</span>
              </div>
              <span className={`msg-setup-status-pill is-${registration.tone}`}>{registration.label}</span>
            </div>

            <p className="msg-setup-lead">
              Let&rsquo;s Get Quoted&rsquo;s shared numbers are reserved for LGQ account, billing, support, and
              platform notifications. Get your dedicated two-way business number with carrier approval to message
              homeowners directly and power our AI Voice Receptionist plans.
            </p>

            <div className="msg-setup-features">
              <div className="msg-setup-feature-item">
                <span className="msg-setup-feature-icon" aria-hidden="true">💬</span>
                <div>
                  <strong>Two-way SMS inbox</strong>
                  <span>Message homeowners and quote leads directly from your LGQ dashboard</span>
                </div>
              </div>
              <div className="msg-setup-feature-item">
                <span className="msg-setup-feature-icon" aria-hidden="true">📱</span>
                <div>
                  <strong>Dedicated local number</strong>
                  <span>Protect your personal phone number with a separate business caller ID</span>
                </div>
              </div>
              <div className="msg-setup-feature-item">
                <span className="msg-setup-feature-icon" aria-hidden="true">🛡️</span>
                <div>
                  <strong>Managed 10DLC registration</strong>
                  <span>Carrier vetting, anti-spam registration, and high deliverability</span>
                </div>
              </div>
              <div className="msg-setup-feature-item">
                <span className="msg-setup-feature-icon" aria-hidden="true">🎙️</span>
                <div>
                  <strong>Required for AI Voice</strong>
                  <span>Powers 24/7 AI Voice Receptionist, inbound call routing, and missed-call follow-ups</span>
                </div>
              </div>
            </div>

            <div className="msg-setup-registration-box">
              <p className={`msg-setup-status is-${registration.tone}`}>
                <span className="msg-setup-status-label">Registration</span>
                <b>{registration.label}</b>
              </p>
              {registration.detail ? <p className="msg-setup-note">{registration.detail}</p> : null}

              {/**
               * Registration action box for not_started status.
               */}
              {setup.registration.kind === 'ok' && setup.registration.status === 'not_started' ? (
                <div className="msg-setup-action-box">
                  <p className="msg-setup-note">
                    Register for a dedicated business phone number. Carrier vetting ensures 10DLC spam compliance,
                    high deliverability, and unlocks our AI Voice Receptionist plans. Applying does not charge your account until you
                    review and accept final carrier fees.
                  </p>
                  <p>
                    <Link className="btn primary msg-setup-apply-btn" href="/dashboard/messages/dedicated-number">
                      Get Dedicated Number <span>›</span>
                    </Link>
                  </p>
                </div>
              ) : null}

              {setup.registration.kind === 'ok' && ['action_required', 'rejected'].includes(setup.registration.status) ? (
                <p>
                  <Link className="btn secondary msg-setup-apply-btn" href="/dashboard/messages/dedicated-number">
                    Review application status <span>›</span>
                  </Link>
                </p>
              ) : null}

              {setup.registration.kind === 'ok' && ['submitted', 'in_review', 'approved'].includes(setup.registration.status) ? (
                <p>
                  <Link className="btn secondary msg-setup-apply-btn" href="/dashboard/messages/dedicated-number">
                    View application status <span>›</span>
                  </Link>
                </p>
              ) : null}

              {setup.registration.kind === 'ok' && setup.registration.assignedNumber ? (
                <div className="msg-setup-assigned-number">
                  <p className="msg-setup-status is-ready">
                    <span className="msg-setup-status-label">Your number</span>
                    <b>{setup.registration.assignedNumber}</b>
                  </p>
                </div>
              ) : null}

              {setup.registration.kind === 'unavailable' ? (
                <p className="msg-setup-note is-attention">
                  We could not check your registration just now, so this is not a statement that you have
                  none. Reload in a moment.
                </p>
              ) : null}
            </div>
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

