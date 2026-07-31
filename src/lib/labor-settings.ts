import type { PeriodMode } from './labor';

// Labor settings — how this account counts hours.
//
// Stored in a cookie, the same way the dashboard's other per-user preferences
// are (see dashboard-views.ts). That is a deliberate choice, not a shortcut:
// these are display and rollup rules for one owner's screen, they need no
// migration, and they survive sessions. Anything that has to be true for the
// whole ACCOUNT — an audit trail of what was exported, an approval a second
// person can see — would need a column, and none of that is claimed here.
//
// Client-safe: names and normalizers only.

export const LABOR_SETTINGS_COOKIE = 'lgq_labor_settings';

export type RoundingRule = 'none' | 'quarter' | 'tenth';
export type ExportFormat = 'summary' | 'detail';

export type LaborSettings = {
  /** Default pay-period length the Hours & pay tab opens on. */
  periodMode: PeriodMode;
  /** Hours in a WEEK past which time counts as overtime. */
  overtimeThreshold: number;
  /** How each entry's hours are rounded before they're totalled. */
  rounding: RoundingRule;
  exportFormat: ExportFormat;
};

export const DEFAULT_LABOR_SETTINGS: LaborSettings = {
  periodMode: 'weekly',
  overtimeThreshold: 40,
  rounding: 'none',
  exportFormat: 'summary',
};

export const ROUNDING_LABEL: Record<RoundingRule, string> = {
  none: 'Exact hours as logged',
  quarter: 'Nearest 15 minutes (0.25)',
  tenth: 'Nearest 6 minutes (0.1)',
};

export const EXPORT_FORMAT_LABEL: Record<ExportFormat, string> = {
  summary: 'One row per crew member',
  detail: 'One row per labor entry',
};

export function normalizeLaborSettings(value: unknown): LaborSettings {
  if (typeof value !== 'string' || !value) return DEFAULT_LABOR_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // A hand-edited or truncated cookie must not take the page down.
    return DEFAULT_LABOR_SETTINGS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_LABOR_SETTINGS;
  const raw = parsed as Record<string, unknown>;

  const periodMode = ['weekly', 'biweekly', 'monthly', 'custom'].includes(raw.periodMode as string)
    ? (raw.periodMode as PeriodMode)
    : DEFAULT_LABOR_SETTINGS.periodMode;

  const threshold = Number(raw.overtimeThreshold);
  return {
    // 'custom' as a DEFAULT would open the tab on a range with no dates in it,
    // so it's allowed as a choice but never as the opening state.
    periodMode: periodMode === 'custom' ? 'weekly' : periodMode,
    // A threshold of 0 would mark every hour as overtime; 168 is a full week.
    overtimeThreshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 168 ? threshold : DEFAULT_LABOR_SETTINGS.overtimeThreshold,
    rounding: ['none', 'quarter', 'tenth'].includes(raw.rounding as string) ? (raw.rounding as RoundingRule) : DEFAULT_LABOR_SETTINGS.rounding,
    exportFormat: raw.exportFormat === 'detail' ? 'detail' : 'summary',
  };
}

export function serializeLaborSettings(settings: LaborSettings): string {
  return JSON.stringify(settings);
}

/** Round one entry's hours under the account's rule. */
export function roundHours(hours: number, rule: RoundingRule): number {
  if (rule === 'none' || !Number.isFinite(hours)) return hours;
  const step = rule === 'quarter' ? 0.25 : 0.1;
  return Math.round(hours / step) * step;
}

// -- The same rules, but per ACCOUNT ------------------------------------------
//
// They started as a cookie, which was defensible while they only shaped a
// display. They stopped being defensible the moment money was approved against
// them: the same account on a phone and a laptop could total one week two
// different ways, and nothing recorded which rules an amount was agreed under.
//
// The cookie is still read, as the fallback for an account that has never saved
// them — so nothing changes underneath an owner who has been using it.

export const LABOR_RULE_COLUMNS = 'labor_period_mode, labor_overtime_threshold, labor_rounding, labor_rules_set_at';

export type AccountLaborRules = LaborSettings & {
  /** False while these are still the defaults nobody chose. */
  chosen: boolean;
};

export function laborRulesFromAccount(
  row: {
    labor_period_mode?: unknown;
    labor_overtime_threshold?: unknown;
    labor_rounding?: unknown;
    labor_rules_set_at?: unknown;
  } | null,
  cookieFallback?: LaborSettings,
): AccountLaborRules {
  const chosen = typeof row?.labor_rules_set_at === 'string' && row.labor_rules_set_at.length > 0;
  // Until they have been saved once, whatever this browser was already using is
  // a better answer than a global default — it is what the owner has been
  // looking at.
  const base = chosen ? DEFAULT_LABOR_SETTINGS : cookieFallback ?? DEFAULT_LABOR_SETTINGS;
  if (!chosen) return { ...base, chosen: false };

  const threshold = Number(row?.labor_overtime_threshold);
  return {
    periodMode: normalizePeriodModeValue(row?.labor_period_mode, base.periodMode),
    overtimeThreshold: Number.isFinite(threshold) && threshold >= 1 && threshold <= 168 ? threshold : base.overtimeThreshold,
    rounding: normalizeRoundingValue(row?.labor_rounding, base.rounding),
    // Never lived on the account: it is a preference about a CSV, not a rule
    // that decides an amount.
    exportFormat: base.exportFormat,
    chosen: true,
  };
}

function normalizePeriodModeValue(value: unknown, fallback: PeriodMode): PeriodMode {
  const modes: PeriodMode[] = ['weekly', 'biweekly', 'monthly', 'custom'];
  return modes.includes(value as PeriodMode) ? (value as PeriodMode) : fallback;
}

function normalizeRoundingValue(value: unknown, fallback: RoundingRule): RoundingRule {
  const rules: RoundingRule[] = ['none', 'quarter', 'tenth'];
  return rules.includes(value as RoundingRule) ? (value as RoundingRule) : fallback;
}

/** "Weekly · overtime past 40 h · exact hours" — for showing what was applied. */
export function laborRulesSentence(settings: LaborSettings): string {
  const mode = settings.periodMode === 'custom' ? 'Custom range' : settings.periodMode[0].toUpperCase() + settings.periodMode.slice(1);
  return `${mode} · overtime past ${settings.overtimeThreshold} h/week · ${ROUNDING_LABEL[settings.rounding].toLowerCase()}`;
}
