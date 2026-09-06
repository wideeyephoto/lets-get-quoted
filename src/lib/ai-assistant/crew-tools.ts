import type { SupabaseClient } from '@supabase/supabase-js';
import { Type, type FunctionDeclaration } from '@google/genai';
import { isJobAssignedToCrew, listJobIdsForCrew, type CrewMember } from '@/lib/crew';
import { getJob, formatJobSchedule } from '@/lib/jobs';
import { listJobTasks, createJobTask } from '@/lib/job-tasks';
import { getOpenShift, clockIn, clockOut } from '@/lib/time-clock-data';
import { loadMyPay } from '@/lib/my-pay-data';
import { hoursLabel } from '@/lib/my-pay';
import { createAdminClient } from '@/lib/auth';

export interface CrewToolExecutionContext {
  supabase: SupabaseClient;
  accountId: string;
  crew: CrewMember;
  businessName: string;
  activeJobId?: string;
}

export interface CrewToolExecutionResult {
  data: unknown;
}

type AssistantFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

/**
 * Tools available to the Crew Copilot.
 * Strictly scoped: NO financial intelligence, NO profit margins, NO invoice billing.
 */
export const CREW_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = [
  {
    name: 'get_my_route_and_schedule',
    description: 'Looks up the schedule and assigned route stops for this crew member for today or upcoming days.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timeframe: {
          type: Type.STRING,
          description: 'Timeframe to look up: "today" (default), "tomorrow", or "upcoming"',
        },
      },
    },
  },
  {
    name: 'get_job_access_and_details',
    description: 'Retrieves job address, navigation directions, customer contact, gate codes, lockbox codes, parking notes, and scope for an assigned job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The job ID (optional; defaults to the active job if viewed on screen)',
        },
        jobRef: {
          type: Type.STRING,
          description: 'The human-readable job reference number (e.g. "104" or "J-104") if looking up by reference',
        },
      },
    },
  },
  {
    name: 'get_timecard_and_hours',
    description: 'Checks whether the crew member is currently clocked in or out, current shift duration, and total hours worked for the active pay period.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'clock_in_or_out',
    description: 'Clocks the crew member into an assigned job or clocks them out of their active shift.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'Either "clock_in" or "clock_out"',
        },
        jobId: {
          type: Type.STRING,
          description: 'Job ID to clock into (required for clock_in; defaults to the currently viewed job)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'add_job_note_or_task',
    description: 'Adds a progress note, site update, gate code note, or checklist punch item to an assigned job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The assigned job ID (optional; defaults to the active job)',
        },
        type: {
          type: Type.STRING,
          description: 'Either "note" (site update/memo) or "task" (punch list checklist item)',
        },
        text: {
          type: Type.STRING,
          description: 'The note text or task description to record',
        },
      },
      required: ['type', 'text'],
    },
  },
];

