import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAYMENTS = readFileSync(join(process.cwd(), 'src/lib/payments.ts'), 'utf8');
const SMS = readFileSync(join(process.cwd(), 'src/lib/sms.ts'), 'utf8');

describe('payment reads pin their PostgREST relationships', () => {
  it('uses the legacy payment account and job foreign keys on the public pay page', () => {
    expect(PAYMENTS.match(/job:jobs!payments_job_id_fkey\(client_name, ref\)/g)).toHaveLength(2);
    expect(
      PAYMENTS.match(
        /account:accounts!payments_account_id_fkey\(business_name, stripe_connect_id, connect_onboarded, payouts_restricted_at\)/g,
      ),
    ).toHaveLength(2);
    expect(PAYMENTS).not.toContain('job:jobs(client_name, ref)');
    expect(PAYMENTS).not.toContain(
      'account:accounts(business_name, stripe_connect_id, connect_onboarded, payouts_restricted_at)',
    );
  });

  it('uses the legacy payment account foreign key before deciding whether to send SMS', () => {
    expect(SMS).toContain('account:accounts!payments_account_id_fkey(business_name)');
    expect(SMS).not.toContain('account:accounts(business_name)');
  });
});
