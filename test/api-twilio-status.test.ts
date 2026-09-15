import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/twilio/status/route';
import { POST as RealPost } from '@/app/api/sms/status/route';

vi.mock('@/app/api/sms/status/route', () => ({
  POST: vi.fn(),
}));

describe('Twilio Status Alias Route', () => {
  it('exports POST from sms/status', () => {
    expect(POST).toBe(RealPost);
  });
});
