import Link from 'next/link';
import type { Period } from '@/lib/insights';

// The header control row: reporting-period presets, a custom-range form, and the
// "compare to previous period" toggle that reveals every card's delta.
//
// A server component on purpose. Everything here is a link or a GET form, so the
// selected period, range and comparison are all in the URL — shareable, and
// working without client JS, exactly like the page it replaces. The interactive
// pieces the mockup adds later (the export modal, the filters popover) will mount
// as their own small client islands inside this row rather than turning the whole
// header client-side.
//
// Every href preserves the OTHER params. Switch from 90 days to 30 and the
// comparison toggle (and, later, an active filter) has to survive the click, or
// the control silently resets state the owner set on purpose. The custom-range
// form carries those same params as hidden inputs — a GET form otherwise submits
// only its own fields.

type Preset = { key: string; label: string };

function str(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default function InsightsHeaderControls({
  period,
  presets,
  searchParams,
}: {
  period: Period;
  presets: Preset[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const compareOn = str(searchParams.compare) === 'prev';

  // Build a /dashboard/insights href from the current params with overrides
  // applied (null deletes a key).
  const hrefWith = (overrides: Record<string, string | null>): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      const s = str(value);
      if (s) params.set(key, s);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return `/dashboard/insights${qs ? `?${qs}` : ''}`;
  };

  // Everything except the period keys, for the custom-range form's hidden inputs.
  const preserved = Object.entries(searchParams)
    .map(([key, value]) => [key, str(value)] as const)
    .filter(([key, value]) => value && key !== 'window' && key !== 'from' && key !== 'to');

  const presetHref = (key: string) => hrefWith({ window: key, from: null, to: null });
  const compareHref = compareOn ? hrefWith({ compare: null }) : hrefWith({ compare: 'prev' });

  // Active-filter chips surface the two applied states a glance at the tabs
  // doesn't already show — a custom date range and the comparison overlay — each
  // as its own dismiss link. (A non-default preset needs no chip: its tab is lit.)
  // "Reset all" clears range, comparison and preset back to the default view. The
  // date/lead-source/job-status filters the mockup sketches are deliberately not
  // here — leads and jobs are the only tables that carry a source, so a
  // categorical filter can't re-scope payments, customers, MRR or marketing
  // without inventing attribution; that omission is called out in the report.
  const chips: Array<{ label: string; href: string; removeLabel: string }> = [];
  if (period.custom) {
    chips.push({
      label: `Dates: ${period.label}`,
      href: hrefWith({ window: '90', from: null, to: null }),
      removeLabel: 'Clear the custom date range and return to the last 90 days',
    });
  }
  if (compareOn) {
    chips.push({
      label: 'Compared to previous period',
      href: hrefWith({ compare: null }),
      removeLabel: 'Turn off comparison to the previous period',
    });
  }

  return (
    <div className="ins-controls">
      <div className="ins-periods">
        <div className="ins-period-tabs" role="tablist" aria-label="Reporting period">
          {presets.map((option) => {
            const active = !period.custom && option.key === period.key;
            return (
              <Link
                key={option.key}
                href={presetHref(option.key)}
                role="tab"
                aria-selected={active}
                className={`ins-period-tab${active ? ' is-active' : ''}`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        {/* GET form so a custom range is a shareable URL, not tab-local state. */}
        <form className={`ins-range${period.custom ? ' is-active' : ''}`} action="/dashboard/insights" method="get">
          {preserved.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <label htmlFor="ins-from">From</label>
          <input id="ins-from" type="date" name="from" defaultValue={str(searchParams.from)} />
          <label htmlFor="ins-to">To</label>
          <input id="ins-to" type="date" name="to" defaultValue={str(searchParams.to)} />
          <button type="submit">Apply</button>
          {period.custom ? (
            <Link href={hrefWith({ window: '90', from: null, to: null })} className="ins-range-clear">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <Link
        href={compareHref}
        className={`ins-compare${compareOn ? ' is-on' : ''}`}
        aria-label={
          compareOn
            ? 'Comparison to the previous period is on. Activate to turn it off.'
            : 'Compare to the previous period. Activate to turn it on.'
        }
      >
        <span className="ins-compare-track" aria-hidden="true">
          <span className="ins-compare-thumb" />
        </span>
        <span>Compare to previous period</span>
      </Link>

      {chips.length > 0 ? (
        <div className="ins-active-filters">
          <span className="ins-active-filters-label">Applied</span>
          {chips.map((chip) => (
            <Link key={chip.label} href={chip.href} className="ins-filter-chip" aria-label={chip.removeLabel}>
              <span>{chip.label}</span>
              <span className="ins-filter-chip-x" aria-hidden="true">✕</span>
            </Link>
          ))}
          <Link href="/dashboard/insights" className="ins-filter-reset">
            Reset all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
