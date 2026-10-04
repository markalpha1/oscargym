/* ===== Oscar Gym — app logic =====
   One file, top to bottom:
     1. Data (what we store and how)
     2. Helpers (little utilities)
     3. Screens (list, exercise, settings)
     4. Wiring (buttons → functions)

   Two "kinds" of thing you can log:
     lift — weight × reps   (bench press, leg press…)
     row  — a time over a distance (500 m, 2,000 m…)
*/

const VERSION = '0.6.0';
const STORAGE_KEY = 'oscargym.v1';

/* ---------- 1. Data ---------- */

// Starter exercises so the app isn't empty on day one. Any can be renamed or deleted.
const STARTER_LIFTS = {
  'Chest':     ['Bench press', 'Incline bench press', 'Dumbbell bench press', 'Chest press machine', 'Cable fly', 'Pec deck', 'Push-ups', 'Dips'],
  'Back':      ['Lat pulldown', 'Pull-ups', 'Seated row', 'Barbell row', 'Dumbbell row', 'Deadlift', 'Face pulls', 'Back extension'],
  'Shoulders': ['Shoulder press', 'Dumbbell shoulder press', 'Lateral raise', 'Front raise', 'Rear delt fly', 'Shrugs'],
  'Arms':      ['Bicep curl', 'Hammer curl', 'Preacher curl', 'Cable curl', 'Tricep pushdown', 'Overhead tricep extension', 'Skull crushers'],
  'Legs':      ['Squat', 'Leg press', 'Leg extension', 'Leg curl', 'Romanian deadlift', 'Lunges', 'Hip thrust', 'Calf raise', 'Hack squat'],
  'Core':      ['Plank', 'Cable crunch', 'Hanging leg raise', 'Ab machine', 'Russian twist'],
};
const STARTER_ROWS = [500, 1000, 2000, 5000];   // metres

// The whole app's data lives in this one object, saved to the phone as JSON.
//   exercises: [{ id, kind:'lift'|'row', name, category, metres?, fav? }]   (fav = true when starred)
//   sets:      [{ id, exerciseId, at, weight?, reps?, seconds? }]   (at = timestamp in ms)
let db = load();

function rowName(metres) { return metres >= 1000 ? `${(metres / 1000).toLocaleString()} km` : `${metres} m`; }

// Starter exercises get fixed ids ("lift-bench-press", "row-2000") so two phones
// signed into the same account agree on which "Bench press" is which.
function starterId(kind, nameOrMetres) {
  return kind === 'row' ? `row-${nameOrMetres}` : 'lift-' + String(nameOrMetres).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { console.warn('Could not read saved data', e); }
  if (!data) {
    data = { exercises: [], sets: [] };
    for (const [category, names] of Object.entries(STARTER_LIFTS)) {
      for (const name of names) data.exercises.push({ id: starterId('lift', name), kind: 'lift', name, category, updatedAt: 0 });
    }
  }
  // ---- Upgrades for saves made by older versions (never wipe, always carry forward) ----
  for (const e of data.exercises) if (!e.kind) e.kind = 'lift';
  if (!data.exercises.some(e => e.kind === 'row')) {
    for (const metres of STARTER_ROWS) data.exercises.push({ id: starterId('row', metres), kind: 'row', name: rowName(metres), category: 'Rowing', metres, updatedAt: 0 });
  }
  // Starters saved with random ids → move them to their fixed ids (and point their sets at the new id)
  const starterNames = new Set(Object.values(STARTER_LIFTS).flat().map(n => n.toLowerCase()));
  for (const e of data.exercises) {
    const fixed = e.kind === 'row' ? starterId('row', e.metres) : (starterNames.has(e.name.toLowerCase()) ? starterId('lift', e.name) : null);
    if (fixed && e.id !== fixed) {
      for (const s of data.sets) if (s.exerciseId === e.id) s.exerciseId = fixed;
      e.id = fixed;
    }
  }
  // Every record carries updatedAt so sync can tell which copy is newer
  for (const e of data.exercises) if (e.updatedAt === undefined) e.updatedAt = 0;
  for (const s of data.sets) if (s.updatedAt === undefined) s.updatedAt = s.at || 0;
  if (!data.tombstones) data.tombstones = [];   // things deleted here, remembered so the cloud copy gets deleted too
  return data;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/* ---- Cloud hooks: app.js never talks to Firebase directly, only via window.cloud (sync.js) ---- */
function cloudUpsert(name, item) { item.updatedAt = Date.now(); if (window.cloud) window.cloud.upsert(name, item); }
function cloudDelete(name, id) {
  const tomb = { id, deleted: true, updatedAt: Date.now() };
  db.tombstones.push({ name, ...tomb });
  if (db.tombstones.length > 500) db.tombstones.splice(0, db.tombstones.length - 500);
  if (window.cloud) window.cloud.upsert(name, tomb);
}
// sync.js asks for everything local when you sign in (including tombstones, so offline deletes stick)
window.cloudLocal = () => ({
  exercises: [...db.exercises, ...db.tombstones.filter(t => t.name === 'exercises').map(({ name, ...t }) => t)],
  sets:      [...db.sets,      ...db.tombstones.filter(t => t.name === 'sets').map(({ name, ...t }) => t)],
});
// sync.js hands us records from the cloud; newer copy wins, deleted-newer removes.
window.cloudMerge = (name, items) => {
  const list = db[name];
  let changed = false;
  for (const item of items) {
    const i = list.findIndex(x => x.id === item.id);
    const local = list[i];
    const localAt = local ? (local.updatedAt || 0) : -1;
    if ((item.updatedAt || 0) < localAt) continue;                 // ours is newer, keep it
    if (item.deleted) { if (local) { list.splice(i, 1); changed = true; } continue; }
    if (local && (item.updatedAt || 0) === localAt) continue;      // same copy already
    if (local) list[i] = item; else list.push(item);
    changed = true;
  }
  if (changed) { save(); rerender(); }
};
window.cloudStatus = (state, email) => {
  const dot = $('#cloud-dot');
  dot.className = 'dot ' + (state === 'synced' ? 'synced' : state === 'saving' || state === 'syncing' ? 'saving' : state === 'error' ? 'error' : '');
  dot.title = state;
  cloudState = { state, email: email || (window.cloud && window.cloud.user && window.cloud.user.email) || '' };
  if (!$('#screen-settings').classList.contains('hidden')) renderAccount();
};
let cloudState = { state: 'loading', email: '' };

/* ---------- 2. Helpers ---------- */

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const $ = (sel) => document.querySelector(sel);

function fmtWeight(w) { return Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, ''); }

