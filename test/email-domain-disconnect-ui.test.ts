import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ create: vi.fn(), verify: vi.fn(), remove: vi.fn() }));
vi.mock('@/app/dashboard/settings/email-domain-actions', () => ({
  createEmailSendingDomainAction: actions.create,
  verifyEmailSendingDomainAction: actions.verify,
  deleteEmailSendingDomainAction: actions.remove,
}));
import EmailSendingDomainSection from '@/app/dashboard/settings/EmailSendingDomainSection';
import type { EmailSendingDomainRow } from '@/app/dashboard/settings/email-domain-actions';

const domain: EmailSendingDomainRow = {
  id: 'owned-domain-row', account_id: 'owner-workspace', domain: 'contractor.example',
  from_local_part: 'hello', from_display_name: null, provider: 'resend', provider_domain_id: 'owned-provider-binding',
  status: 'verified', dns_records: [], failure_reason: null,
  last_checked_at: '2026-09-09T22:48:00Z', verified_at: '2026-09-09T22:48:00Z',
  created_at: '2026-09-09T22:11:00Z', updated_at: '2026-09-09T22:48:00Z',
};
let renderer: ReactTestRenderer;
let focused: unknown;
const nativeConfirm = vi.fn(() => { throw new Error('Native confirmation is unavailable'); });

function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
}
function button(label: string): ReactTestInstance {
  const result = renderer.root.findAllByType('button').find(node => text(node) === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => { await button(label).props.onClick(); });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('React', React);
  vi.stubGlobal('confirm', nativeConfirm);
  focused = undefined;
  actions.remove.mockResolvedValue({ success: true });
  await act(async () => {
    renderer = create(React.createElement(EmailSendingDomainSection, { initialDomain: domain, isEnabled: true }), {
      createNodeMock: element => element.type === 'button' ? { focus: () => { focused = element.props.children; } } : null,
    });
  });
});

afterEach(async () => {
  await act(async () => { renderer.unmount(); });
  vi.unstubAllGlobals();
});

describe('email domain disconnect confirmation', () => {
  it('shows a saved provider-loss reason on initial load and exposes the recovery link target', async () => {
    const reason = 'This domain is no longer registered with the email provider. Reconnect it to start sending from it again.';
    await act(async () => {
      renderer.unmount();
      renderer = create(React.createElement(EmailSendingDomainSection, {
        initialDomain: { ...domain, status: 'failed', verified_at: null, failure_reason: reason }, isEnabled: true,
      }));
    });
    expect(renderer.root.findByProps({ id: 'email-domain' })).toBeDefined();
    expect(text(renderer.root.findByProps({ role: 'status' }))).toBe(reason);
    expect(text(renderer.root)).toContain('Connection needs attention');
    expect(text(renderer.root)).not.toContain('Pending DNS verification');
    expect(actions.verify).not.toHaveBeenCalled();
  });

  it('opens an on-page confirmation and lets the owner cancel without deleting anything', async () => {
    await click('Disconnect');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ role: 'group' }).props['aria-label']).toBe('Disconnect contractor.example?');
    expect(focused).toBe('Keep domain connected');

    await click('Keep domain connected');
    expect(renderer.root.findAllByProps({ role: 'group' })).toHaveLength(0);
    expect(actions.remove).not.toHaveBeenCalled();
    expect(focused).toBe('Disconnect');
  });

  it('allows Escape to cancel without invoking the server action', async () => {
    await click('Disconnect');
    const preventDefault = vi.fn();
    await act(async () => {
      renderer.root.findByProps({ role: 'group' }).props.onKeyDown({ key: 'Escape', preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(actions.remove).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: 'group' })).toHaveLength(0);
  });

  it('requires the second action, blocks rapid duplicate requests, and shows completion only after success', async () => {
    let finish!: (value: { success: boolean }) => void;
    actions.remove.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await click('Disconnect');
    const confirm = button('Disconnect domain').props.onClick;
    let pending!: Promise<void>;
    await act(async () => { pending = confirm(); await confirm(); });
    expect(actions.remove).toHaveBeenCalledTimes(1);
    expect(actions.remove).toHaveBeenCalledWith('owned-domain-row');
    expect(button('Disconnecting…').props.disabled).toBe(true);
    expect(button('Keep domain connected').props.disabled).toBe(true);
    expect(text(renderer.root)).not.toContain('Sending domain disconnected.');

    await act(async () => { finish({ success: true }); await pending; });
    expect(text(renderer.root)).toContain('Sending domain disconnected.');
    expect(renderer.root.findAllByProps({ role: 'group' })).toHaveLength(0);
    expect(button('Connect Email Domain')).toBeDefined();
  });

  it('reports a failed disconnect and permits a deliberate retry without claiming success', async () => {
    actions.remove.mockRejectedValueOnce(new Error('Could not delete domain from provider. Domain was disabled instead.'));
    await click('Disconnect');
    await click('Disconnect domain');
    expect(text(renderer.root.findByProps({ role: 'alert' }))).toContain('Domain was disabled instead.');
    expect(text(renderer.root)).not.toContain('Sending domain disconnected.');
    expect(button('Disconnect domain').props.disabled).toBe(false);

    await click('Disconnect domain');
    expect(actions.remove).toHaveBeenCalledTimes(2);
    expect(text(renderer.root)).toContain('Sending domain disconnected.');
  });
});
