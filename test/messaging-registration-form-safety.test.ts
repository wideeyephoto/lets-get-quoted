import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PersistedApplicationForm from '../src/app/dashboard/messages/dedicated-number/PersistedApplicationForm';

const ownerAction = readFileSync('src/app/dashboard/messages/dedicated-number/actions.ts', 'utf8');
const ownerPage = readFileSync('src/app/dashboard/messages/dedicated-number/page.tsx', 'utf8');
const persistedForm = readFileSync('src/app/dashboard/messages/dedicated-number/PersistedApplicationForm.tsx', 'utf8');
const adminAction = readFileSync('src/app/admin/messaging/registrations/actions.ts', 'utf8');
const adminPage = readFileSync('src/app/admin/messaging/registrations/page.tsx', 'utf8');

describe('messaging registration form safety', () => {
  it('preserves the long owner application across validation redirects and clears only from durable state', () => {
    expect(ownerPage).toContain('<PersistedApplicationForm');
    expect(ownerPage).toContain('<ApplicationDraftLifecycle');
    expect(ownerPage).toContain('clear={Boolean(application && !canSubmit)}');
    expect(persistedForm).toContain('window.sessionStorage.setItem(storageKey, JSON.stringify(draft))');
    expect(persistedForm).toContain('window.sessionStorage.getItem(storageKey)');
    expect(persistedForm).toContain("element.name === 'submissionKey'");
    expect(persistedForm).toContain("element.name === 'attested'");
    expect(persistedForm).toContain("element.name === 'ein'");
    expect(persistedForm).toContain("element.name === 'taxId'");
    expect(persistedForm).toContain("if (name === 'attested' || name === 'submissionKey' || name === 'ein' || name === 'taxId') continue");
    expect(persistedForm).toContain('onSubmit={submit}');
  });

  it('collects EIN on the owner page while keeping full tax identity out of drafts and client records', () => {
    expect(ownerPage).toContain('name="ein"');
    expect(ownerPage).toContain('name="solePropNoEin"');
    expect(ownerPage).toContain('Your EIN is encrypted and transmitted directly to mobile carrier registries');
    expect(ownerPage).toContain('LGQ stores only the verified last four digits');
    expect(ownerAction).toContain('rawEin.replace(/\\D/g,');
    expect(ownerAction).toContain('recordMessagingComplianceVerification({');
    expect(ownerAction).toContain('einLastFour: einDigits.slice(-4)');
    expect(ownerAction).not.toContain('p_ein:');
  });

  it('renders the application controls disabled until the saved draft has restored', () => {
    const html = renderToStaticMarkup(createElement(PersistedApplicationForm, {
      action: '/registration-test' as unknown as (formData: FormData) => void,
      storageKey: 'registration:test',
      children: createElement('button', { type: 'submit' }, 'Submit'),
    }));

    expect(html).toContain('<fieldset disabled="" aria-busy="true"');
    expect(persistedForm).toContain('finally {');
    expect(persistedForm).toContain('setDraftRestored(true)');
    expect(persistedForm).toContain('if (!draftRestored)');
    expect(persistedForm).toContain('event.preventDefault()');
  });

  it('maps owner result codes to fixed copy instead of rendering query prose', () => {
    expect(ownerAction).toContain("back('error', 'invalid')");
    expect(ownerAction).toContain("back('error', 'save_failed')");
    expect(ownerAction).toContain("back('done', 'submitted')");
    expect(ownerPage).toContain("searchParams.done === 'submitted'");
    expect(ownerPage).toContain("application?.status === 'submitted'");
    expect(ownerPage).toContain("searchParams.error === 'save_failed'");
    expect(ownerPage).toContain('Boolean(application && !canSubmit)');
    expect(ownerPage).toContain('The application has a durable record. Its current status below is authoritative');
    expect(ownerPage).toContain('const errorMessage = !canSubmit');
    expect(ownerPage).not.toContain('Nothing was submitted or purchased');
    expect(ownerPage).not.toContain('>{searchParams.done}<');
    expect(ownerPage).not.toContain('>{searchParams.error}<');
  });

  it('routes owner submission failures through the redacting structured logger', () => {
    expect(ownerAction).toContain('logMessagingRegistrationActionFailure({');
    expect(ownerAction).toContain("action: 'owner_submit_dedicated_number_application'");
    expect(ownerAction).not.toContain("console.error('Dedicated number application failed:'");
  });

  it('does not present arbitrary query text as an authoritative admin outcome', () => {
    expect(adminAction).toContain("new URLSearchParams({ error: '1', correlation: correlationId })");
    expect(adminAction).toContain('logMessagingRegistrationActionFailure');
    expect(adminAction).not.toContain('providerError(error)');
    expect(adminAction).not.toContain('_message: string');
    expect(adminPage).toContain("searchParams.done === '1'");
    expect(adminPage).toContain("searchParams.error === '1'");
    expect(adminPage).toContain("UUID.test(searchParams.correlation ?? '')");
    expect(adminPage).toContain("<code>{errorCorrelation ?? 'unavailable'}</code>");
    expect(adminPage).not.toContain('>{searchParams.done}<');
    expect(adminPage).not.toContain('>{searchParams.error}<');
    expect(adminPage).not.toContain('>{searchParams.correlation}<');
  });
});
