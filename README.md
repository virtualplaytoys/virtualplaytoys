# Prism Collective — site files

## Files
- `index.html` — the 18+ age-verification gate. This is what visitors
  land on first, and what GitHub Pages will serve automatically at
  your repo's root URL.
- `directory-template.html` — the public catalog page (search, photo
  scroller, member cards). Reached after clicking through the age gate.
- `profile.html` — individual artist profile pages. One page handles
  everyone: it reads `?id=` from the URL (e.g. `profile.html?id=3`)
  and pulls that person's portfolio, bio, and bottom sections from the
  shared data. You don't create a new file per artist.
- `admin.html` — the admin login + management panel: add/edit/delete
  profiles, restore defaults, and manage each artist's profile-page
  content (portfolio projects, extra bio blocks, bottom sections) via
  the 🖼 button on each card.
- `members-data.js` — shared default profile data + local-storage
  load/save helpers, used by all three HTML pages.

**Keep all files in the same folder/repo root.** They link to each
other by filename, so moving one into a subfolder will break those
links.

## Deploying to Netlify (with GitHub as the source repo)
1. Push these four files to a GitHub repo (root of the repo, not a
   subfolder).
2. In Netlify, click **Add new site → Import an existing project**,
   then **Deploy with GitHub** and pick that repo.
3. Build settings: leave **Build command** blank and set **Publish
   directory** to `/` (the repo root) — there's no build step, these
   are plain static files.
4. Click **Deploy site**. Netlify gives you a live URL (something like
   `random-name-123.netlify.app`) within a few seconds, starting at the
   age gate (`index.html`).
5. Any time you push new commits to the connected branch, Netlify
   redeploys automatically.

If you'd rather not connect a repo, you can also drag-and-drop the
unzipped folder straight onto Netlify's dashboard for a one-off deploy
— but connecting GitHub means every future push updates the live site
automatically.

## Before you go live — things to change
- **Age gate "Leave" link** — in `index.html`, search for `LEAVE_URL`
  and point it wherever you actually want people to go if they decline.
- **Admin login secret** — in `admin.html`, search for
  `ADMIN_TOTP_SECRET` and replace the placeholder value with your own
  random base32 string, then set that up in Google Authenticator (or
  any TOTP app) using the manual-entry key shown in that page's footer
  ("build ..."). Do this before you rely on the admin panel for
  anything, since the placeholder secret is the same one shown to you
  in this conversation.
- **Member data** — either edit the `DEFAULT_MEMBERS` array directly in
  `members-data.js`, or log into `admin.html` after deploying and add
  people through the UI.

## Good to know / limitations
- **No real backend.** All of this runs entirely in the visitor's
  browser. There's no server, no database, and no real user accounts.
- **Admin login is a deterrent, not real security.** The TOTP secret
  lives in this file's source, so it stops casual visitors but not
  anyone who actually reads the code.
- **Data is per-browser.** Profile edits are saved to that visitor's
  own browser (local storage), not to a shared database. If you add
  profiles from your laptop, people visiting on their own phone/laptop
  won't see those changes — only you will, on that same browser. If
  you want the catalog to show the same data to everyone regardless of
  device, that needs a real backend/database, which is a bigger step
  up from this static-file setup.
