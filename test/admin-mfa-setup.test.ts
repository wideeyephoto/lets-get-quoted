import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MfaPanel from '@/app/admin/security/MfaPanel';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { mfa: {} } } }));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('Admin MFA setup', () => {
  it('offers authenticator-code MFA without unsupported passkey enrollment or Dashboard instructions', () => {
    const html = renderToStaticMarkup(React.createElement(MfaPanel, {
      stepUp: false, accountEmail: 'staff@example.com',
    }));
    expect(html).toContain('Google Authenticator, Apple Passwords');
    expect(html).not.toContain('Set up Passkey');
    expect(html).not.toContain('Supabase Dashboard');
    expect(html).not.toContain('High-impact actions are unlocked');
  });

  it('continues to require session verification for protected actions', () => {
    const html = renderToStaticMarkup(React.createElement(MfaPanel, {
      stepUp: true, accountEmail: 'staff@example.com',
    }));
    expect(html).toContain('This action needs an authenticator check before it can continue.');
    expect(html).not.toContain('MFA verified');
  });
});
