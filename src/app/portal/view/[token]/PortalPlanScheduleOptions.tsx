'use client';

import React from 'react';
import SelfServiceRescheduleCard from '@/components/portal/SelfServiceRescheduleCard';
import type { PortalPlan } from '@/lib/client-portal';
import { requestPlanRescheduleAction } from './actions';

function formatDayLocal(value: string | null): string {
  if (!value) return '';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PortalPlanScheduleOptions({
  plan,
  token,
  businessName,
}: {
  plan: PortalPlan;
  token: string;
  businessName: string;
}) {
  const [showReschedule, setShowReschedule] = React.useState(false);

  if (!plan.nextRunDate) return null;

  return (
    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>📅 Next service: <strong>{formatDayLocal(plan.nextRunDate)}</strong></span>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
          <button 
            type="button" 
            onClick={() => setShowReschedule(!showReschedule)}
            style={{ color: 'var(--ink-link, #2563eb)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Reschedule or Cancel
          </button>
          <a 
            href={`/api/portal/${token}/plans/${plan.id}/calendar.ics`} 
            style={{ color: 'var(--ink-link, #2563eb)', textDecoration: 'none' }}
          >
            Add to Calendar
          </a>
          <a 
            href={`/track/${token}?plan=${plan.id}`} 
            style={{ color: 'var(--ink-link, #2563eb)', textDecoration: 'none' }}
          >
            Live ETA
          </a>
        </div>
      </div>
      
      {showReschedule && (
        <SelfServiceRescheduleCard
          jobId={plan.id}
          currentDateLabel={formatDayLocal(plan.nextRunDate)}
          businessName={businessName}
          onConfirmReschedule={async (params) => {
            await requestPlanRescheduleAction(token, plan.id, params);
            setShowReschedule(false);
          }}
        />
      )}
    </div>
  );
}
