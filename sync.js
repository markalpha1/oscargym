/* ===== Cloud sync (Firebase) =====
   Keeps a copy of everything in Firestore so nothing is lost if the phone is.
   The app works exactly the same when signed out or offline — localStorage is
   always the source of truth for what's on screen. This file just:
     • uploads every change (queued automatically while offline),
     • listens for changes from the cloud and merges them in,
     • handles sign in / out.

   app.js talks to this file only through window.cloud (see the bottom), and this
   file talks back through window.cloudMerge(...) and window.cloudStatus(...).

   Security: firestore.rules (in this folder, pasted into the Firebase console)
   says each signed-in user can read/write only users/{their own uid}/...
*/
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, setPersistence, indexedDBLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, collection, doc, getDocs, setDoc, writeBatch, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Project identity. These are public by design — the rules file is what protects the data.
const firebaseConfig = {
  apiKey: 'AIzaSyBxkbGLM6yIFCX6RMbwuMeyiqlMN67WCDU',
  authDomain: 'oscargym-3249c.firebaseapp.com',
  projectId: 'oscargym-3249c',
  storageBucket: 'oscargym-3249c.firebasestorage.app',
  messagingSenderId: '111101938864',
  appId: '1:111101938864:web:14dfca34145912b3567f75',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// persistentLocalCache = Firestore keeps its own offline copy and queues writes until online.
const fs = initializeFirestore(app, { localCache: persistentLocalCache() });

const COLLECTIONS = ['exercises', 'sets'];
let user = null;
let unsubscribe = [];        // live listeners, so we can stop them on sign-out

function col(name) { return collection(fs, 'users', user.uid, name); }

// Friendlier wording for Firebase's error codes
function friendly(err) {
  const code = (err && err.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Wrong email or password';
  if (code.includes('email-already-in-use')) return 'That email already has an account — sign in instead';
  if (code.includes('weak-password')) return 'Password needs at least 6 characters';
  if (code.includes('invalid-email')) return 'That doesn\'t look like an email address';
  if (code.includes('network')) return 'No connection — try again when you have signal';
  if (code.includes('too-many-requests')) return 'Too many tries — wait a minute';
  return 'Something went wrong (' + code.replace('auth/', '') + ')';
}

/* ---- First sync after sign-in: merge cloud ↔ phone both ways ---- */
async function initialSync() {
  const local = window.cloudLocal();                // { exercises: [...], sets: [...] } from app.js
  for (const name of COLLECTIONS) {
    const snap = await getDocs(col(name));
    const cloud = new Map(snap.docs.map(d => [d.id, d.data()]));
    // 1. Anything newer in the cloud → into the phone
    window.cloudMerge(name, [...cloud.values()]);
    // 2. Anything on the phone that the cloud lacks or has an older copy of → up
    const up = local[name].filter(item => { const c = cloud.get(item.id); return !c || (item.updatedAt || 0) > (c.updatedAt || 0); });
    await upsertMany(name, up);
  }
  // 3. Then listen for live changes (also fires for our own writes, which merge harmlessly)
  for (const name of COLLECTIONS) {
    unsubscribe.push(onSnapshot(col(name), (snap) => {
      const changed = snap.docChanges().map(ch => ch.doc.data());
      if (changed.length) window.cloudMerge(name, changed);
      window.cloudStatus(snap.metadata.hasPendingWrites ? 'saving' : 'synced');
    }, (err) => { console.warn('sync listener', err); window.cloudStatus('error'); }));
  }
}

async function upsertMany(name, items) {
  // Firestore batches take up to 500 writes
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(fs);
    for (const item of items.slice(i, i + 400)) batch.set(doc(col(name), item.id), item);
    await batch.commit();
  }
}

onAuthStateChanged(auth, async (u) => {
  for (const stop of unsubscribe) stop();
  unsubscribe = [];
  user = u;
  if (!u) { window.cloudStatus('signed-out'); return; }
  window.cloudStatus('syncing', u.email);
  try { await initialSync(); window.cloudStatus('synced', u.email); }
  catch (e) { console.warn('initial sync failed', e); window.cloudStatus('error', u.email); }
});

/* ---- What app.js can call ---- */
window.cloud = {
  // Save one record (or a tombstone { id, deleted: true, updatedAt }) — queued if offline.
  upsert(name, item) {
    if (!user) return;
    setDoc(doc(col(name), item.id), item).catch(e => { console.warn('upsert', e); window.cloudStatus('error'); });
  },
  upsertMany(name, items) { if (user) upsertMany(name, items).catch(e => { console.warn('upsertMany', e); window.cloudStatus('error'); }); },
  async signIn(email, password) { try { await signInWithEmailAndPassword(auth, email, password); return null; } catch (e) { return friendly(e); } },
  async createAccount(email, password) { try { await createUserWithEmailAndPassword(auth, email, password); return null; } catch (e) { return friendly(e); } },
  async resetPassword(email) { try { await sendPasswordResetEmail(auth, email); return null; } catch (e) { return friendly(e); } },
  signOut() { return signOut(auth); },
  get user() { return user; },
};

await setPersistence(auth, indexedDBLocalPersistence).catch(() => {});
window.cloudStatus(user ? 'syncing' : 'signed-out');
