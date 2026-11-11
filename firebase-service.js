import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA2W60L7naaONqO_NuTH66papAkaPFZhJM',
  authDomain: 'santywin-bingo-2026.firebaseapp.com',
  projectId: 'santywin-bingo-2026',
  storageBucket: 'santywin-bingo-2026.firebasestorage.app',
  messagingSenderId: '961484017722',
  appId: '1:961484017722:web:fc0803e92442ff5d7a2503',
};

const MASTER_ADMIN_EMAIL = 'santywin@gmail.com';
const MASTER_ADMIN_DEFAULT_PIN = 'santy2026';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

let allowedUsersUnsubscribe = null;

function buildFirebasePasswordFromPin(pin) {
  return `SantyWin#${(pin || '1234').trim()}#2026`;
}

function sanitizeAllowedUserDoc(u, existingCreatedAt) {
  const email = (u.email || '').toLowerCase().trim();
  const docData = {
    email,
    name: String(u.name || email.split('@')[0]).slice(0, 100),
    pin: String(u.pin || '1234').slice(0, 50),
    role: email === MASTER_ADMIN_EMAIL || u.role === 'admin' ? 'admin' : 'user',
    active: email === MASTER_ADMIN_EMAIL ? true : u.active !== false,
    updatedAt: Date.now(),
  };
  if (typeof existingCreatedAt === 'number') {
    docData.createdAt = existingCreatedAt;
  } else if (typeof u.createdAt === 'number') {
    docData.createdAt = u.createdAt;
  } else {
    docData.createdAt = Date.now();
  }
  return docData;
}

async function ensureAdminSeedInFirestore(localUsers = []) {
  if (!auth.currentUser || !auth.currentUser.email) return;
  const currentEmail = auth.currentUser.email.toLowerCase().trim();
  if (currentEmail !== MASTER_ADMIN_EMAIL) return;

  try {
    const adminRef = doc(db, 'allowed_users', MASTER_ADMIN_EMAIL);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        email: MASTER_ADMIN_EMAIL,
        name: 'Administrador Principal (SantyWin)',
        pin: MASTER_ADMIN_DEFAULT_PIN,
        role: 'admin',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    for (const u of localUsers) {
      if (!u || !u.email) continue;
      const emailKey = u.email.toLowerCase().trim();
      const ref = doc(db, 'allowed_users', emailKey);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, sanitizeAllowedUserDoc(u));
      }
    }
  } catch (err) {
    console.warn('Error seeding Firestore allowed_users:', err);
  }
}

async function verifyAuthorizedUserInFirestore(email, fallbackName = '') {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) {
    return { ok: false, error: 'No se pudo obtener el correo Google de la cuenta.' };
  }

  // El administrador maestro siempre tiene acceso garantizado
  if (cleanEmail === MASTER_ADMIN_EMAIL) {
    try {
      const adminRef = doc(db, 'allowed_users', MASTER_ADMIN_EMAIL);
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        await setDoc(adminRef, {
          email: MASTER_ADMIN_EMAIL,
          name: fallbackName || 'Administrador Principal (SantyWin)',
          pin: MASTER_ADMIN_DEFAULT_PIN,
          role: 'admin',
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (_) {}

    return {
      ok: true,
      user: {
        email: MASTER_ADMIN_EMAIL,
        name: fallbackName || 'Administrador Principal (SantyWin)',
        role: 'admin',
      },
    };
  }

  // Consultar documento individual en /allowed_users/{email}
  try {
    const userRef = doc(db, 'allowed_users', cleanEmail);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.active === false) {
        return {
          ok: false,
          error: `Acceso bloqueado: El correo "${cleanEmail}" fue desactivado por el administrador.`,
        };
      }
      return {
        ok: true,
        user: {
          email: cleanEmail,
          name: data.name || fallbackName || cleanEmail,
          role: data.role || 'user',
          pin: data.pin || '',
        },
      };
    }

    // Fallback: revisar /config/auth_store en Firestore
    const storeRef = doc(db, 'config', 'auth_store');
    const storeSnap = await getDoc(storeRef);
    if (storeSnap.exists()) {
      const storeData = storeSnap.data();
      if (Array.isArray(storeData.users)) {
        const matched = storeData.users.find(
          (u) => u && u.email && u.email.toLowerCase().trim() === cleanEmail
        );
        if (matched) {
          if (matched.active === false) {
            return {
              ok: false,
              error: `Acceso bloqueado: El correo "${cleanEmail}" fue desactivado por el administrador.`,
            };
          }
          return {
            ok: true,
            user: {
              email: cleanEmail,
              name: matched.name || fallbackName || cleanEmail,
              role: matched.role || 'user',
              pin: matched.pin || '',
            },
          };
        }
      }
    }
  } catch (err) {
    console.warn('Firestore verification error:', err);
  }

  return {
    ok: false,
    error: `Acceso denegado: El correo Google "${cleanEmail}" no está en la lista autorizada por el administrador.`,
  };
}

