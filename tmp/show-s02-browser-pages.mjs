/** Visual rehearsal script for browser.mjs — public + role dashboards. */
export default async function (page, ui) {
  const results = {};
  const PASS = 'DemoShowcase123!';

  async function login(username, expectPath) {
    await page.goto('http://localhost:3000/auth/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.locator('input[type="password"]').waitFor({ timeout: 20000 });
    await page.locator('form input').nth(0).fill(username);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);
    return page.url();
  }

  async function probe(path, checks) {
    const consoleErrors = [];
    const failed = [];
    const onConsole = (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    };
    const onFail = (req) => {
      const u = req.url();
      if (u.includes('/_next/') || u.includes('hot-update')) return;
      failed.push({ url: u.slice(0, 120), err: req.failure()?.errorText });
    };
    page.on('console', onConsole);
    page.on('requestfailed', onFail);
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    const imgs = await page.evaluate(() => {
      const list = [...document.querySelectorAll('img')];
      return {
        total: list.length,
        loaded: list.filter((i) => i.complete && i.naturalWidth > 0).length,
        broken: list.filter((i) => i.complete && i.naturalWidth === 0).length,
        noImageText: document.body.innerText.includes('No image'),
      };
    });
    const width = await page.evaluate(() => window.innerWidth);
    page.off('console', onConsole);
    page.off('requestfailed', onFail);
    const out = {
      url: page.url(),
      width,
      textLen: text.length,
      hasErrorUi: /failed to load|something went wrong|unauthorized|500/i.test(text),
      imgs,
      consoleErrors: consoleErrors.slice(0, 8),
      failedNet: failed.slice(0, 8),
      checks: {},
    };
    for (const [k, re] of Object.entries(checks || {})) {
      out.checks[k] = re.test(text);
    }
    return out;
  }

  // Public
  results.home = await probe('/', {
    auctions: /auction|live|bid/i,
    populated: /৳|BDT|Starting|Current/i,
  });
  results.auctions = await probe('/auctions', {
    liveOrUpcoming: /Live|Upcoming|ACTIVE|live/i,
    price: /৳|Starting|Current/i,
  });

  // Search via query if UI has search; also hit API-backed page content
  await page.goto('http://localhost:3000/auctions?q=iPhone', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  const searchText = await page.evaluate(() => document.body.innerText);
  results.search = {
    q: 'iPhone',
    hasIphone: /iphone/i.test(searchText),
    textSnippet: searchText.slice(0, 400),
  };

  // Pick live/upcoming/closed/cancelled from API
  const active = await page.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8000/api/auctions/active/');
    return r.json();
  });
  const all = await page.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8000/api/auctions/');
    return r.json();
  });
  const list = Array.isArray(all) ? all : all.results || [];
  const liveId = active[0]?.id;
  const upcoming = list.find((a) => /upcoming|scheduled/i.test(a.status) || a.status === 'PENDING');
  const closed = list.find((a) => a.status === 'CLOSED' && a.winning_bidder);
  const cancelled = list.find((a) => a.status === 'CANCELLED');

  if (liveId) {
    results.live = await probe(`/auctions/${liveId}`, {
      live: /Live|LIVE|ACTIVE/i,
      price: /Current|Starting|৳/i,
      bid: /Place Bid|Next valid/i,
    });
  }
  if (upcoming?.id) {
    results.upcoming = await probe(`/auctions/${upcoming.id}`, {
      upcoming: /Upcoming|Starts|PENDING|SCHEDULED/i,
      notLiveFalse: !/LIVE UPDATES/i.test('x'), // placeholder
      bidDisabledHint: /not started|starts in|upcoming|disabled|cannot bid/i,
    });
    results.upcoming.checks.notFalselyLive = !/Status:\s*Live\b/i.test(
      await page.evaluate(() => document.body.innerText),
    );
  }
  if (closed?.id) {
    results.closed = await probe(`/auctions/${closed.id}`, {
      closed: /Closed|CLOSED|Winner/i,
      winner: /winner|won by|winning/i,
    });
  }
  if (cancelled?.id) {
    results.cancelled = await probe(`/auctions/${cancelled.id}`, {
      cancelled: /Cancel/i,
    });
  }

  // Buyer
  await login('demo_buyer_a');
  results.buyer = await probe('/buyer', { populated: /bid|won|auction|৳/i });
  results.myBids = await probe('/buyer/my-bids', { populated: /bid|auction|৳/i });
  results.won = await probe('/buyer/won', { populated: /won|auction|pay|৳/i });
  results.notifications = await probe('/buyer/notifications', {
    populated: /notif|outbid|won|bid/i,
  });

  // Seller
  await login('demo_seller_electronics');
  results.seller = await probe('/seller', { populated: /product|auction|sale|৳/i });
  results.sellerProducts = await probe('/seller/products', {
    populated: /product|image|৳|edit/i,
  });
  results.sellerAuctions = await probe('/seller/auctions', {
    populated: /auction|live|closed|৳/i,
  });
  results.sellerSales = await probe('/seller/sales', { populated: /sale|earning|৳|fee/i });

  // Admin
  await login('demo_admin');
  results.admin = await probe('/admin', { populated: /user|auction|analytic/i });
  results.adminUsers = await probe('/admin/users', { populated: /demo_|user|buyer|seller/i });
  results.adminAuctions = await probe('/admin/auctions', {
    populated: /auction|live|closed|hide/i,
  });
  results.adminAnalytics = await probe('/admin/analytics', {
    populated: /revenue|fee|gross|৳|sale/i,
  });

  // Mobile-ish
  await page.setViewportSize({ width: 390, height: 844 });
  results.mobileHome = await probe('/', { ok: /auction|bid|৳/i });
  results.mobileAuctions = await probe('/auctions', { ok: /Live|Upcoming|৳/i });
  if (liveId) results.mobileLive = await probe(`/auctions/${liveId}`, { ok: /Place Bid|Live|৳/i });
  await login('demo_buyer_a');
  results.mobileBuyer = await probe('/buyer', { ok: /bid|won|৳/i });

  return results;
}
