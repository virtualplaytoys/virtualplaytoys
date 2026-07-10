// =====================================================================
// SHARED DATA HELPERS — used by directory-template.html, admin.html,
// and profile.html.
// -----------------------------------------------------------------
// Two layers of data:
//
// 1. LIVE DATA (members-data.json in this repo) — what everyone sees.
//    Only changes when someone actually publishes.
//
// 2. LOCAL DRAFT (this browser's local storage) — edits made in
//    admin.html (add/edit/delete a profile, manage portfolio content,
//    restore defaults) are staged here instead of published
//    immediately. This means admin edits don't use up a GitHub API
//    call/commit until you're actually ready.
//
// loadMembers() prefers the local draft if one exists, so both
// admin.html and directory-template.html show your in-progress edits
// consistently, on this browser. Once you click "Commit changes" on
// the public page's admin toolbar, everything staged gets published
// in ONE commit, and the draft is cleared (so the next load goes back
// to fetching the now-updated live file).
//
// Since the draft lives in local storage, it's specific to this one
// browser/device — editing from your phone and your laptop won't
// share a draft between them until one of them publishes.
// =====================================================================
const DRAFT_STORAGE_KEY = 'prism_members_draft_v1';

const DEFAULT_MEMBERS = [
  { id:1, name:"Vesper Kaida", role:"Character Artist", gender:"She/her", tags:["cyberpunk","original"], bio:"Builds neon-lit street-style avatars with a focus on modular armor pieces and animated visor UI.", status:"available", image:"", portfolio:[], extraBio:[], bottomSections:[] }
];

async function loadMembers(){
  try{
    const draft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if(draft) return JSON.parse(draft);
  }catch(e){
    console.warn('Could not read local draft, falling back to live data.', e);
  }

  try{
    const res = await fetch(`members-data.json?t=${Date.now()}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }catch(e){
    console.warn('Could not fetch members-data.json, using built-in fallback.', e);
    return JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
  }
}

// Stages a change locally — does NOT publish or use up an API call.
function saveDraft(members){
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(members));
}

function hasDraft(){
  return localStorage.getItem(DRAFT_STORAGE_KEY) !== null;
}

// Called after a successful publish, so future page loads go back to
// fetching the live file (which now matches what was just published)
// instead of continuing to read the old staged copy.
function clearDraft(){
  localStorage.removeItem(DRAFT_STORAGE_KEY);
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
