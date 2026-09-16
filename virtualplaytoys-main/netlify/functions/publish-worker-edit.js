// =====================================================================
// netlify/functions/publish-worker-edit.js
// -----------------------------------------------------------------
// A worker's code only ever flows through this function. It:
//   1. Reads worker-secrets.json (server-side only, never sent to
//      any browser) to find which member the submitted 6-digit code
//      belongs to.
//   2. On login (a code with no updates), returns the worker's
//      current data PLUS a signed, expiring session token. The
//      browser keeps that token in localStorage, so the worker stays
//      logged in across page reloads and pages — the raw code is
//      never needed again until the session expires. (Previously the
//      raw code was re-sent on every save, which meant a worker who
//      took longer than ~90 seconds to fill in the form got rejected
//      with "Incorrect or expired code", and no page could keep
//      anyone logged in.)
//   3. With (token, updates), verifies the signature and expiry,
//      then applies ONLY the allow-listed fields to that one member's
//      entry in members-data.json and commits.
// A worker can never touch another member's entry, and can never
// edit fields outside the allow-list (id, and anything not listed
// below, are protected even if the request tries to include them).
//
// REQUIRED ENV VARS: same GitHub ones as the other two functions,
// plus WORKER_SECRETS_PATH (must match save-worker-secret.js).
// OPTIONAL ENV VAR: WORKER_SESSION_SECRET — any long random string
// used to sign session tokens. If unset, a signing key is derived
// from GITHUB_TOKEN, so rotating that token also logs every worker
// out (set a dedicated WORKER_SESSION_SECRET to survive that).
//
// NOTE: regenerating a worker's code (🔑 in the admin panel) kills
// the CODE immediately, but any session token issued before then
// stays valid until it expires (12h max, refreshed while in use).
// =====================================================================

const crypto = require('crypto');

// Fields a worker is allowed to change on their own profile.
// Workers have the SAME editing power as the admin — for their OWN
// entry only. Two things stay admin-only:
//   - "id" (it's what ties the session token to the profile)
//   - "verified" (the ✓ badge is earned through the platform's
//     verification process, never self-granted)
//
// Every field must pass VALIDATION_SHAPES below or the whole save is
// rejected BEFORE anything is written, so a buggy or malicious client
// can never corrupt members-data.json for everyone else.
const WORKER_EDITABLE_FIELDS = [
  'bio', 'status', 'tags', 'image', 'gender', 'role', 'name',
  'schedule', 'availability', 'rates', 'services', 'contacts', 'links',
  'portfolio', 'extraBio', 'bottomSections'
];

// Required shape of each structured field. 'string' = must be a
// string (trimmed); objects/arrays are checked recursively.
const VALIDATION_SHAPES = {
  bio: 'string', status: 'string', image: 'imageSrc', gender: 'string', role: 'string', name: 'string',
  schedule: 'string',
  // Structured availability: the performer's usual online window in
  // THEIR timezone. The profile renders it converted to each visitor's
  // local timezone (see convertAvailability in assets/ui.js), so
  // guests never do GMT math.
  availability: {
    type: 'object',
    fields: {
      timezone: 'string',
      days: { type: 'array', item: 'string', max: 7 },
      start: 'time',
      end: 'time',
      note: 'string'
    }
  },
  // Multi-platform contacts: one entry per platform. "username" is the
  // performer's name/handle ON that platform.
  contacts: {
    type: 'array', max: 10,
    item: { platform: 'string', username: 'string' }
  },
  // Optional outbound links shown on the profile hero (Twitter, OF,
  // Fansly, Bluesky, ...). URLs must be http(s) — anything else is
  // rejected so the field can never be used for javascript: tricks.
  links: {
    type: 'array', max: 15,
    item: { label: 'string', url: 'url' }
  },
  services: {
    type: 'object',
    fields: {
      offered: { type: 'array', item: 'string', max: 25 },
      blocked: { type: 'array', item: 'string', max: 25 }
    }
  },
  rates: {
    type: 'array', max: 25,
    item: { id: 'int', label: 'string', amount: 'string' }
  },
  tags: { type: 'array', item: 'string', max: 30 },
  portfolio: {
    type: 'array', max: 50,
    item: { id: 'int', title: 'string', images: { type: 'array', item: 'imageSrc', max: 30 } }
  },
  extraBio: {
    type: 'array', max: 50,
    item: { id: 'int', title: 'string', text: 'string' }
  },
  bottomSections: {
    type: 'array', max: 50,
    item: { id: 'int', title: 'string', image: 'imageSrc', text: 'string' }
  }
};

