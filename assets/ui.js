/* =====================================================================
   VirtualPlayToys — shared UI helpers (loaded on every page)
   -----------------------------------------------------------------
   - showToast / confirmDialog : replace alert() and confirm()
   - lightbox                  : click-to-zoom for portfolio images
   - escapeHtml                : XSS guard for user-entered text
   - placeholderImg            : shared placeholder generator
   - profileUrl                : canonical profile link builder
   ===================================================================== */

/* ---------- Toasts (replacement for alert) ---------- */
function ensureToastRoot(){
  let root = document.getElementById('toastRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'toastRoot';
    document.body.appendChild(root);
  }
  return root;
}

function showToast(message, kind){
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, kind === 'err' ? 5200 : 3400);
}

/* ---------- Confirm dialog (replacement for confirm) ----------
   Returns a Promise<boolean>. Usage:
     if(await confirmDialog('Delete this?')) { ... }
----------------------------------------------------------------- */
function confirmDialog(message, confirmLabel = 'Confirm'){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.style.zIndex = '500';
    overlay.innerHTML = `
      <div class="box modal-box confirm-box">
        <h2>Are you sure?</h2>
        <p></p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-c-cancel>Cancel</button>
          <button type="button" class="btn danger" data-c-ok></button>
        </div>
      </div>`;
    overlay.querySelector('p').textContent = message;
    overlay.querySelector('[data-c-ok]').textContent = confirmLabel;
    const done = val => { overlay.remove(); resolve(val); };
    overlay.querySelector('[data-c-ok]').addEventListener('click', () => done(true));
    overlay.querySelector('[data-c-cancel]').addEventListener('click', () => done(false));
    overlay.addEventListener('click', e => { if(e.target === overlay) done(false); });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-c-ok]').focus();
  });
}

/* ---------- Lightbox ---------- */
function ensureLightbox(){
  let lb = document.getElementById('vptLightbox');
  if(!lb){
    lb = document.createElement('div');
    lb.id = 'vptLightbox';
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt="Enlarged view" />';
    lb.addEventListener('click', () => lb.classList.remove('open'));
    document.addEventListener('keydown', e => { if(e.key === 'Escape') lb.classList.remove('open'); });
    document.body.appendChild(lb);
  }
  return lb;
}

function openLightbox(src){
  const lb = ensureLightbox();
  lb.querySelector('img').src = src;
  lb.classList.add('open');
}

// Delegate: any element with [data-lightbox-src] (or a plain <img>)
// inside [data-lightbox] opens the lightbox on click.
function wireLightboxes(scope = document){
  scope.querySelectorAll('[data-lightbox]').forEach(container => {
    if(container.dataset.lbWired) return;
    container.dataset.lbWired = '1';
    container.addEventListener('click', e => {
      const img = e.target.closest('img');
      if(!img) return;
      const src = img.getAttribute('data-lightbox-src') || img.src;
      if(src){ e.preventDefault(); e.stopPropagation(); openLightbox(src); }
    });
  });
}

