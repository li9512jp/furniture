// Shared list state. Storage: Supabase Postgres (Vercel Marketplace) via POSTGRES_URL.
// GET  /api/state            -> { items, updatedAt }
// PUT  /api/state  (JSON body { items }; x-passcode header if EDIT_PASSCODE is set) -> { ok, updatedAt }
var { Pool } = require('pg');
var KEY = 'kagu-kaden-tier:v1';
var pool, ready;

function db() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1, ssl: { rejectUnauthorized: false } });
  }
  if (!ready) {
    ready = pool.query(
      'CREATE TABLE IF NOT EXISTS tier_state (key text PRIMARY KEY, data jsonb NOT NULL, updated_at bigint NOT NULL)'
    ).catch(function (e) { ready = null; throw e; });
  }
  return ready.then(function () { return pool; });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body !== undefined) return resolve(req.body);
    var data = '';
    req.on('data', function (c) { data += c; });
    req.on('end', function () { resolve(data); });
    req.on('error', reject);
  });
}

function validItems(items) {
  if (!Array.isArray(items) || items.length > 500) return false;
  var tiers = { pool: 1, must: 1, want: 1, later: 1, owned: 1 };
  return items.every(function (it) {
    return it && typeof it.id === 'string' && it.id.length <= 40 &&
      typeof it.name === 'string' && it.name.length >= 1 && it.name.length <= 30 &&
      tiers[it.tier];
  });
}

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.POSTGRES_URL) {
    res.status(500).json({ error: 'storage not configured' });
    return;
  }
  try {
    var p = await db();
    if (req.method === 'GET') {
      var r = await p.query('SELECT data, updated_at FROM tier_state WHERE key = $1', [KEY]);
      if (!r.rows.length) { res.status(200).json({ items: null, updatedAt: null }); return; }
      res.status(200).json({ items: r.rows[0].data, updatedAt: Number(r.rows[0].updated_at) });
      return;
    }
    if (req.method === 'PUT') {
      var pass = process.env.EDIT_PASSCODE;
      // no EDIT_PASSCODE set -> anyone can edit
      if (pass && (req.headers['x-passcode'] || '') !== pass) { res.status(401).json({ error: 'bad passcode' }); return; }
      var body = await readBody(req);
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
      if (!validItems(body.items)) { res.status(400).json({ error: 'bad items' }); return; }
      var items = body.items.map(function (it) { return { id: it.id, name: it.name, tier: it.tier }; });
      var updatedAt = Date.now();
      await p.query(
        'INSERT INTO tier_state (key, data, updated_at) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at',
        [KEY, JSON.stringify(items), updatedAt]
      );
      res.status(200).json({ ok: true, updatedAt: updatedAt });
      return;
    }
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
