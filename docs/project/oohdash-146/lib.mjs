import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const BASE = 'http://localhost:3093';
export async function newPage() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/auth/dev');
  await page.locator('button:has-text("Test Handler")').click();
  await page.waitForSelector('[data-testid="operator-name"]');
  return { browser, ctx, page };
}
export async function confirm(page, siteNo) {
  await page.evaluate(() => { if (typeof go === 'function') go('home'); });
  await page.evaluate(async (s) => { await openSite(s); }, String(siteNo));
  await page.waitForTimeout(300);
  const amb = await page.evaluate(() => !!state.ambiguous);
  if (amb) return 'ambiguous';
  await page.waitForSelector('[data-testid="confirm-site"]', { timeout: 15000 });
  await page.evaluate(async () => { await confirmSite(); });
  await page.waitForSelector('[data-testid="category-tiles"]', { timeout: 15000 });
  return 'ok';
}