// 452.3 seconds → "7:32.3";  90 → "1:30"
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const whole = Number.isInteger(Math.round(s * 10) / 10) ? String(Math.round(s)).padStart(2, '0') : s.toFixed(1).padStart(4, '0');
  return `${m}:${whole}`;
}

function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

function fmtDay(ts) {
  const d = new Date(ts), now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(y.getTime())) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtAgo(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function exercise(id) { return db.exercises.find(e => e.id === id); }

function setsFor(exerciseId) {
  return db.sets.filter(s => s.exerciseId === exerciseId).sort((a, b) => b.at - a.at); // newest first
}

// One line describing a set: "60 × 8"  or  "7:32"
function fmtSet(ex, s) {
  return ex.kind === 'row' ? fmtTime(s.seconds) : `${fmtWeight(s.weight)} × ${s.reps}`;
}

// Is set a better than set b?  Lifting: heavier, then more reps.  Rowing: faster.
function better(ex, a, b) {
  if (!b) return true;
  if (ex.kind === 'row') return a.seconds < b.seconds;
  return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
}
function bestSet(ex, sets) { return sets.reduce((best, s) => better(ex, s, best) ? s : best, null); }

// Your best from each day you trained, oldest first — the points on the progress graph.
//   lift → heaviest weight that day;  row → fastest time that day
//   returns [{ at, value, set }]
function progressPoints(ex, sets) {
  const byDay = new Map();
  for (const s of sets) {
    const k = dayKey(s.at);
    if (!byDay.has(k) || better(ex, s, byDay.get(k))) byDay.set(k, s);
  }
  return [...byDay.values()]
    .sort((a, b) => a.at - b.at)
    .map(s => ({ at: s.at, value: ex.kind === 'row' ? s.seconds : s.weight, set: s }));
}

// Draws a line graph as inline SVG (no libraries — it's just a few lines of maths).
//   points: from progressPoints;  opts: { width, height, labels: true/false }
// For rowing the graph is flipped so that FASTER is HIGHER — "up" always means "better".
function chartSVG(ex, points, { width = 340, height = 120, labels = false } = {}) {
  const pad = { top: 10, right: 12, bottom: labels ? 22 : 6, left: 12 };
  const w = width - pad.left - pad.right, h = height - pad.top - pad.bottom;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }   // a flat line still needs some room
  const up = ex.kind === 'row';          // row: smaller value sits higher
  const x = (i) => pad.left + (points.length === 1 ? w / 2 : i / (points.length - 1) * w);
  const y = (v) => pad.top + (up ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * h;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)},${(pad.top + h).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + h).toFixed(1)} Z`;
  const best = bestSet(ex, points.map(p => p.set));
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="graph" aria-hidden="true">`;
  svg += `<path class="graph-area" d="${area}"/>`;
  svg += `<path class="graph-line" d="${d}"/>`;
  points.forEach((p, i) => {
    svg += `<circle class="graph-dot${p.set.id === best.id ? ' best' : ''}" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${labels ? 4 : 2.5}"/>`;
  });
  if (labels) {
    // Just the two ends on the date axis — enough to read the span without clutter
    const fmt = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    svg += `<text class="graph-label" x="${pad.left}" y="${height - 6}">${fmt(points[0].at)}</text>`;
    if (points.length > 1) svg += `<text class="graph-label" x="${width - pad.right}" y="${height - 6}" text-anchor="end">${fmt(points[points.length - 1].at)}</text>`;
  }
  return svg + '</svg>';
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}

