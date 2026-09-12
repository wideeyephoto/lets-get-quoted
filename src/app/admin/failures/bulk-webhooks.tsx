'use client';

import { useState } from 'react';
import styles from '../admin.module.css';
import { resolveWebhookGroupAction } from './actions';

export function BulkWebhookResolve({ 
  webhookGroups, 
  canResolve 
}: { 
  webhookGroups: any[]; 
  canResolve: boolean 
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelected(new Set(webhookGroups.map(g => g.key)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    setSelected(next);
  }

  const fmt = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  };

  const selectedIds = webhookGroups
    .filter(g => selected.has(g.key))
    .flatMap(g => g.ids);

  const resolveSelected = resolveWebhookGroupAction.bind(null, selectedIds);

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {canResolve && (
                <th>
                  <input 
                    type="checkbox" 
                    checked={webhookGroups.length > 0 && selected.size === webhookGroups.length}
                    onChange={toggleAll}
                  />
                </th>
              )}
              <th>Source</th>
              <th>Event</th>
              <th>Error</th>
              <th className="num">Occurrences</th>
              <th>First / latest</th>
              {canResolve && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {webhookGroups.map((entry) => (
              <tr key={entry.key} style={selected.has(entry.key) ? { background: 'rgba(255,255,255,0.05)' } : {}}>
                {canResolve && (
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selected.has(entry.key)}
                      onChange={(e) => toggleOne(entry.key, e.target.checked)}
                    />
                  </td>
                )}
                <td>{entry.sample.source.replace(/_/g, ' ')}</td>
                <td>{entry.sample.event_type || '—'}</td>
                <td className={styles.muted}>{entry.sample.error_message}</td>
                <td className="num">{entry.count}</td>
                <td className={styles.muted}>{fmt(entry.firstAt)}<br />{fmt(entry.latestAt)}</td>
                {canResolve && (
                  <td>
                    <form action={resolveWebhookGroupAction.bind(null, entry.ids)} className={styles.compactForm}>
                      <label className={styles.srOnly} htmlFor={`resolve-${entry.ids[0]}`}>Resolution reason</label>
                      <input id={`resolve-${entry.ids[0]}`} className={styles.compactInput} name="reason" required minLength={4} placeholder="Resolution reason" />
                      <button className="btn secondary" type="submit">Resolve</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canResolve && selected.size > 0 && (
        <form action={resolveSelected} className={styles.panel} style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <strong>Bulk resolve {selected.size} group{selected.size === 1 ? '' : 's'}</strong>
          <input className={styles.input} name="reason" required minLength={4} placeholder="Reason for resolving selected" style={{ flex: 1 }} />
          <button className="btn primary" type="submit">Resolve Selected</button>
        </form>
      )}
    </>
  );
}
