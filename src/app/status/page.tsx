import { createClient } from '@/lib/supabase/server';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Platform Status - Let\'s Get Quoted',
  description: 'Current operational status and incident history.',
};

export const revalidate = 60; // Refresh cache every minute

export default async function StatusPage() {
  const supabase = createClient();
  const { data: incidents, error } = await supabase
    .from('platform_incidents')
    .select('*')
    .eq('published', true)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to load status incidents', error);
  }

  const activeIncidents = (incidents || []).filter(i => !i.resolved_at && i.kind === 'incident');
  const pastIncidents = (incidents || []).filter(i => i.resolved_at || i.kind === 'release');

  const isHealthy = activeIncidents.length === 0;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
          Platform Status
        </h1>
        <p className="mt-4 text-xl text-gray-500">
          Real-time updates on system performance and availability.
        </p>
      </div>

      <div className={`rounded-xl p-8 mb-12 border flex items-center gap-6 ${isHealthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        {isHealthy ? (
          <ShieldCheck className="w-16 h-16 text-green-600" />
        ) : (
          <ShieldAlert className="w-16 h-16 text-red-600" />
        )}
        <div>
          <h2 className={`text-2xl font-bold ${isHealthy ? 'text-green-900' : 'text-red-900'}`}>
            {isHealthy ? 'All Systems Operational' : 'Active Incident Ongoing'}
          </h2>
          <p className={`mt-2 ${isHealthy ? 'text-green-700' : 'text-red-700'}`}>
            {isHealthy 
              ? 'Our infrastructure is currently running smoothly with no reported issues.' 
              : 'We are currently investigating a system issue. See details below.'}
          </p>
        </div>
      </div>

      {activeIncidents.length > 0 && (
        <div className="mb-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Active Incidents</h3>
          <div className="space-y-6">
            {activeIncidents.map(incident => (
              <div key={incident.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                  <h4 className="text-lg font-semibold text-red-900">{incident.title}</h4>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 capitalize">
                    {incident.severity}
                  </span>
                </div>
                <div className="p-6">
                  <p className="text-gray-700 whitespace-pre-wrap">{incident.description || incident.impact_summary}</p>
                  <div className="mt-4 text-sm text-gray-500">
                    Started: {new Date(incident.started_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Past Incidents &amp; Releases</h3>
        {pastIncidents.length === 0 ? (
          <p className="text-gray-500 italic">No past incidents or updates to display.</p>
        ) : (
          <div className="space-y-6">
            {pastIncidents.map(incident => (
              <div key={incident.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h4 className="text-lg font-medium text-gray-900">{incident.title}</h4>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                    {incident.kind === 'release' ? 'Release' : 'Resolved'}
                  </span>
                </div>
                <div className="p-6">
                  {incident.description && (
                    <p className="text-gray-700 whitespace-pre-wrap mb-4">{incident.description}</p>
                  )}
                  {incident.resolution_summary && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <h5 className="font-medium text-gray-900 mb-2">Resolution</h5>
                      <p className="text-gray-700 whitespace-pre-wrap">{incident.resolution_summary}</p>
                    </div>
                  )}
                  <div className="mt-4 flex gap-4 text-sm text-gray-500">
                    <span>Started: {new Date(incident.started_at).toLocaleString()}</span>
                    {incident.resolved_at && (
                      <span>Resolved: {new Date(incident.resolved_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
