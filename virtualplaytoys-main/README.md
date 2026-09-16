# VirtualPlayToys — site files

An 18+ directory of virtual lewdtubers & private escorts, deployed as
static pages + Netlify serverless functions, with GitHub as the data
store.

**Business model:** the site is advertising only. Performers pay for
their listings; the site takes no cut of any session. Customers contact
and pay performers directly using each performer's preferred contact
and payment method, with prices shown in the performer's local
currency.

## Files

- `index.html` — 18+ age-verification gate. Visitors land here first;
  entering sets a device-local flag (`localStorage`, never sent
  anywhere) and goes to the directory.
- `directory.html` — the public catalog: search, availability/tag
  filters, performer marquee, how-it-works and safety notes, and the
  admin toolbar (staged edits + one-click publish).
- `profile.html` — one page per performer, driven by `?id=`
  (e.g. `profile.html?id=10`). Shows bio, tags, portfolio galleries
  (click-to-zoom lightbox), session rates, offered/blocked services,
  online schedule, and contact/booking info. Workers edit their own
  listing here.
- `admin.html` — admin gate + full management panel: add/edit/delete
  profiles, set the ✓ Verified badge and contact info, manage rates /
  services / schedule / portfolio / bio blocks / bottom sections per
  performer, restore defaults, and issue worker login keys (🔑 on each
  card).
- `assets/site.css` — the shared design system (dark charcoal theme,
  magenta/violet accents, buttons, forms, cards, modals, toasts).
- `assets/ui.js` — shared helpers: toasts (`showToast`), async confirm
  dialog (`confirmDialog`), lightbox, `escapeHtml` (all user-entered
  content is rendered through it), placeholder images, image resizing.
- `members-data.js` — data helpers shared by all pages: `loadMembers()`
  (prefers the local admin draft if one exists), `publishMembers()`
  (commits to GitHub via the serverless function).
- `members-data.json` — the live, shared data. Overwritten automatically
  when an admin publishes or a worker saves; don't hand-edit after
  initial setup.
- `members-data.defaults.json` — untouched baseline, used only by
  "Restore defaults".
- `worker-secrets.json` — workers' TOTP keys. **Server-side only**:
  read by the functions, blocked from public download by `netlify.toml`.
- `netlify/functions/`
  - `publish-members.js` — admin publish: verifies the admin TOTP code
    server-side and commits the full member list.
  - `publish-worker-edit.js` — worker login + self-edit (see below).
  - `save-worker-secret.js` — admin-only; generates a worker's TOTP key
    and stores it in `worker-secrets.json`. The key is shown once to the
    admin, who hands it to the worker for their authenticator app.
- `netlify.toml` — functions folder + forced 404 for
  `/worker-secrets.json`.

## Logins

- **Admin** — a 6-digit TOTP code from an authenticator app. The check
  runs in the browser (a deterrent, not real security — the secret is in
  `admin.html`'s and `directory.html`'s source) but publishing re-checks
  the code server-side.
- **Workers** — each worker gets their own secret key (never public)
  for their authenticator app. Logging in exchanges a code for a signed,
  expiring **session token** (12 h, sliding — refreshed on every
  request) kept in `localStorage`, so the login survives reloads and
  works across pages. Workers can open the full editor on their own
  profile; the "Edit my profile" button only appears for the profile's
  owner. Code logins are rate-limited (10 attempts / 10 min / IP).
- **What workers can edit** — everything on their own entry: name, role,
  gender, status, bio, tags, photo, contact, schedule, rates, services,
  portfolio, bio blocks, bottom sections. Only admins can add/remove
  profiles, set the Verified badge, or issue worker keys; nobody can
  change an entry's `id`.

## How publishing works (admin flow)

To save on GitHub API calls, admin edits are staged in the browser's
local storage and published in one commit:

1. Edits in `admin.html` (or the directory toolbar's quick
   add/remove/toggle) stage locally — no API calls.
