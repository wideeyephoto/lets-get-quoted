import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import StatusPage from '@/app/status/page';

const readStatus = vi.hoisted(() => vi.fn());
vi.mock('@/lib/public-incident-status', () => ({ getPublicIncidentStatus: readStatus }));
beforeEach(() => readStatus.mockReset());

it('renders unknown health when the database is unavailable', async () => {
  readStatus.mockResolvedValue({ available: false, active: [], history: [] });
  const html = renderToStaticMarkup(await StatusPage());
  expect(html).toContain('Status temporarily unavailable');
  expect(html).toContain('Service health is unconfirmed');
  expect(html).not.toMatch(/No active incidents|All Systems Operational|No published history/);
});

it('describes an empty successful read as no reported incidents', async () => {
  readStatus.mockResolvedValue({ available: true, active: [], history: [] });
  expect(renderToStaticMarkup(await StatusPage())).toContain('No active incidents reported');
});

it('renders active and resolved state, escaped public copy, and timestamps', async () => {
  const incident = { id: 'fixture', title: '<script>unsafe</script>', kind: 'incident', severity: 'warning', description: 'Recovery in progress', impact_summary: 'Booking delays', affected_services: ['Booking'], started_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:01:00Z', resolved_at: null };
  readStatus.mockResolvedValue({ available: true, active: [incident], history: [] });
  const active = renderToStaticMarkup(await StatusPage());
  expect(active).toContain('Service disruption reported');
  expect(active).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
  expect(active).toContain('Recovery in progress');
  readStatus.mockResolvedValue({ available: true, active: [], history: [{ ...incident, resolved_at: '2026-09-11T10:02:00Z', resolution_summary: 'Recovered' }] });
  const resolved = renderToStaticMarkup(await StatusPage());
  expect(resolved).toContain('No active incidents reported');
  expect(resolved).toContain('Recovered');
  expect(resolved).toContain('Resolved');
});

it('includes public status in the sitemap and publication controls in the operator entry point', () => {
  expect(readFileSync('src/app/sitemap.ts', 'utf8')).toContain('${origin}/status');
  expect(readFileSync('src/app/admin/operator/OperatorCockpit.tsx', 'utf8')).toContain('/admin/incidents#new-incident');
});
