import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createContinuationToken,
  verifyContinuationToken,
} from '../src/lib/estimate-continuation-token';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('stateless estimate continuation token & OpenAI route', () => {
  it('creates and verifies valid encrypted continuation tokens', () => {
    const token = createContinuationToken({
      siteId: 'site-xyz-123',
      turn: 2,
      history: [
        { role: 'user', content: 'Need a water heater fixed' },
        { role: 'assistant', content: [{ type: 'message', content: [{ type: 'output_text', text: '{"type":"question"}' }] }] },
      ],
    });

    expect(token).toBeDefined();
    expect(token.split(':').length).toBe(3); // iv:tag:data

    const verified = verifyContinuationToken(token, 'site-xyz-123');
    expect(verified).toBeDefined();
    expect(verified?.siteId).toBe('site-xyz-123');
    expect(verified?.turn).toBe(2);
    expect(verified?.history.length).toBe(2);
  });

  it('rejects expired or mismatched site tokens', () => {
    const expiredToken = createContinuationToken({
      siteId: 'site-xyz-123',
      turn: 1,
      history: [],
      ttlMs: -1000, // already expired
    });

    expect(verifyContinuationToken(expiredToken, 'site-xyz-123')).toBeNull();

    const validToken = createContinuationToken({
      siteId: 'site-xyz-123',
      turn: 1,
      history: [],
    });

    expect(verifyContinuationToken(validToken, 'different-site')).toBeNull();
    expect(verifyContinuationToken('tampered:token:format', 'site-xyz-123')).toBeNull();
  });

  it('verifies classify-estimate/route.ts uses store: false without previous_response_id', () => {
    const routeContent = read('src/app/api/public/leads/classify-estimate/route.ts');

    // Must have store: false
    expect(routeContent).toContain('store: false');

    // Must NOT pass previous_response_id to OpenAI
    expect(routeContent).not.toContain('previous_response_id:');

    // Must use verifyContinuationToken and createContinuationToken
    expect(routeContent).toContain('verifyContinuationToken');
    expect(routeContent).toContain('createContinuationToken');
  });
});
