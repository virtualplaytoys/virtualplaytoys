// =====================================================================
// netlify/functions/save-worker-secret.js
// -----------------------------------------------------------------
// Admin-only. Call this when creating a new profile (or regenerating
// a code) instead of storing any secret in members-data.json.
//
// Writes to a SEPARATE file, worker-secrets.json, that is never
// fetched by directory.html/profile.html — only this function and
// publish-worker-edit.js ever read it. Keeping it out of the file the
// public site loads is what keeps worker codes private.
//
// REQUIRED ENV VARS (same GitHub ones as publish-members.js, plus):
//   ADMIN_TOTP_SECRET     - same one used elsewhere, gates this call
//   WORKER_SECRETS_PATH   - e.g. "worker-secrets.json" (pick a name,
//                            just don't reference it anywhere in the
//                            public-facing pages/scripts)
// =====================================================================

const crypto = require('crypto');

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function counterToBuffer(counter) {
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  return buf;
}

function generateTOTP(secretBase32, atTimeMs, period = 30, digits = 6) {
  const keyBytes = base32Decode(secretBase32);
  const counter = Math.floor(atTimeMs / 1000 / period);
  const counterBuf = counterToBuffer(counter);
  const hmac = crypto.createHmac('sha1', keyBytes).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % (10 ** digits)).toString().padStart(digits, '0');
}

function verifyTOTP(secretBase32, code) {
  const now = Date.now();
  for (const stepOffset of [0, -1, 1]) {
    if (generateTOTP(secretBase32, now + stepOffset * 30000) === code) return true;
  }
  return false;
}

function generateWorkerSecret(length = 16) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  const bytes = crypto.randomBytes(length);
  for (const b of bytes) secret += alphabet[b % alphabet.length];
  return secret;
}

async function githubGetFile(apiUrl, branch, headers) {
  const res = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (res.status === 200) {
    const body = await res.json();
    const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    return { content, sha: body.sha };
  }
  if (res.status === 404) return { content: [], sha: undefined };
  const errBody = await res.text();
  throw new Error(`GitHub lookup failed: ${res.status} ${errBody}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const {
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
    ADMIN_TOTP_SECRET, WORKER_SECRETS_PATH
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !ADMIN_TOTP_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing required environment variables.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { adminCode, memberId, memberName } = payload;

  if (!adminCode || !verifyTOTP(ADMIN_TOTP_SECRET, String(adminCode))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect or expired admin code.' }) };
  }
  if (memberId === undefined || !memberName) {
    return { statusCode: 400, body: JSON.stringify({ error: '"memberId" and "memberName" are required.' }) };
  }

  const branch = GITHUB_BRANCH || 'main';
  const path = WORKER_SECRETS_PATH || 'worker-secrets.json';
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'prism-collective-admin'
  };

  try {
    const { content: secrets, sha } = await githubGetFile(apiUrl, branch, ghHeaders);

    const newSecret = generateWorkerSecret();
    const filtered = secrets.filter(s => s.memberId !== memberId);
    filtered.push({ memberId, memberName, secret: newSecret, updatedAt: new Date().toISOString() });

    const contentB64 = Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Set worker login code for ${memberName} (${new Date().toISOString()})`,
        content: contentB64,
        branch,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: `GitHub commit failed: ${putRes.status} ${errBody}` }) };
    }

    // Only returned once, directly to the admin who just requested it.
    // It is never written anywhere the public site reads.
    return { statusCode: 200, body: JSON.stringify({ ok: true, secret: newSecret }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Unexpected error: ${e.message}` }) };
  }
};
