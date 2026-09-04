import fs from 'node:fs';
import path from 'node:path';

const auditData = JSON.parse(fs.readFileSync('scripts/.page-audit-result.json', 'utf8'));
const validRoutes = new Set(auditData.map((p) => p.route));
console.log('Total valid page routes:', validRoutes.size);

function getAllTsx(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'node_modules' && f.name !== '.next') {
        getAllTsx(full, list);
      }
    } else if (/\.(tsx|ts|jsx|js)$/.test(f.name)) {
      list.push(full);
    }
  }
  return list;
}

const allFiles = [
  ...getAllTsx('src/app'),
  ...getAllTsx('src/components'),
  ...getAllTsx('src/lib'),
];

// Look for href="..." or href={`...`} or to="..." or redirect('...') or router.push('...')
const hrefRegex = /(?:href|to)=["'`](\/[^"'`\s?#]*)/g;
const templateHrefRegex = /(?:href|to)=\{`(\/[^`\s?#$]*)/g;
const redirectRegex = /(?:redirect|router\.push)\(["'`](\/[^"'`\s?#]*)/g;

const foundLinks = new Map(); // target -> Set of source files

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');

  const scan = (regex) => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      let target = match[1];
      if (target.length > 1 && target.endsWith('/')) target = target.slice(0, -1);
      if (!foundLinks.has(target)) foundLinks.set(target, new Set());
      foundLinks.get(target).add(rel);
    }
  };

  scan(hrefRegex);
  scan(templateHrefRegex);
  scan(redirectRegex);
}

console.log('Total unique internal destination prefixes found:', foundLinks.size);

// 1. Check for broken links (targets starting with / that do NOT match any known route or route pattern)
const brokenLinks = [];
for (const [target, sources] of foundLinks) {
  // Ignore api routes, public static files, anchors, auth callbacks
  if (
    target.startsWith('/api') ||
    target.startsWith('/_next') ||
    target.startsWith('/favicon') ||
    target.startsWith('/site-domain') ||
    target.startsWith('/site/') ||
    target.includes('.') // like .png, .jpg, .svg, .pdf
  ) {
    continue;
  }

  // Check if target matches any valid route
  let matches = validRoutes.has(target);

  if (!matches) {
    // Check dynamic routes, e.g. /dashboard/jobs/123 matches /dashboard/jobs/[id]
    for (const valid of validRoutes) {
      if (valid.includes('[')) {
        // Convert [param] to regex [^/]+
        const regexPattern = '^' + valid.replace(/\[\w+\]/g, '[^/]+').replace(/\[\.\.\.\w+\]/g, '.*') + '$';
        if (new RegExp(regexPattern).test(target)) {
          matches = true;
          break;
        }
      }
    }
  }

  if (!matches) {
    brokenLinks.push({ target, sources: Array.from(sources) });
  }
}

// 2. Check for orphaned/unlinked valid routes (pages that have 0 internal links pointing to them)
const unlinkedRoutes = [];
for (const r of validRoutes) {
  let hasLink = foundLinks.has(r);
  if (!hasLink) {
    // check if dynamic route pattern has any link matching it
    if (r.includes('[')) {
      const regexPattern = '^' + r.replace(/\[\w+\]/g, '[^/]+').replace(/\[\.\.\.\w+\]/g, '.*') + '$';
      const reg = new RegExp(regexPattern);
      for (const [target] of foundLinks) {
        if (reg.test(target)) {
          hasLink = true;
          break;
        }
      }
    }
  }
  if (!hasLink) {
    const pageObj = auditData.find((p) => p.route === r);
    unlinkedRoutes.push({ route: r, category: pageObj?.category || 'Unknown', file: pageObj?.relFile });
  }
}

console.log('\n=============================================');
console.log(`POTENTIALLY BROKEN INTERNAL TARGETS (${brokenLinks.length})`);
console.log('=============================================');
for (const b of brokenLinks) {
  console.log(`Target: ${b.target}`);
  console.log(`Sources (${b.sources.length}): ${b.sources.slice(0, 3).join(', ')}${b.sources.length > 3 ? '...' : ''}`);
  console.log('---');
}

console.log('\n=============================================');
console.log(`ORPHANED / UNLINKED PAGE ROUTES (${unlinkedRoutes.length})`);
console.log('=============================================');
// Group by category
const unlinkedByCat = {};
for (const u of unlinkedRoutes) {
  if (!unlinkedByCat[u.category]) unlinkedByCat[u.category] = [];
  unlinkedByCat[u.category].push(u.route);
}

for (const [cat, routes] of Object.entries(unlinkedByCat)) {
  console.log(`\n### ${cat} (${routes.length} unlinked)`);
  routes.sort().forEach((r) => console.log(`  - ${r}`));
}

fs.writeFileSync(
  'scripts/.cross-link-audit.json',
  JSON.stringify({ brokenLinks, unlinkedRoutes }, null, 2)
);
