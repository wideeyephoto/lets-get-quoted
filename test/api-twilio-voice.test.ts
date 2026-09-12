import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/twilio/voice/route';
import { POST as RealPost } from '@/app/api/sms/voice/route';

vi.mock('@/app/api/sms/voice/route', () => ({
  POST: vi.fn(),
}));

describe('Twilio Voice Alias Route', () => {
  it('exports POST from sms/voice', () => {
    expect(POST).toBe(RealPost);
  });
});
