import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import OfficeJobDetail from '@/app/dashboard/jobs/[id]/OfficeJobDetail';
import type { Job } from '@/lib/jobs';

const job = {
  id: 'job-1', ref: 'J-42', client_name: 'Test client', client_id: 'client-1',
  address: '42 Main Street', scope: 'Replace the kitchen window', status: 'in_progress',
  scheduled_for: null, client_phone: null, client_email: null,
  quoted_amount: 987654, quote_items: [{ label: 'PRIVATE QUOTE ITEM' }],
} as unknown as Job;

describe('office job detail', () => {
  it('renders useful work details without invented financial totals or quote contents', () => {
    const html = renderToStaticMarkup(React.createElement(OfficeJobDetail, { job, canSchedule: false }));
    expect(html).toContain('Replace the kitchen window');
    expect(html).toContain('42 Main Street');
    expect(html).toContain('Not scheduled');
    expect(html).not.toContain('987654');
    expect(html).not.toContain('PRIVATE QUOTE ITEM');
    expect(html).not.toContain('$0');
    expect(html).not.toContain('Open schedule');
  });

  it('offers schedule navigation only when that capability is held', () => {
    const html = renderToStaticMarkup(React.createElement(OfficeJobDetail, { job, canSchedule: true }));
    expect(html).toContain('Open schedule');
    expect(html).toContain('/dashboard/clients/client-1');
  });

  it('returns the office view before any owner data loader can run', () => {
    const source = readFileSync('src/app/dashboard/jobs/[id]/page.tsx', 'utf8');
    const body = source.slice(source.indexOf('export default async function'));
    const branch = body.indexOf("if (role !== 'owner')");
    expect(branch).toBeGreaterThan(body.indexOf('await getJob('));
    expect(body.slice(branch, body.indexOf('const costs'))).toContain('return <OfficeJobDetail');
    for (const call of ['await listCosts(', 'await listPayments(', 'createAdminClient()', 'await signSelectionPhotos(']) {
      expect(body.indexOf(call), call).toBeGreaterThan(branch);
    }
  });
});