// Size guard for data-URL images inside the structured content —
// these end up in members-data.json which becomes the public site's
// payload, and GitHub rejects big API bodies.
const MAX_IMAGE_DATAURL = 4 * 1024 * 1024; // ~4 MB per image

// Returns a normalized value for the given field, or throws if the
// value doesn't match its expected shape. Normalization: strings are
// trimmed, tag strings are lower-cased, string arrays drop empties.
function validateField(field, value) {
  const spec = VALIDATION_SHAPES[field];
  if (!spec) throw new Error(`"${field}" has no validation rule.`);
  // An availability block without a timezone or a start time can't be
  // converted, so it would never render. An empty or half-filled object
  // (the editors send {} when the worker clears everything) means
  // "clear the field" — handle that BEFORE shape validation, which
  // would otherwise throw on the missing keys.
  if (field === 'availability') {
    const isEmptyish = !value || typeof value !== 'object' || Array.isArray(value) ||
      !String(value.timezone || '').trim() || !String(value.start || '').trim() ||
      !Array.isArray(value.days) || !value.days.length;
    if (isEmptyish) return undefined; // clears the stored field
    const validated = validateValue(field, value, spec);
    try { new Intl.DateTimeFormat('en-US', { timeZone: validated.timezone }); }
    catch (e) {
      throw new Error(`"availability.timezone" is not a recognized IANA timezone (e.g. Pacific/Auckland).`);
    }
    return validated;
  }
  const validated = validateValue(field, value, spec);
  // Drop half-filled rows instead of rejecting the whole save — an
  // editor row missing its platform or username can't be displayed
  // meaningfully, so it's dropped as a UI artifact, not bad data.
  if (field === 'contacts') return validated.filter(c => c.platform && c.username);
  if (field === 'links') return validated.filter(l => l.url);
  return validated;
}

