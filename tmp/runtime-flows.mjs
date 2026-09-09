/** @param {import('playwright').Page} page */
/** @param {any} ui */
export default async function (page, ui) {
  const results = {
    login: null,
    buyer: null,
    seller: null,
    admin: null,
    auctionDetail: null,
    wsAuction: null,
    wsNotif: null,
    media: null,
    consoleErrors: [],
    failedRequests: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });
  page.on('requestfailed', (req) => {
    results.failedRequests.push({
      url: req.url(),
      err: req.failure()?.errorText || '',
    });
  });

  async function dump(label) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 1200));
    const url = page.url();
    return { label, url, body };
  }

  // --- Login as buyer ---
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('input', { timeout: 15000 });
  const userSel =
    (await page.$('input[name="username"]')) ||
    (await page.$('input[type="text"]')) ||
    (await page.locator('input').first());
  const passSel =
    (await page.$('input[name="password"]')) ||
    (await page.$('input[type="password"]'));

  await page.fill('input[name="username"], input[autocomplete="username"], form input[type="text"]', 'demo_buyer_a');
  await page.fill('input[name="password"], input[type="password"]', 'DemoShowcase123!');

  const loginApi = page.waitForResponse(
    (r) => r.url().includes('/users/login') && r.request().method() === 'POST',
    { timeout: 20000 },
  ).catch(() => null);

  await page.click('button[type="submit"]');
  const loginRes = await loginApi;
  let loginBody = '';
  let loginStatus = null;
  if (loginRes) {
    loginStatus = loginRes.status();
    try {
      loginBody = (await loginRes.text()).slice(0, 300);
    } catch {}
  }
  await page.waitForTimeout(2000);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  results.login = {
    status: loginStatus,
    bodyPreview: loginBody,
    tokenPresent: Boolean(token),
    afterUrl: page.url(),
    dump: await dump('post-login'),
  };

  // --- Buyer pages ---
  for (const path of ['/buyer', '/buyer/my-bids', '/buyer/won', '/buyer/notifications']) {
    const apiHits = [];
    const onResp = async (res) => {
      if (res.url().includes('/api/')) {
        apiHits.push({ url: res.url(), status: res.status() });
      }
    };
    page.on('response', onResp);
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(1200);
    page.off('response', onResp);
    if (!results.buyer) results.buyer = [];
    results.buyer.push({
      path,
      ...(await dump(path)),
      apiHits: apiHits.slice(0, 15),
    });
  }

  // --- Auction detail + WS ---
  const wsEvents = [];
  page.on('websocket', (ws) => {
    wsEvents.push({ url: ws.url(), type: 'open' });
    ws.on('close', () => wsEvents.push({ url: ws.url(), type: 'close' }));
    ws.on('framereceived', (f) =>
      wsEvents.push({
        url: ws.url(),
        type: 'recv',
        payload: String(f.payload).slice(0, 120),
      }),
    );
  });

  await page.goto('http://localhost:3000/auctions/87', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(2500);
  results.auctionDetail = await dump('auction-87');
  results.wsAuction = {
    events: wsEvents.filter((e) => e.url.includes('/ws/auctions/')).slice(0, 10),
    connectedText: (await page.evaluate(() => document.body.innerText)).includes(
      'live',
    ),
  };

  // notification socket may already be open from buyer layout
  results.wsNotif = {
    events: wsEvents.filter((e) => e.url.includes('/ws/notifications/')).slice(0, 10),
  };

  // media sample
  const mediaUrl = await page.evaluate(() => {
    const img = document.querySelector('img');
    return img ? img.src : null;
  });
  results.media = { imgSrc: mediaUrl };

  // --- Seller login ---
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.fill('input[name="username"], input[autocomplete="username"], form input[type="text"]', 'demo_seller_electronics');
  await page.fill('input[name="password"], input[type="password"]', 'DemoShowcase123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  results.seller = { afterLogin: await dump('seller-login') };
  for (const path of ['/seller', '/seller/products', '/seller/auctions', '/seller/sales']) {
    const apiHits = [];
    const onResp = async (res) => {
      if (res.url().includes('/api/')) {
        apiHits.push({ url: res.url(), status: res.status() });
      }
    };
    page.on('response', onResp);
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(1000);
    page.off('response', onResp);
    results.seller[path] = { ...(await dump(path)), apiHits: apiHits.slice(0, 12) };
  }

  // --- Admin login ---
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.fill('input[name="username"], input[autocomplete="username"], form input[type="text"]', 'demo_admin');
  await page.fill('input[name="password"], input[type="password"]', 'DemoShowcase123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  results.admin = { afterLogin: await dump('admin-login') };
  for (const path of ['/admin', '/admin/users', '/admin/auctions', '/admin/analytics']) {
    const apiHits = [];
    const onResp = async (res) => {
      if (res.url().includes('/api/')) {
        apiHits.push({ url: res.url(), status: res.status() });
      }
    };
    page.on('response', onResp);
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(1000);
    page.off('response', onResp);
    results.admin[path] = { ...(await dump(path)), apiHits: apiHits.slice(0, 12) };
  }

  return results;
}
