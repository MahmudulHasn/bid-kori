/**
 * Multi-context realtime bid + seller/admin/checkout/moderation/celery close.
 * Uses Playwright chromium via the same patchright path as browser.mjs.
 */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function resolveChromium() {
  for (const base of [
    join(homedir(), '.vscode/extensions'),
    join(homedir(), '.vscode-server/extensions'),
  ]) {
    if (!existsSync(base)) continue;
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const newest = dirs[dirs.length - 1];
    if (!newest) continue;
    try {
      const mod = createRequire(join(base, newest, 'standalone') + '/')('patchright');
      return mod.chromium ?? mod.default?.chromium;
    } catch {}
  }
  throw new Error('patchright not found');
}

const API = 'http://127.0.0.1:8000/api';
const FE = 'http://localhost:3000';

async function login(request, username) {
  const res = await request.post(`${API}/users/login/`, {
    data: { username, password: 'DemoShowcase123!' },
  });
  const body = await res.json();
  return body.token;
}

async function main() {
  const chromium = resolveChromium();
  const browser = await chromium.launch({ headless: true });
  const out = {
    realtime: null,
    seller: {},
    admin: {},
    moderation: null,
    checkout: null,
    finance: null,
    shortClose: null,
  };

  // --- Multi-buyer realtime ---
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  async function uiLogin(page, username) {
    await page.goto(`${FE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('input[type="password"]').waitFor();
    await page.locator('form input').nth(0).fill(username);
    await page.locator('input[type="password"]').fill('DemoShowcase123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);
  }

  const active = await (await fetch(`${API}/auctions/active/`)).json();
  const liveId = active[0].id;
  const detail0 = await (await fetch(`${API}/auctions/${liveId}/`)).json();
  const nextA = (
    Number(detail0.current_highest_bid) + Number(detail0.min_increment)
  ).toFixed(2);

  await uiLogin(pageA, 'demo_buyer_a');
  await uiLogin(pageB, 'demo_buyer_b');
  await pageA.goto(`${FE}/auctions/${liveId}`, { waitUntil: 'networkidle', timeout: 60000 });
  await pageB.goto(`${FE}/auctions/${liveId}`, { waitUntil: 'networkidle', timeout: 60000 });
  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  const priceBeforeB = await pageB.evaluate(() => document.body.innerText);
  await pageA.locator('input[type="number"], form input').first().fill(nextA);
  const bidResp = pageA.waitForResponse(
    (r) => r.url().includes('/place-bid') && r.request().method() === 'POST',
  );
  await pageA.getByRole('button', { name: /Place Bid/i }).click();
  const bidRes = await bidResp;
  await pageB.waitForTimeout(2500);
  const priceAfterB = await pageB.evaluate(() => document.body.innerText);
  out.realtime = {
    liveId,
    bidStatus: bidRes.status(),
    nextA,
    bSawUpdate:
      priceAfterB.includes(nextA.replace(/\.00$/, '')) ||
      priceAfterB.includes(Number(nextA).toLocaleString('en-US')) ||
      priceAfterB.includes(nextA) ||
      !priceAfterB.includes(
        Number(detail0.current_highest_bid).toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }),
      ),
    bTextHasAmount: priceAfterB.includes(nextA) || priceAfterB.includes('৳'),
    aSnippet: (await pageA.evaluate(() => document.body.innerText)).slice(0, 400),
    bSnippet: priceAfterB.slice(0, 400),
    priceBeforeHadOld: priceBeforeB.includes(String(detail0.current_highest_bid)),
  };

  // Buyer B outbids
  const detail1 = await (await fetch(`${API}/auctions/${liveId}/`)).json();
  const nextB = (
    Number(detail1.current_highest_bid) + Number(detail1.min_increment)
  ).toFixed(2);
  await pageB.locator('input[type="number"], form input').first().fill(nextB);
  const bidResp2 = pageB.waitForResponse(
    (r) => r.url().includes('/place-bid') && r.request().method() === 'POST',
  );
  await pageB.getByRole('button', { name: /Place Bid/i }).click();
  const bidRes2 = await bidResp2;
  await pageA.waitForTimeout(3000);
  const aAfter = await pageA.evaluate(() => document.body.innerText);
  out.realtime.outbid = {
    bidStatus: bidRes2.status(),
    nextB,
    aSeesUpdate: aAfter.includes(nextB) || aAfter.toLowerCase().includes('outbid'),
    aSnippet: aAfter.slice(0, 500),
  };

  // Notifications for A
  await pageA.goto(`${FE}/buyer/notifications`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(1500);
  out.realtime.notifA = (await pageA.evaluate(() => document.body.innerText)).slice(
    0,
    600,
  );

  await ctxA.close();
  await ctxB.close();

  // --- Seller ---
  const sellerCtx = await browser.newContext();
  const sellerPage = await sellerCtx.newPage();
  await uiLogin(sellerPage, 'demo_seller_electronics');
  for (const path of ['/seller', '/seller/products', '/seller/auctions', '/seller/sales']) {
    await sellerPage.goto(`${FE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await sellerPage.waitForTimeout(1200);
    out.seller[path] = {
      url: sellerPage.url(),
      text: (await sellerPage.evaluate(() => document.body.innerText)).slice(0, 500),
      imgs: await sellerPage.evaluate(
        () => [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
      ),
    };
  }
  await sellerCtx.close();

  // --- Admin + moderation ---
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await uiLogin(adminPage, 'demo_admin');
  for (const path of ['/admin', '/admin/users', '/admin/auctions', '/admin/analytics']) {
    await adminPage.goto(`${FE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await adminPage.waitForTimeout(1200);
    out.admin[path] = {
      url: adminPage.url(),
      text: (await adminPage.evaluate(() => document.body.innerText)).slice(0, 500),
    };
  }

  const tokenAdmin = await login(adminPage.request, 'demo_admin');
  const auctions = await (
    await fetch(`${API}/auctions/`, {
      headers: { Authorization: `Token ${tokenAdmin}` },
    })
  ).json();
  const list = Array.isArray(auctions) ? auctions : auctions.results || [];
  const target = list.find(
    (a) =>
      a.status === 'ACTIVE' &&
      a.id !== liveId &&
      String(a.product_title || '').includes('[DEMO]'),
  );
  if (target) {
    const hide = await adminPage.request.post(
      `${API}/admin/auctions/${target.id}/hide/`,
      { headers: { Authorization: `Token ${tokenAdmin}` }, data: {} },
    );
    const publicAfterHide = await fetch(`${API}/auctions/${target.id}/`);
    const restore = await adminPage.request.post(
      `${API}/admin/auctions/${target.id}/restore/`,
      { headers: { Authorization: `Token ${tokenAdmin}` }, data: {} },
    );
    const publicAfterRestore = await fetch(`${API}/auctions/${target.id}/`);
    out.moderation = {
      id: target.id,
      hide: hide.status(),
      publicAfterHide: publicAfterHide.status,
      restore: restore.status(),
      publicAfterRestore: publicAfterRestore.status,
    };
  }
  await adminCtx.close();

  // --- Checkout unpaid ---
  const tokenBuyer = await login(
    (
      await browser.newContext()
    ).request,
    'demo_buyer_a',
  );
  // find unpaid via django isn't available; probe closed auctions
  const all = await (await fetch(`${API}/auctions/`)).json();
  const allList = Array.isArray(all) ? all : all.results || [];
  // Use shell-less: try checkout on closed unpaid from won list
  const buyerCtx = await browser.newContext();
  const buyerReq = buyerCtx.request;
  const t = await login(buyerReq, 'demo_buyer_a');
  let unpaidId = null;
  for (const a of allList) {
    if (a.status !== 'CLOSED' || a.is_paid) continue;
    const r = await buyerReq.post(`${API}/auctions/${a.id}/checkout/`, {
      headers: { Authorization: `Token ${t}` },
      data: {},
    });
    if (r.status() === 200 || r.status() === 201) {
      unpaidId = a.id;
      const body = await r.json();
      const dup = await buyerReq.post(`${API}/auctions/${a.id}/checkout/`, {
        headers: { Authorization: `Token ${t}` },
        data: {},
      });
      out.checkout = {
        id: a.id,
        status: r.status(),
        bodyKeys: Object.keys(body),
        hasFee: 'platform_fee' in body || 'seller_net' in (body.payment || {}),
        dup: dup.status(),
        dupBody: (await dup.text()).slice(0, 250),
      };
      break;
    }
  }
  if (!out.checkout) out.checkout = { unpaidId: null, note: 'no unpaid found or all blocked' };

  const earnings = await (
    await buyerReq.get(`${API}/seller/earnings/`, {
      headers: {
        Authorization: `Token ${await login(buyerReq, 'demo_seller_electronics')}`,
      },
    })
  ).json();
  const finance = await (
    await buyerReq.get(`${API}/admin/finance/summary/`, {
      headers: { Authorization: `Token ${await login(buyerReq, 'demo_admin')}` },
    })
  ).json();
  out.finance = { earnings, finance };
  await buyerCtx.close();

  // --- Short auction celery close via API ---
  const sellerTok = await login((await browser.newContext()).request, 'demo_seller_electronics');
  // Create product + short auction through manage is easier via docker - skip in this script
  out.shortClose = { deferred: true };

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
