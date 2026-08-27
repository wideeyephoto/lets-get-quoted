import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/brett/.gemini/antigravity-ide/brain/a9ba53cb-59ab-4806-8d43-69b568d7a820/screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:3010';

async function runVisualQA() {
  console.log(`🚀 Starting Full Visual QA Suite against ${BASE_URL}...`);
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

  const safeGoto = async (urlPath) => {
    try {
      console.log(`Navigating to ${BASE_URL}${urlPath}...`);
      await page.emulateMedia({ media: null });
      await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {
      console.warn(`⚠️ Warning navigating to ${urlPath}: ${e.message}`);
    }
  };

  // =============================================================
  // 1. ESTIMATE GENERATOR & TRADE PRESETS & PRINT MODE
  // =============================================================
  console.log('\n--- 1. Testing Estimate Generator ---');
  try {
    await safeGoto('/tools/estimate-generator');
    await capture('01_estimate_gen_hero_and_presets');

    // Click "Plumbing" preset
    const plumbing = page.locator('button:has-text("Plumbing")').first();
    if (await plumbing.isVisible()) {
      await plumbing.click();
      await page.waitForTimeout(600);
      await capture('02_estimate_gen_plumbing_preset_selected');
    }

    // Click "HVAC" preset
    const hvac = page.locator('button:has-text("HVAC")').first();
    if (await hvac.isVisible()) {
      await hvac.click();
      await page.waitForTimeout(600);
      await capture('03_estimate_gen_hvac_preset_selected');
    }

    // Scroll to see line items, calculations, guardrails
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(500);
    await capture('04_estimate_gen_line_items_and_guardrails');

    // Test Print preview
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(600);
    await capture('05_estimate_gen_print_mode');
    await page.emulateMedia({ media: null });
  } catch (err) {
    console.error('Error testing Estimate Generator:', err);
  }

  // =============================================================
  // 2. FEATURES PAGE & ALL FEATURES MODAL
  // =============================================================
  console.log('\n--- 2. Testing Features Page & All Features Modal ---');
  try {
    await safeGoto('/features');
    await capture('06_features_page_top');

    // Look for modal trigger
    const exploreBtn = page.locator('button:has-text("See all"), button:has-text("All features"), button:has-text("Explore all")').first();
    if (await exploreBtn.isVisible()) {
      await exploreBtn.click();
      await page.waitForTimeout(800);
      await capture('07_all_features_modal_open');

      // Test category tab in modal
      const tab = page.locator('[role="dialog"] button:has-text("Estimating"), [role="dialog"] button:has-text("Voice"), [role="dialog"] button:has-text("Operations")').first();
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(500);
        await capture('08_all_features_modal_filtered');
      }

      // Close modal
      const closeBtn = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("✕")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }
  } catch (err) {
    console.error('Error testing Features page:', err);
  }

  // =============================================================
  // 3. HOMEPAGE & HERO SHOWCASE
  // =============================================================
  console.log('\n--- 3. Testing Homepage & Showcase ---');
  try {
    await safeGoto('/');
    await capture('09_homepage_hero');

    // Test Showcase Tabs
    const showcaseTab = page.locator('button:has-text("AI Voice"), button:has-text("Voice"), button:has-text("Estimates"), button:has-text("Schedule")').first();
    if (await showcaseTab.isVisible()) {
      await showcaseTab.click();
      await page.waitForTimeout(600);
      await capture('10_homepage_showcase_tab_active');
    }
  } catch (err) {
    console.error('Error testing Homepage:', err);
  }

  // =============================================================
  // 4. CALCULATORS (HOURLY RATE & REVENUE LEAKAGE)
  // =============================================================
  console.log('\n--- 4. Testing Calculators ---');
  try {
    await safeGoto('/tools/hourly-rate-calculator');
    await capture('11_hourly_rate_calculator');

    await safeGoto('/tools/leakage-calculator');
    await capture('12_leakage_calculator');
  } catch (err) {
    console.error('Error testing Calculators:', err);
  }

  // =============================================================
  // 5. PUBLIC CHANGELOG
  // =============================================================
  console.log('\n--- 5. Testing Changelog ---');
  try {
    await safeGoto('/changelog');
    await capture('13_changelog_feed');
  } catch (err) {
    console.error('Error testing Changelog:', err);
  }

  // =============================================================
  // 6. DEMO REEL INTERACTION
  // =============================================================
  console.log('\n--- 6. Testing Demo Reel ---');
  try {
    await safeGoto('/demo/reel/bath-to-shower');
    await capture('14_demo_reel_bath_to_shower');
  } catch (err) {
    console.error('Error testing Demo Reel:', err);
  }

  // =============================================================
  // 7. AUTH / LOGIN FLOW
  // =============================================================
  console.log('\n--- 7. Testing Dashboard / Auth redirects ---');
  try {
    await safeGoto('/login');
    await capture('15_login_screen');
  } catch (err) {
    console.error('Error testing Auth flow:', err);
  }

  console.log('\n🎉 Visual QA Complete!');
  await browser.close();
}

runVisualQA().catch((err) => {
  console.error('Fatal Error during visual QA:', err);
  process.exit(1);
});
