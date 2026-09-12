import fs from 'node:fs';
import path from 'node:path';

/**
 * Which source files does nothing in the test suite ever run?
 *
 * `vitest --coverage` answers that for the paths listed in vitest.config.ts's
 * `coverage.include` — src/lib, src/app/api and the middleware. That is 44% of
 * the source lines. Server actions, pages and components are outside it, so a
 * coverage percentage says nothing at all about them, and a file that no test
 * imports looks the same as a file that does not exist.
 *
 * So this walks the import graph instead. Every test file is an entry point;
 * anything reachable from one is code a test can at least run. What is left is
 * code that no test can run, whatever the coverage number says.
 *
 * Three outcomes per file:
 *   executed   — a test imports it, directly or through a chain of imports
 *   text-only  — a test reads it with readFileSync and asserts on the source,
 *                but never runs it (a large share of this suite works this way)
 *   untouched  — no test mentions it at all
 *
 * Pass --json for the raw data, or --coverage to fold in coverage/coverage-
 * summary.json (run `npm run test:coverage` first) and also list the files a
 * test does import but barely executes.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const CODE = /\.(ts|tsx|mjs|js|jsx|cjs)$/;

// Directories holding test entry points. test-pg17, test-staging and
// test-preflight are counted even though CI does not run them, so that a file
// only they reach is not reported as untouched.
const TEST_DIRS = ['test', 'test-pg17', 'test-staging', 'test-preflight'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (CODE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

const srcFiles = walk(SRC).sort();
const srcSet = new Set(srcFiles);

// Mirrors tsconfig's `@/*` -> `src/*` plus Node's extension and index probing.
const SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '/index.ts', '/index.tsx', '/index.mjs', '/index.js'];

function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
  else return null; // bare package specifier
  for (const suffix of SUFFIXES) {
    const rel = path.relative(ROOT, base + suffix);
    if (srcSet.has(rel)) return rel;
  }
  return null;
}

// import/export-from, bare side-effect import, dynamic import, require, and
// vi.mock — a mocked path still names a module the test is bound to.
const SPEC_PATTERNS = [
  /(?:^|[\s;{(])(?:import|export)\s+(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g,
  /(?:^|[\s;])import\s*['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /vi\.(?:mock|doMock|importActual|importMock)\s*\(\s*['"]([^'"]+)['"]/g,
];

function specifiersIn(text) {
  const found = new Set();
  for (const pattern of SPEC_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) found.add(match[1]);
  }
  return found;
}

const read = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

const imports = new Map();
for (const rel of srcFiles) {
  const deps = new Set();
  for (const spec of specifiersIn(read(rel))) {
    const target = resolveSpecifier(spec, rel);
    if (target) deps.add(target);
  }
  imports.set(rel, deps);
}

const testFiles = TEST_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .concat(walk(path.join(ROOT, 'scripts')).filter((f) => /\.test\.mjs$/.test(f)))
  .concat(srcFiles.filter((f) => /\.test\./.test(f)));

const seeds = new Set();
const textRefs = new Map(); // src file -> test files that read it as source

for (const rel of testFiles) {
  const text = read(rel);
  for (const spec of specifiersIn(text)) {
    const target = resolveSpecifier(spec, rel);
    if (target) seeds.add(target);
  }
  // A string literal naming a source file — the grep-style contract tests.
  for (const match of text.matchAll(/(src\/[A-Za-z0-9_\-./[\]@]+?\.(?:tsx?|mjs|jsx?))/g)) {
    if (!srcSet.has(match[1])) continue;
    if (!textRefs.has(match[1])) textRefs.set(match[1], new Set());
    textRefs.get(match[1]).add(rel);
  }
}

const executed = new Set();
const stack = [...seeds];
while (stack.length) {
  const current = stack.pop();
  if (executed.has(current)) continue;
  executed.add(current);
  for (const dep of imports.get(current) || []) if (!executed.has(dep)) stack.push(dep);
}

function area(file) {
  if (/^src\/app\/.*(?:^|\/)[a-z-]*actions\.ts$/.test(file)) return 'server actions';
  if (file.startsWith('src/app/api/') || /route\.ts$/.test(file)) return 'route handlers';
  if (file.startsWith('src/lib/')) return 'lib';
  if (file.startsWith('src/components/')) return 'components';
  if (/\/(page|layout|template|default|error|global-error|not-found|loading)\.tsx?$/.test(file)) return 'pages & layouts';
  if (file.startsWith('src/app/')) return 'app-local UI & helpers';
  return 'other';
}

const codeLines = (rel) => read(rel).split('\n').filter((line) => line.trim()).length;

const classified = srcFiles
  .filter((f) => !/\.test\./.test(f))
  .map((file) => ({
    file,
    area: area(file),
    lines: codeLines(file),
    state: executed.has(file) ? 'executed' : textRefs.has(file) ? 'text-only' : 'untouched',
  }));

const byArea = new Map();
for (const row of classified) {
  if (!byArea.has(row.area)) byArea.set(row.area, { executed: 0, 'text-only': 0, untouched: 0, darkLines: 0 });
  const bucket = byArea.get(row.area);
  bucket[row.state] += 1;
  if (row.state !== 'executed') bucket.darkLines += row.lines;
}

const pad = (value, width) => String(value).padStart(width);
console.log('Files no test can execute, by area (a test reading the source as text is not executing it)\n');
console.log('area                       executed  text-only  untouched   unexecuted lines');
for (const [name, b] of [...byArea].sort((a, b) => b[1].darkLines - a[1].darkLines)) {
  console.log(name.padEnd(26), pad(b.executed, 8), pad(b['text-only'], 10), pad(b.untouched, 10), pad(b.darkLines, 18));
}

const dark = classified.filter((r) => r.state !== 'executed');
console.log(
  `\n${dark.length} of ${classified.length} source files are never executed by a test (${dark.reduce((sum, r) => sum + r.lines, 0)} lines).`,
);

// Coverage, when it has been generated, adds the other half of the picture:
// files a test does import but hardly runs.
const SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json');
if (process.argv.includes('--coverage')) {
  if (!fs.existsSync(SUMMARY)) {
    console.log('\nNo coverage/coverage-summary.json — run `npm run test:coverage` first.');
  } else {
    const summary = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
    const rows = Object.entries(summary)
      .filter(([key]) => key !== 'total')
      .map(([key, value]) => ({
        file: path.relative(ROOT, key),
        pct: value.lines.pct,
        missing: value.lines.total - value.lines.covered,
      }))
      .filter((r) => r.pct > 0 && r.pct < 40)
      .sort((a, b) => b.missing - a.missing);
    console.log('\nImported by a test but under 40% of lines executed (top 25):\n');
    for (const row of rows.slice(0, 25)) {
      console.log(pad(row.pct.toFixed(1) + '%', 7), pad(row.missing, 6) + ' unexecuted lines ', row.file);
    }
  }
}

if (process.argv.includes('--json')) {
  fs.writeFileSync('untested-code-audit.json', JSON.stringify({ classified, textRefs: [...textRefs.keys()] }, null, 2));
  console.log('\nWrote untested-code-audit.json');
}

// Never fails the build. This reports a standing shape of the codebase; the
// thing worth failing on is a regression against an agreed floor, which
// belongs in vitest.config.ts's coverage thresholds.
