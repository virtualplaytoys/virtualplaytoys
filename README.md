# Prism Collective — site files

## Files
- `index.html` — the 18+ age-verification gate. This is what visitors
  land on first, and what GitHub Pages/Netlify will serve automatically
  at your site's root URL.
- `directory-template.html` — the public catalog page (search, photo
  scroller, member cards). Reached after clicking through the age gate.
- `profile.html` — individual artist profile pages. One page handles
  everyone: it reads `?id=` from the URL (e.g. `profile.html?id=3`)
  and pulls that person's portfolio, bio, and bottom sections from the
  shared data. You don't create a new file per artist.
- `admin.html` — the admin login + management panel: add/edit/delete
  profiles, restore defaults, and manage each artist's profile-page
  content (portfolio projects, extra bio blocks, bottom sections) via
  the 🖼 button on each card. Every change here is published for
  everyone, not just saved to your own browser.
- `members-data.js` — shared helpers used by all three HTML pages:
  `loadMembers()` fetches the live data, `publishMembers()` sends
  changes to the serverless function below.
- `members-data.json` — the live, shared data everyone's page reads.
  This file gets overwritten automatically when an admin publishes a
  change — you shouldn't need to hand-edit it after initial setup.
- `members-data.defaults.json` — an untouched baseline copy, only used
  by "Restore defaults" in the admin panel. Publishing never modifies
  this file.
- `netlify/functions/publish-members.js` — the serverless function that
  actually commits updates to `members-data.json` in your GitHub repo.
  This is the only place a GitHub write token exists, and it never
  reaches the browser.
- `netlify.toml` — tells Netlify where to find the functions folder.

**Keep all files in the same folder/repo root, preserving the
`netlify/functions/` subfolder.** The HTML pages link to each other by
filename, so moving one into a different subfolder will break those
links.

## How publishing works now
Previously, admin changes only saved to your own browser's local
storage — nobody else could see them. Now, clicking "Commit changes" /
"Save profile" / "Save content" / "Restore defaults" in the admin
panel calls a Netlify serverless function, which:
1. Checks your current 6-digit authenticator code — for real, on the
   server this time, using a secret that never ships to the browser.
2. If valid, commits the updated data straight to `members-data.json`
   in your GitHub repo.
3. Netlify sees the new commit and automatically redeploys — usually
   well under a minute — after which everyone's page shows the update.

You'll be asked for a fresh code at each publish action. That's by
design: each one is a real commit to your repository, not a quick
local save.

## Deploying to Netlify (with GitHub as the source repo)
1. Push everything in this folder — including the `netlify/` subfolder
   — to a GitHub repo (root of the repo, not a subfolder).
2. In Netlify, click **Add new site → Import an existing project**,
   then **Deploy with GitHub** and pick that repo.
3. Build settings: leave **Build command** blank and set **Publish
   directory** to `/` (the repo root). Netlify will detect
   `netlify.toml` and pick up the function automatically.
4. **Before or right after your first deploy**, add these environment
   variables in Netlify (Site settings → Environment variables):
   - `GITHUB_TOKEN` — a GitHub Personal Access Token with write access
     to this repo's contents. (Fine-grained token scoped to just this
     repo, with Contents: Read and write, is the safest option.)
   - `GITHUB_OWNER` — your GitHub username or org, e.g. `yourname`
   - `GITHUB_REPO` — this repo's name
   - `GITHUB_BRANCH` — the branch to commit to, usually `main`
   - `GITHUB_FILE_PATH` — `members-data.json`
   - `ADMIN_TOTP_SECRET` — the exact same value you set as
     `ADMIN_TOTP_SECRET` inside `admin.html` (see below), so the codes
     from your authenticator app work for both the page login and the
     server-side publish check.
5. Redeploy (or trigger a deploy) after adding the environment
   variables so the function picks them up.
6. Any time someone publishes through the admin panel, or you push new
   commits yourself, Netlify redeploys automatically.

## Before you go live — things to change
- **Age gate "Leave" link** — in `index.html`, search for `LEAVE_URL`
  and point it wherever you actually want people to go if they decline.
- **Admin login secret** — in `admin.html`, search for
  `ADMIN_TOTP_SECRET` and replace the placeholder value with your own
  random base32 string. Set the *same* value as the `ADMIN_TOTP_SECRET`
  environment variable in Netlify (step 4 above), then scan/enter it
  into Google Authenticator (or any TOTP app) using the manual-entry
  key shown on the admin login screen. Do this before relying on the
  admin panel for anything real — the placeholder secret is the same
  one shown to you in the conversation that built this.
- **Starting member data** — edit `members-data.json` (and
  `members-data.defaults.json`, if you want "Restore defaults" to match)
  directly before your first deploy, or just add people through the
  admin panel once it's live.
- **GitHub token scope** — use a fine-grained token limited to just
  this one repo, not a classic token with broad account access. If it
  ever leaks, the damage is contained to this repo.

## Good to know / limitations
- **Publishing needs the Netlify environment variables set up** (see
  above) to actually work. Until then, "Commit changes" etc. will fail
  with an error explaining what's missing.
- **The page login (entering a code to see the admin panel at all)
  is still a convenience gate, not real security** — that check runs
  in the browser, so it stops casual visitors but not someone who
  reads the page source. The *actual* protection now lives in the
  publish step, which is verified server-side and can't be bypassed by
  reading `admin.html`'s source.
- **Everyone shares one dataset now.** There's no more per-browser
  local copy — `members-data.json` in your repo is the single source
  of truth for all visitors.
- **Rate limits / commit history** — every publish is a real GitHub
  commit. That's normal and fine for occasional admin edits; it's not
  meant for extremely high-frequency automated writes.
