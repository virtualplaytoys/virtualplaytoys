// =====================================================================
// SHARED DATA HELPERS — used by directory.html, profile.html, and
// admin.html.
// -----------------------------------------------------------------
// Two layers of data:
//   1. LIVE DATA (members-data.json) — what everyone sees. Only
//      changes when an admin publishes.
//   2. LOCAL DRAFT (localStorage) — admin edits are staged here until
//      published, so several edits cost zero GitHub API calls.
//
// loadMembers() prefers the local draft, so admin.html and
// directory.html show in-progress edits consistently in the same
// browser. publishMembers() commits the whole list in one request;
// clearDraft() runs after a successful publish.
//
// Workers do NOT go through this draft system — their saves are
// committed immediately via publish-worker-edit.
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

// Stages a change locally — does NOT publish or use an API call.
function saveDraft(members){
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(members));
}

function hasDraft(){
  return localStorage.getItem(DRAFT_STORAGE_KEY) !== null;
}

// Called after a successful publish so future loads fetch the live
// file again instead of the now-stale staged copy.
function clearDraft(){
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

// Publishes a full replacement of the member list to everyone, by
// committing it to GitHub through the serverless function. Requires
// the current 6-digit admin code, which is re-checked server-side.
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
