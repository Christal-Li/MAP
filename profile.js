/* Profile app logic — uses localStorage for persistence */

const DEFAULTS = {
  userId: 'guest',
  displayName: 'Guest',
  avatar: '', // will be set to fallback if empty
  // preferences remapped: walkerTime ("Morning"|"Evening"), dogSize ("Small"|"Large"), experience ("New walker"|"Experienced")
  prefs: { walkerTime: 'Morning', dogSize: 'Small', experience: 'New walker' },
  dogDetails: { name: '', breed: '', age: '', notes: '' },
  savedLocations: []
};

const LS_KEY = 'dfm_profile_v1';

/* ==== helpers ==== */
function readState(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return {...DEFAULTS};
    const parsed = JSON.parse(raw);
    return {...DEFAULTS, ...parsed};
  } catch (e) {
    console.error('read state', e);
    return {...DEFAULTS};
  }
}
function writeState(state){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/* ==== DOM refs ==== */
const headerAvatar = document.getElementById('headerAvatar');
const profileAvatar = document.getElementById('profileAvatar');
const avatarInput = document.getElementById('avatarInput');
const displayName = document.getElementById('displayName');
const displayId = document.getElementById('displayId');

const dogDetailsCard = document.getElementById('dogDetailsCard');
const savedLocationsCard = document.getElementById('savedLocationsCard');
const ratedLocationsCard = document.getElementById('ratedLocationsCard');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalSave = document.getElementById('modalSave');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');

const confirm = document.getElementById('confirm');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const confirmText = document.getElementById('confirmText');

let state = readState();
let editingContext = null; // { section: 'savedLocations', index: 0 } or for dogDetails { section: 'dogDetails' }

/* ==== init ==== */
const FALLBACK_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="100%" height="100%" fill="#e6e9ff"/><text x="50%" y="56%" text-anchor="middle" font-size="42" font-family="Arial" fill="#4f46e5">DOG</text></svg>`
);

function refreshUI(){
  state = readState();
  // avatar
  const avatarSrc = state.avatar || FALLBACK_AVATAR;
  headerAvatar.src = avatarSrc;
  profileAvatar.src = avatarSrc;

  // name/id
  displayName.textContent = state.displayName || 'Guest';
  displayId.textContent = '@' + (state.userId || 'guest');

  // prefs (map stored values to display labels)
  const WALKER_LABEL = { 'Morning': 'Morning walker', 'Evening': 'Evening walker' };
  const SIZE_LABEL = { 'Small': 'Small buddies', 'Large': 'Large buddies' };
  const EXP_LABEL = { 'New walker': 'New walker', 'Experienced': 'Experienced' };
  const walkerText = WALKER_LABEL[state.prefs.walkerTime] || WALKER_LABEL['Morning'];
  const sizeText = SIZE_LABEL[state.prefs.dogSize] || SIZE_LABEL['Small'];
  const expText = EXP_LABEL[state.prefs.experience] || EXP_LABEL['New walker'];
  document.getElementById('prefWalkerTime').textContent = walkerText;
  document.getElementById('prefDogSize').textContent = sizeText;
  document.getElementById('prefExperience').textContent = expText;

  // dog details
  renderDogDetails();

  // saved locations
  renderSavedLocations();

  // rated locations removed
}

function safeEmpty(v){ return v === undefined || v === null ? '' : v; }

/* ==== renderers ==== */
function renderDogDetails(){
  const d = state.dogDetails || {};
  dogDetailsCard.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <div>
        <div class="item-title">${safeEmpty(d.name) || '<span class="muted">No name</span>'}</div>
        <div class="item-sub">${d.breed ? d.breed : '<span class="muted">Breed not set</span>'}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="muted">Age</div>
        <div>${d.age || '-'}</div>
      </div>
    </div>
    <div style="margin-top:12px;color:var(--muted)">${d.notes ? d.notes : '<em>No notes yet</em>'}</div>
  `;
}

