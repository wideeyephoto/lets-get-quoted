import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('MailIcon across pages', () => {
  it('verifies MailIcon component exists and renders an SVG envelope with stroke currentColor', () => {
    const iconSrc = readFileSync('src/components/MailIcon.tsx', 'utf8');
    expect(iconSrc).toContain('<svg');
    expect(iconSrc).toContain('stroke="currentColor"');
    expect(iconSrc).toContain('fill="none"');
    expect(iconSrc).toContain('<rect');
  });

  it('verifies ClientSmoothieView uses MailIcon instead of emoji ✉️', () => {
    const src = readFileSync('src/app/dashboard/clients/ClientSmoothieView.tsx', 'utf8');
    expect(src).toContain('<MailIcon /> Email');
    expect(src).not.toContain('✉️ Email');
  });

  it('verifies ClientFocusView uses MailIcon instead of emoji ✉️', () => {
    const src = readFileSync('src/app/dashboard/clients/ClientFocusView.tsx', 'utf8');
    expect(src).toContain('<MailIcon /> Email');
    expect(src).not.toContain('✉️ Email');
  });

  it('verifies Client detail page uses MailIcon instead of emoji ✉️', () => {
    const src = readFileSync('src/app/dashboard/clients/[id]/page.tsx', 'utf8');
    expect(src).toContain('<MailIcon /> Email');
    expect(src).not.toContain('✉️ Email');
  });

  it('verifies LeadSmoothieView uses MailIcon instead of emoji ✉️', () => {
    const src = readFileSync('src/app/dashboard/leads/LeadSmoothieView.tsx', 'utf8');
    expect(src).toContain('<MailIcon /> Email customer');
    expect(src).not.toContain('✉️ Email customer');
  });
});
