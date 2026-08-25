import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Client Rescheduling Safety', () => {
  it('verifies public tracking page does not mount unbacked reschedule card', () => {
    const trackPageContent = readFileSync(
      join(process.cwd(), 'src/app/track/[token]/page.tsx'),
      'utf8',
    );

    expect(trackPageContent).not.toContain('<SelfServiceRescheduleCard');
    expect(trackPageContent).not.toContain('SelfServiceRescheduleCard');
  });

  it('verifies SelfServiceRescheduleCard does not use simulated timeout fallback', () => {
    const cardContent = readFileSync(
      join(process.cwd(), 'src/components/portal/SelfServiceRescheduleCard.tsx'),
      'utf8',
    );

    expect(cardContent).not.toContain('setTimeout(resolve, 800)');
    expect(cardContent).not.toContain('Simulated API turnaround');
    expect(cardContent).toContain('Self-service rescheduling is currently unavailable');
  });
});
