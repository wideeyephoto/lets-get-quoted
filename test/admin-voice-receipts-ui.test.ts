import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/app/admin/failures/actions', () => ({ retryVoiceReceiptAction: { bind: () => '/test-retry' } }));
import VoiceReceiptFailures from '@/app/admin/failures/voice-receipts';
import type { PendingVoiceReceipt } from '@/lib/admin-voice-receipts';
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

const row: PendingVoiceReceipt = {
  id: '11111111-1111-4111-8111-111111111111', account_id: '22222222-2222-4222-8222-222222222222',
  provider_call_id: '33333333-3333-4333-8333-333333333333', processing_status: 'failed', attempt_count: 2,
  received_at: new Date(Date.now() - 3600000).toISOString(), next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  processing_lease_expires_at: null, last_error: 'settlement_failed',
};
describe('operator voice receipt view', () => {
  it('shows call reference, stage, retry history, and an authorized recovery control', () => {
    const html = renderToStaticMarkup(createElement(VoiceReceiptFailures, { result: { available: true, rows: [row], total: 1 }, canRetry: true }));
    expect(html).toContain(row.provider_call_id); expect(html).toContain('Usage settlement'); expect(html).toContain('2 / 5');
    expect(html).toContain('Retry receipt'); expect(html).toContain('Reason for retry');
    expect(html).toContain(`/admin/accounts/${row.account_id}`);
  });
  it('hides the mutation control from read-only operators', () => {
    const html = renderToStaticMarkup(createElement(VoiceReceiptFailures, { result: { available: true, rows: [row], total: 1 }, canRetry: false }));
    expect(html).not.toContain('<form'); expect(html).toContain('An operations administrator can retry.');
  });
  it('keeps unavailable and empty states distinct', () => {
    const unavailable = renderToStaticMarkup(createElement(VoiceReceiptFailures, { result: { available: false, rows: [], total: null }, canRetry: true }));
    expect(unavailable).toContain('status is unavailable'); expect(unavailable).not.toContain('No pending');
    const empty = renderToStaticMarkup(createElement(VoiceReceiptFailures, { result: { available: true, rows: [], total: 0 }, canRetry: true }));
    expect(empty).toContain('No pending or failed');
  });
  it('does not expose arbitrary errors or offer retry for exhausted receipts', () => {
    const html = renderToStaticMarkup(createElement(VoiceReceiptFailures, { result: { available: true, rows: [{ ...row, attempt_count: 5, last_error: 'private phone number' }], total: 101 }, canRetry: true }));
    expect(html).not.toContain('private phone number'); expect(html).not.toContain('<form'); expect(html).toContain('Needs review');
    expect(html).toContain('Showing the oldest 1 of 101');
  });
});
