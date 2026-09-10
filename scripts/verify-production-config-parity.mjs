import fs from 'fs/promises';
import path from 'path';

async function scanEnvRefs(dir, refs = new Set()) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.next'].includes(entry.name)) {
        await scanEnvRefs(fullPath, refs);
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      const content = await fs.readFile(fullPath, 'utf8');
      const matches = content.match(/LGQ_[A-Z0-9_]+/g);
      if (matches) {
        for (const m of matches) {
          refs.add(m);
        }
      }
    }
  }
  return refs;
}

async function verify() {
  const rootDir = process.cwd();

  // 1. Read vercel.json cron declarations
  let vercelCrons = [];
  try {
    const vercelJson = JSON.parse(await fs.readFile(path.join(rootDir, 'vercel.json'), 'utf8'));
    vercelCrons = vercelJson.crons || [];
  } catch (e) {
    console.error('Could not read vercel.json', e);
  }

  // 2. List all migration files in migrations/
  let migrations = [];
  try {
    const files = await fs.readdir(path.join(rootDir, 'migrations'));
    migrations = files.filter(f => f.endsWith('.sql'));
  } catch (e) {
    console.error('Could not read migrations directory', e);
  }

  // 3. Scan source files for LGQ_* env var references
  const envRefs = await scanEnvRefs(path.join(rootDir, 'src'));

  // 4. Compare against .env.example documentation
  let envExampleKeys = [];
  try {
    const envExample = await fs.readFile(path.join(rootDir, '.env.example'), 'utf8');
    const lines = envExample.split('\n');
    for (const line of lines) {
      if (line.startsWith('LGQ_')) {
        const key = line.split('=')[0];
        envExampleKeys.push(key);
      }
    }
  } catch (e) {
    console.error('Could not read .env.example', e);
  }

  const undocumentedVars = Array.from(envRefs).filter(ref => !envExampleKeys.includes(ref));
  const unusedVars = envExampleKeys.filter(key => !envRefs.has(key));

  // 5. Output a machine-readable parity report as JSON
  const report = {
    cronsCount: vercelCrons.length,
    crons: vercelCrons,
    migrationsCount: migrations.length,
    migrations: migrations,
    envVars: {
      foundInSource: Array.from(envRefs),
      documentedInEnvExample: envExampleKeys,
      undocumented: undocumentedVars,
      unusedDocumented: unusedVars
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

verify().catch(console.error);