async function loginWithGooglePopup() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    const email = (fbUser.email || '').toLowerCase().trim();

    const check = await verifyAuthorizedUserInFirestore(email, fbUser.displayName || '');
    if (!check.ok) {
      await signOut(auth);
      return check;
    }

    return {
      ok: true,
      user: {
        ...check.user,
        uid: fbUser.uid,
        photoURL: fbUser.photoURL || '',
      },
    };
  } catch (err) {
    let msg = 'No se pudo completar el inicio de sesión con Google.';
    if (err && err.code === 'auth/popup-closed-by-user') {
      msg = 'Cerraste la ventana de Google antes de terminar.';
    } else if (err && err.code === 'auth/unauthorized-domain') {
      msg = `Este dominio (${window.location.hostname}) aún no está en Dominios Autorizados de Firebase Console, o puedes ingresar abajo con tu correo + PIN.`;
    } else if (err && err.message) {
      msg = err.message;
    }
    return { ok: false, error: msg, code: err && err.code };
  }
}

async function loginWithEmailAndPinFirebase(email, pin) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const cleanPin = (pin || '').trim();
  const derivedPassword = buildFirebasePasswordFromPin(cleanPin);

  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, cleanEmail, derivedPassword);
    } catch (signInErr) {
      if (
        signInErr.code === 'auth/user-not-found' ||
        signInErr.code === 'auth/invalid-credential'
      ) {
        try {
          cred = await createUserWithEmailAndPassword(auth, cleanEmail, derivedPassword);
        } catch (_) {
          cred = null;
        }
      }
    }

    if (cred && cred.user) {
      const check = await verifyAuthorizedUserInFirestore(cleanEmail, '');
      if (!check.ok) {
        await signOut(auth);
        return check;
      }
      if (check.user.pin && check.user.pin !== cleanPin) {
        await signOut(auth);
        return { ok: false, error: 'Clave / PIN incorrecto para este correo Google.' };
      }
      return {
        ok: true,
        user: {
          ...check.user,
          uid: cred.user.uid,
        },
      };
    }
  } catch (_) {
    // Continuar al fallback local/API si la cuenta ya existe con proveedor Google OAuth
  }
  return null;
}

async function fetchAllAllowedUsersFromFirestore() {
  if (!auth.currentUser) return null;
  try {
    const snap = await getDocs(collection(db, 'allowed_users'));
    const list = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && d.email) list.push(d);
    });
    return list;
  } catch (_) {
    return null;
  }
}

function listenToAllowedUsers(onUpdate) {
  if (allowedUsersUnsubscribe) {
    allowedUsersUnsubscribe();
    allowedUsersUnsubscribe = null;
  }
  if (!auth.currentUser) return;

  try {
    allowedUsersUnsubscribe = onSnapshot(
      collection(db, 'allowed_users'),
      (snapshot) => {
        const users = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.email) {
            users.push(data);
          }
        });
        if (users.length > 0 && typeof onUpdate === 'function') {
          onUpdate(users);
        }
      },
      () => {
        // Silenciar error si el usuario no es admin (regla list: if isAdmin())
      }
    );
  } catch (_) {}
}

async function upsertAllowedUserInFirestore(userObj, allUsers = []) {
  if (!auth.currentUser) return false;
  try {
    const emailKey = (userObj.email || '').toLowerCase().trim();
    const userRef = doc(db, 'allowed_users', emailKey);
    const existingSnap = await getDoc(userRef);
    const existingCreatedAt = existingSnap.exists() ? existingSnap.data().createdAt : undefined;

    const payload = sanitizeAllowedUserDoc(userObj, existingCreatedAt);
    await setDoc(userRef, payload);

    if (Array.isArray(allUsers) && allUsers.length > 0) {
      const storeRef = doc(db, 'config', 'auth_store');
      await setDoc(storeRef, {
        users: allUsers.map((u) => sanitizeAllowedUserDoc(u, u.createdAt)),
        adminEmail: auth.currentUser.email || MASTER_ADMIN_EMAIL,
        updatedAt: Date.now(),
      });
    }
    return true;
  } catch (err) {
    console.warn('Error saving allowed user to Firestore:', err);
    return false;
  }
}

