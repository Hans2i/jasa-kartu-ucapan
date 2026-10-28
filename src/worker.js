// Portal Kartu Ucapan - versi Cloudflare Workers + D1
// Tampilan (public/) disajikan oleh Cloudflare. File ini hanya melayani /api/*.

const SESSION_DAYS = 7;
const PBKDF2_ITER = 100000; // batas maksimum yang diizinkan Cloudflare
const enc = new TextEncoder();

// ---------------------------------------------------------------
//  Tabel database (dibuat otomatis kalau belum ada)
// ---------------------------------------------------------------
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
    role TEXT NOT NULL, status TEXT NOT NULL, nama TEXT NOT NULL DEFAULT '',
    wa TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS paket (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, nama TEXT NOT NULL,
    kategori TEXT NOT NULL DEFAULT '', deskripsi TEXT NOT NULL DEFAULT '',
    fitur TEXT NOT NULL DEFAULT '[]', harga TEXT NOT NULL DEFAULT '',
    warna TEXT NOT NULL DEFAULT '#C22F54', contoh_url TEXT NOT NULL,
    admin_url TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL)',
];
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

const DEFAULT_SETTINGS = { brand: 'Jasa Kartu Ucapan', tagline: 'Lihat contohnya dulu, baru pesan kartu ucapanmu.', whatsapp: '', email: '' };

// ---------------------------------------------------------------
//  Helper
// ---------------------------------------------------------------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));
const uid = () => hex(crypto.getRandomValues(new Uint8Array(8)));

async function sha(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return 'pbkdf2$' + PBKDF2_ITER + '$' + hex(salt) + '$' + hex(await pbkdf2(pw, salt, PBKDF2_ITER));
}
async function checkPassword(pw, stored) {
  const p = String(stored || '').split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  const want = unhex(p[3]);
  const got = await pbkdf2(pw, unhex(p[2]), parseInt(p[1], 10) || PBKDF2_ITER);
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ got[i];
  return diff === 0;
}
// Dipakai supaya waktu respons sama baik ID ada maupun tidak
const DUMMY_HASH = 'pbkdf2$' + PBKDF2_ITER + '$' + '00'.repeat(16) + '$' + '00'.repeat(32);

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function cleanUrl(v) {
  const s = clean(v, 300);
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return u.toString();
}
function cleanWa(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (!d) return '';
  return d.length >= 8 && d.length <= 16 ? d : null;
}
function cleanUsername(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_.-]{3,30}$/.test(s) ? s : null;
}
const okPassword = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 100;
const USERNAME_ERR = 'ID harus 3-30 karakter: huruf kecil, angka, titik, strip, atau garis bawah.';

const publicUser = (u) => ({ id: u.id, username: u.username, nama: u.nama, wa: u.wa, role: u.role, status: u.status, createdAt: u.created_at });

function parseCookies(req) {
  const out = {};
  (req.headers.get('Cookie') || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* abaikan */ } }
  });
  return out;
}

// ---------------------------------------------------------------
//  Akses data
// ---------------------------------------------------------------
async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const s = Object.assign({}, DEFAULT_SETTINGS);
  results.forEach((r) => { if (r.key in s) s[r.key] = r.value; });
  return s;
}
const setSettingStmt = (db, k, v) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(k, v);

const findUser = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
const findByName = (db, n) => db.prepare('SELECT * FROM users WHERE username = ?1').bind(n).first();
async function hasOwner(db) { return !!(await db.prepare("SELECT 1 AS x FROM users WHERE role = 'owner' LIMIT 1").first()); }

function paketOut(p, extra) {
  let fitur = [];
  try { fitur = JSON.parse(p.fitur); } catch (e) { /* abaikan */ }
  return Object.assign({
    id: p.id, ownerId: p.owner_id, nama: p.nama, kategori: p.kategori, deskripsi: p.deskripsi, fitur,
    harga: p.harga, warna: p.warna, contohUrl: p.contoh_url, adminUrl: p.admin_url,
    hidden: !!p.hidden, createdAt: p.created_at
  }, extra || {});
}
const canEdit = (user, p) => user.role === 'owner' || p.owner_id === user.id;