// Slide-up panel. Replaces the browser's ugly prompt()/confirm() pop-ups.
//   openSheet({ title, text, fields: [{ id, label, value, placeholder, type }],
//               actions: [{ label, kind: 'primary'|'danger'|'secondary', onClick(values) }] })
function openSheet({ title, text = '', fields = [], actions = [] }) {
  $('#sheet-title').textContent = title;
  $('#sheet-text').textContent = text;
  const fieldsEl = $('#sheet-fields'); fieldsEl.innerHTML = '';
  for (const f of fields) {
    const wrap = document.createElement('div'); wrap.className = 'field';
    const label = document.createElement('label'); label.textContent = f.label; label.htmlFor = 'sheet-' + f.id;
    const input = document.createElement('input');
    input.id = 'sheet-' + f.id; input.type = f.type || 'text'; input.value = f.value || ''; input.placeholder = f.placeholder || '';
    input.autocomplete = f.type === 'email' ? 'email' : f.type === 'password' ? 'current-password' : 'off';
    input.autocapitalize = ['number', 'email', 'password'].includes(f.type) ? 'off' : 'sentences';
    if (f.type === 'number') input.inputMode = 'numeric';
    wrap.append(label, input); fieldsEl.appendChild(wrap);
  }
  const actionsEl = $('#sheet-actions'); actionsEl.innerHTML = '';
  const row = document.createElement('div'); row.className = 'actions-row';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = a.kind === 'primary' ? 'primary' : a.kind === 'danger' ? 'primary danger' : 'secondary';
    b.textContent = a.label;
    b.onclick = async () => {
      const values = {};
      for (const f of fields) values[f.id] = $('#sheet-' + f.id).value.trim();
      b.disabled = true;
      try {
        if (a.onClick && (await a.onClick(values)) === false) return;   // return false from onClick to keep the sheet open
        closeSheet();
      } finally { b.disabled = false; }
    };
    row.appendChild(b);
  }
  // Every sheet gets a Cancel unless an action already closes it harmlessly
  if (!actions.some(a => a.kind === 'secondary')) {
    const c = document.createElement('button'); c.className = 'secondary'; c.textContent = 'Cancel'; c.onclick = closeSheet; row.appendChild(c);
  }
  actionsEl.appendChild(row);
  $('#backdrop').classList.remove('hidden'); $('#sheet').classList.remove('hidden');
  const first = fieldsEl.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
  // Enter in the last box = press the first (primary) button
  const inputs = fieldsEl.querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 1].addEventListener('keydown', (e) => { if (e.key === 'Enter') row.querySelector('button').click(); });
}
function closeSheet() { $('#backdrop').classList.add('hidden'); $('#sheet').classList.add('hidden'); }
$('#backdrop').onclick = closeSheet;

// Swap screens. direction: 'push' = new page slides in from the right (going deeper),
// 'pop' = coming back, the page settles in from the left; nothing = no animation (first load).
function show(screenId, direction) {
  const next = $(screenId);
  if (next.classList.contains('hidden') || direction) {
    for (const s of document.querySelectorAll('.screen')) { s.classList.add('hidden'); s.classList.remove('anim-push', 'anim-pop'); }
    next.classList.remove('hidden');
    if (direction) next.classList.add(direction === 'push' ? 'anim-push' : 'anim-pop');
  }
  next.scrollTop = 0;
}

