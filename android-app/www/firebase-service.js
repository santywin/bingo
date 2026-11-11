(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyA2W60L7naaONqO_NuTH66papAkaPFZhJM',
    authDomain: 'santywin-bingo-2026.firebaseapp.com',
    projectId: 'santywin-bingo-2026',
    storageBucket: 'santywin-bingo-2026.firebasestorage.app',
    messagingSenderId: '961484017722',
    appId: '1:961484017722:web:fc0803e92442ff5d7a2503',
  };

  const MASTER_ADMIN_EMAIL = 'santywin@gmail.com';
  const MASTER_ADMIN_DEFAULT_PIN = 'santy2026';
  const TOKEN_STORAGE_KEY = 'santywin_fb_tokens_v1';

  const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  const IDENTITY_BASE_URL = 'https://identitytoolkit.googleapis.com/v1';

  let currentAuthUser = null; // { uid, email, idToken, refreshToken, displayName }
  let pollIntervalId = null;

  function loadStoredTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email && parsed.idToken) {
          currentAuthUser = parsed;
        }
      }
    } catch (_) {}
  }

  function saveStoredTokens(userObj) {
    currentAuthUser = userObj;
    try {
      if (userObj) {
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(userObj));
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (_) {}
  }

  loadStoredTokens();

  function buildFirebasePasswordFromPin(pin) {
    return `SantyWin#${(pin || '1234').trim()}#2026`;
  }

  // =========================================================================
  // CONVERSIÓN ENTRE OBJETOS JS Y FORMATO FIRESTORE REST API
  // =========================================================================

  function toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return { integerValue: String(val) };
      return { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
    if (typeof val === 'object') {
      const fields = {};
      Object.keys(val).forEach((k) => {
        if (val[k] !== undefined) {
          fields[k] = toFirestoreValue(val[k]);
        }
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFirestoreValue(fv) {
    if (!fv || typeof fv !== 'object') return null;
    if ('stringValue' in fv) return fv.stringValue;
    if ('booleanValue' in fv) return Boolean(fv.booleanValue);
    if ('integerValue' in fv) return parseInt(fv.integerValue, 10);
    if ('doubleValue' in fv) return Number(fv.doubleValue);
    if ('nullValue' in fv) return null;
    if ('timestampValue' in fv) return fv.timestampValue;
    if ('arrayValue' in fv) {
      const vals = (fv.arrayValue && fv.arrayValue.values) || [];
      return vals.map(fromFirestoreValue);
    }
    if ('mapValue' in fv) {
      const fields = (fv.mapValue && fv.mapValue.fields) || {};
      const obj = {};
      Object.keys(fields).forEach((k) => {
        obj[k] = fromFirestoreValue(fields[k]);
      });
      return obj;
    }
    return null;
  }

  function fromFirestoreDoc(docJson) {
    if (!docJson || !docJson.fields) return null;
    const obj = {};
    Object.keys(docJson.fields).forEach((k) => {
      obj[k] = fromFirestoreValue(docJson.fields[k]);
    });
    return obj;
  }

  function toFirestoreDoc(obj) {
    const fields = {};
    Object.keys(obj).forEach((k) => {
      if (obj[k] !== undefined) {
        fields[k] = toFirestoreValue(obj[k]);
      }
    });
    return { fields };
  }

  // =========================================================================
  // HELPER DE LLAMADAS A FIRESTORE CON REFRESCO AUTOMÁTICO DE TOKEN
  // =========================================================================

  async function refreshIdTokenIfNeeded() {
    if (!currentAuthUser || !currentAuthUser.refreshToken) return null;
    try {
      const resp = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(
            currentAuthUser.refreshToken
          )}`,
        }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data && data.id_token) {
        currentAuthUser.idToken = data.id_token;
        if (data.refresh_token) currentAuthUser.refreshToken = data.refresh_token;
        saveStoredTokens(currentAuthUser);
        return currentAuthUser.idToken;
      }
    } catch (_) {}
    return null;
  }

  async function firestoreFetch(path, options = {}, retried = false) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    if (currentAuthUser && currentAuthUser.idToken) {
      headers['Authorization'] = `Bearer ${currentAuthUser.idToken}`;
    }

    const resp = await fetch(`${FIRESTORE_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (resp.status === 401 && !retried && currentAuthUser && currentAuthUser.refreshToken) {
      const newToken = await refreshIdTokenIfNeeded();
      if (newToken) {
        return firestoreFetch(path, options, true);
      }
    }
    return resp;
  }

  async function firestoreGetDoc(collectionName, docId) {
    try {
      const resp = await firestoreFetch(
        `/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      return fromFirestoreDoc(json);
    } catch (_) {
      return null;
    }
  }

  async function firestoreSetDoc(collectionName, docId, dataObj) {
    try {
      const resp = await firestoreFetch(
        `/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(toFirestoreDoc(dataObj)),
        }
      );
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  async function firestoreDeleteDoc(collectionName, docId) {
    try {
      const resp = await firestoreFetch(
        `/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`,
        {
          method: 'DELETE',
        }
      );
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  async function firestoreListDocs(collectionName) {
    try {
      const resp = await firestoreFetch(`/${encodeURIComponent(collectionName)}?pageSize=200`);
      if (!resp.ok) return null;
      const json = await resp.json();
      if (!json || !Array.isArray(json.documents)) return [];
      return json.documents.map(fromFirestoreDoc).filter(Boolean);
    } catch (_) {
      return null;
    }
  }

  // =========================================================================
  // AUTENTICACIÓN CON FIREBASE AUTH (EMAIL/PIN + GOOGLE POPUP EN WEB)
  // =========================================================================

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

  async function firebaseSignInOrCreateWithPassword(email, password) {
    const cleanEmail = (email || '').toLowerCase().trim();
    // 1. Intentar signInWithPassword
    const signInResp = await fetch(
      `${IDENTITY_BASE_URL}/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    if (signInResp.ok) {
      const data = await signInResp.json();
      const userObj = {
        uid: data.localId,
        email: cleanEmail,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
      };
      saveStoredTokens(userObj);
      return { ok: true, authData: userObj };
    }

    // 2. Si no existe aún en Firebase Auth, crearlo con signUp
    const signUpResp = await fetch(
      `${IDENTITY_BASE_URL}/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    if (signUpResp.ok) {
      const data = await signUpResp.json();
      const userObj = {
        uid: data.localId,
        email: cleanEmail,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
      };
      saveStoredTokens(userObj);
      return { ok: true, authData: userObj };
    }

    return { ok: false };
  }

  async function ensureAdminSeedInFirestore(localUsers = []) {
    if (!currentAuthUser || !currentAuthUser.email) return;
    const currentEmail = currentAuthUser.email.toLowerCase().trim();
    if (currentEmail !== MASTER_ADMIN_EMAIL) return;

    try {
      const existingAdmin = await firestoreGetDoc('allowed_users', MASTER_ADMIN_EMAIL);
      if (!existingAdmin) {
        await firestoreSetDoc('allowed_users', MASTER_ADMIN_EMAIL, {
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
        const existing = await firestoreGetDoc('allowed_users', emailKey);
        if (!existing) {
          await firestoreSetDoc('allowed_users', emailKey, sanitizeAllowedUserDoc(u));
        }
      }
    } catch (_) {}
  }

  async function verifyAuthorizedUserInFirestore(email, fallbackName = '') {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail) {
      return { ok: false, error: 'Ingresa un correo Google válido.' };
    }

    if (cleanEmail === MASTER_ADMIN_EMAIL) {
      const existingAdmin = await firestoreGetDoc('allowed_users', MASTER_ADMIN_EMAIL);
      if (!existingAdmin) {
        await firestoreSetDoc('allowed_users', MASTER_ADMIN_EMAIL, {
          email: MASTER_ADMIN_EMAIL,
          name: fallbackName || 'Administrador Principal (SantyWin)',
          pin: MASTER_ADMIN_DEFAULT_PIN,
          role: 'admin',
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      return {
        ok: true,
        user: {
          email: MASTER_ADMIN_EMAIL,
          name:
            (existingAdmin && existingAdmin.name) ||
            fallbackName ||
            'Administrador Principal (SantyWin)',
          role: 'admin',
          pin: (existingAdmin && existingAdmin.pin) || MASTER_ADMIN_DEFAULT_PIN,
        },
      };
    }

    // Consultar /allowed_users/{email} en Cloud Firestore
    const userDoc = await firestoreGetDoc('allowed_users', cleanEmail);
    if (userDoc) {
      if (userDoc.active === false) {
        return {
          ok: false,
          error: `Acceso bloqueado: El correo "${cleanEmail}" fue desactivado por el administrador.`,
        };
      }
      return {
        ok: true,
        user: {
          email: cleanEmail,
          name: userDoc.name || fallbackName || cleanEmail,
          role: userDoc.role || 'user',
          pin: userDoc.pin || '',
        },
      };
    }

    // Fallback: consultar /config/auth_store en Cloud Firestore
    const storeDoc = await firestoreGetDoc('config', 'auth_store');
    if (storeDoc && Array.isArray(storeDoc.users)) {
      const matched = storeDoc.users.find(
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

    return {
      ok: false,
      error: `Acceso denegado: El correo Google "${cleanEmail}" no está en la lista autorizada por el administrador.`,
    };
  }

  async function loginWithEmailAndPinFirebase(email, pin) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const cleanPin = (pin || '').trim();

    // Si es el admin maestro, usar una contraseña fija de Firebase Auth para que aunque cambie su PIN nunca falle el login de Firebase Auth
    const primaryPassword =
      cleanEmail === MASTER_ADMIN_EMAIL
        ? buildFirebasePasswordFromPin(MASTER_ADMIN_DEFAULT_PIN)
        : buildFirebasePasswordFromPin(cleanPin);

    try {
      let authRes = await firebaseSignInOrCreateWithPassword(cleanEmail, primaryPassword);
      if (!authRes.ok && cleanEmail !== MASTER_ADMIN_EMAIL) {
        // Probar también con contraseña maestra de la app por si el admin le cambió el PIN en Firestore
        authRes = await firebaseSignInOrCreateWithPassword(
          cleanEmail,
          buildFirebasePasswordFromPin('santywin_user')
        );
      }

      if (authRes.ok && authRes.authData) {
        const check = await verifyAuthorizedUserInFirestore(cleanEmail, '');
        if (!check.ok) {
          saveStoredTokens(null);
          return check;
        }
        if (check.user.pin && check.user.pin !== cleanPin) {
          saveStoredTokens(null);
          return { ok: false, error: 'Clave / PIN incorrecto para este correo Google.' };
        }
        return {
          ok: true,
          user: {
            ...check.user,
            uid: authRes.authData.uid,
          },
        };
      }
    } catch (_) {}
    return null;
  }

  async function loginWithGooglePopup() {
    // Detectar si estamos dentro del WebView nativo de Android (Capacitor / APK)
    const isAndroidWebView =
      window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent || '');

    if (!isAndroidWebView) {
      try {
        const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
          await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
          ]);

        const fbApp =
          getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
        const fbAuth = getAuth(fbApp);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const result = await signInWithPopup(fbAuth, provider);
        const fbUser = result.user;
        const idToken = await fbUser.getIdToken();

        saveStoredTokens({
          uid: fbUser.uid,
          email: (fbUser.email || '').toLowerCase().trim(),
          idToken,
          refreshToken: fbUser.refreshToken || '',
          displayName: fbUser.displayName || '',
        });

        const check = await verifyAuthorizedUserInFirestore(
          fbUser.email,
          fbUser.displayName || ''
        );
        if (!check.ok) {
          saveStoredTokens(null);
          return check;
        }

        return {
          ok: true,
          user: {
            ...check.user,
            uid: fbUser.uid,
          },
        };
      } catch (err) {
        if (err && err.code === 'auth/popup-closed-by-user') {
          return { ok: false, error: 'Cerraste la ventana de Google antes de terminar.' };
        }
      }
    }

    // En la app APK de Android (donde Google bloquea popups en WebViews) o si el navegador bloqueó el popup:
    const emailInput = document.getElementById('loginEmailInput');
    const pinInput = document.getElementById('loginPinInput');
    if (emailInput && emailInput.value.trim() && pinInput && pinInput.value.trim()) {
      const directRes = await loginWithEmailAndPinFirebase(
        emailInput.value.trim(),
        pinInput.value.trim()
      );
      if (directRes) return directRes;
    }

    if (emailInput) emailInput.focus();
    return {
      ok: false,
      error:
        'En la App Android, escribe abajo tu correo Google autorizado y tu PIN y toca "Entrar a SantyWin Bingo".',
    };
  }

  async function fetchAllAllowedUsersFromFirestore() {
    if (!currentAuthUser) return null;
    return await firestoreListDocs('allowed_users');
  }

  function listenToAllowedUsers(onUpdate) {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (!currentAuthUser) return;

    const poll = async () => {
      if (!currentAuthUser) return;
      const list = await firestoreListDocs('allowed_users');
      if (Array.isArray(list) && list.length > 0 && typeof onUpdate === 'function') {
        onUpdate(list);
      }
    };
    poll();
    pollIntervalId = setInterval(poll, 12000);
  }

  async function upsertAllowedUserInFirestore(userObj, allUsers = []) {
    if (!currentAuthUser) return false;
    const emailKey = (userObj.email || '').toLowerCase().trim();
    if (!emailKey) return false;

    // También pre-crear la cuenta en Firebase Auth para que el usuario pueda entrar desde cualquier celular con su correo + PIN
    try {
      await fetch(`${IDENTITY_BASE_URL}/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailKey,
          password: buildFirebasePasswordFromPin('santywin_user'),
          returnSecureToken: false,
        }),
      });
    } catch (_) {}

    const existing = await firestoreGetDoc('allowed_users', emailKey);
    const existingCreatedAt = existing ? existing.createdAt : undefined;
    const payload = sanitizeAllowedUserDoc(userObj, existingCreatedAt);

    const ok = await firestoreSetDoc('allowed_users', emailKey, payload);
    if (Array.isArray(allUsers) && allUsers.length > 0) {
      await firestoreSetDoc('config', 'auth_store', {
        users: allUsers.map((u) => sanitizeAllowedUserDoc(u, u.createdAt)),
        adminEmail: currentAuthUser.email || MASTER_ADMIN_EMAIL,
        updatedAt: Date.now(),
      });
    }
    return ok;
  }

  async function removeAllowedUserFromFirestore(email, remainingUsers = []) {
    if (!currentAuthUser) return false;
    const emailKey = (email || '').toLowerCase().trim();
    if (!emailKey || emailKey === MASTER_ADMIN_EMAIL) return false;

    const ok = await firestoreDeleteDoc('allowed_users', emailKey);
    if (Array.isArray(remainingUsers)) {
      await firestoreSetDoc('config', 'auth_store', {
        users: remainingUsers.map((u) => sanitizeAllowedUserDoc(u, u.createdAt)),
        adminEmail: currentAuthUser.email || MASTER_ADMIN_EMAIL,
        updatedAt: Date.now(),
      });
    }
    return ok;
  }

  async function saveUserBingoStateToFirestore(stateObj) {
    if (!currentAuthUser || !currentAuthUser.email) return false;
    const emailKey = currentAuthUser.email.toLowerCase().trim();

    const existing = await firestoreGetDoc('user_bingo_data', emailKey);
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

    if (existing) {
      if (existing.uid) payload.uid = existing.uid;
      if (existing.email) payload.email = existing.email;
      if (existing.createdAt) payload.createdAt = existing.createdAt;
    } else {
      payload.uid = currentAuthUser.uid || emailKey;
      payload.email = emailKey;
      payload.createdAt = Date.now();
    }

    return await firestoreSetDoc('user_bingo_data', emailKey, payload);
  }

  async function loadUserBingoStateFromFirestore() {
    if (!currentAuthUser || !currentAuthUser.email) return null;
    const emailKey = currentAuthUser.email.toLowerCase().trim();
    return await firestoreGetDoc('user_bingo_data', emailKey);
  }

  async function logoutFirebase() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    saveStoredTokens(null);
  }

  window.SantyFirebase = {
    get auth() {
      return { currentUser: currentAuthUser };
    },
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
    onAuthStateChanged: (cb) => {
      if (currentAuthUser && typeof cb === 'function') {
        setTimeout(() => cb(currentAuthUser), 0);
      }
    },
  };

  window.dispatchEvent(new CustomEvent('santy-firebase-ready'));
})();
