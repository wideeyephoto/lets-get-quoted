import Link from 'next/link';
import { createAdminClient } from '@/lib/auth';
import { getReviewInviteByToken } from '@/lib/reviews';
import { reviewRoutes, reviewAcknowledgement } from '@/lib/review-routing';
import SaveButton from '@/components/save-button';
import StarPicker from './StarPicker';
import { submitFeedbackAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero review-gate">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="workspace-title">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}

/**
 * The two doors, rendered identically on every screen and for every rating.
 * Order and prominence are fixed here on purpose: a page that shows the public
 * route to a happy customer and buries it for an unhappy one is still gating,
 * even when the link is technically present.
 */
function ReviewRoutes({ token, googleUrl, businessName }: { token: string; googleUrl: string | null; businessName: string }) {
  return (
    <div className="review-routes">
      {googleUrl ? (
        <a className="review-route is-public" href={`/review/${token}/google`}>
          <span className="review-route-title">Leave a public review</span>
          <span className="review-route-note">Opens Google. Your words help other homeowners choose.</span>
        </a>
      ) : null}
      <Link className="review-route" href={`/review/${token}?step=feedback`}>
        <span className="review-route-title">Send private feedback</span>
        <span className="review-route-note">Goes straight to {businessName}. Not published anywhere.</span>
      </Link>
    </div>
  );
}

export default async function ReviewPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ step?: string; done?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const admin = createAdminClient();
  const invite = await getReviewInviteByToken(admin, params.token);

  if (!invite) {
    return (
      <Shell eyebrow="Review" title="This link isn't valid">
        <p className="workspace-lead">This review link is invalid or has expired. If you meant to leave a review, ask your contractor to resend it.</p>
      </Shell>
    );
  }

  const businessName = invite.business_name;
  const routes = reviewRoutes({ googleUrl: invite.google_url });

  // Private feedback sent. The public route stays open — closing it here would
  // mean a private note quietly absorbed a review the customer was entitled to
  // leave, which is the whole thing we stopped doing.
  if (searchParams.done === '1') {
    return (
      <Shell eyebrow={businessName} title="Thank you — that's been sent">
        <p className="workspace-lead">
          {businessName} got your note directly and will be in touch. If you&apos;d also like to say something publicly,
          that&apos;s still up to you.
        </p>
        {routes.googleUrl ? <ReviewRoutes token={params.token} googleUrl={routes.googleUrl} businessName={businessName} /> : null}
      </Shell>
    );
  }

  if (searchParams.step === 'feedback') {
    return (
      <Shell eyebrow={businessName} title={`Tell ${businessName} directly`}>
        <p className="workspace-lead">This goes straight to the owner and isn&apos;t published anywhere.</p>
        <form action={submitFeedbackAction.bind(null, params.token)} className="review-feedback-form">
          <textarea name="feedback" rows={5} placeholder="What happened? What would have made it better?" required aria-label="Your feedback" />
          <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Send private feedback</SaveButton>
        </form>
        {routes.googleUrl ? (
          <p className="review-gate-fine">
            You can also <a href={`/review/${params.token}/google`}>leave a public review</a> — doing one doesn&apos;t rule out the other.
          </p>
        ) : null}
      </Shell>
    );
  }

  // Rated already: acknowledge it, then offer both routes. The acknowledgement
  // is the only thing the rating is allowed to change.
  if (invite.rating !== null) {
    const ack = reviewAcknowledgement(invite.rating, businessName);
    return (
      <Shell eyebrow={businessName} title={ack.title}>
        <p className="workspace-lead">{ack.lead}</p>
        <ReviewRoutes token={params.token} googleUrl={routes.googleUrl} businessName={businessName} />
      </Shell>
    );
  }

  // First view. The rating is optional — the public route is reachable without
  // telling us anything first.
  return (
    <Shell eyebrow={businessName} title="How did we do?">
      <p className="workspace-lead">
        {invite.client_name ? `${invite.client_name.split(/\s+/)[0]}, how` : 'How'} was your experience with {businessName}?
      </p>
      <StarPicker token={params.token} />
      <p className="review-gate-fine">
        The rating is for {businessName}&apos;s own records.{' '}
        {routes.googleUrl ? (
          <>
            You can also go <a href={`/review/${params.token}/google`}>straight to Google</a> or{' '}
            <Link href={`/review/${params.token}?step=feedback`}>send private feedback</Link>.
          </>
        ) : (
          <Link href={`/review/${params.token}?step=feedback`}>Send private feedback instead</Link>
        )}
      </p>
    </Shell>
  );
}
