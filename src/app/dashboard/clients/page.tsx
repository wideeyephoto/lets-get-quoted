import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { listClientsWithStats } from '@/lib/clients';
import { clientPins } from '@/lib/client-map';
import { CLIENTS_VIEW_COOKIE, normalizeClientsView } from '@/lib/dashboard-views';
import { toClientRows } from '@/lib/client-rows';
import { duplicateMemberKey, findDuplicateGroups } from '@/lib/client-duplicates';
import { listDuplicateDismissals } from '@/lib/client-duplicates-data';
import { todayIn } from '@/lib/quote-options';
import { dismissDuplicateGroupAction, mergeClientsAction } from './actions';
import ClientsScreen from './ClientsScreen';

export const metadata = { title: 'Clients' };

/**
 * The customer book, for a signed-in owner.
 *
 * The read only — the screen itself is in ClientsScreen so the logged-out demo
 * renders the same one.
 */
export default async function ClientsPage({ searchParams }: { searchParams: { created?: string; existing?: string; add?: string; merged?: string; dismissed?: string; dismissError?: string } }) {
  const { supabase, accountId, accountTimeZone } = await requireOwnerContext();
  const todayKey = todayIn(accountTimeZone);
  // One query for the whole book's coordinates, not one per customer.
  const [clients, pinsByClient, dismissed] = await Promise.all([
    listClientsWithStats(supabase, accountId, { todayKey }),
    clientPins(supabase, accountId),
    listDuplicateDismissals(supabase, accountId),
  ]);

  // Computed from the book already in memory — no extra query. Only the fields
  // the panel shows are passed on: this crosses to a client component, and the
  // rest of ClientWithStats is nobody's business over the wire.
  //
  // Suggestions the owner has already declined drop out here rather than in the
  // finder, which stays a pure function of the book. Keyed on the members, so a
  // third record on the same number brings the question back — see
  // duplicateMemberKey.
  const duplicateGroups = findDuplicateGroups(clients)
    .filter((group) => !dismissed.has(duplicateMemberKey(group.members)))
    .map((group) => ({
      ...group,
      members: group.members.map((member) => ({
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        address: member.address,
        jobCount: member.jobCount,
        created_at: member.created_at,
      })),
    }));

  return (
    <ClientsScreen
      rows={toClientRows(clients)}
      duplicateGroups={duplicateGroups}
      mergeAction={mergeClientsAction}
      dismissDuplicateAction={dismissDuplicateGroupAction}
      dismissError={searchParams.dismissError === 'schema'}
      mergedCount={Number(searchParams.merged) || 0}
      pins={[...pinsByClient.values()].map((pin) => ({ clientId: pin.clientId, lat: pin.lat, lng: pin.lng }))}
      // One account-local day for the stats and the follow-up bands, so neither
      // changes at the deployment server's midnight.
      todayKey={todayKey}
      view={normalizeClientsView(cookies().get(CLIENTS_VIEW_COOKIE)?.value)}
      repeatCount={clients.filter((client) => client.jobCount > 1).length}
      showExistingFlash={Boolean(searchParams.existing)}
      openAdd={searchParams.add === '1'}
    />
  );
}
