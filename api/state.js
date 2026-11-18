// Shared list state. Storage: Upstash Redis (Vercel Marketplace) via REST.
// GET  /api/state            -> { items, updatedAt }
// PUT  /api/state  (x-passcode header, JSON body { items }) -> { ok, updatedAt }
var KEY = 'kagu-kaden-tier:v1';

function redisEnv() {
  var url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  var token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url, token: token } : null;
}

async function redis(cmd) {
  var env = redisEnv();
  var r = await fetch(env.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  var j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
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
  if (!redisEnv()) {
    res.status(500).json({ error: 'storage not configured' });
    return;
  }
  try {
    if (req.method === 'GET') {
      var raw = await redis(['GET', KEY]);
      var s = raw ? JSON.parse(raw) : null;
      res.status(200).json(s || { items: null, updatedAt: null });
      return;
    }
    if (req.method === 'PUT') {
      var pass = process.env.EDIT_PASSCODE;
      if (!pass) { res.status(500).json({ error: 'EDIT_PASSCODE not set' }); return; }
      if ((req.headers['x-passcode'] || '') !== pass) { res.status(401).json({ error: 'bad passcode' }); return; }
      var body = await readBody(req);
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
      if (!validItems(body.items)) { res.status(400).json({ error: 'bad items' }); return; }
      var items = body.items.map(function (it) { return { id: it.id, name: it.name, tier: it.tier }; });
      var updatedAt = Date.now();
      await redis(['SET', KEY, JSON.stringify({ items: items, updatedAt: updatedAt })]);
      res.status(200).json({ ok: true, updatedAt: updatedAt });
      return;
    }
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
