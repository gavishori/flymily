// Unified Firebase wrapper exposing the exact names script.js expects.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  setLogLevel,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  getDocs,
  enableNetwork,
  disableNetwork,
  persistentLocalCache,
  persistentMultipleTabManager,
  waitForPendingWrites
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyArvkyWzgOmPjYYXUIOdilmtfrWt7WxK-0",
  authDomain: "travel-416ff.firebaseapp.com",
  projectId: "travel-416ff",
  storageBucket: "travel-416ff.appspot.com",
  messagingSenderId: "1032412697405",
  appId: "1:1032412697405:web:44c9d7c6c220a3e4a8e3a7"
};

export const app = initializeApp(firebaseConfig);
let _db;
try {
  // Offline support: cache reads locally and queue writes in IndexedDB while
  // offline; Firestore flushes the queue and syncs automatically once the
  // connection returns.
  _db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  // Falls back to memory-only cache (still works online, just not
  // offline-persistent) in browsers/contexts that don't support IndexedDB
  // persistence, e.g. some private/incognito windows.
  console.warn('Offline persistence unavailable, falling back to memory cache', e);
  _db = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
}
export const db = _db;
setLogLevel("error");

// --- AUTH ---
export const auth = getAuth(app);
// Persist across tabs & restarts
try { setPersistence(auth, browserLocalPersistence); } catch(e) { console.warn('setPersistence failed', e); }
// Convenience named exports (used in a few places)
export const onAuth = onAuthStateChanged;
export const signOutUser = () => signOut(auth);

// --- FB namespace matching script.js expectations ---
export const FB = {
  // db & auth handles
  db, auth,

  // auth API names as expected by script.js
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,

  // firestore API surface
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs,
  onSnapshot, query, where, orderBy, limit, startAfter,
  serverTimestamp,
  deleteDoc,
  waitForPendingWrites: () => waitForPendingWrites(db)
};

// Network toggles (optional resilience)
window.addEventListener("offline", () => disableNetwork(db).catch(()=>{}));
window.addEventListener("online",  () => enableNetwork(db).catch(()=>{}));

// --- Offline / sync status pill ---------------------------------------
// Small, self-contained UI so the person can see: "you're offline, your
// changes are saved locally" vs "back online, syncing" vs "synced". Uses
// its own injected styles so it doesn't depend on the main stylesheet.
(function offlineStatusPill(){
  try {
    if (typeof document === 'undefined') return;

    function ensurePill(){
      let pill = document.getElementById('flymilyOfflinePill');
      if (pill) return pill;
      const style = document.createElement('style');
      style.textContent = `
        #flymilyOfflinePill{
          position:fixed; z-index:9999; left:50%; bottom:calc(14px + env(safe-area-inset-bottom,0px));
          transform:translateX(-50%) translateY(80px); opacity:0; pointer-events:none;
          display:flex; align-items:center; gap:8px;
          padding:9px 16px; border-radius:999px; font:600 13px/1 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
          box-shadow:0 8px 24px rgba(0,0,0,.22);
          transition:transform .28s ease, opacity .28s ease, background-color .25s ease;
          background:#3a3f4a; color:#fff;
        }
        #flymilyOfflinePill.show{ transform:translateX(-50%) translateY(0); opacity:1; }
        #flymilyOfflinePill[data-state="offline"]{ background:#7a4b12; }
        #flymilyOfflinePill[data-state="syncing"]{ background:#1a5fb4; }
        #flymilyOfflinePill[data-state="synced"]{ background:#0f8a5f; }
        #flymilyOfflinePill .dot{ width:8px; height:8px; border-radius:50%; background:currentColor; opacity:.85; }
      `;
      document.head.appendChild(style);
      pill = document.createElement('div');
      pill.id = 'flymilyOfflinePill';
      pill.innerHTML = '<span class="dot"></span><span class="txt"></span>';
      document.body.appendChild(pill);
      return pill;
    }

    let hideTimer = null;
    function setPill(state, text){
      const pill = ensurePill();
      pill.dataset.state = state;
      pill.querySelector('.txt').textContent = text;
      pill.classList.add('show');
      if (hideTimer) clearTimeout(hideTimer);
      if (state === 'synced'){
        hideTimer = setTimeout(() => pill.classList.remove('show'), 2500);
      }
    }

    function goOffline(){
      setPill('offline', 'אופליין • השינויים נשמרים ויסונכרנו כשהחיבור יחזור');
    }
    async function goOnline(){
      setPill('syncing', 'מתחבר מחדש • מסנכרן שינויים...');
      try { await waitForPendingWrites(db); } catch(_){ }
      setPill('synced', 'מסונכרן ✓');
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', goOffline, { once:true });
      } else {
        goOffline();
      }
    }
  } catch(e) { console.warn('offline status pill init failed', e); }
})();


// --- Hard sign-out: also wipe local caches so the next login truly switches accounts ---
export async function hardSignOut() {
  try { await signOut(auth); } catch(e) { console.warn('signOut err', e); }
  try {
    // Remove Firebase Auth localStorage shards
    if (typeof localStorage !== 'undefined') {
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('firebase:authUser:')) { try { localStorage.removeItem(key); } catch(_){} }
        if (key && key.startsWith('firebase:storedPersistence:')) { try { localStorage.removeItem(key); } catch(_){} }
        if (key && key.startsWith('firebase-heartbeat')) { try { localStorage.removeItem(key); } catch(_){} }
      }
    }
  } catch(e) { console.warn('localStorage cleanup err', e); }
  try { indexedDB && indexedDB.deleteDatabase && indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch(e) {}
  try { indexedDB && indexedDB.deleteDatabase && indexedDB.deleteDatabase('firebase-messaging-database'); } catch(e) {}
  // Optional: give Firestore network a moment to detach
  try { await new Promise(res=>setTimeout(res, 150)); } catch(_) {}
  return true;
}
/* ---- Global attach for legacy scripts that expect a global FB ---- */
try {
  window.FB = FB;
  window.auth = auth;
  window.db = db;
  window.hardSignOut = hardSignOut;
} catch (e) {
  // Ignore if window not available (SSR)
}
