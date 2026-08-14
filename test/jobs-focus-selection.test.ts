import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FILTERING THE LIST HAS TO MOVE THE SELECTION.
 *
 * Filtering /dashboard/jobs to "Complete 5" while an in-progress job was open
 * left that job selected. The list showed five finished jobs and the pane
 * beside it showed a sixth that was no longer in the list — along with
 * everything else keyed off the selection: the detail request went out for a
 * job the visitor could not see, the map centred on it, and the arrow keys
 * searched a list the selection was not in.
 *
 * A source-shape test, because the thing that broke is a piece of React
 * bookkeeping rather than a computation: the selection was STORED and the list
 * it indexed into was recomputed under it. There is no pure function to call.
 */

const FOCUS = readFileSync('src/app/dashboard/jobs/FocusView.tsx', 'utf8').replace(/\r\n/g, '\n');
const WORKSPACE = readFileSync('src/app/dashboard/jobs/JobsWorkspace.tsx', 'utf8').replace(/\r\n/g, '\n');

describe('the focus pane always shows a job that is in the list', () => {
  it('falls back to the first visible job during render, not in an effect', () => {
    // An effect renders one frame of the wrong pane first and fires a detail
    // fetch for a job that is about to be dropped.
    expect(FOCUS).toMatch(/const selected = useMemo\(\(\) => \{[\s\S]*?jobs\.find\(\(j\) => j\.id === pickedId\) \?\? jobs\[0\]/);
    expect(FOCUS).toContain('const selectedId = selected?.id ?? null;');
  });

  it('keeps what the visitor picked, so clearing the filter restores it', () => {
    // The fallback is a VIEW of the choice, not a replacement for it. Widening
    // the filter again should reopen the job they had, not the first row.
    expect(FOCUS).toContain('const [pickedId, setPickedId] = useState<string | null>(jobs[0]?.id ?? null);');
    expect(FOCUS).toContain('setPickedId(id);');
    // Nothing writes the derived id back into state — that would overwrite the
    // choice the moment a filter hid it.
    expect(FOCUS).not.toContain('setPickedId(selectedId)');
    expect(FOCUS).not.toContain('setPickedId(jobs[0]');
  });

  it('has nothing selected when the filter matches nothing', () => {
    expect(FOCUS).toMatch(/if \(jobs\.length === 0\) return null;/);
  });

  /**
   * Every consumer reads the DERIVED id. This is the part that actually failed:
   * `selected` was already computed correctly and returned null, while the
   * detail hook, the map callback and the keyboard handler all kept using the
   * stored id.
   */
  it('fetches, centres and navigates on the derived id, never the stored one', () => {
    const after = FOCUS.slice(FOCUS.indexOf('const selectedId = selected?.id ?? null;'));
    for (const consumer of [
      'useJobDetail({ selectedId, jobs, details })',
      'onSelect?.(selectedId);',
      'detail.id === selectedId',
      'jobs.findIndex((j) => j.id === selectedId)',
    ]) {
      expect(after, consumer).toContain(consumer);
    }
    // And the stored id is not reachable past the derivation: everything below
    // that line goes through `selectedId`, which is the whole invariant.
    // Comments stripped, since this file's own WHY note names pickedId.
    const code = after
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('pickedId');
  });

  it('highlights the row it is actually showing', () => {
    expect(FOCUS).toContain('job.id === selectedId ? ` ${styles.rowOn}` : \'\'');
    expect(FOCUS).toContain("aria-current={job.id === selectedId ? 'true' : undefined}");
  });
});

/** The pane is fed the filtered list, which is what makes the above load-bearing. */
describe('the workspace filters before it hands the list over', () => {
  it('passes the filtered jobs to the focus pane', () => {
    expect(WORKSPACE).toContain(
      "const filtered = useMemo(() => (status === 'all' ? jobs : jobs.filter((j) => j.status === status)), [jobs, status]);",
    );
    expect(WORKSPACE).toMatch(/view === 'focus' && <FocusView jobs=\{filtered\}/);
  });

  it('already refused to open a filtered-out job from the map', () => {
    // The awareness existed in one place and had not been applied to the
    // selection itself.
    expect(FOCUS).toContain('if (!jobs.some((j) => j.id === openRequest.id)) return; // filtered out');
  });
});
