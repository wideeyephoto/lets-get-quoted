'use client';

// This page handles the magic-link confirmation using a token_hash URL.
// Because the verification call only happens inside useEffect (client-side JS),
// email scanners that pre-fetch the URL cannot consume the token.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';

function ConfirmPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as
      | 'magiclink'
      | 'signup'
      | 'recovery'
      | 'invite'
      | null;

    if (!tokenHash || !type) {
      setErrorMessage('Invalid confirmation link — token_hash or type is missing.');
      return;
    }

    const supabase = createBrowserClient(
      normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    );

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error, data }) => {
      if (error) {
        console.error('verifyOtp error:', error);
        setErrorMessage(error.message);
      } else {
        console.log('verifyOtp success:', data);
        router.replace('/dashboard');
      }
    }).catch((err) => {
      console.error('verifyOtp exception:', err);
      setErrorMessage(err.message || 'An unexpected error occurred');
    });
  }, [searchParams, router]);

  if (errorMessage) {
    return (
      <main className="page-shell">
        <section className="hero-card">
          <p className="eyebrow">Sign-in error</p>
          <h1>Confirmation failed</h1>
          <p>{errorMessage}</p>
          <a href="/login" className="btn primary">Back to sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Signing you in</p>
        <h1>One moment…</h1>
        <p>Verifying your magic link.</p>
      </section>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <section className="hero-card">
            <p className="eyebrow">Signing you in</p>
            <h1>One moment…</h1>
            <p>Verifying your magic link.</p>
          </section>
        </main>
      }
    >
      <ConfirmPageInner />
    </Suspense>
  );
}
