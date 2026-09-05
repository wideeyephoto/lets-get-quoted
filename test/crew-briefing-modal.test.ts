import React, { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/modal-dialog', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  CloseOnSuccess: () => null,
}));
vi.mock('@/components/save-button', () => ({
  default: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => createElement('button', { type: 'submit', disabled }, children),
}));
vi.mock('@/app/dashboard/schedule/plan/actions', () => ({
  sendCrewMorningBriefingAction: '/test-dispatch', updateCrewPhoneQuickAction: vi.fn(),
}));
import BriefCrewModal from '@/app/dashboard/schedule/plan/BriefCrewModal';

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('crew dispatch form', () => {
  const props = {
    intentId: '11111111-1111-4111-8111-111111111111', intentStorageKey: 'test-briefing',
    dateKey: '2026-09-06', dateLabel: 'September 6', businessName: 'Example Business',
    crew: [{ id: 'crew-a', name: 'Alice', phone: '+12025550101' }],
    activeCrewId: null, assignmentsByJob: {}, stops: [],
  };

  it('keeps the dispatch form and urgent update control available with no stops', () => {
    const html = renderToStaticMarkup(createElement(BriefCrewModal, props));
    expect(html).toContain('Urgent Mid-Day Route Update');
    expect(html).toContain('<button type="submit">');
    expect(html).toContain('Send Morning Dispatch SMS');
    expect(html).toMatch(/name="intentId"[^>]*disabled=""/);
  });

  it('does not expose an unassigned customer in a single-member preview', () => {
    const html = renderToStaticMarkup(createElement(BriefCrewModal, {
      ...props,
      stops: [{ jobId: 'other-job', jobRef: 'JOB-OTHER', clientName: 'Other Customer', address: 'PRIVATE CUSTOMER ADDRESS' }],
    }));
    expect(html).not.toContain('PRIVATE CUSTOMER ADDRESS');
    expect(html).not.toContain('Other Customer');
    expect(html).toContain('no scheduled stops');
  });
});
