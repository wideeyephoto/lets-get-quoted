import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPortalMessageAction: vi.fn(),
  trackPortalEvent: vi.fn(),
}));

vi.mock('@/app/portal/view/[token]/actions', () => ({
  sendPortalMessageAction: mocks.sendPortalMessageAction,
}));

vi.mock('@/lib/analytics', () => ({
  trackPortalEvent: mocks.trackPortalEvent,
}));

import { PortalMessageForm } from '@/app/portal/view/[token]/PortalMessageForm';
import { ReferralButtons } from '@/app/portal/view/[token]/ReferralButtons';

function text(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : text(child)))
    .join('');
}

describe('Portal UI Interactions (react-test-renderer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).document = {
      getElementById: vi.fn().mockReturnValue({ reset: vi.fn() }),
    };
  });

  describe('PortalMessageForm', () => {
    it('renders message form and handles job selection', () => {
      let renderer: ReactTestRenderer | undefined;
      const jobs = [
        { id: 'job-1', ref: 'JOB-101', scope: 'Roof Repair' },
        { id: 'job-2', ref: 'JOB-102', scope: 'Gutter Guard' },
      ];

      act(() => {
        renderer = create(
          React.createElement(PortalMessageForm, {
            token: 'portal-token-xyz',
            businessName: 'Apex Roofing',
            jobs,
          })
        );
      });

      const root = renderer!.root;
      const select = root.findByType('select');
      expect(select).toBeDefined();
      expect(select.props.value).toBe('');

      // Change selected job
      act(() => {
        select.props.onChange({ target: { value: 'job-1' } });
      });
      expect(select.props.value).toBe('job-1');

      const textarea = root.findByType('textarea');
      expect(textarea.props.placeholder).toContain('Apex Roofing');
    });

    it('submits form, calls onOptimisticSend and displays success status', async () => {
      let renderer: ReactTestRenderer | undefined;
      const onOptimisticSend = vi.fn();
      mocks.sendPortalMessageAction.mockResolvedValue({ ok: true });

      act(() => {
        renderer = create(
          React.createElement(PortalMessageForm, {
            token: 'portal-token-xyz',
            businessName: 'Apex Roofing',
            onOptimisticSend,
          })
        );
      });

      const root = renderer!.root;
      const form = root.findByType('form');

      const formData = new FormData();
      formData.append('message', 'When will the crew arrive tomorrow?');

      await act(async () => {
        await form.props.action(formData);
      });

      expect(onOptimisticSend).toHaveBeenCalledWith('When will the crew arrive tomorrow?', null);
      expect(mocks.sendPortalMessageAction).toHaveBeenCalledWith('portal-token-xyz', expect.any(FormData));

      const renderedText = text(root);
      expect(renderedText).toContain('Your message was sent directly to Apex Roofing.');
    });

    it('displays error message when action fails', async () => {
      let renderer: ReactTestRenderer | undefined;
      mocks.sendPortalMessageAction.mockResolvedValue({
        ok: false,
        message: 'Message rate limit exceeded. Please wait a minute.',
      });

      act(() => {
        renderer = create(
          React.createElement(PortalMessageForm, {
            token: 'portal-token-xyz',
            businessName: 'Apex Roofing',
          })
        );
      });

      const root = renderer!.root;
      const form = root.findByType('form');

      const formData = new FormData();
      formData.append('message', 'Hello?');

      await act(async () => {
        await form.props.action(formData);
      });

      const renderedText = text(root);
      expect(renderedText).toContain('Message rate limit exceeded. Please wait a minute.');
    });
  });

  describe('ReferralButtons', () => {
    it('renders SMS and Email share links with encoded parameters and tracks clicks', () => {
      let renderer: ReactTestRenderer | undefined;
      const shareText = 'Check out Apex Roofing at https://apex.example.com';
      const businessName = 'Apex Roofing';

      act(() => {
        renderer = create(
          React.createElement(ReferralButtons, {
            shareText,
            businessName,
          })
        );
      });

      const root = renderer!.root;
      const links = root.findAllByType('a');
      expect(links).toHaveLength(2);

      const smsLink = links[0];
      expect(smsLink.props.href).toContain('sms:?&body=');
      expect(smsLink.props.href).toContain(encodeURIComponent(shareText));

      const emailLink = links[1];
      expect(emailLink.props.href).toContain('mailto:?subject=');
      expect(emailLink.props.href).toContain(encodeURIComponent('$50 off with Apex Roofing'));

      // Click tracks event
      act(() => {
        smsLink.props.onClick();
      });
      expect(mocks.trackPortalEvent).toHaveBeenCalledWith({ step: 'referral_shared' });
    });
  });
});
