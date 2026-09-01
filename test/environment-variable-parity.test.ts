import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Master Production Environment Variable Parity & Sanitization Audit', () => {
  const envExamplePath = path.join(process.cwd(), '.env.example');
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  // Extract all variable names from .env.example
  const variableNames = envContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.split('=')[0]!.trim());

  const uniqueVariables = new Set(variableNames);

  it('documents all launch-critical production variables in .env.example', () => {
    const requiredProductionKeys = [
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_ROOT_DOMAIN',
      'DATABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'STRIPE_SECRET_KEY',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_BILLING_WEBHOOK_SECRET',
      'LGQ_STRIPE_BILLING_WEBHOOK_ENABLED',
      'STRIPE_PRICE_SOLO_MONTHLY',
      'STRIPE_PRICE_SOLO_ANNUAL',
      'STRIPE_PRICE_GROWTH_MONTHLY',
      'STRIPE_PRICE_GROWTH_ANNUAL',
      'STRIPE_PRICE_SCALE_MONTHLY',
      'STRIPE_PRICE_SCALE_ANNUAL',
      'RESEND_API_KEY',
      'SIGNALWIRE_PROJECT_ID',
      'SIGNALWIRE_API_TOKEN',
      'SIGNALWIRE_SPACE_URL',
      'SIGNALWIRE_FROM_NUMBER',
      'LGQ_SMS_PROVIDER',
      'CRON_SECRET',
      'TAX_VAULT_ENCRYPTION_KEY',
      'WEBHOOK_VAULT_ENCRYPTION_KEY',
    ];

    for (const key of requiredProductionKeys) {
      expect(uniqueVariables.has(key)).toBe(true);
    }
  });

  it('strictly isolates sensitive server secrets from NEXT_PUBLIC_ client prefix', () => {
    const sensitiveSecretNames = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_BILLING_WEBHOOK_SECRET',
      'RESEND_API_KEY',
      'SIGNALWIRE_API_TOKEN',
      'TWILIO_AUTH_TOKEN',
      'TAX_VAULT_ENCRYPTION_KEY',
      'WEBHOOK_VAULT_ENCRYPTION_KEY',
      'CLOSURE_ENCRYPTION_SECRET',
      'CRON_SECRET',
      'DATABASE_URL',
    ];

    for (const secret of sensitiveSecretNames) {
      // Must exist as server secret
      expect(uniqueVariables.has(secret)).toBe(true);
      // Must NOT exist with NEXT_PUBLIC_ prefix
      expect(uniqueVariables.has(`NEXT_PUBLIC_${secret}`)).toBe(false);
    }
  });

  it('verifies client-exposed NEXT_PUBLIC_ variables contain only publishable/safe metadata', () => {
    const publicKeys = Array.from(uniqueVariables).filter(k => k.startsWith('NEXT_PUBLIC_'));

    expect(publicKeys.length).toBeGreaterThan(0);

    for (const pubKey of publicKeys) {
      // Disallow any accidental SECRET or PRIVATE substrings in public keys
      expect(pubKey).not.toMatch(/SECRET/i);
      expect(pubKey).not.toMatch(/PRIVATE/i);
      expect(pubKey).not.toMatch(/SERVICE_ROLE/i);
      expect(pubKey).not.toMatch(/PASSWORD/i);
    }
  });

  it('documents canonical 6-tier Stripe plan price IDs with valid format comments', () => {
    const priceKeys = [
      'STRIPE_PRICE_SOLO_MONTHLY',
      'STRIPE_PRICE_SOLO_ANNUAL',
      'STRIPE_PRICE_GROWTH_MONTHLY',
      'STRIPE_PRICE_GROWTH_ANNUAL',
      'STRIPE_PRICE_SCALE_MONTHLY',
      'STRIPE_PRICE_SCALE_ANNUAL',
    ];

    for (const key of priceKeys) {
      expect(envContent).toContain(`${key}=`);
    }
  });
});
