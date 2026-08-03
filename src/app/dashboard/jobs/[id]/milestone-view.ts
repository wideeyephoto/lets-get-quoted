import {
  milestoneCoverage as coverage,
  milestoneProgressPct as progressPct,
  milestoneTotals as totals,
  MILESTONE_STATUS_LABEL as STATUS_LABEL,
  type Milestone, type MilestonePayment, type MilestoneProof, type MilestoneStatus,
} from '@/lib/milestones';

// The flat shape a milestone takes once it crosses to the browser.
//
// The server model nests proof under the milestone, which is right for the
// rules but awkward for a component that renders one card per stage. Flattening
// here (rather than in lib/milestones) keeps the pure rules working on the shape
// that makes them readable, and gives the UI the shape that makes IT readable —
// and because the flat type satisfies both Milestone and MilestoneProof, the
// same pure functions run over it unchanged.

export type MilestoneEntryView = Milestone & MilestoneProof & {
  status: MilestoneStatus;
  blockers: string[];
  canRequest: boolean;
  payment: MilestonePayment | null;
};

export function flattenMilestone(entry: {
  milestone: Milestone;
  proof: MilestoneProof;
  payment: MilestonePayment | null;
  status: MilestoneStatus;
  blockers: string[];
  canRequest: boolean;
}): MilestoneEntryView {
  return {
    ...entry.milestone,
    tasks: entry.proof.tasks,
    photos: entry.proof.photos,
    status: entry.status,
    blockers: entry.blockers,
    canRequest: entry.canRequest,
    payment: entry.payment,
  };
}

export function milestoneTotals(entries: MilestoneEntryView[]) {
  return totals(entries.map((entry) => ({ milestone: entry, proof: entry, payment: entry.payment })));
}

export const milestoneProgressPct = progressPct;
export const milestoneCoverage = coverage;
export const MILESTONE_STATUS_LABEL = STATUS_LABEL;
