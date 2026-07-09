// =====================================================================
// DEFAULT MEMBER DATA — shared by directory-template.html (public
// catalog) and admin.html (admin panel). Both pages load this file.
// -----------------------------------------------------------------
// This is only the STARTING data set, used the very first time either
// page runs (before anything has been saved). Once you add, edit, or
// delete a profile from admin.html, the working copy lives in the
// browser's local storage instead, and this file is only read again
// if you click "Restore defaults" in the admin panel.
//
// FIELD GUIDE:
//   id       -> unique number, auto-assigned for new profiles
//   name     -> display name shown on the card
//   role     -> short label under the name (e.g. "Character Artist")
//   gender   -> free-text field (e.g. "She/her")
//   tags     -> array of lowercase words
//   bio      -> 1-2 sentence description
//   status   -> "available" or "unavailable"
//   link     -> where clicking the card/scroller image goes ("#" = none yet)
//   image    -> data URL or external URL for their picture. Leave
//               empty/omit to use an auto-generated placeholder.
// =====================================================================
const DEFAULT_MEMBERS = [
  { id:1, name:"Vesper Kaida", role:"Character Artist", gender:"She/her", tags:["cyberpunk","original"], bio:"Builds neon-lit street-style avatars with a focus on modular armor pieces and animated visor UI.", status:"available", link:"#", image:"" },
  { id:2, name:"Rin Solace", role:"Rigger & Animator", gender:"They/them", tags:["fantasy","creature"], bio:"Specializes in expressive custom face rigs for creature and hybrid-form avatars.", status:"available", link:"#", image:"" },
  { id:3, name:"Onyx Marrow", role:"3D Sculptor", gender:"He/him", tags:["gothic","original"], bio:"Dark academia-inspired designs with hand-sculpted fabric physics and candlelit textures.", status:"unavailable", link:"#", image:"" },
  { id:4, name:"Fable Ashgrove", role:"Texture Artist", gender:"She/her", tags:["cottagecore","nature"], bio:"Painterly hand-drawn textures for woodland and botanical-themed avatars.", status:"available", link:"#", image:"" },
  { id:5, name:"Juno Vellichor", role:"Concept Designer", gender:"They/them", tags:["mecha","scifi"], bio:"Hard-surface mecha shells with functioning panel lights and thruster VFX.", status:"unavailable", link:"#", image:"" },
  { id:6, name:"Wren Isolde", role:"Character Artist", gender:"She/her", tags:["kemono","fantasy"], bio:"Soft-shaded kemono avatars with custom tail and ear physics setups.", status:"available", link:"#", image:"" },
  { id:7, name:"Halcyon Vane", role:"World & Prop Artist", gender:"He/him", tags:["scifi","original"], bio:"Builds companion props and interactive gadgets that pair with any avatar base.", status:"available", link:"#", image:"" },
  { id:8, name:"Marlow Petra", role:"Sculptor", gender:"He/him", tags:["gothic","creature"], bio:"Baroque-inspired horned and winged forms with intricate metal filigree.", status:"unavailable", link:"#", image:"" }
];

// ---------------------------------------------------------
// Shared persistence helpers (local storage) — browser-only, no
// server. Data lives only in the browser it was saved in.
// ---------------------------------------------------------
const MEMBERS_STORAGE_KEY = 'prism_members_v1';

function loadMembers(){
  try{
    const raw = localStorage.getItem(MEMBERS_STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn('Could not read saved members, using defaults.', e); }
  return JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
}

function saveMembers(members){
  localStorage.setItem(MEMBERS_STORAGE_KEY, JSON.stringify(members));
}