function readPaket(body) {
  const nama = clean(body.nama, 60);
  if (!nama) fail(400, 'Nama web wajib diisi.');
  const contohUrl = cleanUrl(body.contohUrl);
  const adminUrl = cleanUrl(body.adminUrl);
  if (!contohUrl) fail(400, 'URL web contoh wajib diisi (diawali https://).');
  if (!adminUrl) fail(400, 'URL admin panel wajib diisi (diawali https://).');
  const warna = /^#[0-9a-fA-F]{6}$/.test(body.warna || '') ? body.warna : '#C22F54';
  const fitur = (Array.isArray(body.fitur) ? body.fitur : String(body.fitur || '').split('\n'))
    .map((f) => clean(f, 80)).filter(Boolean).slice(0, 8);
  return { nama, kategori: clean(body.kategori, 40) || 'Kartu ucapan', deskripsi: clean(body.deskripsi, 400), fitur, harga: clean(body.harga, 40), warna, contohUrl, adminUrl };
}

// ---------------------------------------------------------------
//  Sesi & pembatas percobaan
// ---------------------------------------------------------------
async function startSession(c, user) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const maxAge = SESSION_DAYS * 24 * 3600;
  await c.db.prepare('INSERT INTO sessions (hash, user_id, exp) VALUES (?1, ?2, ?3)')
    .bind(await sha(token), user.id, Date.now() + maxAge * 1000).run();
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=' + maxAge];
  if (c.url.protocol === 'https:') flags.push('Secure');
  c.headers.append('Set-Cookie', 'sid=' + token + '; ' + flags.join('; '));
}
async function endSession(c) {
  const t = parseCookies(c.req).sid;
  if (t) await c.db.prepare('DELETE FROM sessions WHERE hash = ?1').bind(await sha(t)).run();
  c.headers.append('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
const purgeSessionsOf = (db, userId, keepHash) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?1 AND hash != ?2').bind(userId, keepHash || '').run();

async function currentUser(db, req) {
  const t = parseCookies(req).sid;
  if (!t) return null;
  const s = await db.prepare('SELECT user_id, exp FROM sessions WHERE hash = ?1').bind(await sha(t)).first();
  if (!s || s.exp < Date.now()) return null;
  const u = await findUser(db, s.user_id);
  return u && u.status === 'active' ? u : null;
}

async function tooMany(db, key) {
  const a = await db.prepare('SELECT count, reset FROM attempts WHERE key = ?1').bind(key).first();
  return !!a && a.reset > Date.now() && a.count >= 10;
}
async function noteFail(db, key) {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO attempts (key, count, reset) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset < ?3 THEN 1 ELSE count + 1 END,
       reset = CASE WHEN reset < ?3 THEN ?2 ELSE reset END`
  ).bind(key, now + 15 * 60 * 1000, now).run();
}
async function housekeeping(db) {
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE exp < ?1').bind(now),
    db.prepare('DELETE FROM attempts WHERE reset < ?1').bind(now),
  ]);
}

// ---------------------------------------------------------------
//  Rute API.  level: 'publik' | 'login' | 'owner'
// ---------------------------------------------------------------
const routes = [];
const route = (method, pattern, level, fn) => routes.push({ method, re: new RegExp('^' + pattern + '$'), level, fn });

route('GET', '/api/public', 'publik', async (c) => {
  const settings = await getSettings(c.db);
  const { results } = await c.db.prepare(
    `SELECT p.*, u.role AS o_role, u.wa AS o_wa FROM paket p
     LEFT JOIN users u ON u.id = p.owner_id WHERE p.hidden = 0 ORDER BY p.created_at`
  ).all();
  return {
    settings,
    paket: results.map((p) => {
      const o = paketOut(p);
      return {
        id: o.id, nama: o.nama, kategori: o.kategori, deskripsi: o.deskripsi, fitur: o.fitur,
        harga: o.harga, warna: o.warna, contohUrl: o.contohUrl,
        wa: (p.o_role === 'reseller' && p.o_wa) ? p.o_wa : settings.whatsapp
        // adminUrl sengaja TIDAK dikirim ke publik
      };
    })
  };
});

route('GET', '/api/me', 'publik', async (c) => ({ needsSetup: !(await hasOwner(c.db)), user: c.user ? publicUser(c.user) : null }));

route('POST', '/api/setup', 'publik', async (c) => {
  if (await hasOwner(c.db)) fail(403, 'Pemilik sudah dibuat.');
  const b = c.body;
  const username = cleanUsername(b.username);
  if (!username) fail(400, USERNAME_ERR);
  if (!okPassword(b.password)) fail(400, 'Password minimal 8 karakter.');
  const wa = cleanWa(b.wa);
  if (wa === null) fail(400, 'Nomor WhatsApp tidak valid.');
  const u = { id: uid(), username, pass_hash: await hashPassword(b.password), role: 'owner', status: 'active', nama: clean(b.nama, 60) || 'Pemilik', wa: wa || '', created_at: Date.now() };
  // Satu perintah atomik: hanya masuk kalau belum ada pemilik (aman dari dua orang yang setup bersamaan)
  const r = await c.db.prepare(
    `INSERT INTO users (id, username, pass_hash, role, status, nama, wa, created_at)
     SELECT ?1, ?2, ?3, 'owner', 'active', ?4, ?5, ?6
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')`
  ).bind(u.id, u.username, u.pass_hash, u.nama, u.wa, u.created_at).run();
  if (!r.meta.changes) fail(403, 'Pemilik sudah dibuat.');
  const stmts = [];
  if (wa) stmts.push(setSettingStmt(c.db, 'whatsapp', wa));
  if (clean(b.brand, 60)) stmts.push(setSettingStmt(c.db, 'brand', clean(b.brand, 60)));
  if (stmts.length) await c.db.batch(stmts);
  await startSession(c, u);
  return { user: publicUser(u) };
});

