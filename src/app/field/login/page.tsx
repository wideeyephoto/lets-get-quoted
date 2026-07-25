import CrewLoginForm from './CrewLoginForm';

export const dynamic = 'force-dynamic';

export default function CrewLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error =
    searchParams.error === 'not-crew'
      ? "That email isn't on a crew roster yet. Ask your manager to add you and send an invite."
      : searchParams.error
        ? decodeURIComponent(searchParams.error)
        : null;

  return (
    <main className="field-login">
      <div className="field-login-card">
        <p className="field-login-eyebrow">Field app</p>
        <h1>Crew sign-in</h1>
        <p className="field-login-lead">
          Enter your email and we&apos;ll send you a one-tap sign-in link. No password to remember.
        </p>
        <CrewLoginForm initialError={error} />
        <p className="field-login-foot">Not on a crew? <a href="/login">Owner sign-in →</a></p>
      </div>
    </main>
  );
}
