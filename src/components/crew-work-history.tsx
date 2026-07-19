'use client';

import { useState } from 'react';

type CrewWorkHistoryItem = {
  cost_id: string;
  job_id: string;
  job_ref: string;
  client_name: string;
  scheduled_for: string | null;
  scheduled_time: string | null;
  description: string;
  amount: number;
  hours: number | null;
  rate: number | null;
  created_at: string;
};

type CrewWorkHistoryResponse = {
  history: CrewWorkHistoryItem[];
  totalPaid: number;
  error?: string;
};

type CrewWorkHistoryProps = {
  crewId: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatJobSchedule(dateValue: string | null, timeValue: string | null): string {
  if (!dateValue) return 'Unscheduled';
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

  if (!timeValue) return dateLabel;

  const [hourText, minuteText] = timeValue.slice(0, 5).split(':');
  const hour = Number(hourText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${dateLabel} at ${displayHour}:${minuteText} ${period}`;
}

export default function CrewWorkHistory({ crewId }: CrewWorkHistoryProps) {
  const [history, setHistory] = useState<CrewWorkHistoryItem[] | null>(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    if (history || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/crew/work-history?crewId=${encodeURIComponent(crewId)}`, { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as Partial<CrewWorkHistoryResponse>;
      if (!response.ok) throw new Error(body.error || 'Unable to load work history.');
      setHistory(body.history ?? []);
      setTotalPaid(body.totalPaid ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load work history.');
    } finally {
      setIsLoading(false);
    }
  }

  const loadedCount = history?.length ?? 0;
  const summaryCopy = history
    ? `${loadedCount} labor entr${loadedCount === 1 ? 'y' : 'ies'} - ${formatMoney(totalPaid)} paid`
    : isLoading
      ? 'Loading history...'
      : 'Loads when opened';

  return (
    <details className="workspace-details" style={{ marginTop: '0.75rem' }} onToggle={(event) => {
      if (event.currentTarget.open) void loadHistory();
    }}>
      <summary className="workspace-details-summary">
        <span className="btn secondary">Work history</span>
        <span className="workspace-details-copy">{summaryCopy}</span>
      </summary>

      {error ? <p className="empty-state" style={{ marginTop: '1rem' }}>{error}</p> : null}
      {isLoading ? <p className="empty-state" style={{ marginTop: '1rem' }}>Loading labor history...</p> : null}
      {history && history.length === 0 ? (
        <p className="empty-state" style={{ marginTop: '1rem' }}>No paid labor history logged yet.</p>
      ) : null}
      {history && history.length > 0 ? (
        <div className="cost-list" style={{ marginTop: '1rem' }}>
          {history.map((item) => (
            <div key={item.cost_id} className="cost-item">
              <div className="cost-item-main">
                <span className="cost-item-desc">{item.job_ref} - {item.client_name}</span>
                <span className="cost-item-sub">
                  {formatJobSchedule(item.scheduled_for, item.scheduled_time)} - {item.hours ?? 0} hrs x {formatMoney(item.rate ?? 0)}/hr
                </span>
              </div>
              <span className="cost-item-amount">{formatMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}