route('POST', '/api/login', 'publik', async (c) => {
  if (await tooMany(c.db, c.ip)) fail(429, 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
  const u = await findByName(c.db, String(c.body.username || '').trim().toLowerCase());
  const ok = await checkPassword(c.body.password, u ? u.pass_hash : DUMMY_HASH);
  if (!u || !ok) { await noteFail(c.db, c.ip); fail(401, 'ID atau password salah.'); }
  if (u.status === 'pending') fail(403, 'Akun kamu menunggu persetujuan pemilik.');
  if (u.status !== 'active') fail(403, 'Akun ini tidak aktif.');
  await startSession(c, u);
  return { user: publicUser(u) };
});

route('POST', '/api/logout', 'publik', async (c) => { await endSession(c); return { ok: true }; });

route('POST', '/api/register', 'publik', async (c) => {
  if (!(await hasOwner(c.db))) fail(400, 'Portal belum disiapkan.');
  const rkey = 'reg:' + c.ip;
  if (await tooMany(c.db, rkey)) fail(429, 'Terlalu banyak percobaan. Coba lagi nanti.');
  await noteFail(c.db, rkey);
  const b = c.body;
  const username = cleanUsername(b.username);
  if (!username) fail(400, USERNAME_ERR);
  if (await findByName(c.db, username)) fail(400, 'ID sudah dipakai.');
  if (!okPassword(b.password)) fail(400, 'Password minimal 8 karakter.');
  const wa = cleanWa(b.wa);
  if (!wa) fail(400, 'Isi nomor WhatsApp yang valid.');
  const nama = clean(b.nama, 60);
  if (!nama) fail(400, 'Isi nama.');
  const pend = await c.db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").first();
  if (pend.n >= 50) fail(400, 'Antrean pendaftaran penuh. Hubungi pemilik.');
  await c.db.prepare(
    "INSERT INTO users (id, username, pass_hash, role, status, nama, wa, created_at) VALUES (?1, ?2, ?3, 'reseller', 'pending', ?4, ?5, ?6)"
  ).bind(uid(), username, await hashPassword(b.password), nama, wa, Date.now()).run();
  return { ok: true, message: 'Pendaftaran terkirim. Tunggu persetujuan pemilik.' };
});

route('GET', '/api/paket', 'login', async (c) => {
  const { results } = await c.db.prepare(
    `SELECT p.*, u.nama AS o_nama FROM paket p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at`
  ).all();
  return { paket: results.map((p) => paketOut(p, { canEdit: canEdit(c.user, p), ownerNama: p.o_nama || '-' })) };
});

route('POST', '/api/paket', 'login', async (c) => {
  const d = readPaket(c.body);
  const n = await c.db.prepare('SELECT COUNT(*) AS n FROM paket').first();
  if (n.n >= 500) fail(400, 'Batas jumlah web tercapai.');
  const slug = d.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'web';
  const id = slug + '-' + uid().slice(0, 4);
  const now = Date.now();
  await c.db.prepare(
    `INSERT INTO paket (id, owner_id, nama, kategori, deskripsi, fitur, harga, warna, contoh_url, admin_url, hidden, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11)`
  ).bind(id, c.user.id, d.nama, d.kategori, d.deskripsi, JSON.stringify(d.fitur), d.harga, d.warna, d.contohUrl, d.adminUrl, now).run();
  const p = await c.db.prepare('SELECT * FROM paket WHERE id = ?1').bind(id).first();
  return { paket: paketOut(p, { canEdit: true, ownerNama: c.user.nama }) };
});

route('PUT', '/api/paket/([a-z0-9-]+)', 'login', async (c) => {
  const old = await c.db.prepare('SELECT * FROM paket WHERE id = ?1').bind(c.m[1]).first();
  if (!old) fail(404, 'Web tidak ditemukan.');
  if (!canEdit(c.user, old)) fail(403, 'Ini bukan web milikmu.');
  const d = readPaket(c.body);
  const hidden = (c.user.role === 'owner' && typeof c.body.hidden === 'boolean') ? (c.body.hidden ? 1 : 0) : old.hidden;
  await c.db.prepare(
    `UPDATE paket SET nama=?2, kategori=?3, deskripsi=?4, fitur=?5, harga=?6, warna=?7, contoh_url=?8, admin_url=?9, hidden=?10 WHERE id=?1`
  ).bind(old.id, d.nama, d.kategori, d.deskripsi, JSON.stringify(d.fitur), d.harga, d.warna, d.contohUrl, d.adminUrl, hidden).run();
  const p = await c.db.prepare('SELECT * FROM paket WHERE id = ?1').bind(old.id).first();
  const o = await findUser(c.db, p.owner_id);
  return { paket: paketOut(p, { canEdit: true, ownerNama: o ? o.nama : '-' }) };
});

route('DELETE', '/api/paket/([a-z0-9-]+)', 'login', async (c) => {
  const p = await c.db.prepare('SELECT * FROM paket WHERE id = ?1').bind(c.m[1]).first();
  if (!p) fail(404, 'Web tidak ditemukan.');
  if (!canEdit(c.user, p)) fail(403, 'Ini bukan web milikmu.');
  await c.db.prepare('DELETE FROM paket WHERE id = ?1').bind(p.id).run();
  return { ok: true };
});

route('GET', '/api/users', 'owner', async (c) => {
  const { results } = await c.db.prepare("SELECT * FROM users WHERE role != 'owner' ORDER BY created_at").all();
  return { users: results.map(publicUser) };
});

route('POST', '/api/users', 'owner', async (c) => {
  const b = c.body;
  const username = cleanUsername(b.username);
  if (!username) fail(400, USERNAME_ERR);
  if (await findByName(c.db, username)) fail(400, 'ID sudah dipakai.');
  if (!okPassword(b.password)) fail(400, 'Password minimal 8 karakter.');
  const wa = cleanWa(b.wa);
  if (!wa) fail(400, 'Isi nomor WhatsApp yang valid.');
  const nama = clean(b.nama, 60);
  if (!nama) fail(400, 'Isi nama.');
  const u = { id: uid(), username, pass_hash: await hashPassword(b.password), role: 'reseller', status: 'active', nama, wa, created_at: Date.now() };
  await c.db.prepare('INSERT INTO users (id, username, pass_hash, role, status, nama, wa, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(u.id, u.username, u.pass_hash, u.role, u.status, u.nama, u.wa, u.created_at).run();
  return { user: publicUser(u) };
});

route('POST', '/api/users/([a-f0-9]+)/([a-z]+)', 'owner', async (c) => {
  const u = await findUser(c.db, c.m[1]);
  if (!u || u.role === 'owner') fail(404, 'Akun tidak ditemukan.');
  const db = c.db;
  const a = c.m[2];
  if (a === 'approve' || a === 'enable') {
    await db.prepare("UPDATE users SET status = 'active' WHERE id = ?1").bind(u.id).run();
  } else if (a === 'reject') {
    if (u.status !== 'pending') fail(400, 'Hanya pendaftaran baru yang bisa ditolak.');
    await db.prepare('DELETE FROM users WHERE id = ?1').bind(u.id).run();
  } else if (a === 'disable') {
    await db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?1").bind(u.id).run();
    await purgeSessionsOf(db, u.id);
  } else if (a === 'delete') {
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(u.id),
      db.prepare('UPDATE paket SET owner_id = ?2 WHERE owner_id = ?1').bind(u.id, c.user.id),
      db.prepare('DELETE FROM users WHERE id = ?1').bind(u.id),
    ]);
  } else if (a === 'resetpw') {
    if (!okPassword(c.body.password)) fail(400, 'Password minimal 8 karakter.');
    await db.prepare('UPDATE users SET pass_hash = ?2 WHERE id = ?1').bind(u.id, await hashPassword(c.body.password)).run();
    await purgeSessionsOf(db, u.id);
  } else fail(400, 'Aksi tidak dikenal.');
  return { ok: true };
});

