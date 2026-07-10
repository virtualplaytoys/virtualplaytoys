// =====================================================================
// Netlify serverless function: publish-members
// -----------------------------------------------------------------
// Called by members-data.js's publishMembers(). This is the one place
// in the whole project where a secret (the GitHub token, and the TOTP
// secret used to verify the code) never gets sent to the browser —
// everything here runs on Netlify's servers, not in anyone's page
// source.
//
// REQUIRED ENVIRONMENT VARIABLES (set these in Netlify's dashboard —
// Site settings -> Environment variables — never commit them to the
// repo):
//   GITHUB_TOKEN        - a GitHub Personal Access Token with permission
//                          to write to your repo (Contents: read/write
//                          is enough if using a fine-grained token).
//   GITHUB_OWNER         - your GitHub username or org, e.g. "yourname"
//   GITHUB_REPO          - the repo name, e.g. "prism-collective-site"
//   GITHUB_BRANCH        - branch to commit to, e.g. "main"
//   GITHUB_FILE_PATH     - path to the data file in the repo,
//                          e.g. "members-data.json"
//   ADMIN_TOTP_SECRET    - the SAME base32 secret you used in
//                          admin.html's ADMIN_TOTP_SECRET constant, so
//                          codes from your authenticator app work for
//                          both the page login and this server check.
// =====================================================================

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
  const crypto = require('crypto');
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const {
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
    GITHUB_FILE_PATH, ADMIN_TOTP_SECRET
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !ADMIN_TOTP_SECRET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing required environment variables. See the comment at the top of this function for the full list.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { code, members } = payload;

  if (!code || !verifyTOTP(ADMIN_TOTP_SECRET, String(code))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect or expired authenticator code.' }) };
  }

  if (!Array.isArray(members)) {
    return { statusCode: 400, body: JSON.stringify({ error: '"members" must be an array.' }) };
  }

  const branch = GITHUB_BRANCH || 'main';
  const path = GITHUB_FILE_PATH || 'members-data.json';
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'prism-collective-admin'
  };

  try {
    // Look up the file's current sha (required by GitHub to update an existing file).
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    let sha;
    if (getRes.status === 200) {
      const getBody = await getRes.json();
      sha = getBody.sha;
    } else if (getRes.status !== 404) {
      const errBody = await getRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: `GitHub lookup failed: ${getRes.status} ${errBody}` }) };
    }

    const content = Buffer.from(JSON.stringify(members, null, 2)).toString('base64');

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update member data via admin panel (${new Date().toISOString()})`,
        content,
        branch,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: `GitHub commit failed: ${putRes.status} ${errBody}` }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Unexpected error: ${e.message}` }) };
  }
};
