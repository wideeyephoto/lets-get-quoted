import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrewMember } from '@/lib/crew';
import { listOpenShifts } from '@/lib/time-clock-data';
import { ready, unavailable, type ActiveClockedMember, type CrewSummary, type Loadable } from '@/lib/dashboard-types';

export async function loadCrewStatus(
  supabase: SupabaseClient,
  accountId: string,
  crew: CrewMember[],
  todayJobCount: number,
  todayAssignedJobCount: number,
): Promise<Loadable<CrewSummary>> {
  try {
    const openShifts = await listOpenShifts(supabase, accountId);
    const nowMs = Date.now();

    const clockedIn: ActiveClockedMember[] = openShifts.map((shift) => {
      const startMs = new Date(shift.startedAt).getTime();
      const elapsedHours = Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / (1000 * 60 * 60)) : 0;

      return {
        crewId: shift.crewId,
        crewName: shift.crewName,
        jobId: shift.jobId,
        jobTitle: shift.jobLabel,
        startedAt: shift.startedAt,
        elapsedHours: Number(elapsedHours.toFixed(1)),
      };
    });

    const activeRosterCount = crew.filter((c) => c.active).length;
    const unassignedTodayJobsCount = Math.max(0, todayJobCount - todayAssignedJobCount);

    return ready({
      clockedIn,
      openShiftCount: openShifts.length,
      activeRosterCount,
      unassignedTodayJobsCount,
      assignedTodayJobsCount: todayAssignedJobCount,
    });
  } catch (error) {
    console.error('Failed to load crew status:', error);
    return unavailable('query_failed');
  }
}
