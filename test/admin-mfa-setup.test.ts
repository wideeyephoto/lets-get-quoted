import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MfaPanel from '@/app/admin/security/MfaPanel';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { mfa: {} } } }));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('Admin MFA setup', () => {
  it('offers native passkeys with a required authenticator backup and no provider Dashboard instructions', () => {
    const html = renderToStaticMarkup(React.createElement(MfaPanel, {
      stepUp: false, accountEmail: 'staff@example.com', accountId: 'staff-user',
    }));
    expect(html).toContain('Apple Passwords, Dashlane');
    expect(html).toContain('Add passkey');
    expect(html).toContain('Set up authenticator backup');
    expect(html).toContain('before adding a passkey');
    expect(html).not.toContain('Supabase Dashboard');
    expect(html).not.toContain('High-impact actions are unlocked');
  });

  it('continues to require session verification for protected actions', () => {
    const html = renderToStaticMarkup(React.createElement(MfaPanel, {
      stepUp: true, accountEmail: 'staff@example.com', accountId: 'staff-user',
    }));
    expect(html).toContain('This action needs an authenticator check before it can continue.');
    expect(html).not.toContain('MFA verified');
  });
});