/* ---------- Escaping ---------- */
function escapeHtml(s){
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Placeholders & links ---------- */
const PLACEHOLDER_COLORS = ['d0203a','ff4f6a','e8b84f','4fc3e8','7a5cff','ff9f4f'];
function placeholderImg(seed, label, w = 220, h = 220){
  const color = PLACEHOLDER_COLORS[seed % PLACEHOLDER_COLORS.length];
  return `https://placehold.co/${w}x${h}/${color}/0f0a0b?text=${encodeURIComponent(label)}`;
}

function profileUrl(id){
  return `profile.html?id=${id}`;
}

// =====================================================================
// AVAILABILITY / TIMEZONE HELPERS
// ---------------------------------------------------------------------
// A worker states their online hours once, in THEIR timezone. These
// helpers convert that window into the visitor's local timezone so
// nobody does GMT math in their head.
//
// availability = { timezone:"Pacific/Auckland", days:["Tue","Wed"],
//                  start:"20:00", end:"23:00", note:"usually on later Fri" }
// =====================================================================

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Curated IANA list for the editors' suggestion datalist (any valid
// IANA zone can still be typed — validation happens against Intl).
const COMMON_TIMEZONES = [
  'UTC','Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
  'America/Phoenix','America/Chicago','America/Mexico_City','America/New_York','America/Toronto',
  'America/Bogota','America/Sao_Paulo','America/Argentina/Buenos_Aires','Europe/London','Europe/Dublin',
  'Europe/Lisbon','Europe/Madrid','Europe/Paris','Europe/Berlin','Europe/Amsterdam',
  'Europe/Rome','Europe/Warsaw','Europe/Stockholm','Europe/Athens','Europe/Helsinki',
  'Europe/Kyiv','Europe/Istanbul','Europe/Moscow','Africa/Cairo','Africa/Lagos',
  'Africa/Johannesburg','Asia/Dubai','Asia/Tehran','Asia/Karachi','Asia/Kolkata',
  'Asia/Bangkok','Asia/Jakarta','Asia/Singapore','Asia/Hong_Kong','Asia/Shanghai',
  'Asia/Taipei','Asia/Manila','Asia/Tokyo','Asia/Seoul','Australia/Perth',
  'Australia/Adelaide','Australia/Brisbane','Australia/Melbourne','Australia/Sydney','Pacific/Auckland',
  'Pacific/Fiji'
];

// The visitor's own zone, e.g. "Europe/London".
function guessTimeZone(){
  try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch(e){ return 'UTC'; }
}

// True if the string is a zone Intl understands.
function isValidTimeZone(tz){
  try{ new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch(e){ return false; }
}

// "Pacific/Auckland" → "Auckland (GMT+12)" — offset is that zone's
// CURRENT one (daylight saving included), computed live.
function timezoneLabel(tz){
  if(!isValidTimeZone(tz)) return tz || '';
  try{
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const off = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT';
    const city = String(tz).split('/').pop().replace(/_/g, ' ');
    return `${city} (${off.replace('GMT', 'UTC')})`;
  }catch(e){ return tz; }
}

// "20:30" → { h:20, m:30 }, or null if unparseable.
function parseHm(s){
  const mt = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s || ''));
  if(!mt) return null;
  const h = Number(mt[1]), m = Number(mt[2]);
  if(h > 24 || m > 59) return null;
  return { h, m };
}

