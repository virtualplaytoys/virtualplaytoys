// =====================================================================
// DEFAULT MEMBER DATA — shared by directory-template.html (public
// catalog), admin.html (admin panel), and profile.html (individual
// artist pages). All three pages load this file.
// -----------------------------------------------------------------
// This is only the STARTING data set, used the very first time any
// page runs (before anything has been saved). Once you add, edit, or
// delete something from admin.html, the working copy lives in the
// browser's local storage instead, and this file is only read again
// if you click "Restore defaults" in the admin panel.
//
// FIELD GUIDE:
//   id             -> unique number, auto-assigned for new profiles
//   name           -> display name
//   role           -> short label under the name (e.g. "Character Artist")
//   gender         -> free-text field (e.g. "She/her")
//   tags           -> array of lowercase words
//   bio            -> main bio paragraph, shown on the card and profile page
//   status         -> "available" or "unavailable"
//   image          -> data URL or external URL for their card picture.
//                      Leave empty to use an auto-generated placeholder.
//
//   portfolio      -> array of projects shown on the LEFT side of their
//                      profile page: [{ id, title, images: [url, ...] }]
//                      2 or fewer projects show open by default; 3+ and
//                      each title becomes a click-to-expand dropdown.
//   extraBio       -> array of extra text blocks shown on the RIGHT side,
//                      under the main bio: [{ id, title, text }]
//   bottomSections -> array of full-width blocks at the BOTTOM of the
//                      page (a watermark image, extra dropdowns, etc.):
//                      [{ id, title, image, text }] — image and text
//                      are both optional, use whichever a section needs.
// =====================================================================
const DEFAULT_MEMBERS = [
  {
    id:1, name:"Vesper Kaida", role:"Character Artist", gender:"She/her",
    tags:["cyberpunk","original"],
    bio:"Builds neon-lit street-style avatars with a focus on modular armor pieces and animated visor UI.",
    status:"available", image:"",
    portfolio:[
      { id:1, title:"Neon Courier — full avatar", images:[] },
      { id:2, title:"Modular visor rig breakdown", images:[] },
      { id:3, title:"Street-style texture pass", images:[] }
    ],
    extraBio:[
      { id:1, title:"Commission info", text:"Full avatar commissions take 3-5 weeks. Rigging-only or texture-only passes available separately." }
    ],
    bottomSections:[]
  },
  {
    id:2, name:"Rin Solace", role:"Rigger & Animator", gender:"They/them",
    tags:["fantasy","creature"],
    bio:"Specializes in expressive custom face rigs for creature and hybrid-form avatars.",
    status:"available", image:"",
    portfolio:[
      { id:1, title:"Creature face rig demo", images:[] },
      { id:2, title:"Hybrid-form blend shapes", images:[] }
    ],
    extraBio:[], bottomSections:[]
  },
  { id:3, name:"Onyx Marrow", role:"3D Sculptor", gender:"He/him", tags:["gothic","original"], bio:"Dark academia-inspired designs with hand-sculpted fabric physics and candlelit textures.", status:"unavailable", image:"", portfolio:[], extraBio:[], bottomSections:[] },
  { id:4, name:"Fable Ashgrove", role:"Texture Artist", gender:"She/her", tags:["cottagecore","nature"], bio:"Painterly hand-drawn textures for woodland and botanical-themed avatars.", status:"available", image:"", portfolio:[], extraBio:[], bottomSections:[] },
  { id:5, name:"Juno Vellichor", role:"Concept Designer", gender:"They/them", tags:["mecha","scifi"], bio:"Hard-surface mecha shells with functioning panel lights and thruster VFX.", status:"unavailable", image:"", portfolio:[], extraBio:[], bottomSections:[] },
  { id:6, name:"Wren Isolde", role:"Character Artist", gender:"She/her", tags:["kemono","fantasy"], bio:"Soft-shaded kemono avatars with custom tail and ear physics setups.", status:"available", image:"", portfolio:[], extraBio:[], bottomSections:[] },
  { id:7, name:"Halcyon Vane", role:"World & Prop Artist", gender:"He/him", tags:["scifi","original"], bio:"Builds companion props and interactive gadgets that pair with any avatar base.", status:"available", image:"", portfolio:[], extraBio:[], bottomSections:[] },
  { id:8, name:"Marlow Petra", role:"Sculptor", gender:"He/him", tags:["gothic","creature"], bio:"Baroque-inspired horned and winged forms with intricate metal filigree.", status:"unavailable", image:"", portfolio:[], extraBio:[], bottomSections:[] }
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
