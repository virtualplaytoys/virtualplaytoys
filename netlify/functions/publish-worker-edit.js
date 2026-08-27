// =====================================================================
// netlify/functions/publish-worker-edit.js
// -----------------------------------------------------------------
// A worker's code only ever flows through this function. It:
//   1. Reads worker-secrets.json (server-side only, never sent to
//      any browser) to find which member the submitted code belongs to.
//   2. If valid, applies ONLY an allow-listed set of fields to that
//      one member's entry in members-data.json and commits.
// A worker can never touch another member's entry, and can never
// edit fields outside the allow-list (id, and anything not listed
// below, are protected even if the request tries to include them).
//
// REQUIRED ENV VARS: same GitHub ones as the other two functions,
// plus WORKER_SECRETS_PATH (must match save-worker-secret.js).
// =====================================================================

const crypto = require('crypto');

// Fields a worker is allowed to change on their own profile.
// Add to this list deliberately — anything left off stays admin-only.
const WORKER_EDITABLE_FIELDS = ['bio', 'status', 'tags', 'image', 'gender'];

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

async function githubPutFile(apiUrl, branch, headers, contentObj, sha, message) {
  const contentB64 = Buffer.from(JSON.stringify(contentObj, null, 2)).toString('base64');
  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: contentB64, branch, ...(sha ? { sha } : {}) })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub commit failed: ${res.status} ${errBody}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const {
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
    GITHUB_FILE_PATH, WORKER_SECRETS_PATH
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing required environment variables.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { code, updates } = payload;
  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: '"code" is required.' }) };
  }

  const branch = GITHUB_BRANCH || 'main';
  const secretsPath = WORKER_SECRETS_PATH || 'worker-secrets.json';
  const secretsApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${secretsPath}`;
  const membersPath = GITHUB_FILE_PATH || 'members-data.json';
  const membersApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${membersPath}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'prism-collective-admin'
  };

  try {
    // Find which worker this code belongs to. Small rosters only —
    // fine for dozens of workers, would need a lookup table before
    // this scales much further.
    const { content: secrets } = await githubGetFile(secretsApiUrl, branch, ghHeaders);
    const match = secrets.find(s => verifyTOTP(s.secret, String(code)));

    if (!match) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect or expired code.' }) };
    }

    // "Verify only" mode — worker just logged in, hasn't saved anything
    // yet. Let the client show the edit form with the current data.
    const { content: members, sha: membersSha } = await githubGetFile(membersApiUrl, branch, ghHeaders);
    const memberIdx = members.findIndex(m => m.id === match.memberId);
    if (memberIdx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Your profile could not be found. Contact the admin.' }) };
    }

    if (!updates) {
      // Login step: return the current editable fields, nothing more.
      const current = {};
      WORKER_EDITABLE_FIELDS.forEach(f => { current[f] = members[memberIdx][f]; });
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, memberId: match.memberId, name: match.memberName, current })
      };
    }

    // Save step: apply only allow-listed fields, nothing else.
    WORKER_EDITABLE_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        members[memberIdx][field] = updates[field];
      }
    });

    await githubPutFile(
      membersApiUrl, branch, ghHeaders, members, membersSha,
      `${match.memberName} updated their own profile (${new Date().toISOString()})`
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Unexpected error: ${e.message}` }) };
  }
};
