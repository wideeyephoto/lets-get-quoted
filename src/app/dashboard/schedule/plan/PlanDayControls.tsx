'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Date and crew pickers that navigate the moment they change.
//
// The old form needed a "Show this day" press after every change, which is one
// interaction too many for a control whose entire job is "show me a different
// day" — and it left the page showing a date that didn't match the picker.

export type CrewOption = { id: string; name: string };

export default function PlanDayControls({
  dateKey,
  crewId,
  crew,
}: {
  dateKey: string;
  crewId: string | null;
  crew: CrewOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(nextDate: string, nextCrew: string | null) {
    const params = new URLSearchParams({ date: nextDate });
    if (nextCrew) params.set('crew', nextCrew);
    startTransition(() => router.push(`/dashboard/schedule/plan?${params.toString()}`));
  }

  return (
    <div className={`plan-controls${pending ? ' is-busy' : ''}`} aria-busy={pending}>
      <label className="plan-control">
        <span className="plan-control-label">Day</span>
        <input
          type="date"
          value={dateKey}
          onChange={(event) => {
            // A cleared or half-typed date would navigate to a day that doesn't
            // exist; wait until it's a real one.
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) go(event.target.value, crewId);
          }}
        />
      </label>

      {crew.length > 0 ? (
        <label className="plan-control">
          <span className="plan-control-label">Crew member</span>
          <select value={crewId ?? ''} onChange={(event) => go(dateKey, event.target.value || null)}>
            <option value="">Everyone</option>
            {crew.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
