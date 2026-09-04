import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VoiceStatusBanner } from '@/app/dashboard/voice-calls/VoiceControlsSection';

describe('VoiceStatusBanner rendering invariants', () => {
  it('renders Online & Answering with formatted phone number when route is ready and status is active', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceStatusBanner, {
        status: 'active',
        answerMode: 'always',
        dedicatedNumber: '+18103202687',
        isReady: true,
        businessName: 'BrokePipes Plumbing',
        trade: 'plumbing',
      }),
    );

    expect(html).toContain('Online &amp; Answering');
    expect(html).toContain('(810) 320-2687');
    expect(html).toContain('Mode: 24/7 All Inbound Calls');
    expect(html).toContain('BrokePipes Plumbing · Plumbing Assistant');
    expect(html).not.toContain('No Dedicated Line');
    expect(html).not.toContain('Dedicated line not connected');
  });

  it('renders Paused status and appropriate subtext when route is ready but status is paused', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceStatusBanner, {
        status: 'paused',
        answerMode: 'always',
        dedicatedNumber: '+18103202687',
        isReady: true,
        businessName: 'BrokePipes Plumbing',
        trade: 'plumbing',
      }),
    );

    expect(html).toContain('Paused');
    expect(html).toContain('Dedicated line (810) 320-2687 · Answering paused');
    expect(html).not.toContain('No Dedicated Line');
    expect(html).not.toContain('Dedicated line not connected');
  });

  it('renders Off status and appropriate subtext when route is ready but status is off', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceStatusBanner, {
        status: 'off',
        answerMode: 'always',
        dedicatedNumber: '+18103202687',
        isReady: true,
        businessName: 'BrokePipes Plumbing',
        trade: 'plumbing',
      }),
    );

    expect(html).toContain('Off');
    expect(html).toContain('Dedicated line (810) 320-2687 · Answering off');
    expect(html).not.toContain('No Dedicated Line');
    expect(html).not.toContain('Dedicated line not connected');
  });

  it('renders Verification Pending without falsely claiming no dedicated line when a line exists but route is not verified', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceStatusBanner, {
        status: 'active',
        answerMode: 'always',
        dedicatedNumber: '+18103202687',
        isReady: false,
        businessName: 'BrokePipes Plumbing',
        trade: 'plumbing',
      }),
    );

    expect(html).toContain('Standby · Verification Pending');
    expect(html).toContain('Dedicated line (810) 320-2687 connected · Verification in progress');
    expect(html).not.toContain('No Dedicated Line');
    expect(html).not.toContain('Dedicated line not connected');
  });

  it('renders Standby · No Dedicated Line only when no dedicated number is assigned at all', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceStatusBanner, {
        status: 'active',
        answerMode: 'always',
        dedicatedNumber: null,
        isReady: false,
        businessName: 'BrokePipes Plumbing',
        trade: 'plumbing',
      }),
    );

    expect(html).toContain('Standby · No Dedicated Line');
    expect(html).toContain('Dedicated line not connected · Setup required before AI can answer live calls');
  });
});
