/** @param {import('playwright').Page} page */
export default async function (page) {
  await page.goto('http://localhost:3000/auctions', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('active listing'),
    { timeout: 20000 },
  );
  await page.waitForTimeout(2000);
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('img')].some((i) => i.naturalWidth > 50),
      { timeout: 15000 },
    );
  } catch {
    /* report below */
  }
  return {
    body: await page.evaluate(() => document.body.innerText.slice(0, 400)),
    imgs: await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .map((i) => ({
          w: i.naturalWidth,
          src: (i.currentSrc || i.src).slice(0, 120),
        }))
        .slice(0, 6),
    ),
    loaded: await page.evaluate(
      () => [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 50).length,
    ),
    noImage: await page.evaluate(() => document.body.innerText.includes('No image')),
  };
}