// Minutes-since-midnight → "8:30 PM" (guest-friendly 12h format).
function fmtHm(min){
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${ampm}`;
}

// ["Tue","Wed","Fri"] → "Tue, Wed & Fri"
function fmtDayList(days){
  if(!Array.isArray(days) || !days.length) return '';
  if(days.length === 1) return days[0];
  return days.slice(0, -1).join(', ') + ' & ' + days[days.length - 1];
}

// Current wall time in a zone, e.g. "8:42 PM".
function timeInZone(tz){
  if(!isValidTimeZone(tz)) return '';
  try{
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date());
  }catch(e){ return ''; }
}

// Map whatever the editor produced ("tue", "Tuesday", …) → day index.
function dayIndex(d){
  const s = String(d || '').trim().toLowerCase().slice(0, 3);
  return DAY_NAMES.findIndex(x => x.toLowerCase() === s);
}

// Core conversion. Given a worker's window in their zone, return the
// SAME recurring window expressed in the VISITOR's zone:
//   { days:['Tue'], start:'3:00 AM', end:'6:00 AM', workerDays:[...],
//     workerStart:'8:00 PM', workerEnd:'11:00 PM', tz:'Europe/London' }
// Days come out as short names ("Tue"); a window that crosses midnight
// in the guest zone gets its end day listed separately. Returns null
// when the availability data is unusable (bad zone/time) so callers
// can hide the block gracefully.
function convertAvailability(availability, guestTz){
  if(!availability || typeof availability !== 'object') return null;
  const fromTz = availability.timezone;
  const toTz = guestTz || guessTimeZone();
  const start = parseHm(availability.start);
  if(!start || !isValidTimeZone(fromTz) || !isValidTimeZone(toTz)) return null;
  const days = (Array.isArray(availability.days) ? availability.days : [])
    .map(dayIndex).filter(i => i >= 0);
  if(!days.length) return null;
  const end = parseHm(availability.end) || start;

  // Minutes of the week for the worker's start, expressed as if UTC.
  // Anchor week: the CURRENT week (so both zones' present offsets —
  // including southern-hemisphere DST — are what the conversion uses;
  // "usual weekly hours" should mean right-now offsets).
  const nowD = new Date();
  const weekAnchorMs = nowD.getTime() -
    (nowD.getUTCDay() * 1440 + nowD.getUTCHours() * 60 + nowD.getUTCMinutes()) * 60000;
  const utcStartMin = days[0] * 1440 + start.h * 60 + start.m;
  const durationMin = (((end.h * 60 + end.m) - (start.h * 60 + start.m)) + 1440) % 1440 || 1440;

  // Wall time `utcStartMin` produces in the worker's zone → the same
  // instant re-expressed in the guest zone → shift back to UTC minutes.
  function wallParts(minOfWeek, tz){
    const ms = weekAnchorMs + minOfWeek * 60000;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date(ms));
    const get = t => (parts.find(p => p.type === t) || {}).value || '';
    const wd = dayIndex(get('weekday'));
    let h = Number(get('hour')); if(h === 24) h = 0;
    return { day: wd, min: wd * 1440 + h * 60 + Number(get('minute')) };
  }

  const inWorker = wallParts(utcStartMin, fromTz);
  const inGuest = wallParts(utcStartMin, toTz);
  // Round the zone difference to whole minutes (zones are 15-min
  // quantized; rounding absorbs any formatting surprises).
  const shift = Math.round((inGuest.min - inWorker.min) / 15) * 15;

  // Every worker day shifts by the same offset, so convert each one:
  // guest window = worker day start + shift (mod one week).
  const guestWindows = days.map(i => {
    const s = ((i * 1440 + start.h * 60 + start.m + shift) % 10080 + 10080) % 10080;
    return { s, e: (s + durationMin) % 10080 };
  });

  // Unique guest days in week order — a window that crosses midnight
  // in the guest zone lists its end day too. Ordered starting from the
  // first window's day, so a wrap-around set reads "Sat & Sun", not
  // "Sun & Sat".
  const guestDaySet = new Set(guestWindows.flatMap(w => {
    const out = [Math.floor(w.s / 1440) % 7];
    const endIdx = Math.floor(w.e / 1440) % 7;
    if(!out.includes(endIdx)) out.push(endIdx);
    return out;
  }));
  const startDayIdx = Math.floor(guestWindows[0].s / 1440) % 7;
  const guestDayIdx = [];
  for(let k = 0; k < 7; k++){
    const idx = (startDayIdx + k) % 7;
    if(guestDaySet.has(idx)) guestDayIdx.push(idx);
  }

  const first = guestWindows[0];
  return {
    tz: toTz,
    start: fmtHm(first.s),
    end: fmtHm(first.e),
    days: guestDayIdx.map(i => DAY_NAMES[i]),
    workerDays: days.map(i => DAY_NAMES[i]),
    workerStart: fmtHm(days[0] * 1440 + start.h * 60 + start.m),
    workerEnd: fmtHm(days[0] * 1440 + end.h * 60 + end.m),
    workerTz: fromTz
  };
}

/* ---------- Image resize helper (shared by admin + worker editors) ---------- */
function resizeImageFile(file, maxDimension = 1200, quality = 0.82){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDimension || height > maxDimension){
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