/* ---------- 3. Screens ---------- */

// --- List (Lifting / Rowing tab) ---
let tab = localStorage.getItem('oscargym.tab') || 'lift';
const TAB_ORDER = ['lift', 'row'];   // left → right, decides which way the list slides

function setTab(next) {
  const from = TAB_ORDER.indexOf(tab), to = TAB_ORDER.indexOf(next);
  tab = next; localStorage.setItem('oscargym.tab', tab);
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#search').placeholder = tab === 'row' ? 'Search distances…' : 'Search exercises…';
  renderList();
  // Slide the list in from the side the new tab is on (Lifting → Rowing slides in from the right)
  if (from !== to) {
    const list = $('#exercise-list');
    list.classList.remove('slide-from-right', 'slide-from-left');
    void list.offsetWidth;   // forces the browser to notice the class was removed, so the animation restarts
    list.classList.add(to > from ? 'slide-from-right' : 'slide-from-left');
  }
}

// Swipe left/right on the list to change tab (like flicking between pages).
// Ignores swipes that start at the very left edge — that's the iPhone's own "go back" gesture.
let swipe = null;
$('#screen-list').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  swipe = t.clientX > 24 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
$('#screen-list').addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;   // too short, or mostly a scroll
  const i = TAB_ORDER.indexOf(tab) + (dx < 0 ? 1 : -1);
  if (TAB_ORDER[i]) setTab(TAB_ORDER[i]);
}, { passive: true });

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = $('#exercise-list');
  list.innerHTML = '';

  const matching = db.exercises.filter(e => e.kind === tab && e.name.toLowerCase().includes(q));
  if (!matching.length) {
    list.innerHTML = `<div class="empty">Nothing matches "${q}".<br>Tap + to add it.</div>`;
    return;
  }

  // ---- Favourites: starred exercises up top, each with a mini progress graph ----
  const favs = matching.filter(e => e.fav).sort((a, b) => tab === 'row' ? a.metres - b.metres : a.name.localeCompare(b.name));
  if (favs.length) {
    const title = document.createElement('div');
    title.className = 'group-title'; title.textContent = 'Favourites';
    list.appendChild(title);
    for (const e of favs) {
      const sets = setsFor(e.id);
      const points = progressPoints(e, sets);
      const card = document.createElement('button');
      card.className = 'fav-card';
      card.innerHTML = `<div class="fav-top"><span class="name"></span><span class="last"></span></div>`;
      card.querySelector('.name').textContent = e.name;
      card.querySelector('.last').textContent = sets[0] ? `${fmtSet(e, sets[0])} · ${fmtAgo(sets[0].at)}` : 'Nothing logged yet';
      if (points.length >= 2) card.insertAdjacentHTML('beforeend', chartSVG(e, points, { width: 340, height: 56 }));
      else card.insertAdjacentHTML('beforeend', `<div class="fav-hint muted small">${points.length ? 'One more session and a graph appears here' : ''}</div>`);
      card.onclick = () => { location.hash = `ex/${e.id}`; };
      list.appendChild(card);
    }
  }

  // Group by category, keeping the starter order; custom categories go last.
  const order = [...Object.keys(STARTER_LIFTS), 'Rowing', ...new Set(matching.map(e => e.category))];
  const groups = new Map();
  for (const e of matching) {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category).push(e);
  }

  for (const cat of order) {
    const items = groups.get(cat);
    if (!items) continue;
    groups.delete(cat);
    if (tab === 'lift') {  // rowing has one category, no need for a heading
      const title = document.createElement('div');
      title.className = 'group-title'; title.textContent = cat;
      list.appendChild(title);
    }
    // Lifts sort A–Z; rowing distances sort short → long.
    items.sort((a, b) => tab === 'row' ? a.metres - b.metres : a.name.localeCompare(b.name));
    for (const e of items) {
      const last = setsFor(e.id)[0];
      const row = document.createElement('button');
      row.className = 'row';
      row.innerHTML = `<span class="name"></span><span class="last"></span>`;
      row.querySelector('.name').textContent = (e.fav ? '★ ' : '') + e.name;
      row.querySelector('.last').textContent = last ? `${fmtSet(e, last)} · ${fmtAgo(last.at)}` : '';
      row.onclick = () => { location.hash = `ex/${e.id}`; };
      list.appendChild(row);
    }
  }
}

