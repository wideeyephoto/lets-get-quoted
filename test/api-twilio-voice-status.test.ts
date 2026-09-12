import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/twilio/voice/status/route';
import { POST as RealPost } from '@/app/api/sms/voice/status/route';

vi.mock('@/app/api/sms/voice/status/route', () => ({
  POST: vi.fn(),
}));

describe('Twilio Voice Status Alias Route', () => {
  it('exports POST from sms/voice/status', () => {
    expect(POST).toBe(RealPost);
  });
});
