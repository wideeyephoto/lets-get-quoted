import { greetingWithAiDisclosure } from '@/lib/voice/provider';
import type {
  InboundCall,
  VoiceAnswer,
  VoiceAnswerPlan,
  VoiceProvider,
  VoiceReceipt,
  VoiceReceiptParse,
  VoiceTranscriptTurn,
} from '@/lib/voice/provider';
import { sanitizeVoiceReceipt } from '@/lib/voice/receipt-redaction';

/**
 * SignalWire AI Agents, behind the provider-neutral seam.
 *
 * Everything here is written against a payload measured from a live scratch
 * agent on 2026-08-19, not from documentation. The full capture and its
 * consequences are in docs/ai-voice-v1-decisions.md §11; the three that shape
 * this file are:
 *
 *  - ONE callback, at the end of the call. No call-started event, and nothing at
 *    all for a call that fails while connecting. LGQ therefore learns a call
 *    began from its own SWML request, not from the provider.
 *  - NO duration field. Five microsecond timestamps instead, of which
 *    ai_start_date..ai_end_date is the billable one.
 *  - NO signature, and no signing secret available anywhere in the dashboard.
 *
 * This file deliberately names no SignalWire host. LGQ never dials out to run a
 * call: it answers a request the provider made, and the receipt arrives at a URL
 * LGQ owns. `test/sms-provider.test.ts` asserts that exactly one file under
 * `src/` names a provider host, and this seam keeps that assertion true rather
 * than asking for an exemption.
 */

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const CUSTOMER_SWAIG_TOOLS = [
  'transfer_to_business',
  'send_booking_link',
  'check_available_slots',
  'book_appointment_slot',
  'check_permit_requirement',
  'check_inspection_status',
  'check_rebates_and_incentives',
  'cancel_or_reschedule_appointment',
  'get_service_quote_range',
  'capture_lead',
] as const;

/** Microsecond epoch, or null. Zero is not a timestamp. */
function micros(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function transcriptFrom(payload: Record<string, unknown>): readonly VoiceTranscriptTurn[] | null {
  if (!Array.isArray(payload.call_log)) return null;
  const turns: VoiceTranscriptTurn[] = [];
  for (const candidate of payload.call_log) {
    const turn = record(candidate);
    if (!turn || typeof turn.content !== 'string' || !turn.content.trim()) continue;
    turns.push(Object.freeze({
      role: text(turn.role),
      content: turn.content.trim(),
      timestamp: typeof turn.timestamp === 'number'
        && Number.isFinite(turn.timestamp) && turn.timestamp > 0
        ? turn.timestamp
        : null,
    }));
  }
  return Object.freeze(turns);
}

function compact(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined),
  ));
}

/**
 * The immutable receipt evidence LGQ keeps.
 *
 * SignalWire sends the conversation in `call_log`, `raw_call_log`, and
 * `call_timeline`. The normalized callLog travels separately to voice_calls;
 * no transcript enters voice_events. Provider telemetry and new unknown fields
 * are allowlist-dropped here.
 */
