// =====================================================================
// SHARED DATA HELPERS — used by directory-template.html, admin.html,
// and profile.html.
// -----------------------------------------------------------------
// The real, shared-with-everyone data lives in members-data.json in
// this same repo. loadMembers() fetches it fresh every time (with a
// cache-busting query param so a browser cache can't show stale data
// right after a publish).
//
// publishMembers() is how admin.html writes changes back: it calls a
// Netlify serverless function (netlify/functions/publish-members.js),
// which verifies your authenticator code SERVER-SIDE (the actual
// secret never ships to the browser for this step) and, if valid,
// commits the updated members-data.json straight to your GitHub repo.
// Netlify then redeploys automatically, and everyone's next page load
// sees the change — usually within well under a minute.
//
// DEFAULT_MEMBERS below is only a last-resort fallback, used if the
// fetch fails (e.g. you open these files directly from disk instead
// of through a real web server, where fetching a local JSON file
// doesn't work). On a real deployment this fallback should never be
// needed.
// =====================================================================
const DEFAULT_MEMBERS = [
  { id:1, name:"Vesper Kaida", role:"Character Artist", gender:"She/her", tags:["cyberpunk","original"], bio:"Builds neon-lit street-style avatars with a focus on modular armor pieces and animated visor UI.", status:"available", image:"", portfolio:[], extraBio:[], bottomSections:[] }
];

async function loadMembers(){
  try{
    const res = await fetch(`members-data.json?t=${Date.now()}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }catch(e){
    console.warn('Could not fetch members-data.json, using built-in fallback.', e);
    return JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
  }
}

// Publishes a full replacement of the member list to everyone, by
// committing it to GitHub through the serverless function. Requires
// the current 6-digit authenticator code, which is checked again on
// the server — a stale or wrong code is rejected there even if the
// browser's own login check already passed.
async function publishMembers(members, code){
  const res = await fetch('/.netlify/functions/publish-members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, members })
  });

  let body;
  try{ body = await res.json(); }catch(e){ body = {}; }

  if(!res.ok){
    throw new Error(body.error || `Publish failed (HTTP ${res.status})`);
  }
  return body;
}
