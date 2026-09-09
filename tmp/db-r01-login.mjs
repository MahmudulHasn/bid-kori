/** @param {import('playwright').Page} page */
export default async function (page) {
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.locator('input[type="password"]').waitFor({ timeout: 15000 });
  const inputs = page.locator('form input');
  await inputs.nth(0).fill('demo_buyer_a');
  await page.locator('input[type="password"]').fill('DemoShowcase123!');
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/users/login') && r.request().method() === 'POST',
      { timeout: 20000 },
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(2500);
  return {
    url: page.url(),
    token: await page.evaluate(() => Boolean(localStorage.getItem('token'))),
    snippet: await page.evaluate(() => document.body.innerText.slice(0, 350)),
  };
}
