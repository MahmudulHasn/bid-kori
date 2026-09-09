/** Browser: stay on short LIVE auction until CLOSED without reload. */
export default async function (page) {
  const id = Number(process.env.SHORT_AUCTION_ID || process.argv?.[2]);
  // browser.mjs may not pass argv — read from file
  const fs = await import('fs');
  const idFromFile = Number(fs.readFileSync('G:/bid-kori/tmp/show-s02-short-id.txt', 'utf8').trim().split(/\s+/).pop());
  const auctionId = idFromFile || id;
  const PASS = 'DemoShowcase123!';

  await page.goto('http://localhost:3000/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.locator('input[type="password"]').waitFor();
  await page.locator('form input').nth(0).fill('demo_buyer_a');
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);

  const wsFrames = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes(`/ws/auctions/${auctionId}/`)) return;
    ws.on('framereceived', (f) => wsFrames.push(String(f.payload).slice(0, 300)));
  });

  await page.goto(`http://localhost:3000/auctions/${auctionId}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  const before = await page.evaluate(() => document.body.innerText.slice(0, 800));

  // Wait up to 3 minutes for Closed / winner without reload
  let after = before;
  const start = Date.now();
  while (Date.now() - start < 180000) {
    after = await page.evaluate(() => document.body.innerText);
    if (/Closed|CLOSED|Winner|won/i.test(after) && !/Place Bid/i.test(after)) {
      break;
    }
    await page.waitForTimeout(2000);
  }

  return {
    auctionId,
    beforeSnippet: before.slice(0, 400),
    afterSnippet: after.slice(0, 500),
    sawClosedUi: /Closed|CLOSED/i.test(after),
    sawWinner: /winner|won by|winning/i.test(after),
    bidStillEnabled: /Place Bid/i.test(after) && !/disabled/i.test(after),
    closedWsFrames: wsFrames.filter((f) => f.includes('auction.closed')),
    allWsSample: wsFrames.slice(0, 8),
    waitedMs: Date.now() - start,
  };
}