export async function executeCrewTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CrewToolExecutionContext,
): Promise<CrewToolExecutionResult> {
  const { supabase, accountId, crew, activeJobId } = ctx;
  const admin = createAdminClient();

  switch (name) {
    case 'get_my_route_and_schedule': {
      const timeframe = (args.timeframe as string) || 'today';
      const assignedJobIds = await listJobIdsForCrew(supabase, accountId, crew.id);

      if (assignedJobIds.length === 0) {
        return {
          data: {
            message: 'You have no assigned jobs on your roster right now.',
            jobs: [],
          },
        };
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, ref, client_name, address, scope, status, scheduled_for, scheduled_time')
        .eq('account_id', accountId)
        .in('id', assignedJobIds)
        .order('scheduled_for', { ascending: true });

      const allJobs = jobs ?? [];
      let filtered = allJobs;

      if (timeframe === 'today') {
        filtered = allJobs.filter((j) => j.scheduled_for === todayStr);
      } else if (timeframe === 'tomorrow') {
        filtered = allJobs.filter((j) => j.scheduled_for === tomorrowStr);
      } else if (timeframe === 'upcoming') {
        filtered = allJobs.filter((j) => j.scheduled_for && j.scheduled_for >= todayStr);
      }

      return {
        data: {
          timeframe,
          count: filtered.length,
          jobs: filtered.map((j) => ({
            id: j.id,
            ref: j.ref,
            clientName: j.client_name,
            address: j.address || 'Address not specified',
            schedule: formatJobSchedule(j.scheduled_for, j.scheduled_time),
            scope: j.scope || 'No scope notes recorded',
            status: j.status,
          })),
        },
      };
    }

    case 'get_job_access_and_details': {
      let targetJobId = (args.jobId as string) || activeJobId;
      const jobRef = args.jobRef as string | undefined;

      if (!targetJobId && jobRef) {
        const cleanRef = jobRef.replace(/^#|^j-/i, '').trim();
        const { data: matched } = await supabase
          .from('jobs')
          .select('id')
          .eq('account_id', accountId)
          .ilike('ref', `%${cleanRef}%`)
          .maybeSingle();
        if (matched?.id) targetJobId = matched.id;
      }

      if (!targetJobId) {
        return {
          data: {
            error: 'Please specify which job you are looking up (e.g. job number or client name).',
          },
        };
      }

      // Security check: Verify the job is assigned to this crew member
      const isAssigned = await isJobAssignedToCrew(supabase, accountId, crew.id, targetJobId);
      if (!isAssigned) {
        return {
          data: {
            error: 'You are not assigned to this job, or it does not exist.',
          },
        };
      }

      const [job, tasks] = await Promise.all([
        getJob(supabase, accountId, targetJobId),
        listJobTasks(supabase, accountId, targetJobId),
      ]);

      if (!job) {
        return { data: { error: 'Job not found.' } };
      }

      return {
        data: {
          id: job.id,
          ref: job.ref,
          clientName: job.client_name,
          clientPhone: job.client_phone,
          address: job.address || 'Address not provided',
          schedule: formatJobSchedule(job.scheduled_for, job.scheduled_time),
          scope: job.scope,
          checklistTasks: tasks.map((t) => ({
            id: t.id,
            description: t.title,
            done: t.done,
          })),

        },
      };
    }

    case 'get_timecard_and_hours': {
      const [openShift, payView] = await Promise.all([
        getOpenShift(supabase, accountId, crew.id),
        loadMyPay(supabase, admin, accountId, crew).catch(() => null),
      ]);

      let shiftInfo: { isClockedIn: boolean; duration?: string; startedAt?: string } = {
        isClockedIn: false,
      };

      if (openShift) {
        const elapsedMinutes = Math.max(0, Math.round((Date.now() - new Date(openShift.started_at).getTime()) / 60000));
        const hours = Math.floor(elapsedMinutes / 60);
        const mins = elapsedMinutes % 60;
        shiftInfo = {
          isClockedIn: true,
          duration: `${hours}h ${mins}m`,
          startedAt: openShift.started_at,
        };
      }

      return {
        data: {
          clockStatus: shiftInfo,
          currentPeriodTotalHours: payView ? hoursLabel(payView.standing.hours) : 'Not available',
          payType: crew.pay_type || 'hourly',
          payDay: payView?.payDay || 'Friday',
        },
      };
    }

    case 'clock_in_or_out': {
      const action = args.action as 'clock_in' | 'clock_out';

      if (action === 'clock_in') {
        const targetJobId = (args.jobId as string) || activeJobId;
        if (!targetJobId) {
          return { data: { error: 'Please specify which job you are clocking into.' } };
        }

        const isAssigned = await isJobAssignedToCrew(supabase, accountId, crew.id, targetJobId);
        if (!isAssigned) {
          return { data: { error: 'You are not assigned to this job.' } };
        }

        const rate = crew.hourly_rate || 0;
        await clockIn(supabase, accountId, crew.id, targetJobId, rate, undefined, 'Clocked in via Crew Copilot');

        return {
          data: {
            success: true,
            message: 'You are now clocked in! Safe working out there.',
            clockedInAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          },
        };
      } else {
        const openShift = await getOpenShift(supabase, accountId, crew.id);
        if (!openShift) {
          return { data: { error: "You aren't currently clocked in to any active shift." } };
        }

        const endedAt = new Date().toISOString();
        await clockOut(supabase, accountId, openShift, {
          endedAt,
          crewName: crew.name,
          note: 'Clocked out via Crew Copilot',
        });


        const elapsedMinutes = Math.max(0, Math.round((Date.now() - new Date(openShift.started_at).getTime()) / 60000));
        const hours = (elapsedMinutes / 60).toFixed(1);

        return {
          data: {
            success: true,
            message: `You are now clocked out. Shift recorded: ${hours} hours. Great job today!`,
            clockedOutAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            totalHours: hours,
          },
        };
      }
    }

    case 'add_job_note_or_task': {
      const targetJobId = (args.jobId as string) || activeJobId;
      if (!targetJobId) {
        return { data: { error: 'Please specify which job to add this note or task to.' } };
      }

      const isAssigned = await isJobAssignedToCrew(supabase, accountId, crew.id, targetJobId);
      if (!isAssigned) {
        return { data: { error: 'You are not assigned to this job.' } };
      }

      const type = (args.type as string) || 'note';
      const text = (args.text as string) || '';

      if (!text.trim()) {
        return { data: { error: 'Note or task text cannot be empty.' } };
      }

      if (type === 'task') {
        const task = await createJobTask(supabase, accountId, targetJobId, text.trim());
        return {
          data: {
            success: true,
            message: `Checklist task added: "${task.title}"`,
            taskId: task.id,
          },
        };
      } else {
        const { error } = await supabase.from('job_updates').insert({
          account_id: accountId,
          job_id: targetJobId,
          author_name: crew.name,
          body: text.trim(),
          source: 'crew_copilot',
        });

        if (error) {
          console.warn('Could not write to job_updates:', error.message);
        }

        return {
          data: {
            success: true,
            message: `Site update recorded from ${crew.name}: "${text.trim()}"`,
          },
        };
      }
    }

    default:
      return { data: { error: `Tool "${name}" is not recognized or permitted.` } };
  }
}
