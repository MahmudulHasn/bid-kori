import fs from 'fs';
const t = fs.readFileSync('G:/bid-kori/tmp/show-s02-browser-out.txt', 'utf8');
const i = t.indexOf('script');
const start = t.indexOf('{', i);
let depth = 0;
let end = -1;
for (let k = start; k < t.length; k++) {
  if (t[k] === '{') depth++;
  else if (t[k] === '}') {
    depth--;
    if (depth === 0) {
      end = k;
      break;
    }
  }
}
const obj = JSON.parse(t.slice(start, end + 1));
for (const [k, v] of Object.entries(obj)) {
  const imgs = v.imgs
    ? `imgs ${v.imgs.loaded}/${v.imgs.total} broken=${v.imgs.broken} noImgText=${v.imgs.noImageText}`
    : '';
  console.log(
    k,
    'errUi=' + (v.hasErrorUi || false),
    imgs,
    JSON.stringify(v.checks || {}),
    'len=' + (v.textLen || 0),
  );
}
