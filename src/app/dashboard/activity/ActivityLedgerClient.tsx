'use client';

import { useState } from 'react';
import type { TenantAuditEvent } from '@/lib/tenant-audit';

interface ActivityLedgerClientProps {
  initialEvents: TenantAuditEvent[];
  total: number;
}

const ENTITY_TYPES = ['all', 'account', 'lead', 'crew', 'service', 'job', 'attachment'];
const SOURCES = ['all', 'web', 'staff', 'integration', 'cron', 'migration', 'api'];

export default function ActivityLedgerClient({ initialEvents }: ActivityLedgerClientProps) {
  const [events] = useState<TenantAuditEvent[]>(initialEvents);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const filteredEvents = events.filter((ev) => {
    if (selectedEntity !== 'all' && ev.entityType !== selectedEntity) {
      return false;
    }
    if (selectedSource !== 'all' && ev.source !== selectedSource) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const action = ev.action.toLowerCase();
      const entity = ev.entityType.toLowerCase();
      const id = ev.entityId.toLowerCase();
      const reason = (ev.reason || '').toLowerCase();
      const actorEmail = (ev.actor.email || '').toLowerCase();
      return action.includes(q) || entity.includes(q) || id.includes(q) || reason.includes(q) || actorEmail.includes(q);
    }
    return true;
  });

  const exportCsv = () => {
    const headers = ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Email', 'Actor Role', 'Source', 'Reason'];
    const rows = filteredEvents.map((ev) => [
      ev.occurredAt,
      ev.entityType,
      ev.entityId,
      ev.action,
      ev.actor.email || '',
      ev.actor.role || '',
      ev.source,
      `"${(ev.reason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tenant-audit-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('deleted') || action.includes('closure')) {
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    }
    if (action.includes('restored') || action.includes('created')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (action.includes('updated') || action.includes('modified')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <span>📜</span> Immutable Tenant Audit Ledger
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Cryptographically timestamped, append-only record of all material state changes, lifecycle events, and actor snapshots.
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            <span>📥</span> Export Audit CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Entity Type</label>
          <select
            aria-label="Filter by entity type"
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Entity Types' : t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Source Channel</label>
          <select
            aria-label="Filter by source channel"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Sources' : s.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Search Keywords</label>
          <input
            type="text"
            placeholder="Search action, actor, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Event list */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-base font-semibold text-slate-200">No Activity Found</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
              No audit records matched the selected filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredEvents.map((ev) => {
              const isExpanded = expandedEventId === ev.id;
              return (
                <div key={ev.id} className="p-4 hover:bg-slate-800/40 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-md font-semibold border ${getActionBadgeColor(ev.action)}`}>
                        {ev.action}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/80">
                        {ev.entityType} #{ev.entityId.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Actor:</span>
                        <span className="text-slate-300 font-medium">{ev.actor.email || ev.actor.role || 'System'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Source:</span>
                        <span className="uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {ev.source}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        {new Date(ev.occurredAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  {ev.reason && (
                    <p className="text-xs text-slate-400 mt-2 italic pl-2 border-l-2 border-slate-700">
                      &ldquo;{ev.reason}&rdquo;
                    </p>
                  )}

                  {ev.changedFields && ev.changedFields.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Fields modified:</span>
                      <div className="flex flex-wrap gap-1">
                        {ev.changedFields.map((field) => (
                          <span
                            key={field}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                    >
                      <span>{isExpanded ? 'Hide Payload Diff' : 'View Payload Diff'}</span>
                      <span>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* Expanded JSON diff */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-red-400"></span>
                          <span>Before State (Sanitized)</span>
                        </div>
                        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 overflow-x-auto max-h-60 font-mono">
                          {ev.beforeState ? JSON.stringify(ev.beforeState, null, 2) : 'null (Created or Initial state)'}
                        </pre>
                      </div>

                      <div>
                        <div className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                          <span>After State (Sanitized)</span>
                        </div>
                        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 overflow-x-auto max-h-60 font-mono">
                          {ev.afterState ? JSON.stringify(ev.afterState, null, 2) : 'null (Deleted or Unchanged)'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
