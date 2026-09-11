import type { Metadata } from 'next';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { createStatusReader, loadStatus, type PublicIncident } from '@/lib/platform-status';
import { incidentDuration } from '@/lib/platform-incidents';

/**
 * The public status page.
 *
 * Rendering only. What it is allowed to read, and why a failed read may not
 * render as "All Systems Operational", is in src/lib/platform-status.ts — a
 * page file may not export anything Next does not define, and that reading is
 * the half worth testing directly.
 */

export const metadata: Metadata = {
  title: 'Platform Status',
  description: 'Current operational status and incident history for Let\u2019s Get Quoted.',
  alternates: { canonical: 'https://letsgetquoted.com/status' },
};

// Caps how stale a cached render may be IF this route is ever cacheable. It is
// not today and this line currently does nothing: the root layout awaits
// headers(), cookies() and the CSP nonce, which makes every route in the app
// render on demand — `next build` lists /status as ƒ alongside /terms and
// /privacy. Kept, and its inertness written down rather than implied, so that
// the deferred route-group work does not have to rediscover it.
export const revalidate = 60;

const BANNER = {
  operational: {
    tone: 'bg-green-50 border-green-200',
    heading: 'text-green-900',
    body: 'text-green-700',
    title: 'All Systems Operational',
    detail: 'No incidents are open. Anything we publish appears here first.',
  },
  incident: {
    tone: 'bg-red-50 border-red-200',
    heading: 'text-red-900',
    body: 'text-red-700',
    title: 'Active Incident Ongoing',
    detail: 'We are investigating. Details are below and this page is updated as we learn more.',
  },
  unavailable: {
    tone: 'bg-amber-50 border-amber-200',
    heading: 'text-amber-900',
    body: 'text-amber-800',
    title: 'Status Unavailable',
    // No inbox named here on purpose: test/public-company-email-exposure.test.ts
    // keeps company addresses out of public page source, so the route people are
    // pointed at is /contact rather than a literal scrapers can harvest.
    detail:
      'We cannot reach the incident log right now, so this page cannot confirm whether the platform is healthy. Treat this as unknown rather than as an all-clear.',
  },
} as const;

function Incident({ incident, open }: { incident: PublicIncident; open: boolean }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div
        className={`px-6 py-4 border-b flex justify-between items-center gap-4 flex-wrap ${
          open ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
        }`}
      >
        <h4 className={`text-lg font-semibold ${open ? 'text-red-900' : 'text-gray-900'}`}>{incident.title}</h4>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
            open ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {open ? incident.severity : incident.kind === 'release' ? 'Release' : 'Resolved'}
        </span>
      </div>
      <div className="p-6">
        {incident.description || incident.impact_summary ? (
          <p className="text-gray-700 whitespace-pre-wrap">{incident.description || incident.impact_summary}</p>
        ) : null}
        {incident.resolution_summary ? (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h5 className="font-medium text-gray-900 mb-2">Resolution</h5>
            <p className="text-gray-700 whitespace-pre-wrap">{incident.resolution_summary}</p>
          </div>
        ) : null}
        <div className="mt-4 flex gap-4 flex-wrap text-sm text-gray-500">
          <span>Started: {new Date(incident.started_at).toLocaleString()}</span>
          {incident.resolved_at ? <span>Resolved: {new Date(incident.resolved_at).toLocaleString()}</span> : null}
          {incident.kind === 'incident' ? (
            <span>{incident.resolved_at ? 'Lasted' : 'Open for'} {incidentDuration(incident.started_at, incident.resolved_at)}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const view = await loadStatus(createStatusReader());
  const banner = BANNER[view.state];
  const Icon = view.state === 'operational' ? ShieldCheck : view.state === 'incident' ? ShieldAlert : ShieldQuestion;
  const iconTone =
    view.state === 'operational' ? 'text-green-600' : view.state === 'incident' ? 'text-red-600' : 'text-amber-600';

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">Platform Status</h1>
        <p className="mt-4 text-xl text-gray-500">Current operational state and the incidents we have published.</p>
      </div>

      <div className={`rounded-xl p-8 mb-12 border flex items-center gap-6 ${banner.tone}`}>
        <Icon className={`w-16 h-16 shrink-0 ${iconTone}`} aria-hidden="true" />
        <div>
          <h2 className={`text-2xl font-bold ${banner.heading}`}>{banner.title}</h2>
          <p className={`mt-2 ${banner.body}`}>{banner.detail}</p>
          {view.state === 'unavailable' ? (
            <p className={`mt-2 ${banner.body}`}>
              If something is broken for you,{' '}
              <a href="/contact" className="underline font-medium">
                tell us what you are seeing
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>

      {view.state === 'unavailable' ? null : (
        <>
          {view.active.length > 0 ? (
            <div className="mb-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Active Incidents</h3>
              <div className="space-y-6">
                {view.active.map((incident) => (
                  <Incident key={incident.id} incident={incident} open />
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Past Incidents &amp; Releases</h3>
            {view.past.length === 0 ? (
              <p className="text-gray-500 italic">No past incidents or updates to display.</p>
            ) : (
              <div className="space-y-6">
                {view.past.map((incident) => (
                  <Incident key={incident.id} incident={incident} open={false} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
