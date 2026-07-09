# Prism Collective — site files

## Files
- `index.html` — the 18+ age-verification gate. This is what visitors
  land on first, and what GitHub Pages will serve automatically at
  your repo's root URL.
- `directory-template.html` — the public catalog page (search, photo
  scroller, member cards). Reached after clicking through the age gate.
- `admin.html` — the admin login + management panel (add/edit/delete
  profiles, restore defaults).
- `members-data.js` — shared default profile data + local-storage
  load/save helpers, used by both `directory-template.html` and
  `admin.html`.

**Keep all four files in the same folder/repo root.** They link to
each other by filename (`index.html` → `directory-template.html` →
`admin.html`, etc.), so moving one into a subfolder will break those
links.

## Deploying to GitHub Pages
1. Create a new GitHub repo (or use an existing one) and push these
   four files to it.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a
   branch**, pick your branch (usually `main`) and the `/ (root)`
   folder, then save.
4. GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/` — that's your
   live site, starting at the age gate.

Changes usually go live within a minute or two of pushing to the
branch GitHub Pages is watching.

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
