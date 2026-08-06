import { listClientsWithStats } from '@/lib/clients';
import { clientPins } from '@/lib/client-map';
import { DEFAULT_CLIENTS_VIEW } from '@/lib/dashboard-views';
import { toClientRows } from '@/lib/client-rows';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import ClientsScreen from '@/app/dashboard/clients/ClientsScreen';

export const metadata = { title: 'Clients — Live Demo' };

/**
 * The customer book, for a logged-out visitor.
 *
 * listClientsWithStats runs unmodified, so the repeat badges, the job counts
 * and the lifetime totals are computed from the demo's own jobs rather than
 * typed in — and the Follow-up view bands people by real silence rather than by
 * a hand-picked example of it.
 *
 * The view is the DEFAULT rather than the cookie. A visitor has no saved
 * preference, and reading the owner's cookie here would let a signed-in
 * contractor's choice leak into the public demo for everyone.
 */
export default async function DemoClientsPage() {
  const [clients, pinsByClient] = await Promise.all([
    listClientsWithStats(demoSupabase, DEMO_ACCOUNT_ID),
    clientPins(demoSupabase, DEMO_ACCOUNT_ID),
  ]);

  return (
    <ClientsScreen
      rows={toClientRows(clients)}
      pins={[...pinsByClient.values()].map((pin) => ({ clientId: pin.clientId, lat: pin.lat, lng: pin.lng }))}
      todayKey={new Date().toLocaleDateString('en-CA')}
      view={DEFAULT_CLIENTS_VIEW}
      repeatCount={clients.filter((client) => client.jobCount > 1).length}
      basePath="/demo"
      readOnly
    />
  );
}
