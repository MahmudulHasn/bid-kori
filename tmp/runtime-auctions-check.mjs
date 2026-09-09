/** @param {import('playwright').Page} page */
/** @param {any} ui */
export default async function (page, ui) {
  const apiCalls = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/') || url.includes(':8000')) {
      let bodyPreview = '';
      try {
        const t = await res.text();
        bodyPreview = t.slice(0, 200);
      } catch {
        bodyPreview = '(unreadable)';
      }
      apiCalls.push({
        url,
        status: res.status(),
        ct: res.headers()['content-type'] || '',
        bodyPreview,
      });
    }
  });

  await page.goto('http://localhost:3000/auctions', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  try {
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return (
          t.includes('active listing') ||
          t.includes('No active auctions') ||
          t.includes('Something went wrong') ||
          t.includes('Could not load') ||
          t.includes('Try again') ||
          t.includes('[DEMO]')
        );
      },
      { timeout: 20000 },
    );
  } catch (e) {
    // continue with dump
  }

  await page.waitForTimeout(1500);

  const dump = await page.evaluate(() => ({
    body: document.body.innerText,
    hrefs: [...document.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .slice(0, 40),
  }));

  return { apiCalls, dump };
}
