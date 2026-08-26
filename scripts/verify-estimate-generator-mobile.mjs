import { chromium } from 'playwright';

const PORT = 3010;
const URL = `http://localhost:${PORT}/tools/estimate-generator`;

async function runVerification() {
  console.log('Launching browser to verify Estimate Generator...');
  const browser = await chromium.launch();
  let errors = 0;

  const viewports = [
    { name: 'Mobile Mini (320px)', width: 320, height: 568 },
    { name: 'iPhone SE (375px)', width: 375, height: 667 },
    { name: 'iPhone 14/15 (390px)', width: 390, height: 844 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop (1280px)', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    page.on('pageerror', (err) => {
      console.error(`[${vp.name}] Unhandled page error:`, err.message);
      errors++;
    });

    console.log(`\nTesting viewport: ${vp.name}`);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

    // 1. Check for horizontal overflow: scrollWidth must equal clientWidth
    const overflowCheck = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const main = document.querySelector('main');
      const sheet = document.querySelector('[class*="estimateSheet"]');

      return {
        clientWidth: docEl.clientWidth,
        scrollWidth: docEl.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        sheetClientWidth: sheet ? sheet.clientWidth : null,
        sheetScrollWidth: sheet ? sheet.scrollWidth : null,
        hasHorizontalOverflow: docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > docEl.clientWidth,
      };
    });

    if (overflowCheck.hasHorizontalOverflow) {
      console.error(
        `❌ OVERFLOW DETECTED on ${vp.name}: clientWidth=${overflowCheck.clientWidth}, scrollWidth=${overflowCheck.scrollWidth}, bodyScrollWidth=${overflowCheck.bodyScrollWidth}`
      );
      errors++;
    } else {
      console.log(`✅ Zero horizontal overflow on ${vp.name} (width: ${overflowCheck.clientWidth}px)`);
    }

    // 2. Responsive Line Items check: Table vs Mobile Cards
    const layoutMode = await page.evaluate(() => {
      const table = document.querySelector('[class*="estimateTable"]');
      const mobileList = document.querySelector('[class*="mobileItemList"]');

      const isTableVisible = table && window.getComputedStyle(table).display !== 'none';
      const isCardsVisible = mobileList && window.getComputedStyle(mobileList).display !== 'none';

      return { isTableVisible, isCardsVisible };
    });

    if (vp.width <= 768) {
      if (layoutMode.isCardsVisible && !layoutMode.isTableVisible) {
        console.log(`✅ Correct mobile card layout active for ${vp.name}`);
      } else {
        console.error(
          `❌ Layout issue on ${vp.name}: expected cards visible, table hidden. Got: table=${layoutMode.isTableVisible}, cards=${layoutMode.isCardsVisible}`
        );
        errors++;
      }
    } else {
      if (layoutMode.isTableVisible && !layoutMode.isCardsVisible) {
        console.log(`✅ Correct desktop table layout active for ${vp.name}`);
      } else {
        console.error(
          `❌ Layout issue on ${vp.name}: expected table visible, cards hidden. Got: table=${layoutMode.isTableVisible}, cards=${layoutMode.isCardsVisible}`
        );
        errors++;
      }
    }

    await context.close();
  }

  // 3. Interactive flow testing on 390px (iPhone 14)
  console.log('\n--- Testing Interactive Editor Operations (Mobile 390px) ---');
  const testContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await testContext.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Test "Use Example" preset
  console.log('Testing "Use Example" preset click...');
  await page.click('button:has-text("Use Example")');
  await page.waitForTimeout(300);

  const sampleState = await page.evaluate(() => {
    const businessInput = document.querySelector('input[aria-label="Contractor or Business Name"]');
    const totalGrand = document.querySelector('[class*="totalGrand"]');
    const banner = document.querySelector('[class*="sampleBanner"]');
    return {
      businessName: businessInput ? businessInput.value : '',
      grandTotalText: totalGrand ? totalGrand.textContent : '',
      hasSampleBanner: !!banner,
    };
  });

  if (sampleState.businessName === 'Apex Trade Solutions' && sampleState.hasSampleBanner) {
    console.log(`✅ Example preset loaded successfully: "${sampleState.businessName}", Total: ${sampleState.grandTotalText}`);
  } else {
    console.error('❌ Example preset failed to load properly:', sampleState);
    errors++;
  }

  // Test adding a line item
  console.log('Testing "+ Add Line Item"...');
  await page.click('button:has-text("+ Add Line Item")');
  await page.waitForTimeout(300);

  const cardsCount = await page.evaluate(() => {
    return document.querySelectorAll('[class*="mobileItemCard"]').length;
  });
  console.log(`✅ Total line items after adding: ${cardsCount}`);

  // Test LocalStorage persistence on reload
  console.log('Testing draft persistence across reload...');
  await page.fill('input[aria-label="Contractor or Business Name"]', 'Acme Roofing Specialists');
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const reloadedName = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Contractor or Business Name"]');
    return input ? input.value : '';
  });

  if (reloadedName === 'Acme Roofing Specialists') {
    console.log(`✅ Draft persisted successfully across page reload: "${reloadedName}"`);
  } else {
    console.error(`❌ Draft did not persist on reload. Got: "${reloadedName}"`);
    errors++;
  }

  // Test Copy Summary button
  console.log('Testing "Copy Text Summary"...');
  await page.click('button:has-text("Copy Text Summary")');
  await page.waitForTimeout(300);

  const copiedState = await page.evaluate(() => {
    const copyBtn = document.querySelector('[class*="copyBtn"]');
    return copyBtn ? copyBtn.textContent : '';
  });

  if (copiedState.includes('Copied')) {
    console.log(`✅ Copy summary button triggered success state: "${copiedState}"`);
  } else {
    console.error(`❌ Copy summary button state did not update: "${copiedState}"`);
    errors++;
  }

  // Test Post-Action CTA Link
  const ctaLink = await page.evaluate(() => {
    const btn = document.querySelector('[class*="postActionBtn"]');
    return btn ? btn.getAttribute('href') : null;
  });

  if (ctaLink && ctaLink.includes('goal=feature') && ctaLink.includes('feature=quotes')) {
    console.log(`✅ Post-action CTA link has correct quote signup attribution: "${ctaLink}"`);
  } else {
    console.error(`❌ Post-action CTA link is missing or incorrect: "${ctaLink}"`);
    errors++;
  }

  // Test "Start Blank" / "New Estimate"
  console.log('Testing "New Estimate" reset...');
  await page.click('button:has-text("New Estimate")');
  await page.waitForTimeout(300);

  const clearedName = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Contractor or Business Name"]');
    return input ? input.value : 'not-found';
  });

  if (clearedName === '') {
    console.log(`✅ "New Estimate" reset all fields to fresh blank state.`);
  } else {
    console.error(`❌ "New Estimate" did not clear business name. Got: "${clearedName}"`);
    errors++;
  }

  await testContext.close();
  await browser.close();

  if (errors === 0) {
    console.log('\n🎉 ALL MOBILE & INTERACTIVE VERIFICATIONS PASSED WITH ZERO ERRORS!');
  } else {
    console.error(`\n❌ VERIFICATION FAILED WITH ${errors} ERRORS.`);
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