function addExercise() {
  if (tab === 'row') {
    openSheet({
      title: 'Add a distance',
      fields: [{ id: 'metres', label: 'Metres', type: 'number', placeholder: 'e.g. 1500' }],
      actions: [{ label: 'Add', kind: 'primary', onClick: (v) => {
        const metres = parseInt(v.metres, 10);
        if (!metres || metres <= 0) { toast('Enter a distance in metres'); return false; }
        const existing = db.exercises.find(e => e.kind === 'row' && e.metres === metres);
        if (existing) { location.hash = `ex/${existing.id}`; return; }
        const ex = { id: starterId('row', metres), kind: 'row', name: rowName(metres), category: 'Rowing', metres };
        cloudUpsert('exercises', ex); db.exercises.push(ex); save();
        location.hash = `ex/${ex.id}`;
      } }],
    });
    return;
  }
  openSheet({
    title: 'Add an exercise',
    fields: [
      { id: 'name', label: 'Exercise or machine', placeholder: 'e.g. Chest press machine', value: $('#search').value.trim() },
      { id: 'category', label: 'Body part', placeholder: 'Chest, Back, Shoulders, Arms, Legs, Core…' },
    ],
    actions: [{ label: 'Add', kind: 'primary', onClick: (v) => {
      if (!v.name) { toast('Give it a name'); return false; }
      const existing = db.exercises.find(e => e.kind === 'lift' && e.name.toLowerCase() === v.name.toLowerCase());
      if (existing) { location.hash = `ex/${existing.id}`; return; }
      // Match the capitalisation of an existing category ("legs" → "Legs")
      const cat = v.category || 'Other';
      const known = [...Object.keys(STARTER_LIFTS), ...db.exercises.map(e => e.category)].find(c => c.toLowerCase() === cat.toLowerCase());
      const ex = { id: uid(), kind: 'lift', name: v.name, category: known || cat };
      cloudUpsert('exercises', ex); db.exercises.push(ex); save();
      location.hash = `ex/${ex.id}`;
    } }],
  });
}

// --- One exercise ---
let currentId = null;
let restStart = null, restTimer = null;

function openExercise(id, direction) {
  const ex = exercise(id);
  if (!ex) { location.hash = ''; return; }
  currentId = id;
  $('#exercise-title').textContent = ex.kind === 'row' ? `Row ${ex.name}` : ex.name;

  $('#logger-lift').classList.toggle('hidden', ex.kind !== 'lift');
  $('#logger-row').classList.toggle('hidden', ex.kind !== 'row');
  $('#btn-save-set').textContent = ex.kind === 'row' ? 'Save time' : 'Save set';

  // Pre-fill with the last entry so "same again" is one tap.
  const last = setsFor(id)[0];
  if (ex.kind === 'row') {
    $('#mins').value = last ? Math.floor(last.seconds / 60) : '';
    $('#secs').value = last ? fmtTime(last.seconds).split(':')[1] : '';
  } else {
    $('#weight').value = last ? fmtWeight(last.weight) : '';
    $('#reps').value = last ? last.reps : '';
  }

  renderFavButton();
  renderChart();
  renderHistory();
  show('#screen-exercise', direction);
}

function renderFavButton() {
  const ex = exercise(currentId);
  $('#btn-fav').textContent = ex.fav ? '★' : '☆';
  $('#btn-fav').classList.toggle('on', !!ex.fav);
}

function toggleFav() {
  const ex = exercise(currentId);
  ex.fav = !ex.fav;
  cloudUpsert('exercises', ex); save();
  renderFavButton();
  if (navigator.vibrate) navigator.vibrate(10);
  toast(ex.fav ? '★ Added to favourites' : 'Removed from favourites');
}

// The progress graph above the history. Tap a dot to see that session's number.
function renderChart() {
  const ex = exercise(currentId);
  const points = progressPoints(ex, setsFor(currentId));
  const el = $('#chart');
  el.classList.toggle('hidden', points.length < 2);   // needs two sessions to draw a line
  if (points.length < 2) return;
  el.innerHTML = chartSVG(ex, points, { width: 340, height: 130, labels: true });
  const caption = document.createElement('div');
  caption.className = 'graph-caption';
  el.appendChild(caption);
  const describe = (i) => {
    const p = points[i];
    caption.innerHTML = `<span>${fmtDay(p.at)}</span><span>${ex.kind === 'row' ? fmtTime(p.value) : fmtWeight(p.value) + ' kg'}${p.set.id === bestSet(ex, points.map(q => q.set)).id ? ' <span class="pb">PB</span>' : ''}</span>`;
    for (const dot of el.querySelectorAll('.graph-dot')) dot.classList.toggle('picked', +dot.dataset.i === i);
  };
  describe(points.length - 1);
  // Tap anywhere on the graph: pick the nearest dot (dots alone are too small to hit)
  const svg = el.querySelector('svg');
  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left) / box.width * (points.length - 1));
    describe(Math.max(0, Math.min(points.length - 1, i)));
  });
}

