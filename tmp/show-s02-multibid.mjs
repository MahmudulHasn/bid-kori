/**
 * Multi-buyer realtime via `ws` package (Origin required by Channels validator).
 */
import WebSocket from 'ws';

const API = 'http://127.0.0.1:8000/api';
const WS = 'ws://127.0.0.1:8000';
const PASS = 'DemoShowcase123!';
const ORIGIN = 'http://localhost:3000';

async function login(username) {
  const res = await fetch(`${API}/users/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASS }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`login failed ${username}: ${JSON.stringify(body)}`);
  return body.token;
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: ORIGIN } });
    const frames = [];
    const timer = setTimeout(() => reject(new Error(`ws open timeout ${url}`)), 15000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve({ ws, frames });
    });
    ws.on('message', (data) => frames.push(String(data)));
    ws.on('error', (err) => reject(err));
    ws.on('unexpected-response', (_req, res) => {
      reject(new Error(`unexpected ${res.statusCode}`));
    });
  });
}

async function openNotif(token) {
  const { ws, frames } = await openWs(`${WS}/ws/notifications/`);
  ws.send(JSON.stringify({ type: 'authenticate', token }));
  await waitFor(frames, (j) => j && j.type === 'authenticated', 8000);
  frames.length = 0;
  return { ws, frames };
}

function waitFor(frames, pred, ms = 12000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      for (const f of frames) {
        try {
          const j = JSON.parse(f);
          if (pred(j, f)) return resolve(j);
        } catch {
          if (pred(null, f)) return resolve(f);
        }
      }
      if (Date.now() - start > ms) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 150);
    };
    tick();
  });
}

async function placeBid(token, auctionId, amount) {
  const res = await fetch(`${API}/auctions/${auctionId}/place-bid/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: String(amount) }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  const tokenA = await login('demo_buyer_a');
  const tokenB = await login('demo_buyer_b');
  const active = await (await fetch(`${API}/auctions/active/`)).json();
  const live = active[0];
  const detail = await (await fetch(`${API}/auctions/${live.id}/`)).json();
  const cur = Number(detail.current_highest_bid);
  const inc = Number(detail.min_increment) || 100;
  const amtA = (cur + inc).toFixed(2);
  const amtB = (cur + inc * 2).toFixed(2);

  const auctionA = await openWs(`${WS}/ws/auctions/${live.id}/`);
  const auctionB = await openWs(`${WS}/ws/auctions/${live.id}/`);
  const notifA = await openNotif(tokenA);

  auctionA.frames.length = 0;
  auctionB.frames.length = 0;

  const bidA = await placeBid(tokenA, live.id, amtA);
  const bSawA = await waitFor(
    auctionB.frames,
    (j) => j && (j.type === 'bid.accepted' || JSON.stringify(j).includes(amtA)),
  ).catch((e) => ({ error: String(e.message), frames: auctionB.frames.slice(-5) }));

  const bidB = await placeBid(tokenB, live.id, amtB);
  const aSawB = await waitFor(
    auctionA.frames,
    (j) => j && (j.type === 'bid.accepted' || JSON.stringify(j).includes(amtB)),
  ).catch((e) => ({ error: String(e.message), frames: auctionA.frames.slice(-5) }));

  const outbid = await waitFor(
    notifA.frames,
    (j, raw) =>
      String(raw).toLowerCase().includes('outbid') ||
      (j &&
        (j.type === 'notification.created' ||
          JSON.stringify(j).toLowerCase().includes('outbid'))),
    15000,
  ).catch((e) => ({ error: String(e.message), frames: notifA.frames.slice(-8) }));

  auctionA.ws.close();
  auctionB.ws.close();
  notifA.ws.close();

  console.log(
    JSON.stringify(
      {
        liveId: live.id,
        amtA,
        amtB,
        bidAStatus: bidA.status,
        bidBStatus: bidB.status,
        bSawA,
        aSawB,
        outbid,
        auctionBFrameCount: auctionB.frames.length,
        auctionAFrameCount: auctionA.frames.length,
        notifAFrameCount: notifA.frames.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
