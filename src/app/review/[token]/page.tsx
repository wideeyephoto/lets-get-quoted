import { createAdminClient } from '@/lib/auth';
import { getReviewInviteByToken } from '@/lib/reviews';
import SaveButton from '@/components/save-button';
import StarPicker from './StarPicker';
import { submitFeedbackAction } from './actions';

export const dynamic = 'force-dynamic';

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

export default async function ReviewGatePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { step?: string; done?: string };
}) {
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
  const done = searchParams.done === '1';

  // Thank-you: happy client already routed to Google, or private feedback sent.
  if (done || invite.routed_to) {
    return (
      <Shell eyebrow={businessName} title={invite.routed_to === 'private' ? 'Thank you — we hear you' : 'Thank you! 🙏'}>
        <p className="workspace-lead">
          {invite.routed_to === 'private'
            ? `Thanks for the honest feedback. ${businessName} got it directly and will reach out to make things right.`
            : `Thanks for taking a moment. Reviews mean the world to a small business like ${businessName}.`}
        </p>
      </Shell>
    );
  }

  // Low rating recorded — collect the private note.
  if (searchParams.step === 'feedback' || (invite.rating !== null && invite.rating <= 3)) {
    return (
      <Shell eyebrow={businessName} title="Sorry we missed the mark">
        <p className="workspace-lead">
          Tell {businessName} what went wrong — it goes straight to the owner, privately, so they can make it right.
        </p>
        <form action={submitFeedbackAction.bind(null, params.token)} className="review-feedback-form">
          <textarea name="feedback" rows={5} placeholder="What happened? What would have made it better?" required aria-label="Your feedback" />
          <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Send private feedback</SaveButton>
        </form>
      </Shell>
    );
  }

  // First view — pick a rating.
  return (
    <Shell eyebrow={businessName} title="How did we do?">
      <p className="workspace-lead">
        {invite.client_name ? `${invite.client_name.split(/\s+/)[0]}, how` : 'How'} was your experience with {businessName}? Tap a rating.
      </p>
      <StarPicker token={params.token} />
      <p className="review-gate-fine">Your rating is private until you choose to post it.</p>
    </Shell>
  );
}