function renderHistory() {
  const ex = exercise(currentId);
  const sets = setsFor(currentId);
  const container = $('#history');
  container.innerHTML = '';
  if (!sets.length) {
    container.innerHTML = `<div class="empty">${ex.kind === 'row' ? 'No times yet. Enter your time above, then Save.' : 'No sets yet. Enter weight and reps above, then Save.'}</div>`;
    return;
  }
  const pb = bestSet(ex, sets);

  // Group by day, newest day first.
  const days = new Map();
  for (const s of sets) {
    const k = dayKey(s.at);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(s);
  }
  for (const daySets of days.values()) {
    const day = document.createElement('div');
    day.className = 'day';
    let summary;
    if (ex.kind === 'row') {
      summary = `${daySets.length} row${daySets.length === 1 ? '' : 's'}`;
    } else {
      const volume = daySets.reduce((t, s) => t + s.weight * s.reps, 0);
      summary = `${daySets.length} set${daySets.length === 1 ? '' : 's'} · ${fmtWeight(volume)} kg total`;
    }
    day.innerHTML = `<div class="day-title"><span>${fmtDay(daySets[0].at)}</span><span>${summary}</span></div>`;
    for (const s of daySets.slice().reverse()) {   // oldest of the day first, like you did them
      const row = document.createElement('div');
      row.className = 'set';
      let label;
      if (ex.kind === 'row') {
        const split = s.seconds / (ex.metres / 500);   // pace per 500 m, like the rower shows
        label = `${fmtTime(s.seconds)} <span class="muted small">${fmtTime(split)} /500m</span>`;
      } else {
        label = `${fmtWeight(s.weight)} kg × ${s.reps}`;
      }
      row.innerHTML = `<span>${label}${s.id === pb.id ? '<span class="pb">PB</span>' : ''}</span><button class="del" aria-label="Delete">✕</button>`;
      row.querySelector('.del').onclick = (ev) => deleteSet(s.id, ev.currentTarget);
      day.appendChild(row);
    }
    container.appendChild(day);
  }
}

function saveSet(force = false) {   // force = true: user tapped "Save anyway" on the sanity check
  const ex = exercise(currentId);
  const set = { id: uid(), exerciseId: currentId, at: Date.now() };

  if (ex.kind === 'row') {
    const mins = parseInt($('#mins').value || '0', 10);
    const secs = parseFloat($('#secs').value || '0');
    if (isNaN(mins) || isNaN(secs) || secs < 0 || secs >= 60) { toast('Seconds must be 0–59'); $('#secs').focus(); return; }
    set.seconds = Math.round((mins * 60 + secs) * 10) / 10;
    if (set.seconds <= 0) { toast('Enter a time'); $('#mins').focus(); return; }
  } else {
    set.weight = parseFloat($('#weight').value);
    set.reps = parseInt($('#reps').value, 10);
    if (isNaN(set.weight) || set.weight < 0) { toast('Enter a weight'); $('#weight').focus(); return; }
    if (isNaN(set.reps) || set.reps <= 0) { toast('Enter reps'); $('#reps').focus(); return; }
  }

  // Sanity check: catch a fat-fingered extra digit before it becomes a fake PB.
  const wild = ex.kind === 'row'
    ? (set.seconds / (ex.metres / 500) < 60 || set.seconds > 4 * 3600)       // faster than 1:00 /500m, or over 4 hours
    : (set.weight > 300 || set.reps > 100);
  if (wild && !force) {
    openSheet({
      title: 'Really?',
      text: ex.kind === 'row'
        ? `${fmtTime(set.seconds)} for ${ex.name} is ${fmtTime(set.seconds / (ex.metres / 500))} per 500 m — world-record territory.`
        : `${fmtWeight(set.weight)} kg × ${set.reps} is world-record territory.`,
      actions: [{ label: 'Save anyway', kind: 'primary', onClick: () => saveSet(true) }],
    });
    return;
  }

  const before = bestSet(ex, setsFor(currentId));
  cloudUpsert('sets', set); db.sets.push(set); save();

  toast(better(ex, set, before) ? '🏆 New personal best!' : 'Saved');
  if (navigator.vibrate) navigator.vibrate(10);
  renderChart();
  renderHistory();
  startRest();
}

