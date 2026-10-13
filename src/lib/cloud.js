// Thin wrapper around Firebase Auth + Firestore. The SDK is loaded on first use.
import { firebaseConfig } from './firebaseConfig.js';
import { MONTHS, groupByMonth, mergeEntries } from './cloudData.js';

let ready;
function init() {
  ready ??= (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
    ]);
    const app = initializeApp(firebaseConfig);
    const a = auth.getAuth(app);
    let db;
    try {
      // Cache data on the device: faster start, works offline, fewer reads.
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch {
      db = fs.getFirestore(app);
    }
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      auth.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
      fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      // Test-only sign-in (emulator builds): Google's pop-up needs internet access.
      window.__testSignIn = (email) => auth.signInWithCredential(
        a, auth.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })),
      );
    }
    return { auth, fs, a, db };
  })();
  return ready;
}

/** Calls back with the signed-in user (or null). Returns an unsubscribe function. */
export function watchUser(callback) {
  let unsub = () => {};
  let cancelled = false;
  init().then(({ auth, a }) => {
    if (!cancelled) unsub = auth.onAuthStateChanged(a, (u) => callback(u ? { uid: u.uid, email: u.email, name: u.displayName } : null));
  }).catch(() => callback(null));
  return () => { cancelled = true; unsub(); };
}

export async function signIn() {
  const { auth, a } = await init();
  const provider = new auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(a, provider);
  } catch (e) {
    // Some phones block pop-ups; fall back to a full-page redirect.
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await auth.signInWithRedirect(a, provider);
    } else {
      throw e;
    }
  }
}

export async function signOut() {
  const { auth, a } = await init();
  await auth.signOut(a);
}

/** Live list of all entries in the shared log. Returns an unsubscribe function. */
export function watchEntries(callback, onError) {
  let unsub = () => {};
  let cancelled = false;
  init().then(({ fs, db }) => {
    if (cancelled) return;
    unsub = fs.onSnapshot(
      fs.collection(db, MONTHS),
      (snap) => callback(snap.docs.flatMap((d) => d.data().entries ?? [])),
      onError,
    );
  }).catch(onError);
  return () => { cancelled = true; unsub(); };
}

/** Add entries (skipping duplicates), one transaction per month. Returns how many were added. */
export async function addEntries(entries) {
  const { fs, db } = await init();
  let added = 0;
  for (const [month, list] of groupByMonth(entries)) {
    const ref = fs.doc(db, MONTHS, month);
    added += await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const merged = mergeEntries(snap.exists() ? snap.data().entries ?? [] : [], list);
      if (merged.added) tx.set(ref, { entries: merged.entries });
      return merged.added;
    });
  }
  return added;
}

export async function deleteEntry(entry) {
  const { fs, db } = await init();
  const ref = fs.doc(db, MONTHS, entry.day.slice(0, 7));
  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    tx.set(ref, { entries: (snap.data().entries ?? []).filter((e) => e.id !== entry.id) });
  });
}

/** Human-readable message for Firebase errors the user can act on. */
export function describeError(e) {
  const code = e?.code ?? '';
  if (code.includes('permission-denied')) return 'This Google account doesn’t have access to the shared log. Add its email address to the Firestore security rules.';
  if (code.includes('unauthorized-domain')) return 'This website isn’t allowed to sign in yet: in Firebase → Authentication → Settings → Authorized domains, add atireg.github.io.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return null;
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found')) return 'Google sign-in isn’t switched on yet: Firebase → Authentication → Sign-in method → Google → Enable.';
  if (code.includes('unavailable')) return 'Can’t reach the cloud right now — showing the copy saved on this device.';
  if (code.includes('resource-exhausted')) return 'Today’s free Firebase quota is used up; it resets within 24 hours.';
  return `Something went wrong with the cloud log${code ? ` (${code})` : ''}.`;
}

// The sleep being tracked right now, shared between devices: document live/current.
const LIVE = ['live', 'current'];

/** Calls back with the live sleep (or null). Returns an unsubscribe function. */
export function watchLive(callback, onError) {
  let unsub = () => {};
  let cancelled = false;
  init().then(({ fs, db }) => {
    if (cancelled) return;
    unsub = fs.onSnapshot(fs.doc(db, ...LIVE), (snap) => callback(snap.exists() ? snap.data().live ?? null : null), onError);
  }).catch(onError);
  return () => { cancelled = true; unsub(); };
}

export async function setLive(live) {
  const { fs, db } = await init();
  const ref = fs.doc(db, ...LIVE);
  if (live) await fs.setDoc(ref, { live });
  else await fs.deleteDoc(ref);
}
