import { test, expect } from '@playwright/test';

test('verify lasso selection marquee', async ({ page }) => {
  await page.goto('http://localhost:5173/#/poster');

  // Close modal
  await page.click('text=800x1000');

  // Select Object Selection tool
  await page.keyboard.press('w');

  // Switch to Lasso mode
  await page.click('text=LASSO');

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    // Perform a circular drag for lasso
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200);
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.move(box.x + 200, box.y + 300);
    await page.mouse.move(box.x + 200, box.y + 200);

    await page.screenshot({ path: '/home/jules/verification/lasso_dragging.png' });

    await page.mouse.up();
    await page.screenshot({ path: '/home/jules/verification/lasso_after.png' });
  }
});
