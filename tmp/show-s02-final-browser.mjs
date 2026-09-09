/** Post-reset smoke: search + upcoming + dashboards populated. */
export default async function (page) {
  const out = {};
  const PASS = 'DemoShowcase123!';

  async function login(u) {
    await page.goto('http://localhost:3000/auth/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.locator('input[type="password"]').waitFor();
    await page.locator('form input').nth(0).fill(u);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
  }

  async function shot(path) {
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);
    const imgs = await page.evaluate(() => {
      const list = [...document.querySelectorAll('img')];
      return {
        total: list.length,
        loaded: list.filter((i) => i.complete && i.naturalWidth > 0).length,
        broken: list.filter((i) => i.complete && i.naturalWidth === 0).length,
      };
    });
    return {
      textLen: text.length,
      imgs,
      hasDemo: /\[DEMO\]/i.test(text),
      snippet: text.replace(/\s+/g, ' ').slice(0, 280),
    };
  }

  out.home = await shot('/');
  out.auctions = await shot('/auctions');

  const terms = ['iPhone', 'laptop', 'gaming', 'camera', 'watch', 'RTX'];
  out.search = {};
  for (const q of terms) {
    await page.goto(`http://localhost:3000/search?q=${encodeURIComponent(q)}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => document.body.innerText);
    out.search[q] = {
      hasResults: /\d+ result/i.test(text) && !/No auctions matched/i.test(text),
      snippet: text.replace(/\s+/g, ' ').slice(0, 200),
    };
  }

  // Upcoming detail from API
  const upcoming = await page.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8000/api/auctions/');
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.results || [];
    return list.find((a) => {
      const start = new Date(a.start_time).getTime();
      return start > Date.now() && (a.status === 'ACTIVE' || a.status === 'PENDING');
    });
  });
  if (upcoming?.id) {
    out.upcoming = await shot(`/auctions/${upcoming.id}`);
    out.upcoming.id = upcoming.id;
    out.upcoming.checks = {
      upcomingLabel: /Upcoming|Starts in|not started|starts/i.test(out.upcoming.snippet),
      placeBidAbsentOrDisabled: !/Place Bid/i.test(out.upcoming.snippet),
    };
  }

  const live = await page.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8000/api/auctions/active/');
    const list = await r.json();
    return list[0];
  });
  if (live?.id) {
    out.live = await shot(`/auctions/${live.id}`);
    out.live.id = live.id;
  }

  await login('demo_buyer_a');
  out.buyer = await shot('/buyer');
  out.myBids = await shot('/buyer/my-bids');
  out.won = await shot('/buyer/won');
  out.notifications = await shot('/buyer/notifications');

  await login('demo_seller_electronics');
  out.seller = await shot('/seller');
  out.sellerProducts = await shot('/seller/products');
  out.sellerAuctions = await shot('/seller/auctions');
  out.sellerSales = await shot('/seller/sales');

  await login('demo_admin');
  out.admin = await shot('/admin');
  out.adminAnalytics = await shot('/admin/analytics');

  return out;
}