export function minimizeSignalWireVoiceReceiptPayload(
  payload: unknown,
  receipt: VoiceReceipt,
): Readonly<Record<string, unknown>> {
  const safeReceipt = sanitizeVoiceReceipt(receipt);
  const body = record(payload) ?? {};
  const swmlCall = record(body.SWMLCall);
  const swmlVars = record(record(body.SWMLVars)?.userVariables);
  const callEcho = text(swmlCall?.call_id);
  const memberEcho = text(swmlVars?.memberCallId);

  return compact({
    action: safeReceipt.eventType,
    call_id: safeReceipt.providerCallId,
    project_id: safeReceipt.projectId,
    space_id: safeReceipt.spaceId,
    conversation_type: text(body.conversation_type),
    call_start_date: safeReceipt.callStartMicros,
    call_answer_date: safeReceipt.callAnswerMicros,
    call_end_date: safeReceipt.callEndMicros,
    ai_start_date: safeReceipt.aiStartMicros,
    ai_end_date: safeReceipt.aiEndMicros,
    caller_id_number: safeReceipt.callerNumber,
    summary: safeReceipt.summary,
    structured_post_prompt: safeReceipt.structuredPostPrompt ?? null,
    SWMLCall: callEcho ? { call_id: callEcho } : null,
    SWMLVars: memberEcho ? { userVariables: { memberCallId: memberEcho } } : null,
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const CONTRACTOR_JOB_TARGET_DESCRIPTION = 'The exact job reference or job UUID. '
  + 'If the caller does not know it, collect the full client name and service address, '
  + 'then use lookup_jobs to read the available choices and ask a clarifying question before using this tool whenever more than one job could match. Map the caller\'s chosen description or option to the returned exact reference. Never guess.';

// `record` blocks SWML until the caller finishes. `record_call` starts a
// background recording and would let the following hangup cut voicemail off.
// https://signalwire.com/docs/swml/reference/calling/record
const VOICEMAIL_RECORDING = {
  format: 'mp3',
  stereo: false,
  direction: 'speak',
  beep: true,
  max_length: 120,
  initial_timeout: 10,
  end_silence_timeout: 5,
  terminators: '#',
} as const;

export function structuredPostPromptFrom(payload: Record<string, unknown>): Readonly<Record<string, unknown>> | null {
  const post = record(payload.post_prompt_data);
  if (!post) return null;
  const parsed = record(post.parsed);
  if (parsed) return parsed;
  const rawText = text(post.substituted) ?? text(post.raw);
  if (rawText) {
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
          return obj as Record<string, unknown>;
        }
      }
    } catch {
      // not JSON, continue
    }
  }
  return null;
}

/**
 * The last assistant turn of the conversation, which is the closest thing the
 * measured payload has to a summary when `post_prompt_data` is absent.
 */
function summaryFrom(payload: Record<string, unknown>): string | null {
  const post = record(payload.post_prompt_data);
  const direct = text(post?.substituted) ?? text(post?.raw);
  if (direct) return direct;

  const log = payload.call_log;
  if (!Array.isArray(log)) return null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const turn = record(log[i]);
    if (turn?.role === 'assistant') {
      const content = text(turn.content);
      if (content) return content;
    }
  }
  return null;
}

