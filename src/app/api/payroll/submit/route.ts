import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { resolvePayPeriod, normalizePeriodMode, normalizeOffset } from '@/lib/labor';
import {
  loadCrewPayContext,
  ensurePayPeriodRow,
  logPayEvent,
  markSentToPayroll,
  snapshotOf,
} from '@/lib/crew-pay-data';
import { periodEndKey, periodStartKey, formatKeyRange, payMoney } from '@/lib/crew-pay';
import { laborRulesFromAccount } from '@/lib/labor-settings';
import {
  normalizePayrollProvider,
  type PayrollProvider,
} from '@/lib/payroll-export';
import {
  validatePayrollSubmission,
  buildProviderPayload,
  submitPayrollToProvider,
  type PayrollProviderConfig,
} from '@/lib/payroll-api-integration';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payroll/submit
 *
 * Direct cloud API submission of approved pay periods to connected payroll providers
 * (Gusto, QuickBooks Payroll, ADP, Paychex, or Generic Webhook).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userEmail } = await requireOfficeContext('crew_pay.write');

    let body: {
      period?: string;
      offset?: number;
      from?: string;
      to?: string;
      provider?: string;
      dryRun?: boolean;
      crewIds?: string[];
      companyId?: string;
      realmId?: string;
      webhookUrl?: string;
      accessToken?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { data: accountRow } = await supabase
      .from('accounts')
      .select('timezone, overtime_threshold, rounding, period_mode')
      .eq('id', accountId)
      .maybeSingle();

    const timeZone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';
    const settings = laborRulesFromAccount(accountRow as Parameters<typeof laborRulesFromAccount>[0]);

    const period = resolvePayPeriod(
      normalizePeriodMode(body.period || settings.periodMode || 'weekly'),
      normalizeOffset(body.offset ?? 0),
      {
        from: body.from || null,
        to: body.to || null,
        timeZone,
      },
    );

    const provider = normalizePayrollProvider(body.provider);
    const state = await loadCrewPayContext(supabase, accountId, { period, settings });
    if (!state.available) {
      return NextResponse.json(
        { error: 'Payroll data unavailable. Database migration required.' },
        { status: 503 },
      );
    }

    const selectedIds = Array.isArray(body.crewIds) && body.crewIds.length > 0 ? new Set(body.crewIds) : null;
    const targetRows = selectedIds
      ? state.rows.filter((r) => r.crewId && selectedIds.has(r.crewId))
      : state.rows;

    const validation = validatePayrollSubmission(provider, targetRows, {
      rangeLabel: period.rangeLabel,
      periodEndKey: periodEndKey(period),
      alreadySent: targetRows.some((r) => r.record?.sentAt),
      companyId: body.companyId,
    });

    if (!validation.valid && !body.dryRun) {
      return NextResponse.json(
        {
          error: 'Validation failed before payroll submission.',
          problems: validation.problems,
          excluded: validation.excluded,
        },
        { status: 422 },
      );
    }

    const payload = buildProviderPayload(provider, validation.payable, {
      rangeLabel: period.rangeLabel,
      periodStartKey: periodStartKey(period),
      periodEndKey: periodEndKey(period),
      companyId: body.companyId,
      realmId: body.realmId,
    });

    const providerConfig: PayrollProviderConfig = {
      provider,
      companyId: body.companyId,
      realmId: body.realmId,
      accessToken: body.accessToken,
      webhookUrl: body.webhookUrl,
      status: 'connected',
    };

    const submissionResult = await submitPayrollToProvider(providerConfig, payload, {
      dryRun: body.dryRun === true,
    });

    if (!submissionResult.success) {
      return NextResponse.json(
        {
          error: submissionResult.message,
          errors: submissionResult.errors,
          result: submissionResult,
        },
        { status: 502 },
      );
    }

    // On actual live submission, mark period and rows as sent
    if (!body.dryRun) {
      const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
      const approvedRows = targetRows.filter(
        (r) => r.eligible && r.hours > 0 && r.review === 'approved' && r.payment === 'unpaid',
      );

      if (approvedRows.length > 0) {
        await markSentToPayroll(supabase, accountId, periodRow.id, approvedRows.map(snapshotOf), userEmail);
      }

      await logPayEvent(supabase, accountId, {
        periodId: periodRow.id,
        action: 'marked_sent',
        summary: `Submitted ${validation.payable.length} records (${payMoney(validation.totalGross)}) to ${provider.toUpperCase()} API (Batch #${submissionResult.batchId}).`,
        actorEmail: userEmail,
        meta: {
          provider,
          batchId: submissionResult.batchId,
          transactionId: submissionResult.transactionId,
          recordCount: validation.payable.length,
          totalGross: validation.totalGross,
          totalHours: validation.totalHours,
          rangeLabel: formatKeyRange(periodStartKey(period), periodEndKey(period)),
        },
      });
    }

    return NextResponse.json({
      success: true,
      validation,
      submission: submissionResult,
      period: {
        rangeLabel: period.rangeLabel,
        startKey: periodStartKey(period),
        endKey: periodEndKey(period),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal payroll submission error.' },
      { status: 500 },
    );
  }
}
