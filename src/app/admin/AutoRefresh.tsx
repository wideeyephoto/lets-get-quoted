'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'rgba(247,245,239,0.7)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
        <input 
          type="checkbox" 
          checked={enabled} 
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (e.target.checked && !lastRefreshed) setLastRefreshed(new Date());
          }} 
        />
        Auto-refresh
      </label>
      {enabled && lastRefreshed && (
        <span style={{ opacity: 0.8 }}>
          (Last: {lastRefreshed.toLocaleTimeString()})
        </span>
      )}
    </div>
  );
}
