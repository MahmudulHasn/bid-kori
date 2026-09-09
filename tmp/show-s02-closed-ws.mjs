import WebSocket from 'ws';

const id = Number(process.argv[2]);
const ORIGIN = 'http://localhost:3000';
const ws = new WebSocket(`ws://127.0.0.1:8000/ws/auctions/${id}/`, {
  headers: { Origin: ORIGIN },
});
const frames = [];
ws.on('message', (d) => frames.push(String(d)));
await new Promise((res, rej) => {
  ws.on('open', res);
  ws.on('error', rej);
  setTimeout(() => rej(new Error('open timeout')), 15000);
});
console.log(JSON.stringify({ listening: id }));
const start = Date.now();
while (Date.now() - start < 180000) {
  for (const f of frames) {
    try {
      const j = JSON.parse(f);
      if (j.type === 'auction.closed') {
        console.log(JSON.stringify({ closedEvent: j, waitedMs: Date.now() - start }));
        ws.close();
        process.exit(0);
      }
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(JSON.stringify({ timeout: true, last: frames.slice(-5) }));
ws.close();
process.exit(1);
