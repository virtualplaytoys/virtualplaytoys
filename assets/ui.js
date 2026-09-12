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
