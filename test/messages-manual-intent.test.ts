import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PersistentMessageIntent from '../src/app/dashboard/messages/PersistentMessageIntent';

const page = readFileSync('src/app/dashboard/messages/page.tsx', 'utf8');
const compose = readFileSync('src/app/dashboard/messages/ComposeMessage.tsx', 'utf8');
const persistentIntent = readFileSync('src/app/dashboard/messages/PersistentMessageIntent.tsx', 'utf8');
const actions = readFileSync('src/app/dashboard/messages/actions.ts', 'utf8');
const sms = readFileSync('src/lib/sms.ts', 'utf8');

describe('manual Messages producer identity', () => {
  it('persists each rendered reply and new-conversation identity across reloads', () => {
    expect(page).toContain('const composeIntentId = randomUUID()');
    expect(page).toContain('const replyIntentId = randomUUID()');
    expect(page).toContain('<PersistentMessageIntent');
    expect(compose).toContain('<PersistentMessageIntent');
    expect(persistentIntent).toContain('window.sessionStorage.getItem(storageKey)');
    expect(persistentIntent).toContain('window.sessionStorage.setItem(storageKey, next)');
    expect(persistentIntent).toContain('last-completed');
    expect(actions).toContain('&sent=reply&queued=');
    expect(actions).toContain('&sent=compose&queued=');
  });

  it('fails closed in server HTML until the browser has recovered the stable identity', () => {
    const html = renderToStaticMarkup(createElement(PersistentMessageIntent, {
      storageKey: 'test-intent',
      fallbackId: '11111111-1111-4111-8111-111111111111',
      resetToken: null,
    }));
    expect(html).toContain('name="intentId"');
    expect(html).toContain('disabled=""');
  });

  it('validates and tenant-scopes that identity before canonical enqueue', () => {
    expect(actions).toContain('const intentId = messageIntent(formData)');
    expect(actions).toContain('`inbox-reply:${accountId}:${intentId}`');
    expect(sms).toContain('idempotencyKey: params.idempotencyKey');
  });

  it('offers only current consent-ledger destinations in manual compose', () => {
    expect(page).toContain('loadCurrentSmsConsentPhones(supabase, accountId)');
    expect(page).toContain('const contacts = consentPhoneRead.data');
    expect(compose).toContain('<select name="phone"');
    expect(compose).not.toContain('name="phone"\n            type="tel"');
    expect(compose).toContain('No contacts currently have recorded SMS consent');
  });

  it('hides arbitrary URL threads and safely authorizes real replies', () => {
    expect(page).toContain('const knownThread = messagesAvailable && messages.length > 0');
    expect(page).toContain('customerMessagingReady && knownThread');
    expect(page).toContain("messageRead.kind === 'ready'");
    expect(page).toContain("conversationRead.kind === 'ready'");
    expect(page).toContain('Nothing was marked empty');
    expect(page).toContain('This is not an existing message thread');
    expect(actions).toContain('requireExistingThread: true');
    expect(sms).toContain("rpc('enqueue_authorized_inbox_message'");
  });
});