// Two taps to delete: first tap turns ✕ into "Delete?", second tap (within 3 s) deletes.
function deleteSet(id, btn) {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed'); btn.textContent = 'Delete?';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '✕'; }, 3000);
    return;
  }
  db.sets = db.sets.filter(s => s.id !== id); cloudDelete('sets', id); save();
  renderChart();
  renderHistory();
  toast('Deleted');
}

// Rest timer: counts up from the moment you saved, so you know how long you've been resting.
function startRest() {
  restStart = Date.now();
  $('#rest-timer').classList.remove('hidden');
  clearInterval(restTimer);
  restTimer = setInterval(() => {
    const s = Math.floor((Date.now() - restStart) / 1000);
    $('#rest-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 250);
}
function stopRest() {
  clearInterval(restTimer); restStart = null;
  $('#rest-timer').classList.add('hidden');
  $('#rest-time').textContent = '0:00';
}

// The "⋯" menu on an exercise: rename, or delete it with all its history.
function exerciseMenu() {
  const ex = exercise(currentId);
  const n = setsFor(ex.id).length;
  const actions = [];
  if (ex.kind === 'lift') {
    actions.push({ label: 'Rename', kind: 'primary', onClick: (v) => {
      if (!v.name) { toast('Give it a name'); return false; }
      ex.name = v.name; cloudUpsert('exercises', ex); save(); $('#exercise-title').textContent = v.name;
    } });
  }
  actions.push({ label: n ? `Delete with ${n} entr${n === 1 ? 'y' : 'ies'}` : 'Delete', kind: 'danger', onClick: () => {
    // Ask once more — this is the one thing in the app that can't be undone.
    openSheet({
      title: `Delete ${ex.name}?`,
      text: n ? `Its ${n} logged entr${n === 1 ? 'y' : 'ies'} will be gone for good.` : 'This can\'t be undone.',
      actions: [{ label: 'Yes, delete', kind: 'danger', onClick: () => {
        for (const s of db.sets) if (s.exerciseId === ex.id) cloudDelete('sets', s.id);
        cloudDelete('exercises', ex.id);
        db.exercises = db.exercises.filter(e => e.id !== ex.id);
        db.sets = db.sets.filter(s => s.exerciseId !== ex.id);
        save(); location.hash = ''; toast('Deleted');
      } }],
    });
    return false;   // keep the second sheet open (it replaced the first)
  } });
  openSheet({
    title: ex.name,
    fields: ex.kind === 'lift' ? [{ id: 'name', label: 'Name', value: ex.name }] : [],
    actions,
  });
}

// --- Settings: backup & restore ---
async function exportBackup() {
  const json = JSON.stringify(db, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([json], `oscargym-backup-${date}.json`, { type: 'application/json' });
  // On iPhone the share sheet is the nicest way to get a file somewhere safe (Files, AirDrop, email).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Oscar Gym backup' }); } catch (e) { /* user cancelled */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.exercises) || !Array.isArray(data.sets)) throw new Error('Not a gym backup');
      openSheet({
        title: 'Restore backup?',
        text: `Replaces everything on this phone with ${data.exercises.length} exercises and ${data.sets.length} entries from the file.`,
        actions: [{ label: 'Restore', kind: 'danger', onClick: () => {
          // Run the file through load() so old backups get the same upgrades as old saves
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); db = load();
          const now = Date.now();
          for (const e of db.exercises) e.updatedAt = now;
          for (const s of db.sets) s.updatedAt = now;
          save(); renderStats(); toast('Backup restored');
          if (window.cloud) { window.cloud.upsertMany('exercises', db.exercises); window.cloud.upsertMany('sets', db.sets); }
        } }],
      });
    } catch (e) { toast('That file is not a valid backup'); }
  };
  reader.readAsText(file);
}

function renderStats() {
  $('#stats').textContent = `${db.exercises.length} exercises · ${db.sets.length} entries logged`;
}

// Re-draw whatever screen is showing (used when cloud changes arrive)
function rerender() {
  if (!$('#screen-exercise').classList.contains('hidden')) { if (exercise(currentId)) { renderFavButton(); renderChart(); renderHistory(); } else location.hash = ''; }
  else if (!$('#screen-settings').classList.contains('hidden')) renderStats();
  else renderList();
}

// --- Settings: account / cloud sync ---
function renderAccount() {
  const { state, email } = cloudState;
  const signedIn = email && state !== 'signed-out';
  $('#btn-signin').classList.toggle('hidden', !!signedIn);
  $('#btn-signout').classList.toggle('hidden', !signedIn);
  $('#account-text').textContent =
    state === 'loading' ? 'Connecting…' :
    !signedIn ? 'Sign in and every set is saved online too — nothing lost if the phone is.' :
    state === 'syncing' ? `Signed in as ${email} · syncing…` :
    state === 'saving' ? `Signed in as ${email} · saving…` :
    state === 'error' ? `Signed in as ${email} · sync problem (will retry)` :
    `Signed in as ${email} · everything synced ✓`;
}

function signInSheet() {
  if (!window.cloud) { toast('No connection — try again with signal'); return; }
  const fields = [
    { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', value: localStorage.getItem('oscargym.email') || '' },
    { id: 'password', label: 'Password', type: 'password', placeholder: 'At least 6 characters' },
  ];
  const go = (fn) => async (v) => {
    if (!v.email) { toast('Enter your email'); return false; }
    localStorage.setItem('oscargym.email', v.email);
    const err = await fn(v);
    if (err) { toast(err); return false; }   // stay open so they can fix it
  };
  openSheet({
    title: 'Cloud sync',
    text: 'One account, any phone. Your sets upload automatically.',
    fields,
    actions: [
      { label: 'Sign in', kind: 'primary', onClick: go(v => window.cloud.signIn(v.email, v.password)) },
      { label: 'Create account', kind: 'secondary', onClick: go(v => window.cloud.createAccount(v.email, v.password)) },
      { label: 'Forgot password', kind: 'secondary', onClick: go(async v => { const e = await window.cloud.resetPassword(v.email); if (!e) toast('Reset email sent'); return e; }) },
      { label: 'Cancel', kind: 'secondary' },
    ],
  });
}

/* ---------- 4. Wiring ---------- */

// Navigation is driven by the URL hash so the iPhone swipe-back gesture works:
//   ""  → list,  "#ex/<id>" → exercise,  "#settings" → settings
let firstRoute = true;   // no slide animation on the very first draw
function route() {
  const h = location.hash.slice(1);
  const dir = firstRoute ? undefined : 'push';
  closeSheet();   // a panel left open (e.g. swiped back with it up) shouldn't follow you to the next page
  if (h.startsWith('ex/')) openExercise(h.slice(3), dir);
  else if (h === 'settings') { renderStats(); renderAccount(); show('#screen-settings', dir); }
  else { stopRest(); currentId = null; setTab(tab); show('#screen-list', firstRoute ? undefined : 'pop'); }
  firstRoute = false;
}
window.addEventListener('hashchange', route);

for (const b of document.querySelectorAll('.tab')) b.onclick = () => setTab(b.dataset.tab);
$('#search').addEventListener('input', renderList);
$('#btn-add-exercise').onclick = addExercise;
$('#btn-settings').onclick = () => { location.hash = 'settings'; };
$('#btn-settings-back').onclick = () => history.back();
$('#btn-back').onclick = () => history.back();
$('#btn-exercise-menu').onclick = exerciseMenu;
$('#btn-fav').onclick = toggleFav;
$('#btn-save-set').onclick = () => saveSet();   // not `= saveSet` — that would pass the click event as `force`
$('#btn-export').onclick = exportBackup;
$('#btn-signin').onclick = signInSheet;
$('#btn-signout').onclick = () => openSheet({
  title: 'Sign out?',
  text: 'Your sets stay on this phone and in the cloud. Sign back in any time.',
  actions: [{ label: 'Sign out', kind: 'danger', onClick: () => { window.cloud.signOut(); } }],
});
$('#import-file').onchange = (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };

// +/− steppers on every number box
for (const btn of document.querySelectorAll('.step')) {
  btn.onclick = () => {
    const target = btn.dataset.target;
    const input = $('#' + target);
    const delta = parseFloat(btn.dataset.delta);
    let next = Math.max(0, (parseFloat(input.value) || 0) + delta);
    if (target === 'secs') next = Math.min(59, next);
    input.value = target === 'weight' ? fmtWeight(Math.round(next * 2) / 2) : Math.round(next * 10) / 10;
  };
}
// Pressing "go" on the keyboard in the last box saves
for (const id of ['#reps', '#secs']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); saveSet(); } });
}

$('#version').textContent = 'v' + VERSION;

// Offline support: the service worker caches the app so it opens with no signal.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

route();
