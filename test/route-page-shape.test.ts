import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * A PAGE IS NOT A COMPONENT, AND THE TYPE ERROR FOR SAYING OTHERWISE HIDES.
 *
 * /demo/leads/[leadId] wanted the same screen as /demo/leads, opened on the
 * lead its URL names. So it imported the sibling page and called it with a
 * prop, and the sibling grew a signature to receive it:
 *
 *     export default async function DemoLeadsPage(
 *       { initialLeadId }: { initialLeadId?: string } = {},
 *     )
 *
 * Next type-checks every page's default export against PageProps — `{ params,
 * searchParams }` — and generates that check into .next/types. So this was
 * always an error:
 *
 *     .next/types/app/demo/leads/page.ts(28,29): error TS2344
 *     Type '{ initialLeadId?: string | undefined; } | undefined'
 *     does not satisfy the constraint 'PageProps'
 *
 * WHY IT SURVIVED. That file is generated. A clean checkout has no .next, so
 * `tsc --noEmit` passes; the error only appears once something has compiled the
 * route. CI runs tsc BEFORE the build, so the tsc step was green and the
 * failure could only ever land later, in `next build` — where it reads as a
 * build problem rather than as a page with the wrong signature.
 *
 * The fix is a shared component both routes render. This test is the guard: it
 * needs no .next, so it fails in the same place the mistake is made.
 */

const APP = join(process.cwd(), 'src', 'app');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...pageFiles(full));
    } else if (entry === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

const PAGES = pageFiles(APP);
const ALL_TSX = (function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
})(APP);

const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');

describe('route pages', () => {
  it('finds them (a silent zero here would pass every assertion below)', () => {
    expect(PAGES.length).toBeGreaterThan(50);
  });

  it('are never imported as components by another route', () => {
    /**
     * The defect class, not the one instance of it. Importing a page module
     * means calling it with something, and whatever that something is, it will
     * not be PageProps.
     */
    const offenders: string[] = [];
    for (const file of ALL_TSX) {
      const source = readFileSync(file, 'utf8');
      // `from './page'`, `from '../page'`, `from '../../page'`, and the
      // @/app/... spelling of the same thing.
      const bad = /from\s+'(\.{1,2}(?:\/\.\.)*\/page|@\/app\/[^']*\/page)'/g;
      for (const match of source.matchAll(bad)) offenders.push(`${rel(file)} imports ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('take PageProps or nothing at all', () => {
    /**
     * Next passes exactly one argument: `{ params, searchParams }`. A page
     * taking anything else is a page somebody is calling by hand.
     */
    const offenders: string[] = [];
    for (const file of PAGES) {
      const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const match = /export\s+default\s+(?:async\s+)?function\s+\w+\s*\(([\s\S]*?)\)\s*\{/.exec(source);
      if (!match) continue; // arrow-function or re-exported default; not this rule's business
      const args = match[1].trim();
      if (!args) continue;
      const named = /^\{([^}]*)\}/.exec(args);
      if (!named) {
        offenders.push(`${rel(file)} takes a positional argument: ${args.slice(0, 60)}`);
        continue;
      }
      const keys = named[1].split(',').map((k) => k.split(':')[0].trim()).filter(Boolean);
      const strays = keys.filter((k) => k !== 'params' && k !== 'searchParams');
      if (strays.length) offenders.push(`${rel(file)} takes ${strays.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the demo leads screen that this came from', () => {
  it('is a component both routes render, not a page one of them calls', () => {
    const screen = readFileSync('src/app/demo/leads/DemoLeadsScreen.tsx', 'utf8');
    expect(screen).toContain('export default async function DemoLeadsScreen');

    const list = readFileSync('src/app/demo/leads/page.tsx', 'utf8');
    const detail = readFileSync('src/app/demo/leads/[leadId]/page.tsx', 'utf8');
    expect(list).toContain("from './DemoLeadsScreen'");
    expect(detail).toContain("from '../DemoLeadsScreen'");
    // The detail route's entire reason to exist: the same screen, opened on the
    // lead the URL names.
    expect(detail).toContain('initialLeadId={params.leadId}');
  });

  it('keeps force-dynamic on the routes, where it means something', () => {
    // A route segment config export is inert in a plain component.
    expect(readFileSync('src/app/demo/leads/page.tsx', 'utf8')).toContain("export const dynamic = 'force-dynamic'");
    expect(readFileSync('src/app/demo/leads/[leadId]/page.tsx', 'utf8')).toContain("export const dynamic = 'force-dynamic'");
  });
});

describe('the ai-copilot and sparky screen', () => {
  it('is a shared screen component both routes render, not a page one of them calls', () => {
    const screen = readFileSync('src/app/features/sparky/AiCopilotWithAvatarsScreen.tsx', 'utf8');
    expect(screen).toContain('export default function AiCopilotWithAvatarsScreen');

    const sparky = readFileSync('src/app/features/sparky/page.tsx', 'utf8');
    const aiCopilot = readFileSync('src/app/features/ai-copilot/page.tsx', 'utf8');
    expect(sparky).toContain("from './AiCopilotWithAvatarsScreen'");
    expect(aiCopilot).toContain("from '../sparky/AiCopilotWithAvatarsScreen'");
    expect(sparky).toContain('path="/features/sparky"');
    expect(aiCopilot).toContain('path="/features/ai-copilot"');
  });
});

