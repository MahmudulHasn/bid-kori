/** @param {import('playwright').Page} page */
export default async function (page) {
  const wsLog = [];
  page.on('websocket', (ws) => {
    const entry = { url: ws.url(), frames: [], closed: false, closeCode: null };
    wsLog.push(entry);
    ws.on('framereceived', (f) =>
      entry.frames.push({ dir: 'in', data: String(f.payload).slice(0, 200) }),
    );
    ws.on('framesent', (f) =>
      entry.frames.push({ dir: 'out', data: String(f.payload).slice(0, 200) }),
    );
    ws.on('close', (code) => {
      entry.closed = true;
      entry.closeCode = code;
    });
  });

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
  await page.waitForTimeout(5000);

  const buyerWs = wsLog.filter((w) => w.url.includes('/ws/notifications/'));

  await page.goto('http://localhost:3000/auctions/87', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(4000);

  const auctionWs = wsLog.filter((w) => w.url.includes('/ws/auctions/87/'));

  // Place a bid
  const nextBid = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/Next valid bid:\s*৳([\d,]+\.\d{2})/);
    return m ? m[1].replace(/,/g, '') : null;
  });

  let bidResult = null;
  if (nextBid) {
    await page.fill('input[type="number"], input[name="amount"], form input', nextBid);
    const bidRespPromise = page.waitForResponse(
      (r) => r.url().includes('/place-bid') && r.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.click('button:has-text("Place Bid")');
    const bidResp = await bidRespPromise;
    bidResult = {
      status: bidResp.status(),
      body: (await bidResp.text()).slice(0, 400),
      nextBid,
    };
    await page.waitForTimeout(1500);
  }

  // LIVE UPDATES badge / connected
  const liveText = await page.evaluate(() => document.body.innerText.includes('LIVE UPDATES'));

  return {
    buyerWs: buyerWs.map((w) => ({
      url: w.url,
      closed: w.closed,
      frames: w.frames.slice(0, 6),
    })),
    auctionWs: auctionWs.map((w) => ({
      url: w.url,
      closed: w.closed,
      frames: w.frames.slice(0, 8),
    })),
    bidResult,
    liveText,
    openAuctionSockets: auctionWs.filter((w) => !w.closed).length,
    openNotifSockets: buyerWs.filter((w) => !w.closed).length,
  };
}
