const fs = require('fs');
const path = require('path');

const TMP_STORE_PATH = path.join('/tmp', 'santywin_bingo_auth_store.json');

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'santywin@gmail.com').toLowerCase().trim();
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'santy2026';

function getDefaultStore() {
  const initialList = [
    {
      email: DEFAULT_ADMIN_EMAIL,
      name: 'Administrador Principal (SantyWin)',
      pin: DEFAULT_ADMIN_PIN,
      role: 'admin',
      active: true,
      createdAt: Date.now(),
    },
  ];

  // Si se definieron correos extra por variable de entorno ALLOWED_EMAILS (separados por coma)
  if (process.env.ALLOWED_EMAILS) {
    process.env.ALLOWED_EMAILS.split(',').forEach((raw) => {
      const clean = raw.toLowerCase().trim();
      if (clean && clean !== DEFAULT_ADMIN_EMAIL) {
        initialList.push({
          email: clean,
          name: clean.split('@')[0],
          pin: process.env.DEFAULT_USER_PIN || '1234',
          role: 'user',
          active: true,
          createdAt: Date.now(),
        });
      }
    });
  }

  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    requirePinForEmailLogin: true,
    users: initialList,
  };
}

function readStore() {
  try {
    if (fs.existsSync(TMP_STORE_PATH)) {
      const raw = fs.readFileSync(TMP_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        return parsed;
      }
    }
  } catch (_) {
    // fallback to default
  }
  return getDefaultStore();
}

function writeStore(store) {
  try {
    fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {
    // ignore write error
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const store = readStore();

  if (req.method === 'GET') {
    return res.status(200).json({
      googleClientId: store.googleClientId || '',
      users: store.users.map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active !== false,
        pin: u.pin || '',
      })),
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { action } = body;

    // 1. Verificar token de Google Identity Services
    if (action === 'verify_google') {
      const { credential } = body;
      if (!credential) {
        return res.status(400).json({ ok: false, error: 'Falta credencial de Google.' });
      }
      try {
        const resp = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );
        if (!resp.ok) {
          return res.status(401).json({ ok: false, error: 'Token de Google inválido o expirado.' });
        }
        const payload = await resp.json();
        const email = (payload.email || '').toLowerCase().trim();
        const matched = store.users.find((u) => u.email.toLowerCase() === email);

        if (!matched) {
          return res.status(403).json({
            ok: false,
            error: `El correo ${email} no está en la lista de usuarios autorizados por el administrador.`,
          });
        }
        if (matched.active === false) {
          return res.status(403).json({
            ok: false,
            error: `El acceso para ${email} se encuentra temporalmente desactivado.`,
          });
        }

        return res.status(200).json({
          ok: true,
          user: {
            email: matched.email,
            name: payload.name || matched.name || email,
            picture: payload.picture || '',
            role: matched.role || 'user',
          },
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: 'No se pudo verificar con Google.' });
      }
    }

    // 2. Verificar inicio con Correo Google autorizado + PIN
    if (action === 'verify_email_pin') {
      const email = (body.email || '').toLowerCase().trim();
      const pin = (body.pin || '').trim();

      const matched = store.users.find((u) => u.email.toLowerCase() === email);
      if (!matched) {
        return res.status(403).json({
          ok: false,
          error: `El correo "${email}" no está autorizado para entrar al sistema.`,
        });
      }
      if (matched.active === false) {
        return res.status(403).json({
          ok: false,
          error: `El correo "${email}" está desactivado por el administrador.`,
        });
      }
      if (matched.pin && matched.pin !== pin) {
        return res.status(401).json({
          ok: false,
          error: 'Clave / PIN de acceso incorrecto para este correo.',
        });
      }

      return res.status(200).json({
        ok: true,
        user: {
          email: matched.email,
          name: matched.name || matched.email,
          role: matched.role || 'user',
        },
      });
    }

    // 3. Guardar cambios de la lista de usuarios desde el Panel de Administrador
    if (action === 'save_store') {
      const adminEmail = (body.adminEmail || '').toLowerCase().trim();
      const adminUser = store.users.find(
        (u) => u.email.toLowerCase() === adminEmail && u.role === 'admin'
      );
      if (!adminUser) {
        return res.status(403).json({ ok: false, error: 'No autorizado.' });
      }

      if (Array.isArray(body.users) && body.users.length > 0) {
        store.users = body.users;
      }
      if (typeof body.googleClientId === 'string') {
        store.googleClientId = body.googleClientId.trim();
      }
      writeStore(store);
      return res.status(200).json({ ok: true, store });
    }

    return res.status(400).json({ ok: false, error: 'Acción no reconocida.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

