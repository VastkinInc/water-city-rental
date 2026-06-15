// Quick diagnostic script — hits the LIVE backend, no DB / no env required.
// Usage: node scripts/test-inquiries-endpoint.mjs

const BASE  = process.env.API_BASE || 'https://whitesmoke-cat-246560.hostingersite.com';
const EMAIL = process.env.LOGIN_EMAIL || 'alex@example.com';
const PASS  = process.env.LOGIN_PASS  || 'password123';

function header(s) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}

async function dump(label, res) {
  const headersObj = {};
  for (const [k, v] of res.headers.entries()) headersObj[k] = v;
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  console.log(`\n[${label}]`);
  console.log('  URL:        ', res.url);
  console.log('  Status:     ', res.status, res.statusText);
  console.log('  Headers:    ', JSON.stringify(headersObj, null, 2));
  console.log('  Body (raw): ', text.length > 1200 ? text.slice(0, 1200) + '…' : text);
  if (parsed) console.log('  Body (parsed JSON):', JSON.stringify(parsed, null, 2));
  return { text, parsed };
}

(async () => {
  header(`Diagnosing /api/conversations on ${BASE}`);

  // 1) Login.
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS })
  });
  const { parsed: loginJson } = await dump('LOGIN', loginRes);
  if (!loginRes.ok) {
    console.error('\nLogin failed — cannot continue.');
    process.exit(1);
  }
  const token =
    (loginJson && (loginJson.accessToken || loginJson.token)) ||
    (loginJson && loginJson.data && (loginJson.data.accessToken || loginJson.data.token));
  if (!token) {
    console.error('\nLogin succeeded but no token found in response. Inspect body above.');
    process.exit(1);
  }
  console.log('\n✓ Got token (first 24 chars):', token.slice(0, 24) + '…');

  // 2) GET /api/conversations
  header('GET /api/conversations');
  const convRes = await fetch(`${BASE}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await dump('LIST_CONVERSATIONS', convRes);

  // 3) GET /api/conversations/unread-count
  header('GET /api/conversations/unread-count');
  const uRes = await fetch(`${BASE}/api/conversations/unread-count`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await dump('UNREAD_COUNT', uRes);

  // 4) Sanity: GET /api/messages/unread-count (the other inbox — known good)
  header('GET /api/messages/unread-count (control — should still work)');
  const mRes = await fetch(`${BASE}/api/messages/unread-count`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await dump('MESSAGES_UNREAD_COUNT_CONTROL', mRes);

  console.log('\nDone.');
})().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