function validateValue(path, value, spec) {
  if (spec === 'url') {
    if (typeof value !== 'string') throw new Error(`"${path}" must be a string.`);
    const t = value.trim();
    if (t && !/^https?:\/\/\S+$/i.test(t)) {
      throw new Error(`"${path}" must be a full http(s) link, e.g. https://example.com/you`);
    }
    return t;
  }
  // Image fields accept either an embedded data URL (uploaded photo) or
  // an https link (photo hosted on Twitter/Bluesky/anywhere else). http
  // links are rejected — mixed content gets blocked by browsers on the
  // https site anyway, and https-only keeps hotlinked images verifiable.
  if (spec === 'imageSrc') {
    if (typeof value !== 'string') throw new Error(`"${path}" must be a string.`);
    const t = value.trim();
    if (!t) return '';
    if (/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(t)) {
      if (t.length > MAX_IMAGE_DATAURL) throw new Error(`"${path}" is too large (over ${Math.round(MAX_IMAGE_DATAURL / 1024 / 1024)} MB).`);
      return t;
    }
    if (/^https:\/\/\S+$/i.test(t)) {
      if (t.length > 2048) throw new Error(`"${path}" link is too long (over 2048 characters).`);
      return t;
    }
    throw new Error(`"${path}" must be an https image link (e.g. https://pbs.twimg.com/...) or an uploaded photo.`);
  }
  if (spec === 'time') {
    if (typeof value !== 'string') throw new Error(`"${path}" must be a string.`);
    const t = value.trim();
    if (t) {
      const mt = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!mt) throw new Error(`"${path}" must be a 24-hour time like 20:30.`);
      if (Number(mt[1]) > 24 || Number(mt[2]) > 59) {
        throw new Error(`"${path}" must be a real time of day, e.g. 20:30.`);
      }
    }
    return t;
  }
  if (spec === 'string') {
    if (typeof value !== 'string') throw new Error(`"${path}" must be a string.`);
    const trimmed = value.trim();
    if (path === 'name' && !trimmed) throw new Error('"name" cannot be empty.');
    if (trimmed.length > MAX_IMAGE_DATAURL) throw new Error(`"${path}" is too large.`);
    return trimmed;
  }
  if (spec.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`"${path}" must be an array.`);
    if (value.length > spec.max) throw new Error(`"${path}" allows at most ${spec.max} entries.`);
    if (typeof spec.item === 'string') {
      // Scalar specs with their own rules (image links, http(s) links,
      // times) must run per item — they're not plain strings.
      if (spec.item === 'url' || spec.item === 'imageSrc' || spec.item === 'time') {
        return value.map((v, i) => validateValue(`${path}[${i}]`, v, spec.item)).filter(Boolean);
      }
      return value.map((v, i) => {
        if (typeof v !== 'string') throw new Error(`"${path}" must contain only strings.`);
        if (v.length > MAX_IMAGE_DATAURL) throw new Error(`An entry in "${path}" is too large (over ${Math.round(MAX_IMAGE_DATAURL / 1024 / 1024)} MB).`);
        const t = v.trim();
        return path === 'tags' ? t.toLowerCase() : t;
      }).filter(Boolean);
    }
    return value.map((entry, i) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`"${path}[${i}]" must be an object.`);
      }
      const out = {};
      for (const [key, keySpec] of Object.entries(spec.item)) {
        if (keySpec === 'int') {
          const n = Number(entry[key]);
          if (!Number.isInteger(n)) throw new Error(`"${path}[${i}].${key}" must be an integer.`);
          out[key] = n;
        } else {
          out[key] = validateValue(`${path}[${i}].${key}`, entry[key], keySpec);
        }
      }
      return out;
    });
  }
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`"${path}" must be an object.`);
    }
    const out = {};
    for (const [key, keySpec] of Object.entries(spec.fields)) {
      out[key] = validateValue(`${path}.${key}`, value[key], keySpec);
    }
    return out;
  }
  throw new Error(`"${path}" has no validation rule.`);
}

// How long a worker stays logged in after one successful code entry.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

// ---------------------------------------------------------------------
// Session tokens — stateless, HMAC-signed, format:
//   "v2.<memberId>.<expiryMs>.<hex hmac-sha256 of the first three parts>"
// The function can verify any token with no server-side session store.
// ---------------------------------------------------------------------

function sessionSigningSecret() {
  if (process.env.WORKER_SESSION_SECRET) return process.env.WORKER_SESSION_SECRET;
  return crypto.createHash('sha256')
    .update(`${process.env.GITHUB_TOKEN || ''}|${process.env.GITHUB_OWNER || ''}/${process.env.GITHUB_REPO || ''}`)
    .digest('hex');
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', sessionSigningSecret()).update(payload).digest('hex');
}

