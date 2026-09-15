'use client';

import { useState, useEffect } from 'react';
import styles from '../manual/manual.module.css'; // Reuse drawer styles

interface Client360DrawerProps {
  clientId: string | null;
  onClose: () => void;
}

export default function Client360Drawer({ clientId, onClose }: Client360DrawerProps) {
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    if (clientId) {
      // Mock fetch timeline
      setTimeline([
        { id: 1, type: 'payment', description: 'Paid Invoice #1024', date: new Date().toISOString() },
        { id: 2, type: 'message', description: 'Received SMS: "On my way!"', date: new Date(Date.now() - 3600000).toISOString() },
        { id: 3, type: 'job', description: 'Job #992 Completed', date: new Date(Date.now() - 86400000).toISOString() }
      ]);
    }
  }, [clientId]);

  if (!clientId) return null;

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} />
      <div className={styles.drawerPanel} style={{ right: 0, left: 'auto', width: '400px', transform: 'none' }}>
        <div className={styles.drawerHeader}>
          <span className={styles.drawerBadge}>Customer 360</span>
          <h3 className={styles.drawerTitle}>Timeline for {clientId}</h3>
          <div className={styles.drawerHeaderActions}>
            <button className={styles.drawerCloseBtn} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className={styles.drawerBody} style={{ padding: '1rem' }}>
          <h4>Unified Activity</h4>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
            {timeline.map((item) => (
              <li key={item.id} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{new Date(item.date).toLocaleString()}</div>
                <div><strong>{item.type.toUpperCase()}:</strong> {item.description}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