async function removeAllowedUserFromFirestore(email, remainingUsers = []) {
  if (!auth.currentUser) return false;
  const emailKey = (email || '').toLowerCase().trim();
  if (!emailKey || emailKey === MASTER_ADMIN_EMAIL) return false;

  try {
    await deleteDoc(doc(db, 'allowed_users', emailKey));
    if (Array.isArray(remainingUsers)) {
      const storeRef = doc(db, 'config', 'auth_store');
      await setDoc(storeRef, {
        users: remainingUsers.map((u) => sanitizeAllowedUserDoc(u, u.createdAt)),
        adminEmail: auth.currentUser.email || MASTER_ADMIN_EMAIL,
        updatedAt: Date.now(),
      });
    }
    return true;
  } catch (err) {
    console.warn('Error deleting allowed user from Firestore:', err);
    return false;
  }
}

async function saveUserBingoStateToFirestore(stateObj) {
  if (!auth.currentUser || !auth.currentUser.email) return false;
  const emailKey = auth.currentUser.email.toLowerCase().trim();

  try {
    const docRef = doc(db, 'user_bingo_data', emailKey);
    const existing = await getDoc(docRef);

    const payload = {
      cards: Array.isArray(stateObj.cards) ? stateObj.cards.slice(0, 500) : [],
      calledNumbers: Array.isArray(stateObj.calledNumbers)
        ? stateObj.calledNumbers.slice(0, 1000)
        : [],
      activePatternIds: Array.isArray(stateObj.activePatternIds)
        ? stateObj.activePatternIds.slice(0, 100)
        : ['single_line'],
      customPatterns: Array.isArray(stateObj.customPatterns)
        ? stateObj.customPatterns.slice(0, 200)
        : [],
      soundEnabled: Boolean(stateObj.soundEnabled),
      patternsMinimized: Boolean(stateObj.patternsMinimized),
      boardMinimized: Boolean(stateObj.boardMinimized),
      show99Balls: Boolean(stateObj.show99Balls),
      sortBy: String(stateObj.sortBy || 'closest').slice(0, 30),
      updatedAt: Date.now(),
    };

    if (existing.exists()) {
      const prev = existing.data();
      if (prev.uid) payload.uid = prev.uid;
      if (prev.email) payload.email = prev.email;
      if (prev.createdAt) payload.createdAt = prev.createdAt;
    } else {
      payload.uid = auth.currentUser.uid;
      payload.email = emailKey;
      payload.createdAt = Date.now();
    }

    await setDoc(docRef, payload);
    return true;
  } catch (err) {
    console.warn('Error saving bingo data to Firestore:', err);
    return false;
  }
}

async function loadUserBingoStateFromFirestore() {
  if (!auth.currentUser || !auth.currentUser.email) return null;
  const emailKey = auth.currentUser.email.toLowerCase().trim();
  try {
    const docRef = doc(db, 'user_bingo_data', emailKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.warn('Error loading bingo data from Firestore:', err);
  }
  return null;
}

async function logoutFirebase() {
  if (allowedUsersUnsubscribe) {
    allowedUsersUnsubscribe();
    allowedUsersUnsubscribe = null;
  }
  try {
    await signOut(auth);
  } catch (_) {}
}

window.SantyFirebase = {
  auth,
  db,
  loginWithGooglePopup,
  loginWithEmailAndPinFirebase,
  verifyAuthorizedUserInFirestore,
  ensureAdminSeedInFirestore,
  fetchAllAllowedUsersFromFirestore,
  listenToAllowedUsers,
  upsertAllowedUserInFirestore,
  removeAllowedUserFromFirestore,
  saveUserBingoStateToFirestore,
  loadUserBingoStateFromFirestore,
  logoutFirebase,
  onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),
};

window.dispatchEvent(new CustomEvent('santy-firebase-ready'));

