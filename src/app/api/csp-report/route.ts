import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Where the report-only CSP sends what it *would* have blocked. This is the whole
// point of shipping report-only first: real traffic tells us which directive is
// wrong before it can break a contractor's site.
//
// Deliberately boring: it logs a compact line and returns 204. No database
// writes — the endpoint is unauthenticated and browser-driven, so anything it
// persisted would be attacker-controllable storage. Rate limited per IP because a
// single misconfigured page can emit a report per violation per page view, and
// this is a public endpoint. Fails OPEN (a limiter error just drops the report):
// losing a diagnostic beats 500-ing on a header we're only observing.

type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'effective-directive'?: string;
  'blocked-uri'?: string;
  'line-number'?: number;
};

function summarize(body: unknown): CspReport | null {
  if (!body || typeof body !== 'object') return null;
  // Browsers send either {"csp-report": {...}} (Level 2) or a Reporting API array.
  const legacy = (body as { 'csp-report'?: unknown })['csp-report'];
  if (legacy && typeof legacy === 'object') return legacy as CspReport;
  if (Array.isArray(body)) {
    const first = body[0] as { body?: unknown } | undefined;
    if (first?.body && typeof first.body === 'object') return first.body as CspReport;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request.headers);
  try {
    const admin = createAdminClient();
    if (!(await checkRateLimit(admin, `cspreport:ip:${ip}`, 30, 60))) {
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    // Limiter unavailable — keep accepting, just don't let it break the request.
  }

  const body = await request.json().catch(() => null);
  const report = summarize(body);
  if (report) {
    // Truncated: these fields are attacker-influenced and end up in logs.
    const directive = String(report['effective-directive'] || report['violated-directive'] || 'unknown').slice(0, 80);
    const blocked = String(report['blocked-uri'] || 'unknown').slice(0, 200);
    const document = String(report['document-uri'] || 'unknown').slice(0, 200);
    console.warn(`[csp-report] ${directive} blocked=${blocked} on=${document}`);
  }

  return new NextResponse(null, { status: 204 });
}
