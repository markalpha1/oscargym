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

const VERSION = '0.2.0';
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
//   exercises: [{ id, kind:'lift'|'row', name, category, metres? }]
//   sets:      [{ id, exerciseId, at, weight?, reps?, seconds? }]   (at = timestamp in ms)
let db = load();

function rowName(metres) { return metres >= 1000 ? `${(metres / 1000).toLocaleString()} km` : `${metres} m`; }

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { console.warn('Could not read saved data', e); }
  if (!data) {
    data = { exercises: [], sets: [] };
    for (const [category, names] of Object.entries(STARTER_LIFTS)) {
      for (const name of names) data.exercises.push({ id: uid(), kind: 'lift', name, category });
    }
  }
  // Upgrade older saves: give everything a kind, and add the rowing distances if missing.
  for (const e of data.exercises) if (!e.kind) e.kind = 'lift';
  if (!data.exercises.some(e => e.kind === 'row')) {
    for (const metres of STARTER_ROWS) data.exercises.push({ id: uid(), kind: 'row', name: rowName(metres), category: 'Rowing', metres });
  }
  return data;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

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

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}

function show(screenId) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $(screenId).classList.remove('hidden');
  window.scrollTo(0, 0);
}

/* ---------- 3. Screens ---------- */

// --- List (Lifting / Rowing tab) ---
let tab = localStorage.getItem('oscargym.tab') || 'lift';

function setTab(next) {
  tab = next; localStorage.setItem('oscargym.tab', tab);
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#search').placeholder = tab === 'row' ? 'Search distances…' : 'Search exercises…';
  renderList();
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = $('#exercise-list');
  list.innerHTML = '';

  const matching = db.exercises.filter(e => e.kind === tab && e.name.toLowerCase().includes(q));
  if (!matching.length) {
    list.innerHTML = `<div class="empty">Nothing matches "${q}".<br>Tap + to add it.</div>`;
    return;
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
      row.querySelector('.name').textContent = e.name;
      row.querySelector('.last').textContent = last ? `${fmtSet(e, last)} · ${fmtAgo(last.at)}` : '';
      row.onclick = () => { location.hash = `ex/${e.id}`; };
      list.appendChild(row);
    }
  }
}

function addExercise() {
  if (tab === 'row') {
    const metres = parseInt(prompt('Distance in metres (e.g. 1500):') || '', 10);
    if (!metres || metres <= 0) return;
    const existing = db.exercises.find(e => e.kind === 'row' && e.metres === metres);
    if (existing) { location.hash = `ex/${existing.id}`; return; }
    const ex = { id: uid(), kind: 'row', name: rowName(metres), category: 'Rowing', metres };
    db.exercises.push(ex); save();
    location.hash = `ex/${ex.id}`;
    return;
  }
  const name = (prompt('Exercise or machine name:') || '').trim();
  if (!name) return;
  const existing = db.exercises.find(e => e.kind === 'lift' && e.name.toLowerCase() === name.toLowerCase());
  if (existing) { location.hash = `ex/${existing.id}`; return; }
  const category = (prompt('Category (Chest, Back, Shoulders, Arms, Legs, Core… or your own):', 'Other') || 'Other').trim() || 'Other';
  const ex = { id: uid(), kind: 'lift', name, category };
  db.exercises.push(ex); save();
  location.hash = `ex/${ex.id}`;
}

// --- One exercise ---
let currentId = null;
let restStart = null, restTimer = null;

function openExercise(id) {
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

  renderHistory();
  show('#screen-exercise');
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
      row.querySelector('.del').onclick = () => deleteSet(s.id);
      day.appendChild(row);
    }
    container.appendChild(day);
  }
}

function saveSet() {
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

  const before = bestSet(ex, setsFor(currentId));
  db.sets.push(set); save();

  toast(better(ex, set, before) ? '🏆 New personal best!' : 'Saved');
  if (navigator.vibrate) navigator.vibrate(10);
  renderHistory();
  startRest();
}

function deleteSet(id) {
  if (!confirm('Delete this entry?')) return;
  db.sets = db.sets.filter(s => s.id !== id); save();
  renderHistory();
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

function exerciseMenu() {
  const ex = exercise(currentId);
  const choice = (prompt(`"${ex.name}"\n\nType:  rename  or  delete`, '') || '').trim().toLowerCase();
  if (choice === 'rename' && ex.kind === 'lift') {
    const name = (prompt('New name:', ex.name) || '').trim();
    if (name) { ex.name = name; save(); $('#exercise-title').textContent = name; }
  } else if (choice === 'delete') {
    const n = setsFor(ex.id).length;
    if (confirm(`Delete "${ex.name}"${n ? ` and its ${n} logged entr${n === 1 ? 'y' : 'ies'}` : ''}? This can't be undone.`)) {
      db.exercises = db.exercises.filter(e => e.id !== ex.id);
      db.sets = db.sets.filter(s => s.exerciseId !== ex.id);
      save(); location.hash = '';
    }
  }
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
      if (!confirm(`Replace everything on this phone with the backup?\n(${data.exercises.length} exercises, ${data.sets.length} entries)`)) return;
      db = data; save(); renderStats(); toast('Backup restored');
    } catch (e) { alert('That file is not a valid backup.'); }
  };
  reader.readAsText(file);
}

function renderStats() {
  $('#stats').textContent = `${db.exercises.length} exercises · ${db.sets.length} entries logged`;
}

/* ---------- 4. Wiring ---------- */

// Navigation is driven by the URL hash so the iPhone swipe-back gesture works:
//   ""  → list,  "#ex/<id>" → exercise,  "#settings" → settings
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('ex/')) openExercise(h.slice(3));
  else if (h === 'settings') { renderStats(); show('#screen-settings'); }
  else { stopRest(); currentId = null; setTab(tab); show('#screen-list'); }
}
window.addEventListener('hashchange', route);

for (const b of document.querySelectorAll('.tab')) b.onclick = () => setTab(b.dataset.tab);
$('#search').addEventListener('input', renderList);
$('#btn-add-exercise').onclick = addExercise;
$('#btn-settings').onclick = () => { location.hash = 'settings'; };
$('#btn-settings-back').onclick = () => history.back();
$('#btn-back').onclick = () => history.back();
$('#btn-exercise-menu').onclick = exerciseMenu;
$('#btn-save-set').onclick = saveSet;
$('#btn-export').onclick = exportBackup;
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
