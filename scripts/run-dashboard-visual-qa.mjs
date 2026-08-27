import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/brett/.gemini/antigravity-ide/brain/a9ba53cb-59ab-4806-8d43-69b568d7a820/screenshots';

async function loadEnv() {
  const contents = await readFile('c:/dev/CLAUDE CODE FOLDER/.env.local', 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

async function runDashboardVisualQA() {
  console.log('🚀 Setting up Authenticated Session for Active Owner QA...');
  await loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userEmail = 'brett.arnold@live.com';

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });

  if (linkErr) {
    console.error('Error generating link:', linkErr);
    return;
  }

  const tokenHash = linkData.properties.hashed_token;
  const verifyUrl = `http://localhost:3010/auth/magic-link-callback?token_hash=${tokenHash}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const capture = async (name, fullPage = false) => {
    const filename = `${name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage });
    console.log(`📸 Captured: ${filename}`);
  };

  try {
    console.log(`Navigating to auth callback: ${verifyUrl}`);
    await page.goto(verifyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // 1. DASHBOARD HOME
    console.log('\n--- 1. Dashboard Home ---');
    await page.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('20_dashboard_home');

    // 2. VOICE CALLS
    console.log('\n--- 2. Dashboard Voice Calls ---');
    await page.goto('http://localhost:3010/dashboard/voice-calls', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('21_dashboard_voice_calls');

    // 3. SCHEDULE DAY PLANNER
    console.log('\n--- 3. Schedule & Day Planner ---');
    await page.goto('http://localhost:3010/dashboard/schedule/plan', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('22_dashboard_schedule_plan');

    // Test Brief Crew Modal
    const briefBtn = page.locator('button:has-text("Brief Crew"), button:has-text("Morning Briefing")').first();
    if (await briefBtn.isVisible()) {
      await briefBtn.click();
      await page.waitForTimeout(1000);
      await capture('23_dashboard_brief_crew_modal');
      const closeBtn = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // 4. SETTINGS (PLAN & USAGE FIRST TAB)
    console.log('\n--- 4. Settings Default Tab ---');
    await page.goto('http://localhost:3010/dashboard/settings', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('24_dashboard_settings_plan_and_usage');

    // 5. MESSAGES & COMPOSE MODAL
    console.log('\n--- 5. Messages Inbox ---');
    await page.goto('http://localhost:3010/dashboard/messages', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('25_dashboard_messages_inbox');

    const composeBtn = page.locator('button:has-text("Compose"), button:has-text("New Message")').first();
    if (await composeBtn.isVisible()) {
      await composeBtn.click();
      await page.waitForTimeout(1000);
      await capture('26_dashboard_compose_message_modal');
      const closeMsg = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]').first();
      if (await closeMsg.isVisible()) await closeMsg.click();
    }

    // 6. LEADS WORKSPACE
    console.log('\n--- 6. Leads Workspace ---');
    await page.goto('http://localhost:3010/dashboard/leads', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('27_dashboard_leads_workspace');

    // 7. CREW ROSTER
    console.log('\n--- 7. Crew Roster ---');
    await page.goto('http://localhost:3010/dashboard/crew', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await capture('28_dashboard_crew_roster');

    console.log('\n🎉 Active Contractor Dashboard QA Completed!');
  } catch (err) {
    console.error('Error during dashboard QA:', err);
  } finally {
    await browser.close();
  }
}

runDashboardVisualQA();
