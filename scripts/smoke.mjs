// Smoke-checks a deployed macro.watch instance.
//   node scripts/smoke.mjs https://<railway-url>            read-only checks
//   node scripts/smoke.mjs https://<railway-url> --with-write
//     also POSTs a clearly-marked sentinel brief (date 1999-01-01) using
//     MACRO_WATCH_INGEST_TOKEN from the environment and verifies it renders.
//     Use --with-write against STAGING only (spec §11 launch check).

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url> [--with-write]');
  process.exit(1);
}

let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

await check('GET / renders with the byline', async () => {
  const res = await fetch(`${base}/`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const text = await res.text();
  if (!text.includes('a Sovereign Signal system')) throw new Error('byline missing');
  if (!text.includes('Not investment advice')) throw new Error('disclaimer missing');
});

await check('GET /feed.xml is RSS', async () => {
  const res = await fetch(`${base}/feed.xml`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const text = await res.text();
  if (!text.includes('<rss version="2.0">')) throw new Error('not an RSS document');
});

await check('GET /map, /accountability, /catalysts, /about, /search all 200', async () => {
  for (const p of ['/map', '/accountability', '/catalysts', '/about', '/search']) {
    const res = await fetch(`${base}${p}`);
    if (res.status !== 200) throw new Error(`${p} -> ${res.status}`);
  }
});

await check('ingest rejects a missing token with 401', async () => {
  const res = await fetch(`${base}/api/ingest/briefs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

if (process.argv.includes('--with-write')) {
  const token = process.env.MACRO_WATCH_INGEST_TOKEN;
  if (!token) {
    console.error('FAIL  --with-write requires MACRO_WATCH_INGEST_TOKEN in the environment');
    process.exit(1);
  }
  const sentinel = {
    date: '1999-01-01',
    kind: 'daily',
    subject: 'Smoke test brief (sentinel — not market content)',
    telegram_ping: 'Smoke test sentinel.',
    html: '<p>Smoke test sentinel published by scripts/smoke.mjs.</p>',
    sent_verified_at: '1999-01-01T14:00:00Z',
  };
  await check('ingest accepts a sentinel brief and the permalink renders it', async () => {
    const res = await fetch(`${base}/api/ingest/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(sentinel),
    });
    if (res.status !== 200) throw new Error(`ingest -> ${res.status}`);
    const page = await fetch(`${base}/briefs/1999-01-01`);
    if (page.status !== 200) throw new Error(`permalink -> ${page.status}`);
    const text = await page.text();
    if (!text.includes('Smoke test brief (sentinel')) throw new Error('sentinel not rendered');
  });
}

console.log(failures === 0 ? 'smoke passed' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
