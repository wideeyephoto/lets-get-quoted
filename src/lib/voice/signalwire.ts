import type {
  InboundCall,
  VoiceAnswer,
  VoiceAnswerPlan,
  VoiceProvider,
  VoiceReceiptParse,
} from '@/lib/voice/provider';

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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

  parseInboundCall(body): InboundCall | null {
    const get = (key: string): unknown =>
      body instanceof FormData ? body.get(key) : (body as Record<string, unknown>)[key];

    // The inbound leg still arrives on the compatibility API, which is form
    // encoded and uses the same field names as the existing voice rail.
    const toNumber = text(get('To'));
    const providerCallId = text(get('CallSid')) ?? text(get('call_id'));
    if (!toNumber || !providerCallId) return null;

    return Object.freeze({
      providerCallId,
      toNumber,
      fromNumber: text(get('From')),
    });
  },

  renderAnswer(plan: VoiceAnswerPlan): VoiceAnswer {
    if (plan.kind === 'ai_agent') {
      // SWML, which is JSON. `post_prompt_url` is where the receipt lands, and
      // it is the only URL in here — LGQ's own.
      return Object.freeze({
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1.0.0',
          sections: {
            main: [
              { answer: {} },
              {
                ai: {
                  post_prompt_url: plan.receiptUrl,
                  params: {
                    // The published safety cap, expressed to the provider so it
                    // holds even if LGQ's own settlement never runs.
                    end_of_speech_timeout: 1000,
                    max_duration: plan.capMinutes * 60,
                  },
                  prompt: { text: plan.greeting },
                  post_prompt: {
                    text: 'Summarise the caller\'s name, phone number, service address, '
                      + 'the work requested, how urgent it is, and any appointment time '
                      + 'they preferred. State plainly if any of these were not given.',
                  },
                  ...(plan.transferTo
                    ? { SWAIG: { functions: [{
                      function: 'transfer_to_business',
                      purpose: 'Send the caller to a person when they ask for one or the '
                        + 'request is beyond what can be handled.',
                      argument: { type: 'object', properties: {} },
                      data_map: { expressions: [{
                        string: 'true', pattern: '.*',
                        output: { response: 'Connecting you now.', action: [{ SWML: {
                          version: '1.0.0',
                          sections: { main: [{ connect: { to: plan.transferTo } }] },
                        } }] },
                      }] },
                    }] } }
                    : {}),
                },
              },
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
        + (plan.kind === 'voicemail' ? '<Record maxLength="120" playBeep="true" />' : '')
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

    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        provider: 'signalwire' as const,
        providerCallId: callId,
        eventType: 'post_conversation' as const,
        projectId: text(body.project_id),
        spaceId: text(body.space_id),
        callStartMicros: micros(body.call_start_date),
        callAnswerMicros: micros(body.call_answer_date),
        callEndMicros: micros(body.call_end_date),
        aiStartMicros: micros(body.ai_start_date),
        aiEndMicros: micros(body.ai_end_date),
        callerNumber: text(body.caller_id_number) ?? text(record(body.global_data)?.caller_id_number),
        summary: summaryFrom(body),
      }),
    });
  },
};