export const signalwireVoiceProvider: VoiceProvider = {
  id: 'signalwire',

  parseInboundCall(body: FormData | Record<string, unknown>): InboundCall | null {
    if (body instanceof FormData) {
      const toNumber = text(body.get('To') ?? body.get('to'));
      const providerCallId = text(body.get('CallSid') ?? body.get('call_id'));
      if (!toNumber || !providerCallId) return null;

      return Object.freeze({
        providerCallId,
        toNumber,
        fromNumber: text(body.get('From') ?? body.get('from')),
      });
    }

    const payload = record(body);
    if (!payload) return null;

    const callObj = record(payload.call);
    const toNumber = text(callObj?.to ?? payload.To ?? payload.to);
    const providerCallId = text(callObj?.call_id ?? payload.CallSid ?? payload.call_id);
    if (!toNumber || !providerCallId) return null;

    return Object.freeze({
      providerCallId,
      toNumber,
      fromNumber: text(callObj?.from ?? payload.From ?? payload.from),
    });
  },

  renderAnswer(plan: VoiceAnswerPlan, options?: { format?: 'swml' | 'laml' }): VoiceAnswer {
    if (plan.kind === 'ai_agent') {
      // SWML, which is JSON. `post_prompt_url` is where the receipt lands, and
      // it is the only URL in here — LGQ's own.
      const recordCall = plan.recordCall === true && plan.contractorMode !== true;
      const spokenGreeting = greetingWithAiDisclosure(plan.greeting, {
        recordingEnabled: recordCall,
      });
      const mainSection: Record<string, unknown>[] = [{ answer: {} }];
      // The deterministic disclosure must finish before recording begins. The
      // AI instruction that follows cannot substitute for audio the caller has
      // actually heard.
      mainSection.push({ play: { url: `say: ${spokenGreeting}` } });
      if (recordCall) {
        mainSection.push({
          record_call: {
            ...(plan.recordingStatusUrl ? { status_url: plan.recordingStatusUrl } : {}),
            format: 'mp3',
            stereo: false,
          },
        });
      }
      const swaigFunctions: Record<string, unknown>[] = [];

      if (plan.transferTo) {
        swaigFunctions.push({
          function: 'transfer_to_business',
          purpose: 'Send the caller to a person when they ask for one or the '
            + 'request is beyond what can be handled.',
          argument: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Brief reason for the transfer to announce to the live staff.',
              },
            },
          },
          data_map: { expressions: [{
            string: 'true', pattern: '.*',
            output: {
              response: 'Connecting you with our office staff now. Please hold for just a moment.',
              action: [{
                transfer: true,
                SWML: {
                  version: '1.0.0',
                  sections: {
                    main: [
                      {
                        connect: {
                          to: plan.transferTo,
                          timeout: 25,
                          confirm: [
                            { play: { url: 'say: Incoming transfer from AI receptionist regarding: %{args.reason}.' } },
                          ],
                        },
                      },
                      { play: { url: 'say: Our office staff is currently unavailable to take your call. Please leave a message after the beep.' } },
                      { record: { ...VOICEMAIL_RECORDING, ...(plan.recordingStatusUrl ? { status_url: plan.recordingStatusUrl } : {}) } },
                      { hangup: {} },
                    ],
                  },
                },
              }],
            },
          }] },
        });
      }

      if (plan.swaigUrl) {
        if (!plan.contractorMode) {
          swaigFunctions.push({
            function: 'send_booking_link',
            purpose: 'Send an SMS text message containing our direct online appointment and estimate booking link to the caller\'s phone.',
            argument: {
              type: 'object',
              properties: {
                caller_phone: {
                  type: 'string',
                  description: 'The phone number to receive the booking text message.',
                },
              },
            },
            web_hook_url: plan.swaigUrl,
            web_hook_auth_user: plan.receiptAuthorization.username,
            web_hook_auth_password: plan.receiptAuthorization.password,
          });
        }

        swaigFunctions.push({
          function: 'check_available_slots',
          purpose: 'Query live appointment slots and dispatch windows by date or timeframe.',
          argument: {
            type: 'object',
            properties: {
              preferred_date: {
                type: 'string',
                description: 'The date requested by the caller (e.g. 2026-08-27, tomorrow, Thursday, next week).',
              },
              service_type: {
                type: 'string',
                description: 'The type of service requested (e.g. leak repair, estimate, installation).',
              },
            },
          },
          fillers: [
            'Checking our available appointment slots for you...',
            'Looking up open dispatch windows on our calendar...',
          ],
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        if (!plan.contractorMode) {
          swaigFunctions.push({
            function: 'book_appointment_slot',
            purpose: 'Directly schedule and confirm an appointment slot into the system, place a hold, and send an SMS confirmation to the caller.',
            argument: {
              type: 'object',
              properties: {
                caller_name: {
                  type: 'string',
                  description: 'Full name of the homeowner or business contact.',
                },
                caller_phone: {
                  type: 'string',
                  description: 'Mobile phone number for booking confirmation and dispatch alerts.',
                },
                service_address: {
                  type: 'string',
                  description: 'The street address, city, and ZIP where the service will take place.',
                },
                requested_date: {
                  type: 'string',
                  description: 'The chosen date in YYYY-MM-DD format (e.g. 2026-08-27).',
                },
                requested_time: {
                  type: 'string',
                  description: 'The start time of the window (HH:MM format in 24h or label e.g. 08:00 or Morning).',
                },
                service_description: {
                  type: 'string',
                  description: 'Description of the work needed or issue reported.',
                },
                notes: {
                  type: 'string',
                  description: 'Optional gate codes, parking instructions, or customer notes.',
                },
              },
              required: ['caller_name', 'requested_date', 'requested_time'],
            },
            fillers: [
              'Reserving that appointment window for you right now...',
              'Locking in your appointment slot on our schedule...',
            ],
            web_hook_url: plan.swaigUrl,
            web_hook_auth_user: plan.receiptAuthorization.username,
            web_hook_auth_password: plan.receiptAuthorization.password,
          });
        }

        swaigFunctions.push({
          function: 'check_contractor_availability',
          purpose: 'Query current business hours, appointment availability, and emergency coverage.',
          argument: {
            type: 'object',
            properties: {
              timeframe: {
                type: 'string',
                description: 'Optional timeframe or query type (e.g. today, tomorrow, this week, emergency).',
              },
            },
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'check_permit_requirement',
          purpose: 'Look up municipal building codes, permit requirements, and estimated fees for a project in a specific city.',
          argument: {
            type: 'object',
            properties: {
              city_or_address: {
                type: 'string',
                description: 'The city or street address where work is being performed (e.g. Royal Oak, Detroit, Troy).',
              },
              trade: {
                type: 'string',
                description: 'The trade discipline: roofing, electrical, mechanical, or plumbing.',
              },
              project_description: {
                type: 'string',
                description: 'Brief description of the work requested (e.g. roof replacement, panel upgrade, water heater).',
              },
            },
            required: ['city_or_address'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'check_inspection_status',
          purpose: 'Look up municipal permit approval status and scheduled inspection dates for an active customer or property address.',
          argument: {
            type: 'object',
            properties: {
              customer_name_or_address: {
                type: 'string',
                description: 'The customer name, phone number, or street address to look up.',
              },
            },
            required: ['customer_name_or_address'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'check_rebates_and_incentives',
          purpose: 'Look up federal Inflation Reduction Act (IRA) tax credits and local utility cash rebates for heat pumps, EV chargers, solar, water heaters, and electrical panels.',
          argument: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'The clean energy improvement: heat_pump, ev_charger, solar, water_heater, or panel_upgrade.',
              },
              state: {
                type: 'string',
                description: 'The 2-letter state abbreviation (e.g. MI, CA, NY). Defaults to MI if unspecified.',
              },
            },
            required: ['category'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'capture_lead',
          purpose: 'Save customer intake information and create a new lead in the CRM when a caller requests a quote, service, inspection, or callback. Phone number is optional.',
          argument: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Full name of the customer or contact person.',
              },
              phone: {
                type: 'string',
                description: 'Optional callback phone number. Omit or set null if unavailable or not provided.',
              },
              address: {
                type: 'string',
                description: 'Optional property or service address.',
              },
              project_type: {
                type: 'string',
                description: 'Optional category or type of work requested (e.g. plumbing, leak repair, water heater).',
              },
              notes: {
                type: 'string',
                description: 'Description of the customer issue, request, or details.',
              },
              email: {
                type: 'string',
                description: 'Optional email address of the customer.',
              },
            },
            required: ['name'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'cancel_or_reschedule_appointment',
          purpose: 'Reschedule or cancel an existing appointment for a customer by their phone number or address.',
          argument: {
            type: 'object',
            properties: {
              customer_phone: {
                type: 'string',
                description: 'The phone number associated with the appointment.',
              },
              service_address: {
                type: 'string',
                description: 'The property or street address of the service appointment.',
              },
              action: {
                type: 'string',
                enum: ['reschedule', 'cancel'],
                description: 'Whether the customer wants to reschedule or cancel.',
              },
              new_date: {
                type: 'string',
                description: 'The new requested date in YYYY-MM-DD format (for rescheduling).',
              },
              new_time: {
                type: 'string',
                description: 'The new requested appointment window or time (for rescheduling).',
              },
              reason: {
                type: 'string',
                description: 'Optional reason provided by the customer.',
              },
            },
            required: ['action'],
          },
          fillers: [
            'Looking up your existing appointment on the schedule...',
            'Updating our appointment dispatch calendar for you...',
          ],
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'get_service_quote_range',
          purpose: 'Provide standard estimate ranges and typical pricing benchmarks for requested trade services, explaining that final quotes require an in-person assessment.',
          argument: {
            type: 'object',
            properties: {
              trade: {
                type: 'string',
                description: 'The trade discipline (e.g. plumbing, electrical, hvac, roofing).',
              },
              service_type: {
                type: 'string',
                description: 'The specific job or equipment (e.g. water heater replacement, panel upgrade, roof repair, drain clearing).',
              },
            },
            required: ['service_type'],
          },
          fillers: [
            'Checking our standard pricing guide and typical project ranges for you...',
          ],
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

      if (plan.swaigUrl && plan.contractorMode) {
        swaigFunctions.push({
          function: 'lookup_jobs',
          purpose: 'Read existing jobs for a verified owner or office caller. Use when asked what jobs exist, for job details, or to list choices before an update when the caller does not know a job reference. Returns references, scope, address, status, schedule, and recorded quote. Registered staff identity and role permissions are checked automatically; never ask for a verification code. Does not create or update anything.',
          argument: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Client name, service address, exact job reference, or job UUID. Omit to list current jobs. After listing choices, pass the reference for the option the caller chose.',
              },
            },
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'append_job_caution_or_note',
          purpose: 'Add an internal note, safety warning, gate code, pet caution, or special request to a job or client record.',
          argument: {
            type: 'object',
            properties: {
              job_ref_or_client: {
                type: 'string',
                description: CONTRACTOR_JOB_TARGET_DESCRIPTION,
              },
              note: {
                type: 'string',
                description: 'The internal note, safety warning, gate code, pet caution, or special request.',
              },
              is_caution: {
                type: 'boolean',
                description: 'True if this is a safety caution or special attention warning.',
              },
            },
            required: ['job_ref_or_client', 'note'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'update_job_details',
          purpose: 'Update active job details, quote line items, schedule date/time, or status.',
          argument: {
            type: 'object',
            properties: {
              job_ref_or_client: {
                type: 'string',
                description: CONTRACTOR_JOB_TARGET_DESCRIPTION,
              },
              scope: {
                type: 'string',
                description: 'New or additional scope of work completed or requested.',
              },
              status: {
                type: 'string',
                description: 'Updated status (new_lead, in_progress, complete).',
              },
              scheduled_date: {
                type: 'string',
                description: 'Target or rescheduled date in YYYY-MM-DD format.',
              },
              scheduled_time: {
                type: 'string',
                description: 'Arrival time (e.g. 08:00, 14:00).',
              },
              line_item_label: {
                type: 'string',
                description: 'Name of added quote item or fixture (e.g. 4 Recessed Lights).',
              },
              line_item_price: {
                type: 'number',
                description: 'Dollar amount for the added line item (e.g. 650).',
              },
            },
            required: ['job_ref_or_client'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'create_or_update_lead',
          purpose: 'Create a new customer lead only. Do not use this tool to update or implicitly match an existing lead without an exact lead ID. Phone number is optional. Lead creation is additive and does not require SMS verification.',
          argument: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                enum: ['create'],
                description: 'Explicit operation intent. Defaults to create.',
              },
              name: {
                type: 'string',
                description: 'Full name for the new lead.',
              },
              phone: {
                type: 'string',
                description: 'Optional contact phone number. Can be omitted or null if unavailable or not provided.',
              },
              address: {
                type: 'string',
                description: 'Optional street address and city.',
              },
              project_type: {
                type: 'string',
                description: 'Work requested or trade category.',
              },
              notes: {
                type: 'string',
                description: 'Description of the customer issue or details.',
              },
              requested_date: {
                type: 'string',
                description: 'Requested estimate visit date in YYYY-MM-DD.',
              },
            },
            required: ['intent', 'name'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'log_crew_time_and_materials',
          purpose: 'Log labor hours worked and material costs purchased for one unambiguously identified job. '
            + 'Before calling, confirm at least one positive labor or material entry, collect the crew member name '
            + 'for labor, and itemize the materials for every material cost.',
          argument: {
            type: 'object',
            properties: {
              job_ref_or_client: {
                type: 'string',
                description: CONTRACTOR_JOB_TARGET_DESCRIPTION,
              },
              crew_name: {
                type: 'string',
                description: 'Full name of the crew member whose labor is being logged. Collect this whenever hours are included.',
              },
              hours: {
                type: 'number',
                description: 'A positive, finite number of labor hours worked. Do not send zero or a negative value.',
              },
              materials: {
                type: 'string',
                description: 'Itemized description of materials used or purchased. Required whenever material_cost is included.',
              },
              material_cost: {
                type: 'number',
                description: 'A positive dollar total for the itemized materials. Never submit a material cost without materials.',
              },
            },
            required: ['job_ref_or_client'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });

        swaigFunctions.push({
          function: 'create_job_change_order',
          purpose: 'Record unforeseen extra work or changes requiring an official change order.',
          argument: {
            type: 'object',
            properties: {
              job_ref_or_client: {
                type: 'string',
                description: CONTRACTOR_JOB_TARGET_DESCRIPTION,
              },
              title: {
                type: 'string',
                description: 'Brief title for the change order.',
              },
              description: {
                type: 'string',
                description: 'Explanation of extra scope and necessity.',
              },
            },
            required: ['job_ref_or_client', 'title', 'description'],
          },
          web_hook_url: plan.swaigUrl,
          web_hook_auth_user: plan.receiptAuthorization.username,
          web_hook_auth_password: plan.receiptAuthorization.password,
        });
        }
      }

      mainSection.push({
        ai: {
          post_prompt_url: plan.receiptUrl,
          // SignalWire supports these as dedicated fields. Using them
          // produces Authorization: Basic on the receipt request while
          // keeping reusable credentials out of URLs, request logs and
          // error trackers.
          post_prompt_auth_user: plan.receiptAuthorization.username,
          post_prompt_auth_password: plan.receiptAuthorization.password,
          params: {
            // The published safety cap, expressed to the provider so it
            // holds even if LGQ's own settlement never runs.
            end_of_speech_timeout: 1000,
            max_duration: plan.capMinutes * 60,
            // Provider-side best effort. Structured fields and tool results can
            // still retain originals, so the receipt boundary redacts again.
            redact_prompt: 'Redact six-digit voice authorization codes, one-time passwords, OTPs, verification codes, and PINs.',
          },
          prompt: {
            text: plan.systemPrompt || ('You are an AI receptionist for a home-service contractor. '
              + 'The opening greeting and AI disclosure have already been played; do not repeat them unless asked. '
              + 'Collect the caller\'s name, callback number, service address, the work requested, urgency, '
              + 'and preferred appointment time. Never claim an appointment is confirmed. '
              + 'If the caller speaks Spanish, politely assist them in Spanish. '
              + 'If the caller asks whether a permit or city inspection is needed or asks about municipal building code rules, use the check_permit_requirement tool with their city and trade. '
              + 'If an existing customer calls asking about their permit status or scheduled municipal inspection, use the check_inspection_status tool. '
              + 'If the caller asks for a price range or quote, use the get_service_quote_range tool. '
              + 'If the caller needs to cancel or reschedule an existing appointment, use the cancel_or_reschedule_appointment tool. '
              + 'If the caller asks for a person and a transfer tool is available, use it. '
              + 'If the caller reports an acute emergency such as active flooding, electrical sparks, or gas odor, prioritize safety and transfer immediately if a transfer tool is available.'),
          },
          post_prompt: {
            text: plan.postPrompt || ('Summarise the caller\'s name, phone number, service address, '
              + 'the work requested, how urgent it is, and any appointment time '
              + 'they preferred. State plainly if any of these were not given.'),
          },
          ...(swaigFunctions.length > 0 ? { SWAIG: { functions: swaigFunctions } } : {}),
        },
      });

      return Object.freeze({
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1.0.0',
          sections: {
            main: mainSection,
          },
        }),
      });
    }

    if (options?.format === 'swml') {
      if (plan.kind === 'forward') {
        return Object.freeze({
          contentType: 'application/json',
          body: JSON.stringify({
            version: '1.0.0',
            sections: {
              main: [
                {
                  connect: {
                    to: plan.number,
                    from: plan.callerId,
                    timeout: plan.timeoutSeconds,
                    status_url: plan.actionUrl,
                  },
                },
                { play: { url: "say: We are currently unable to take your call. Please leave your name, number, and a detailed message after the beep." } },
                { record: { ...VOICEMAIL_RECORDING, ...(plan.recordingStatusUrl ? { status_url: plan.recordingStatusUrl } : {}) } },
                { hangup: {} },
              ],
            },
          }),
        });
      }
      const message = plan.kind === 'voicemail' ? plan.message : plan.message;
      return Object.freeze({
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1.0.0',
          sections: {
            main: [
              { answer: {} },
              { play: { url: `say: ${message}` } },
              ...(plan.kind === 'voicemail' ? [{ record: { ...VOICEMAIL_RECORDING, ...(plan.recordingStatusUrl ? { status_url: plan.recordingStatusUrl } : {}) } }] : []),
              { hangup: {} },
            ],
          },
        }),
      });
    }

    // Everything else is the existing dial-and-forward rail, which speaks the
    // compatibility markup both providers share.
    if (plan.kind === 'forward') {
      return Object.freeze({
        contentType: 'text/xml',
        body: '<?xml version="1.0" encoding="UTF-8"?><Response>'
          + `<Dial timeout="${plan.timeoutSeconds}" callerId="${escapeXml(plan.callerId)}"`
          + ` action="${escapeXml(plan.actionUrl)}" method="POST">`
          + `<Number>${escapeXml(plan.number)}</Number></Dial></Response>`,
      });
    }

    // `voice` is pinned on every spoken line. It defaults to a male voice on
    // Twilio and a female one on SignalWire, so leaving it unset changes the
    // gender of the recording a caller hears the day the provider changes —
    // something nobody would think to test for and every repeat caller notices.
    const message = plan.kind === 'voicemail' ? plan.message : plan.message;
    return Object.freeze({
      contentType: 'text/xml',
      body: '<?xml version="1.0" encoding="UTF-8"?><Response>'
        + `<Say voice="man">${escapeXml(message)}</Say>`
        + (plan.kind === 'voicemail' ? `<Record maxLength="120" playBeep="true"${plan.recordingStatusUrl ? ` recordingStatusCallback="${escapeXml(plan.recordingStatusUrl)}" recordingStatusCallbackMethod="POST"` : ''} />` : '')
        + '</Response>',
    });
  },

  parseReceipt(payload): VoiceReceiptParse {
    const body = record(payload);
    if (!body) return Object.freeze({ ok: false as const, reason: 'not_an_object' as const });

    if (text(body.action) !== 'post_conversation') {
      return Object.freeze({ ok: false as const, reason: 'unsupported_event_type' as const });
    }

    const callId = text(body.call_id);
    if (!callId) return Object.freeze({ ok: false as const, reason: 'missing_call_id' as const });
    const projectId = text(body.project_id);
    if (!projectId) {
      return Object.freeze({ ok: false as const, reason: 'missing_project_id' as const });
    }
    const spaceId = text(body.space_id);
    if (!spaceId) {
      return Object.freeze({ ok: false as const, reason: 'missing_space_id' as const });
    }

    // The measured payload carries the call id three times, identical in all
    // three. Reading one and ignoring the others would make a payload whose
    // copies DISAGREED look ordinary — and disagreement is either a provider
    // change worth noticing or a hand-assembled forgery.
    const swmlCall = record(body.SWMLCall);
    const swmlVars = record(record(body.SWMLVars)?.userVariables);
    for (const echo of [text(swmlCall?.call_id), text(swmlVars?.memberCallId)]) {
      if (echo !== null && echo !== callId) {
        return Object.freeze({ ok: false as const, reason: 'call_id_disagreement' as const });
      }
    }

    const receipt = sanitizeVoiceReceipt(Object.freeze({
      provider: 'signalwire' as const,
      providerCallId: callId,
      eventType: 'post_conversation' as const,
      projectId,
      spaceId,
      callStartMicros: micros(body.call_start_date),
      callAnswerMicros: micros(body.call_answer_date),
      callEndMicros: micros(body.call_end_date),
      aiStartMicros: micros(body.ai_start_date),
      aiEndMicros: micros(body.ai_end_date),
      callerNumber: text(body.caller_id_number) ?? text(record(body.global_data)?.caller_id_number),
      summary: summaryFrom(body),
      structuredPostPrompt: structuredPostPromptFrom(body),
      callLog: transcriptFrom(body),
    }));
    return Object.freeze({
      ok: true as const,
      receipt,
    });
  },
};
