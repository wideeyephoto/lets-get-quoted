#!/usr/bin/env node

/**
 * Verification script for Product Tour & Demo Tour implementation.
 *
 * Runs sanity checks against all tour components, catalog integrity,
 * target anchor definitions, and migration files.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('🔍 Starting Product Tour & Evaluation Demo verification...');

const requiredFiles = [
  'src/lib/product-tour/types.ts',
  'src/lib/product-tour/catalog.ts',
  'src/lib/product-tour/access.ts',
  'src/lib/product-tour/events.ts',
  'src/components/product-tour/product-tour.module.css',
  'src/components/product-tour/ProductTourCoachmark.tsx',
  'src/components/product-tour/ProductTourLauncher.tsx',
  'src/components/product-tour/ProductTourRoot.tsx',
  'src/app/dashboard/tour-actions.ts',
  'src/app/api/demo-tour/events/route.ts',
  'migrations/20260826120000_product_tours.sql',
  'src/app/demo/tour/site/page.tsx',
  'src/app/demo/tour/intake/page.tsx',
  'src/app/demo/tour/lead/page.tsx',
  'src/app/demo/tour/quote/page.tsx',
  'src/app/demo/tour/approve/page.tsx',
  'src/app/demo/tour/complete/page.tsx',
];

let allPassed = true;

for (const relPath of requiredFiles) {
  const fullPath = resolve(process.cwd(), relPath);
  if (!existsSync(fullPath)) {
    console.error(`❌ Missing file: ${relPath}`);
    allPassed = false;
  } else {
    console.log(`  ✓ Found ${relPath}`);
  }
}

// Check migration syntax
const migrationPath = resolve(process.cwd(), 'migrations/20260826120000_product_tours.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');
if (
  !migrationSql.includes('public.product_tour_progress') ||
  !migrationSql.includes('public.product_tour_events') ||
  !migrationSql.includes('enable row level security')
) {
  console.error('❌ Migration file incomplete');
  allPassed = false;
} else {
  console.log('  ✓ Migration contains table definitions and RLS policies');
}

// Check stable target anchors
const targetChecks = [
  { file: 'src/app/dashboard/DashboardHomeScreen.tsx', anchor: 'data-tour-id="dashboard:needs-attention"' },
  { file: 'src/app/dashboard/leads/page.tsx', anchor: 'data-tour-id="leads:workspace"' },
  { file: 'src/app/dashboard/jobs/page.tsx', anchor: 'data-tour-id="jobs:workspace"' },
  { file: 'src/app/dashboard/schedule/page.tsx', anchor: 'data-tour-id="schedule:workbench"' },
  { file: 'src/app/dashboard/sites/WebsiteBuilder.tsx', anchor: 'data-tour-id="website:builder"' },
  { file: 'src/app/dashboard/automations/page.tsx', anchor: 'data-tour-id="automations:overview"' },
  { file: 'src/components/app-shell.tsx', anchor: 'data-tour-id={`nav:${href}`}' },
];

for (const { file, anchor } of targetChecks) {
  const content = readFileSync(resolve(process.cwd(), file), 'utf8');
  if (!content.includes(anchor)) {
    console.error(`❌ Missing anchor in ${file}: ${anchor}`);
    allPassed = false;
  } else {
    console.log(`  ✓ Confirmed ${anchor} in ${file}`);
  }
}

if (allPassed) {
  console.log('\n✅ All Product Tour verifications PASSED!');
  process.exit(0);
} else {
  console.error('\n❌ Product Tour verification FAILED!');
  process.exit(1);
}