route('PUT', '/api/settings', 'owner', async (c) => {
  const wa = cleanWa(c.body.whatsapp);
  if (wa === null) fail(400, 'Nomor WhatsApp tidak valid.');
  const cur = await getSettings(c.db);
  await c.db.batch([
    setSettingStmt(c.db, 'brand', clean(c.body.brand, 60) || cur.brand),
    setSettingStmt(c.db, 'tagline', clean(c.body.tagline, 160) || cur.tagline),
    setSettingStmt(c.db, 'whatsapp', wa),
    setSettingStmt(c.db, 'email', clean(c.body.email, 80)),
  ]);
  return { settings: await getSettings(c.db) };
});

route('PUT', '/api/profile', 'login', async (c) => {
  const wa = cleanWa(c.body.wa);
  if (wa === null || (c.user.role === 'reseller' && !wa)) fail(400, 'Nomor WhatsApp tidak valid.');
  const nama = clean(c.body.nama, 60) || c.user.nama;
  const stmts = [c.db.prepare('UPDATE users SET nama = ?2, wa = ?3 WHERE id = ?1').bind(c.user.id, nama, wa)];
  if (c.user.role === 'owner' && wa) stmts.push(setSettingStmt(c.db, 'whatsapp', wa));
  await c.db.batch(stmts);
  return { user: publicUser(Object.assign({}, c.user, { nama, wa })) };
});

