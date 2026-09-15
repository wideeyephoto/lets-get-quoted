import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/twilio/inbound/route';
import { POST as RealPost } from '@/app/api/sms/inbound/route';

vi.mock('@/app/api/sms/inbound/route', () => ({
  POST: vi.fn(),
}));

describe('Twilio Inbound Alias Route', () => {
  it('exports POST from sms/inbound', () => {
    expect(POST).toBe(RealPost);
  });
});
