/** SHOW-S02 visual rehearsal script */
/** @param {import('playwright').Page} page */
export default async function (page) {
  const results = {
    homepage: null,
    auctions: null,
    search: null,
    live: null,
    upcoming: null,
    closed: null,
    cancelled: null,
    buyer: {},
    consoleErrors: [],
    failedRequests: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') results.consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/_next/') || url.includes('favicon')) return;
    results.failedRequests.push({ url, err: req.failure()?.errorText || '' });
  });

  async function snap(label) {
    await page.waitForTimeout(1200);
    return {
      label,
      url: page.url(),
      text: await page.evaluate(() => document.body.innerText.slice(0, 900)),
      imgs: await page.evaluate(
        () =>
          [...document.querySelectorAll('img')]
            .map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }))
            .filter((i) => i.src && !i.src.includes('data:'))
            .slice(0, 8),
      ),
      brokenImgs: await page.evaluate(
        () =>
          [...document.querySelectorAll('img')].filter(
            (i) => (i.currentSrc || i.src) && i.naturalWidth === 0,
          ).length,
      ),
    };
  }

  // Homepage
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  results.homepage = await snap('home');

  // Auctions
  await page.goto('http://localhost:3000/auctions', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForFunction(() => document.body.innerText.includes('active listing'), {
    timeout: 20000,
  });
  results.auctions = await snap('auctions');

  // Search
  await page.goto('http://localhost:3000/search?q=iPhone', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  results.search = await snap('search-iphone');

  // Discover auction ids via API inside browser
  const meta = await page.evaluate(async () => {
    const active = await fetch('http://127.0.0.1:8000/api/auctions/active/').then((r) =>
      r.json(),
    );
    const all = await fetch('http://127.0.0.1:8000/api/auctions/').then((r) => r.json());
    const list = Array.isArray(all) ? all : all.results || [];
    const now = Date.now();
    const upcoming = list.find(
      (a) => a.status === 'ACTIVE' && new Date(a.start_time).getTime() > now,
    );
    const closed = list.find((a) => a.status === 'CLOSED');
    const cancelled = list.find((a) => a.status === 'CANCELLED');
    return {
      liveId: active[0]?.id,
      upcomingId: upcoming?.id,
      closedId: closed?.id,
      cancelledId: cancelled?.id,
    };
  });
  results.ids = meta;

  if (meta.liveId) {
    await page.goto(`http://localhost:3000/auctions/${meta.liveId}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
    results.live = await snap('live');
  }
  if (meta.upcomingId) {
    await page.goto(`http://localhost:3000/auctions/${meta.upcomingId}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    results.upcoming = await snap('upcoming');
  }
  if (meta.closedId) {
    await page.goto(`http://localhost:3000/auctions/${meta.closedId}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    results.closed = await snap('closed');
  }
  if (meta.cancelledId) {
    await page.goto(`http://localhost:3000/auctions/${meta.cancelledId}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    results.cancelled = await snap('cancelled');
  }

  // Buyer login + pages
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.locator('input[type="password"]').waitFor();
  await page.locator('form input').nth(0).fill('demo_buyer_a');
  await page.locator('input[type="password"]').fill('DemoShowcase123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/buyer**', { timeout: 20000 });
  await page.waitForTimeout(2000);
  results.buyer.dashboard = await snap('buyer');

  for (const path of ['/buyer/my-bids', '/buyer/won', '/buyer/notifications']) {
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    results.buyer[path] = await snap(path);
  }

  return results;
}