function issueSessionToken(memberId) {
  const payload = `v2.${memberId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

// Returns the memberId the token was issued for, or null if the token
// is malformed, forged, or expired.
function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return null;
  const [, memberIdStr, expiryStr, signature] = parts;
  const expected = signSessionPayload(`v2.${memberIdStr}.${expiryStr}`);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  if (Number(expiryStr) < Date.now()) return null;
  const memberId = Number(memberIdStr);
  return Number.isFinite(memberId) ? memberId : null;
}

// ---------------------------------------------------------------------
// Login attempt throttling — in-memory, per function instance. Netlify
// may run several instances, so this is a strong deterrent rather than
// a hard guarantee; the 6-digit space is 1,000,000 and each instance
// allows 10 attempts per 10 minutes per IP, which keeps brute-forcing
// impractical while forgiving the occasional typo.
// ---------------------------------------------------------------------
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map(); // ip -> [timestamps]

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || h['client-ip'] || 'unknown';
}

function isRateLimited(event) {
  const ip = clientIp(event);
  const now = Date.now();
  const list = (loginAttempts.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  if (list.length >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(ip, list);
    return true;
  }
  list.push(now);
  loginAttempts.set(ip, list);
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.every(t => now - t >= LOGIN_WINDOW_MS)) loginAttempts.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// GitHub file helpers. Two-step read:
//   1. GET the file's METADATA (?ref=branch) — tiny JSON with the
//      current sha (needed for commits). The metadata body also carries
//      base64 content, but ONLY for files under 1 MB.
//   2. Fetch the actual CONTENT with Accept: application/vnd.github.raw
//      — GitHub serves the raw file up to 100 MB. This matters:
//      members-data.json embeds worker-uploaded images as data URLs and
//      has already crossed 1 MB. With the old single-call read, GitHub
//      returned content:"" and JSON.parse threw "Unexpected end of JSON
//      input", which bricked every worker login and save.
// ---------------------------------------------------------------------
async function githubGetFile(apiUrl, branch, headers) {
  const metaRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (metaRes.status === 404) return { content: [], sha: undefined };
  if (metaRes.status !== 200) {
    const errBody = await metaRes.text();
    throw new Error(`GitHub lookup failed: ${metaRes.status} ${errBody}`);
  }
  const meta = await metaRes.json();

  const rawRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
    headers: { ...headers, Accept: 'application/vnd.github.raw' }
  });
  if (!rawRes.ok) {
    const errBody = await rawRes.text();
    throw new Error(`GitHub content fetch failed: ${rawRes.status} ${errBody}`);
  }
  const rawText = await rawRes.text();
  let content;
  try {
    content = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Stored file at ${apiUrl} is not valid JSON (${e.message}). Last change may have corrupted it — restore a good copy and try again.`);
  }
  return { content, sha: meta.sha };
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

  const { code, token, updates } = payload;

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
    // ---- Authenticate: a session token first, otherwise a fresh code. ----
    let memberId;

    if (token) {
      memberId = verifySessionToken(token);
      if (!memberId) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Your session has expired. Please log in again.' }) };
      }
    } else if (code) {
      // Code logins are the brute-forceable path — throttle them.
      // Token-authenticated requests are not throttled.
      if (isRateLimited(event)) {
        return { statusCode: 429, body: JSON.stringify({ error: 'Too many login attempts. Wait a few minutes and try again.' }) };
      }
      // Find which worker this code belongs to. Small rosters only —
      // fine for dozens of workers, would need a lookup table before
      // this scales much further.
      const { content: secrets } = await githubGetFile(secretsApiUrl, branch, ghHeaders);
      const match = secrets.find(s => verifyTOTP(s.secret, String(code)));
      if (!match) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect or expired code.' }) };
      }
      memberId = match.memberId;
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: '"code" or "token" is required.' }) };
    }

    // ---- Load the live member list and find this worker's entry. ----
    const { content: members, sha: membersSha } = await githubGetFile(membersApiUrl, branch, ghHeaders);
    const memberIdx = members.findIndex(m => m.id === memberId);
    if (memberIdx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Your profile could not be found. Contact the admin.' }) };
    }

    // ---- No updates = login / session check: return current data + fresh token. ----
    // The token is refreshed on every valid request, so a session that's
    // actually being used keeps sliding forward instead of expiring
    // mid-edit 12 hours after the original login.
    if (!updates) {
      const current = {};
      WORKER_EDITABLE_FIELDS.forEach(f => { current[f] = members[memberIdx][f]; });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          memberId,
          name: members[memberIdx].name,
          current,
          token: issueSessionToken(memberId)
        })
      };
    }

    // ---- Save step: validate + apply only allow-listed fields. ----
    // Validation runs BEFORE anything is written, so one bad field
    // rejects the whole save and members-data.json stays intact.
    const applied = {};
    try {
      WORKER_EDITABLE_FIELDS.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
          const v = validateField(field, updates[field]);
          if (v === undefined) delete members[memberIdx][field]; // e.g. emptied availability
          else applied[field] = v;
        }
      });
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
    }
    Object.assign(members[memberIdx], applied);
    // Server-set audit stamp — not in the allow-list, so clients can't
    // spoof it; it always reflects the last real save.
    members[memberIdx].updatedAt = new Date().toISOString();

    await githubPutFile(
      membersApiUrl, branch, ghHeaders, members, membersSha,
      `${members[memberIdx].name} updated their own profile (${new Date().toISOString()})`
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true, token: issueSessionToken(memberId) }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Unexpected error: ${e.message}` }) };
  }
};
