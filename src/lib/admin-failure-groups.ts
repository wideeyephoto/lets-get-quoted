import type { FailedEmailEventRow, FailedSmsEventRow, WebhookFailureRow } from '@/lib/admin-alerts';

export type FailureGroup<T> = {
  key: string;
  count: number;
  latestAt: string;
  firstAt: string;
  sample: T;
  ids: string[];
};

function normalized(message: string | null | undefined): string {
  return (message ?? 'unknown')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\b\d{4,}\b/g, ':n')
    .replace(/\s+/g, ' ')
    .trim();
}

function group<T extends { id: string }>(rows: T[], keyFor: (row: T) => string, dateFor: (row: T) => string): FailureGroup<T>[] {
  const groups = new Map<string, FailureGroup<T>>();
  for (const row of rows) {
    const key = keyFor(row);
    const date = dateFor(row);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, count: 1, latestAt: date, firstAt: date, sample: row, ids: [row.id] });
      continue;
    }
    existing.count += 1;
    existing.ids.push(row.id);
    if (date > existing.latestAt) {
      existing.latestAt = date;
      existing.sample = row;
    }
    if (date < existing.firstAt) existing.firstAt = date;
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

export function groupWebhookFailures(rows: WebhookFailureRow[]): FailureGroup<WebhookFailureRow>[] {
  return group(rows, (row) => `${row.source}|${row.event_type ?? ''}|${normalized(row.error_message)}`, (row) => row.created_at);
}

export function groupSmsFailures(rows: FailedSmsEventRow[]): FailureGroup<FailedSmsEventRow>[] {
  return group(rows, (row) => `${row.account_id}|${row.event_type}|${normalized(row.error_reason)}`, (row) => row.created_at);
}

export function groupEmailFailures(rows: FailedEmailEventRow[]): FailureGroup<FailedEmailEventRow>[] {
  return group(rows, (row) => `${row.account_id ?? ''}|${row.kind}|${row.status}|${normalized(row.error_reason)}`, (row) => row.occurred_at);
}