2. The directory's admin toolbar shows a **Commit changes** button
   whenever anything is staged. Clicking it sends everything in a
   **single request/commit**, then clears the staging area.
3. The function verifies the admin TOTP code and commits;
   Netlify redeploys automatically (usually under a minute).

Worker saves skip staging — they commit immediately.

Staged edits are local to one browser/device. Since the admin secret is
embedded in client pages, anyone reading the source could compute a
valid code; move the check fully server-side (and require a manually
typed code for publish) if that matters for your deployment.

## Deploying to Netlify (GitHub as source)

1. Push everything — including `netlify/functions/` and `assets/` — to
   the repo root.
2. Netlify → **Add new site → Import an existing project**. Leave the
   build command blank, publish directory `/`.
3. Environment variables (Site settings → Environment variables):
   - `GITHUB_TOKEN` — fine-grained PAT, this repo only, Contents: read/write
   - `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` (usually `main`)
   - `GITHUB_FILE_PATH` — `members-data.json`
   - `ADMIN_TOTP_SECRET` — the same base32 secret as in `admin.html` /
     `directory.html`
   - `WORKER_SECRETS_PATH` — `worker-secrets.json` (optional; default)
   - `WORKER_SESSION_SECRET` — optional long random string used to sign
     worker session tokens. If unset the signing key is derived from
     `GITHUB_TOKEN`, so rotating that token logs all workers out.
4. Redeploy so the functions pick up the variables.

## Before you go live

- **Age gate "Leave" link** — `index.html`, search `LEAVE_URL`.
- **Admin secret** — replace `ADMIN_TOTP_SECRET` in *both* `admin.html`
  and `directory.html` with your own random base32 string, set the same
  value as the Netlify env var, and add it to your authenticator app.
  (The old build printed this secret in the admin footer — it no longer
  does.)
- **Worker-secrets visibility** — keep `worker-secrets.json` out of any
  other host/CDN config; Netlify blocks it via `netlify.toml`.
- **Data model note** — profiles support: `id, name, role, gender,
  status, bio, tags[], image, verified, contacts[{platform,username}],
  links[{label,url}], availability{timezone,days[],start,end,note},
  schedule, rates[{label,amount}], services{offered[],blocked[]},
  portfolio[{id,title,images[]}], extraBio[{id,title,text}],
  bottomSections[{id,title,image,text}], updatedAt`. The functions
  validate every worker-submitted field's shape and reject bad saves
  before writing.
- **Availability & timezones** — a worker enters their online hours
  once, in their own timezone (`availability`: IANA zone, day chips,
  start/end). Profile pages convert it live to each visitor's local
  timezone (see `convertAvailability` in `assets/ui.js`), show both
  versions plus "it's HH:MM there right now", and live clocks use
  each zone's current DST offset. The free-text `schedule` field is
  still available alongside it.

## Deploying to GitHub / Netlify

Upload (or commit) the whole folder — the site is static plus three
serverless functions. Checklist:

1. All 4 HTML files, `assets/ui.js`, `assets/site.css`, and
   `members-data.js` — the `?v=N` query strings in the HTML must match
   the newest asset versions (bump `?v=` when changing ui.js/site.css so
   visitors' browsers drop their cached copy).
2. `netlify/functions/*.js` — worker login and saving break on the live
   site if these are stale.
3. `members-data.json` — the live roster (includes worker uploads).
4. `worker-secrets.json` must exist in the repo (functions read it via
   the GitHub API); the netlify.toml redirect keeps it from being
   downloadable from the site itself.
5. After uploading, hard-refresh once (Ctrl+F5) on your own browser.

Env vars required on Netlify (Site settings → Environment variables):
GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH (optional,
defaults to main), GITHUB_FILE_PATH (defaults to members-data.json),
ADMIN_TOTP_SECRET, WORKER_SECRETS_PATH (defaults to
worker-secrets.json), WORKER_SESSION_SECRET (optional but recommended).
