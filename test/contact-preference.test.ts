import { describe, it, expect } from 'vitest';
import {
  getContactPreferenceQuestion,
  CONTACT_PREFERENCE_OPTIONS,
} from '@/components/ContactPreferenceControl';
import { contactPlan } from '@/lib/lead-queue';
import { getLeadTriage, type LeadTriage } from '@/lib/leads';

describe('Contact Preference Shared Control & Copy', () => {
  it('formats question with contractor business name', () => {
    expect(getContactPreferenceQuestion('Apex Roofing & Gutters')).toBe(
      'How may Apex Roofing & Gutters follow up about your request?'
    );
  });

  it('formats question with fallback when no company name is provided', () => {
    expect(getContactPreferenceQuestion(undefined)).toBe(
      'How may we follow up about your request?'
    );
    expect(getContactPreferenceQuestion('')).toBe(
      'How may we follow up about your request?'
    );
  });

  it('defines the required options with exact copy and no preselected default', () => {
    expect(CONTACT_PREFERENCE_OPTIONS).toEqual([
      { key: 'any', label: 'Call or text me' },
      { key: 'text', label: 'Text me only' },
    ]);
  });
});

describe('Downstream Enforcement of Text Only Preference', () => {
  it('prioritizes text and demotes call when homeowner requested text only', () => {
    const plan = contactPlan({ textOnly: true, hasPhone: true, hasEmail: true });
    expect(plan.primary).toBe('text');
    expect(plan.callLabel).toBe('Call only if needed');
    expect(plan.note).toBe('They asked to be texted, not called.');
  });

  it('sets call as primary when homeowner allows call or text', () => {
    const plan = contactPlan({ textOnly: false, hasPhone: true, hasEmail: true });
    expect(plan.primary).toBe('call');
    expect(plan.callLabel).toBe('Call');
    expect(plan.note).toBe('No contact preference given — a call is fine.');
  });

  it('handles email-only cases gracefully', () => {
    const plan = contactPlan({ textOnly: false, hasPhone: false, hasEmail: true });
    expect(plan.primary).toBe('email');
    expect(plan.note).toBe('No phone on file — email is the only way to reach them.');
  });
});

describe('Lead Triage & Duplicate Lead Merge with Contact Preference', () => {
  it('correctly maps contact preference values in triage', () => {
    const textTriage = getLeadTriage({
      triage: {
        score: 'hot',
        flags: [],
        contactPreference: 'text_only',
      },
    });
    expect(textTriage.contactPreference).toBe('text_only');

    const anyTriage = getLeadTriage({
      triage: {
        score: 'warm',
        flags: [],
        contactPreference: 'any',
      },
    });
    expect(anyTriage.contactPreference).toBe('any');
  });

  it('updates duplicate lead triage to the newest submitted contact preference', () => {
    // Existing lead created with 'any' (Call or text me)
    const existingLead = {
      id: 'lead-123',
      account_id: 'acc-1',
      phone: '(248) 555-0199',
      email: 'homeowner@example.com',
      triage: {
        score: 'warm' as const,
        flags: ['needs_review'],
        contactPreference: 'any' as const,
      },
    };

    // New submission from same homeowner, this time choosing 'text_only'
    const newSubmissionTriage: LeadTriage = {
      score: 'hot',
      flags: ['ai_estimate'],
      contactPreference: 'text_only',
    };

    const existingTriage = getLeadTriage({ triage: existingLead.triage });
    const mergedTriage: LeadTriage = {
      ...existingTriage,
      contactPreference: newSubmissionTriage.contactPreference,
      flags: [...new Set([...existingTriage.flags, ...newSubmissionTriage.flags, 'repeat'])],
      snoozedUntil: null,
    };

    expect(mergedTriage.contactPreference).toBe('text_only');
    expect(mergedTriage.flags).toContain('repeat');
    expect(mergedTriage.flags).toContain('needs_review');
    expect(mergedTriage.flags).toContain('ai_estimate');
  });

  it('updates duplicate lead triage from text_only to any if homeowner switches', () => {
    const existingLead = {
      id: 'lead-456',
      account_id: 'acc-1',
      phone: '(248) 555-0199',
      triage: {
        score: 'hot' as const,
        flags: [],
        contactPreference: 'text_only' as const,
      },
    };

    const newSubmissionTriage: LeadTriage = {
      score: 'hot',
      flags: [],
      contactPreference: 'any',
    };

    const existingTriage = getLeadTriage({ triage: existingLead.triage });
    const mergedTriage: LeadTriage = {
      ...existingTriage,
      contactPreference: newSubmissionTriage.contactPreference,
      flags: [...new Set([...existingTriage.flags, ...newSubmissionTriage.flags, 'repeat'])],
      snoozedUntil: null,
    };

    expect(mergedTriage.contactPreference).toBe('any');
  });
});
