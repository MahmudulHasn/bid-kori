/** @param {import('playwright').Page} page */
export default async function (page) {
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.fill(
    'input[name="username"], input[autocomplete="username"], form input[type="text"]',
    'demo_buyer_a',
  );
  await page.fill('input[name="password"], input[type="password"]', 'DemoShowcase123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/buyer**', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const buyer = {
    url: page.url(),
    body: await page.evaluate(() => document.body.innerText.slice(0, 500)),
    token: await page.evaluate(() => Boolean(localStorage.getItem('token'))),
  };

  await page.goto('http://localhost:3000/auctions', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(1500);
  const auctions = {
    body: await page.evaluate(() => document.body.innerText.slice(0, 400)),
    count: await page.evaluate(
      () => document.querySelectorAll('a[href^="/auctions/"]').length,
    ),
  };

  await page.goto('http://localhost:3000/seller', { waitUntil: 'domcontentloaded' });
  // role guard should bounce buyer
  await page.waitForTimeout(1500);

  return { buyer, auctions, afterSellerAttempt: page.url() };
}
