import { describe, it, expect, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { getWebAuthnMfaClient, WebAuthnMfaClient } from '@/app/admin/security/MfaPanel';

describe('Admin WebAuthn MFA SDK Contract & Helpers', () => {
  describe('Real SDK Instance Contract', () => {
    it('verifies supabase.auth.mfa exists and provides standard MFA operations', () => {
      expect(supabase.auth.mfa).toBeDefined();
      expect(typeof supabase.auth.mfa.enroll).toBe('function');
      expect(typeof supabase.auth.mfa.challenge).toBe('function');
      expect(typeof supabase.auth.mfa.verify).toBe('function');
      expect(typeof supabase.auth.mfa.unenroll).toBe('function');
      expect(typeof supabase.auth.mfa.listFactors).toBe('function');
      expect(typeof supabase.auth.mfa.getAuthenticatorAssuranceLevel).toBe('function');
    });

    it('verifies supabase.auth.mfa.webauthn exists on the real SDK instance', () => {
      const mfa = supabase.auth.mfa as unknown as { webauthn?: WebAuthnMfaClient };
      expect(mfa.webauthn).toBeDefined();
      expect(typeof mfa.webauthn).toBe('object');
    });

    it('asserts that _register or register is a callable function on supabase.auth.mfa.webauthn', () => {
      const mfa = supabase.auth.mfa as unknown as { webauthn?: WebAuthnMfaClient };
      const hasRegister =
        typeof mfa.webauthn?._register === 'function' ||
        typeof mfa.webauthn?.register === 'function';
      expect(hasRegister).toBe(true);
    });

    it('asserts that _authenticate or authenticate is a callable function on supabase.auth.mfa.webauthn', () => {
      const mfa = supabase.auth.mfa as unknown as { webauthn?: WebAuthnMfaClient };
      const hasAuthenticate =
        typeof mfa.webauthn?._authenticate === 'function' ||
        typeof mfa.webauthn?.authenticate === 'function';
      expect(hasAuthenticate).toBe(true);
    });

    it('resolves callable registerFn and authenticateFn from the real SDK client via getWebAuthnMfaClient', () => {
      const { webauthn, registerFn, authenticateFn } = getWebAuthnMfaClient(supabase.auth);
      expect(webauthn).toBeDefined();
      expect(typeof registerFn).toBe('function');
      expect(typeof authenticateFn).toBe('function');
    });
  });

  describe('Fail-Loud Guard Behavior', () => {
    it('throws explicitly when webauthn is undefined on auth client', () => {
      const mockClient = { mfa: {} } as any;
      expect(() => getWebAuthnMfaClient(mockClient)).toThrow(
        'WebAuthn MFA is not available: supabase.auth.mfa.webauthn is undefined.'
      );
    });

    it('throws explicitly when registration method is missing on webauthn', () => {
      const mockClient = {
        mfa: {
          webauthn: {
            authenticate: vi.fn(),
          },
        },
      } as any;

      expect(() => getWebAuthnMfaClient(mockClient)).toThrow(
        'WebAuthn MFA methods missing on SDK client: register=false, authenticate=true'
      );
    });

    it('throws explicitly when authentication method is missing on webauthn', () => {
      const mockClient = {
        mfa: {
          webauthn: {
            _register: vi.fn(),
          },
        },
      } as any;

      expect(() => getWebAuthnMfaClient(mockClient)).toThrow(
        'WebAuthn MFA methods missing on SDK client: register=true, authenticate=false'
      );
    });

    it('correctly binds methods to the webauthn receiver when using _register / _authenticate', async () => {
      let wasRegistrationBoundCorrectly = false;
      let wasAuthBoundCorrectly = false;

      const mockWebAuthn: WebAuthnMfaClient = {
        async _register(options) {
          if ((this as unknown) === mockWebAuthn) {
            wasRegistrationBoundCorrectly = true;
          }
          return { data: { id: 'factor-123', friendly_name: options.friendlyName }, error: null };
        },
        async _authenticate(options) {
          if ((this as unknown) === mockWebAuthn) {
            wasAuthBoundCorrectly = true;
          }
          return { data: { factorId: options.factorId }, error: null };
        },
      };

      const mockClient = {
        mfa: {
          webauthn: mockWebAuthn,
        },
      } as any;

      const { registerFn, authenticateFn } = getWebAuthnMfaClient(mockClient);

      const regRes = await registerFn({ friendlyName: 'Passkey Test' });
      expect(regRes.data).toEqual({ id: 'factor-123', friendly_name: 'Passkey Test' });
      expect(wasRegistrationBoundCorrectly).toBe(true);

      const authRes = await authenticateFn({ factorId: 'factor-123' });
      expect(authRes.data).toEqual({ factorId: 'factor-123' });
      expect(wasAuthBoundCorrectly).toBe(true);
    });
  });
});