route('POST', '/api/password', 'login', async (c) => {
  if (!(await checkPassword(c.body.old, c.user.pass_hash))) fail(400, 'Password lama salah.');
  if (!okPassword(c.body.new)) fail(400, 'Password baru minimal 8 karakter.');
  await c.db.prepare('UPDATE users SET pass_hash = ?2 WHERE id = ?1').bind(c.user.id, await hashPassword(c.body.new)).run();
  await purgeSessionsOf(c.db, c.user.id, await sha(parseCookies(c.req).sid || ''));
  return { ok: true };
});

// ---------------------------------------------------------------
//  Pintu masuk Worker
// ---------------------------------------------------------------
function json(status, obj, extra) {
  const h = new Headers(extra || {});
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(obj), { status, headers: h });
}
async function readBody(req) {
  const text = await req.text();
  if (text.length > 50 * 1024) fail(413, 'Data terlalu besar.');
  if (!text) return {};
  try { const j = JSON.parse(text); return j && typeof j === 'object' ? j : {}; } catch (e) { fail(400, 'Format data salah.'); }
}

async function handleApi(req, env, ctx, url) {
  const headers = new Headers();
  try {
    if (!env.DB) fail(500, 'Database D1 belum tersambung (binding DB). Lihat README.');
    if (req.method !== 'GET' && req.headers.get('X-Requested-With') !== 'portal') fail(403, 'Permintaan ditolak.');
    await ensureSchema(env.DB);
    if (Math.random() < 0.02) ctx.waitUntil(housekeeping(env.DB).catch(() => {}));
    const body = (req.method === 'GET' || req.method === 'DELETE') ? {} : await readBody(req);
    const user = await currentUser(env.DB, req);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      if ((r.level === 'login' || r.level === 'owner') && !user) fail(401, 'Silakan login dulu.');
      if (r.level === 'owner' && user.role !== 'owner') fail(403, 'Hanya pemilik yang boleh.');
      const out = await r.fn({ req, url, db: env.DB, headers, body, user, m, ip: req.headers.get('CF-Connecting-IP') || 'unknown' });
      return json(200, out, headers);
    }
    fail(404, 'Tidak ditemukan.');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message }, headers);
    console.error(e);
    return json(500, { error: 'Kesalahan server.' });
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env, ctx, url);
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Tidak ditemukan', { status: 404 });
  }
};
