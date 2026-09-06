import CrewLoginForm from './CrewLoginForm';

export const dynamic = 'force-dynamic';

export default async function CrewLoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const error =
    searchParams.error === 'not-crew'
      ? "That email or phone number isn't on a crew roster yet. Ask your manager to add you and send an invite."
      : searchParams.error
        ? decodeURIComponent(searchParams.error)
        : null;

  return (
    <main className="field-login">
      <div className="field-login-card">
        <p className="field-login-eyebrow">Field app</p>
        <h1>Crew sign-in</h1>
        <p className="field-login-lead">
          Enter your mobile number or email and we&apos;ll send you a sign-in code or link. No password to remember.
        </p>
        <CrewLoginForm initialError={error} />
        <p className="field-login-foot">Not on a crew? <a href="/login">Owner sign-in →</a></p>
      </div>
    </main>
  );
}
