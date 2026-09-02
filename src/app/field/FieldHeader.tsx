import React from 'react';
import Link from 'next/link';

// Field-app top bar: business + crew name, with a back link on detail pages and
// a native sign-out (POST to the shared /auth/signout route).
// Mimics the owner's navigation branding preference (navLogoTop).
export default function FieldHeader({
  businessName,
  crewName,
  backHref,
  /**
   * This person is on more than one roster. The business name stops being
   * decoration and becomes the control that changes which one you're looking
   * at — rendered ONLY in that case, because a "switch" affordance on a screen
   * with nothing to switch to is a dead end wearing a button.
   */
  switchable = false,
  logoUrl,
  navLogoTop = false,
}: {
  businessName: string;
  crewName: string;
  backHref?: string;
  switchable?: boolean;
  logoUrl?: string | null;
  navLogoTop?: boolean;
}) {
  const initials = (businessName || 'HQ').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'HQ';

  return (
    <header className="field-header">
      {backHref ? (
        <div className="field-header-back-wrap">
          <Link href={backHref} className="field-back" aria-label="Back to my jobs">‹ Jobs</Link>
          <div className="field-header-brand-wrap field-header-brand-wrap--sub">
            {navLogoTop ? (
              logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="field-header-logo field-header-logo--compact" />
              ) : (
                <span className="field-header-mark field-header-mark--compact" aria-hidden="true">
                  <span className="field-header-monogram">{initials}</span>
                </span>
              )
            ) : null}
            <span className="field-brand field-brand--compact">{businessName}</span>
          </div>
        </div>
      ) : (
        <div className="field-header-brand-wrap">
          {navLogoTop ? (
            logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="field-header-logo" />
            ) : (
              <span className="field-header-mark" aria-hidden="true">
                <span className="field-header-monogram">{initials}</span>
              </span>
            )
          ) : (
            <span className="field-header-lgq-badge" aria-label="Let's Get Quoted">
              <span className="field-header-lgq-wordmark">Let&apos;s Get <span>Quoted</span></span>
            </span>
          )}

          <div className="field-header-id">
            {switchable ? (
              <Link href="/field/choose" className="field-brand field-brand-switch">
                {businessName} <span aria-hidden="true">⇄</span>
                <span className="sr-only">Switch business</span>
              </Link>
            ) : (
              <span className="field-brand">{businessName}</span>
            )}
            <span className="field-crew">{crewName}</span>
          </div>
        </div>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="field-signout">Sign out</button>
      </form>
    </header>
  );
}
