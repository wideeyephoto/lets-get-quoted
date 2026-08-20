import Link from 'next/link';

import {
  describeSettlement,
  formatCallLength,
  type VoiceCallHistory,
} from '@/lib/voice/call-history';

/**
 * The call list, rendered on the server.
 *
 * NO CLIENT COMPONENT. Nothing here is interactive — it is a list of things that
 * already happened — and shipping a transcript-adjacent panel to the browser as
 * JSON props would put every caller's summary in the page payload of a tab
 * somebody might have open on a job site.
 *
 * THE NUMBERS ARE A REPORT. This is the screen that makes them look
 * authoritative, so it is also the screen where "answered but not billed" has to
 * be said in those words rather than dressed up as free or folded into a total.
 */

function when(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  // The contractor's own timezone, for the reason business hours use it: a UTC
  // host would date every evening call to the following day.
  return new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(at);
}

export default function VoiceCallHistorySection({
  history,
  timezone,
}: {
  history: VoiceCallHistory;
  timezone: string;
}) {
  if (history.calls.length === 0) {
    return (
      <p className="voice-history-empty">
        No calls yet. When the receptionist answers one, it appears here with what the caller
        wanted and how long it took.
      </p>
    );
  }

  return (
    <div className="voice-history">
      <div className="voice-history-totals">
        <div>
          <strong>{history.billedMinutes}</strong>
          <span>{history.billedMinutes === 1 ? 'minute billed' : 'minutes billed'}</span>
        </div>
        {history.unmeteredCalls > 0 ? (
          <div className="voice-history-unmetered">
            <strong>{history.unmeteredCalls}</strong>
            {/* Said plainly. These calls happened, cost LGQ money, and were not
                charged — folding them into the billed total would show a number
                that reconciles against nothing on the invoice. */}
            <span>{history.unmeteredCalls === 1 ? 'call answered but not billed' : 'calls answered but not billed'}</span>
          </div>
        ) : null}
      </div>

      <ul className="voice-history-list">
        {history.calls.map((call) => (
          <li key={call.id}>
            <div className="voice-history-head">
              <strong>{call.callerNumber ?? 'Caller unknown'}</strong>
              <span className="voice-history-when">{when(call.startedAt, timezone)}</span>
            </div>

            {call.summary ? <p className="voice-history-summary">{call.summary}</p> : null}

            <div className="voice-history-meta">
              {/* Length and cost side by side, because a contractor asking why a
                  61-second call cost two minutes needs both to answer it. */}
              <span>{formatCallLength(call.aiSeconds)} on the call</span>
              <span data-settlement={call.settlement}>
                {describeSettlement(call.settlement, call.billedMinutes)}
              </span>
              {call.leadId ? (
                <Link href={`/dashboard/leads/${call.leadId}`}>See the lead →</Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
