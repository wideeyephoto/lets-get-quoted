import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import type { ClientWithStats } from '@/lib/clients';
import type { ClientRow } from '@/app/dashboard/clients/ClientsWorkspace';

/**
 * Customer records, shaped for the clients workspace.
 *
 * Lifted out of the page so the demo builds its rows the same way rather than
 * formatting money and phone numbers its own slightly different way — which is
 * exactly how a replica starts to look almost, but not quite, like the product.
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initialsFor(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

export function toClientRows(clients: ClientWithStats[]): ClientRow[] {
  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    initials: initialsFor(client.name),
    isRepeat: client.jobCount > 1,
    phone: client.phone,
    phoneLabel: client.phone ? formatPhoneDashes(client.phone) : null,
    email: client.email,
    address: client.address,
    contactLine:
      [client.phone ? formatPhoneDashes(client.phone) : null, client.email].filter(Boolean).join(' · ') ||
      'No contact on file',
    jobCount: client.jobCount,
    jobsLabel: `${client.jobCount} job${client.jobCount === 1 ? '' : 's'}`,
    totalValue: client.totalValue,
    totalLabel: formatMoney(client.totalValue),
    lastJobAt: client.lastJobAt,
    lastLabel: formatDate(client.lastJobAt),
    search: [client.name, client.phone, client.email, client.address].filter(Boolean).join(' ').toLowerCase(),
    nextJobAt: client.nextJobAt,
    lastVisitAt: client.lastVisitAt,
    unscheduledJobs: client.unscheduledJobs,
  }));
}