function renderSavedLocations(){
  savedLocationsCard.innerHTML = '';
  if(!state.savedLocations.length){
    savedLocationsCard.innerHTML = `<div class="muted">No saved locations yet. Click Add to create one.</div>`;
    return;
  }
  state.savedLocations.forEach((loc, idx) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
      <div class="item-left">
        <div>
          <div class="item-title">${loc.name}</div>
          <div class="item-sub">${loc.address}</div>
        </div>
      </div>
      <div class="list-actions">
        <button class="icon-btn" data-action="edit" data-section="savedLocations" data-index="${idx}" title="Edit">✎</button>
        <button class="icon-btn" data-action="delete" data-section="savedLocations" data-index="${idx}" title="Delete">🗑</button>
      </div>
    `;
    savedLocationsCard.appendChild(el);
  });
}

// rated locations feature removed

function renderStars(n){
  let s = '';
  for(let i=1;i<=5;i++){
    s += `<span class="star">${i<=n? '★' : '☆'}</span>`;
  }
  return s;
}

/* ==== modal helpers ==== */
function openModal(title, bodyHtml){
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  // focus first input if available
  const first = modalBody.querySelector('input,textarea,select,button');
  if(first) first.focus();
}
function closeModal(){
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  editingContext = null;
}

/* ==== confirm ==== */
let confirmResolve = null;
function openConfirm(text){
  confirmText.textContent = text || 'Are you sure?';
  confirm.classList.remove('hidden');
  confirm.setAttribute('aria-hidden','false');
  return new Promise(res => { confirmResolve = res; });
}
function closeConfirm(){
  confirm.classList.add('hidden');
  confirm.setAttribute('aria-hidden','true');
  if(confirmResolve) { confirmResolve(false); confirmResolve = null; }
}

/* ==== event wiring ==== */
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-action]');
  if(!a) return;
  const action = a.getAttribute('data-action');
  const section = a.getAttribute('data-section');
  const idx = a.getAttribute('data-index');
  if(action === 'edit'){
    if(section === 'dogDetails') openEditDog();
    else if(section === 'savedLocations') openEditLocation('savedLocations', parseInt(idx));
  } else if(action === 'add'){
    if(section === 'savedLocations') openEditLocation('savedLocations', null);
  } else if(action === 'delete'){
    if(section === 'savedLocations'){
      handleDelete(section, parseInt(idx));
    }
  }
});

/* topbar buttons */
document.getElementById('editIdBtn').addEventListener('click', () => {
  openEditId();
});
document.getElementById('openEditProfile').addEventListener('click', () => {
  openEditId();
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  // simple logout: reset state
  if(confirm('Logout will clear profile. Continue?')) {
    localStorage.removeItem(LS_KEY);
    state = readState();
    refreshUI();
    alert('Cleared local profile.');
  }
});

/* modal buttons */
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalSave.addEventListener('click', () => {
  if(!editingContext) return;
  if(editingContext.section === 'dogDetails') saveDogFromModal();
  else if(editingContext.section === 'savedLocations') saveLocationFromModal('savedLocations');
  else if(editingContext.section === 'prefs') savePrefsFromModal();
  else if(editingContext.section === 'userId') saveUserIdFromModal();
});

/* confirm buttons */
confirmYes.addEventListener('click', () => {
  if(confirmResolve) confirmResolve(true);
  confirmResolve = null;
  closeConfirm();
});
confirmNo.addEventListener('click', () => {
  if(confirmResolve) confirmResolve(false);
  confirmResolve = null;
  closeConfirm();
});

/* avatar upload */
avatarInput.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = (e) => {
    state.avatar = e.target.result;
    writeState(state);
    refreshUI();
  };
  r.readAsDataURL(f);
});

/* clicking overlay avatar also triggers input */
document.querySelector('.upload-overlay').addEventListener('click', () => {
  avatarInput.click();
});

/* clicking header avatar opens edit id for convenience */
headerAvatar.addEventListener('click', openEditId);

/* ==== editing functions ==== */
function openEditDog(){
  editingContext = { section: 'dogDetails' };
  const d = state.dogDetails || {};
  const html = `
    <div class="field"><label>Name</label><input id="field_name" type="text" value="${escapeHtml(d.name||'')}" /></div>
    <div class="field"><label>Breed</label><input id="field_breed" type="text" value="${escapeHtml(d.breed||'')}" /></div>
    <div class="field"><label>Age</label><input id="field_age" type="text" value="${escapeHtml(d.age||'')}" /></div>
    <div class="field"><label>Notes</label><textarea id="field_notes">${escapeHtml(d.notes||'')}</textarea></div>
  `;
  openModal('Edit Dog Details', html);
}

function saveDogFromModal(){
  const name = document.getElementById('field_name').value.trim();
  const breed = document.getElementById('field_breed').value.trim();
  const age = document.getElementById('field_age').value.trim();
  const notes = document.getElementById('field_notes').value.trim();
  state.dogDetails = { name, breed, age, notes };
  writeState(state);
  refreshUI();
  closeModal();
}

function openEditLocation(section, index){
  editingContext = { section, index: (index != null ? index : null) };
  let item = { name:'', address:'', tags:'', rating:0 };
  if(index != null){
    item = state[section][index];
  }
  const ratingHtml = '';
  const html = `
    <div class="field"><label>Name</label><input id="field_name" type="text" value="${escapeHtml(item.name||'')}" /></div>
    <div class="field"><label>Address</label><input id="field_address" type="text" value="${escapeHtml(item.address||'')}" /></div>
    <div class="field"><label>Tags (comma separated)</label><input id="field_tags" type="text" value="${escapeHtml(item.tags||'')}" /></div>
    ${ratingHtml}
  `;
  openModal(index!=null ? 'Edit Location' : 'New Location', html);
}

function saveLocationFromModal(section){
  const name = document.getElementById('field_name').value.trim();
  const address = document.getElementById('field_address').value.trim();
  const tags = document.getElementById('field_tags').value.trim();
  const rating = 0; // rating removed
  if(!name){
    alert('Please enter a name.');
    return;
  }
  if(editingContext.index == null){
    // create
    const item = { name, address, tags, rating };
    state[section].push(item);
  } else {
    // update
    state[section][editingContext.index] = { name, address, tags, rating };
  }
  writeState(state);
  refreshUI();
  closeModal();
}

async function handleDelete(section, index){
  const ok = await openConfirm('Delete this item? This cannot be undone.');
  if(!ok) return;
  state[section].splice(index,1);
  writeState(state);
  refreshUI();
}

/* Edit preferences */
document.getElementById('editPrefsBtn').addEventListener('click', () => {
  editingContext = { section: 'prefs' };
  const p = state.prefs;
  const html = `
    <div class="field"><label>Walker time</label>
      <select id="pref_walkertime">
        <option value="Morning" ${p.walkerTime === 'Morning' ? 'selected' : ''}>Morning walker</option>
        <option value="Evening" ${p.walkerTime === 'Evening' ? 'selected' : ''}>Evening walker</option>
      </select>
    </div>
    <div class="field"><label>Dog size</label>
      <select id="pref_dogsize">
        <option value="Small" ${p.dogSize === 'Small' ? 'selected' : ''}>Small buddies</option>
        <option value="Large" ${p.dogSize === 'Large' ? 'selected' : ''}>Large buddies</option>
      </select>
    </div>
    <div class="field"><label>Experience</label>
      <select id="pref_experience">
        <option value="New walker" ${p.experience === 'New walker' ? 'selected' : ''}>New walker</option>
        <option value="Experienced" ${p.experience === 'Experienced' ? 'selected' : ''}>Experienced</option>
      </select>
    </div>
  `;
  openModal('Edit Preferences', html);
});

function savePrefsFromModal(){
  state.prefs.walkerTime = document.getElementById('pref_walkertime').value || 'Morning';
  state.prefs.dogSize = document.getElementById('pref_dogsize').value || 'Small';
  state.prefs.experience = document.getElementById('pref_experience').value || 'New walker';
  writeState(state);
  refreshUI();
  closeModal();
}

/* Edit user id / display name */
function openEditId(){
  editingContext = { section: 'userId' };
  const html = `
    <div class="field"><label>User ID (will be used as @handle)</label><input id="field_userid" type="text" value="${escapeHtml(state.userId||'')}" /></div>
    <div class="field"><label>Display name</label><input id="field_displayname" type="text" value="${escapeHtml(state.displayName||'')}" /></div>
  `;
  openModal('Edit Profile', html);
}
function saveUserIdFromModal(){
  const uid = document.getElementById('field_userid').value.trim() || 'guest';
  const dname = document.getElementById('field_displayname').value.trim() || 'Guest';
  state.userId = uid;
  state.displayName = dname;
  writeState(state);
  refreshUI();
  closeModal();
}

/* escape helper for input values */
function escapeHtml(s){
  if(!s) return '';
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

/* init run */
(function init(){
  // ensure arrays exist
  state.savedLocations = state.savedLocations || [];
  state.dogDetails = state.dogDetails || {};
  // migrate legacy prefs shape if present
  if(!state.prefs || typeof state.prefs !== 'object' || (!('walkerTime' in state.prefs) && !('dogSize' in state.prefs) && !('experience' in state.prefs))){
    state.prefs = { ...DEFAULTS.prefs };
  } else {
    state.prefs.walkerTime = state.prefs.walkerTime || 'Morning';
    state.prefs.dogSize = state.prefs.dogSize || 'Small';
    state.prefs.experience = state.prefs.experience || 'New walker';
  }
  if(!state.avatar) state.avatar = ''; // keep empty; UI uses fallback
  writeState(state);
  refreshUI();
})();

// navigation back to home
function goBackToHome(){
  window.location.href = 'index.html';
}
