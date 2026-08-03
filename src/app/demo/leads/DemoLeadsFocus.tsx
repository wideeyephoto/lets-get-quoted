'use client';

import LeadFocusView from '@/app/dashboard/leads/LeadFocusView';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { LeadDetailDto } from '@/lib/lead-detail';

// The real Focus pane, handed fictional leads and their detail up front so it
// never calls the API. A server component cannot pass `run` across the client
// boundary, which is the other reason this wrapper exists.
export default function DemoLeadsFocus({
  leads,
  details,
}: {
  leads: LeadViewItem[];
  details: Record<string, LeadDetailDto>;
}) {
  return (
    <LeadFocusView
      leads={leads}
      details={details}
      // Every action in the pane routes through this. Swallowing them is what
      // makes the demo read-only without disabling controls one at a time —
      // a prospect can click anything and nothing is written anywhere.
      run={() => {}}
    />
  );
}
