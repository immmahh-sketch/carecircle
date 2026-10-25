import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { App } from './app.js';
import { bus } from './core/bus.js';
import { uid } from './core/store.js';
import { PRESETS, presetPatch } from './core/color.js';
import { RECIPES } from './core/recipes.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const SECRET_FIELDS = ['accessSecret', 'password', 'secret'];

const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function createServer(app) {
  const s = () => app.store.data;
  const sse = new Set();

  const push = (type, data) => { for (const res of sse) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
  bus.on('state', e => push('state', { id: e.id, state: e.next }));
  bus.on('change', e => push('change', e));
  bus.on('log', e => push('log', { t: Date.now(), ...e }));

  const normClick = c => ({ single_click: 'click', single: 'click', click: 'click', double_click: 'double', double: 'double', hold: 'hold', long: 'hold' })[String(c).toLowerCase()];

  const maskedIntegrations = () => Object.fromEntries(Object.entries(s().integrations).map(([k, v]) => [k,
    { ...Object.fromEntries(Object.entries(v).map(([f, val]) => [f, SECRET_FIELDS.includes(f) && val ? '••••••' : val])), _health: app.adapters.get(k)?.health }]));

  const fullState = () => ({
    demo: app.demo,
    devices: app.registry.list(),
    scenes: s().scenes, rules: s().rules, timers: s().timers, buttons: s().buttons,
    people: s().people.map(p => ({ id: p.id, name: p.name, inside: p.inside, last: p.last, token: p.token })),
    zones: s().zones,
    settings: { lat: s().settings.lat, lon: s().settings.lon, notifyUrl: s().settings.notifyUrl, hookKey: s().settings.hookKey },
    integrations: maskedIntegrations(),
    activity: app.activity.slice(0, 60),
    presets: PRESETS,
    recipes: RECIPES.map(({ id, title, fields }) => ({ id, title, fields })),
  });

  async function body(req) {
    let n = 0; const chunks = [];
    for await (const c of req) { n += c.length; if (n > 1e6) throw new HttpError(413, 'body too large'); chunks.push(c); }
    if (!n) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'invalid JSON'); }
  }

  const find = (list, id, what) => { const x = list.find(i => i.id === id); if (!x) throw new HttpError(404, `no such ${what}`); return x; };

  // ---- authenticated API -----------------------------------------------------
  async function api(req, res, url, parts) {
    const m = req.method;
    const [a, b, c, d] = parts;

    if (a === 'state' && m === 'GET') return fullState();

    if (a === 'events' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      sse.add(res);
      const ka = setInterval(() => res.write(': ka\n\n'), 25000);
      req.on('close', () => { sse.delete(res); clearInterval(ka); });
      return undefined;
    }

    if (a === 'devices' && b) {
      const dev = app.registry.get(decodeURIComponent(b));
      if (!dev) throw new HttpError(404, 'no such device');
      if (c === 'command' && m === 'POST') {
        const { patch, preset } = await body(req);
        const p = preset ? presetPatch(PRESETS.find(x => x.id === preset) || (() => { throw new HttpError(400, 'bad preset'); })()) : patch;
        return app.registry.command(dev.id, p || {});
      }
      if (c === 'meta' && m === 'PUT') {
        const { name, room, hidden } = await body(req);
        s().deviceMeta[dev.id] = { ...(s().deviceMeta[dev.id] || {}), ...(name !== undefined && { name }), ...(room !== undefined && { room }), ...(hidden !== undefined && { hidden: !!hidden }) };
        app.store.save(); bus.emit('change', { kind: 'devices' });
        return app.registry.view(dev);
      }
      if (c === 'history') return app.registry.getHistory(dev.id);
      if (c === 'timer' && m === 'POST') {
        const { minutes, patch } = await body(req);
        if (!(minutes > 0)) throw new HttpError(400, 'minutes must be > 0');
        const t = app.timers.add(dev.id, minutes * 60000, patch || { on: false });
        bus.emit('change', { kind: 'timers' });
        return t;
      }
    }
    if (a === 'timers' && b && m === 'DELETE') { app.timers.cancel(b); bus.emit('change', { kind: 'timers' }); return { ok: true }; }

    if (a === 'scenes') {
      if (!b && m === 'POST') {
        const { name, icon, targets, capture } = await body(req);
        if (!name) throw new HttpError(400, 'name required');
        const t = targets || (capture || []).map(did => {
          const dv = app.registry.find(did); if (!dv) throw new HttpError(400, `unknown device ${did}`);
          const st = dv.state, patch = { on: !!st.on };
          if (st.on && dv.caps.includes('dim') && st.brightness != null) patch.brightness = st.brightness;
          if (st.on && st.color) patch.color = st.color; else if (st.on && st.colorTemp != null && dv.caps.includes('temp')) patch.colorTemp = st.colorTemp;
          return { device: dv.id, patch };
        });
        const sc = { id: uid('s'), name, icon: icon || '🎬', targets: t };
        s().scenes.push(sc); app.store.save(); bus.emit('change', { kind: 'scenes' });
        return sc;
      }
      if (b) {
        const sc = find(s().scenes, b, 'scene');
        if (c === 'activate' && m === 'POST') { await app.engine.activateScene(sc.id); return { ok: true }; }
        if (m === 'PUT') { const x = await body(req); Object.assign(sc, { name: x.name ?? sc.name, icon: x.icon ?? sc.icon, targets: x.targets ?? sc.targets }); app.store.save(); bus.emit('change', { kind: 'scenes' }); return sc; }
        if (m === 'DELETE') { s().scenes = s().scenes.filter(x => x !== sc); app.store.save(); bus.emit('change', { kind: 'scenes' }); return { ok: true }; }
      }
    }

    if (a === 'rules') {
      if (!b && m === 'POST') {
        const x = await body(req);
        validateRule(x);
        const rule = { id: uid('r'), enabled: true, mode: 'restart', conditions: [], ...x };
        s().rules.push(rule); app.store.save(); bus.emit('change', { kind: 'rules' });
        return rule;
      }
      if (b) {
        const rule = find(s().rules, b, 'rule');
        if (c === 'run' && m === 'POST') { app.engine.runNow(rule.id); return { ok: true }; }
        if (m === 'PUT') {
          const x = await body(req); validateRule({ ...rule, ...x });
          Object.assign(rule, x, { id: rule.id });
          app.engine.level.delete(rule.id); // re-baseline level triggers
          app.store.save(); bus.emit('change', { kind: 'rules' }); return rule;
        }
        if (m === 'DELETE') { s().rules = s().rules.filter(x => x !== rule); app.engine.level.delete(rule.id); app.store.save(); bus.emit('change', { kind: 'rules' }); return { ok: true }; }
      }
    }

    if (a === 'recipes' && b && m === 'POST') return app.addRecipe(b, await body(req));

    if (a === 'buttons' && b) {
      const btn = s().buttons[b];
      if (!btn) throw new HttpError(404, 'no such button');
      if (!c && m === 'PUT') { const { name } = await body(req); if (name) btn.name = name; app.store.save(); bus.emit('change', { kind: 'buttons' }); return btn; }
      if (!c && m === 'DELETE') { ['click', 'double', 'hold'].forEach(k => app.setButtonAction(b, k, null)); delete s().buttons[b]; app.store.save(); bus.emit('change', { kind: 'buttons' }); return { ok: true }; }
      if (['click', 'double', 'hold'].includes(c) && m === 'PUT') { const { action } = await body(req); app.setButtonAction(b, c, action || null); return btn; }
    }
    if (a === 'buttons' && !b && m === 'POST') { // manual add / test
      const { id: bid, name } = await body(req);
      if (!bid) throw new HttpError(400, 'id required');
      s().buttons[bid] ||= { name: name || bid, actions: {} }; app.store.save(); bus.emit('change', { kind: 'buttons' });
      return s().buttons[bid];
    }

    if (a === 'people') {
      if (!b && m === 'POST') { const { name } = await body(req); if (!name) throw new HttpError(400, 'name required'); const p = app.geo.addPerson(name); bus.emit('change', { kind: 'people' }); return p; }
      if (b && m === 'DELETE') { s().people = s().people.filter(p => p.id !== b); app.store.save(); bus.emit('change', { kind: 'people' }); return { ok: true }; }
    }
    if (a === 'zones') {
      if (!b && m === 'POST') {
        const x = await body(req);
        const z = { id: x.id || uid('z'), name: x.name, lat: +x.lat, lon: +x.lon, radius: +x.radius || 150 };
        if (!z.name || !isFinite(z.lat) || !isFinite(z.lon)) throw new HttpError(400, 'name, lat, lon required');
        s().zones.push(z); app.store.save(); bus.emit('change', { kind: 'zones' }); return z;
      }
      if (b && m === 'PUT') {
        const z = find(s().zones, b, 'zone'), x = await body(req);
        for (const k of ['name', 'lat', 'lon', 'radius']) if (x[k] !== undefined) z[k] = k === 'name' ? x[k] : +x[k];
        delete z.unset;
        app.store.save(); bus.emit('change', { kind: 'zones' }); return z;
      }
      if (b && m === 'DELETE') { s().zones = s().zones.filter(z => z.id !== b); app.store.save(); bus.emit('change', { kind: 'zones' }); return { ok: true }; }
    }
    if (a === 'geo-test' && b && c && m === 'POST') { // "simulate arriving/leaving" from the UI
      const p = find(s().people, b, 'person');
      return app.geo.event(p, c, d !== 'leave') || { unchanged: true };
    }

    if (a === 'settings' && m === 'PUT') {
      const x = await body(req);
      for (const k of ['lat', 'lon']) if (x[k] !== undefined) s().settings[k] = x[k] === null || x[k] === '' ? null : +x[k];
      if (x.notifyUrl !== undefined) s().settings.notifyUrl = String(x.notifyUrl);
      app.store.save(); bus.emit('change', { kind: 'settings' });
      return { ok: true };
    }

    if (a === 'integrations' && b && ['tuya', 'meross', 'wiser'].includes(b)) {
      if (m === 'PUT') {
        const x = await body(req);
        const old = s().integrations[b] || {};
        // Masked placeholders from the UI mean "keep the stored secret".
        for (const f of SECRET_FIELDS) if (x[f] === '••••••') x[f] = old[f];
        s().integrations[b] = x; app.store.flush();
        await app.startAdapters();
        bus.emit('change', { kind: 'integrations' });
        return { ok: true };
      }
      if (m === 'DELETE') { delete s().integrations[b]; app.store.flush(); await app.startAdapters(); bus.emit('change', { kind: 'integrations' }); return { ok: true }; }
    }

    if (a === 'sim' && b && m === 'POST') {
      const sim = app.adapters.get('sim');
      if (!sim) throw new HttpError(404, 'demo mode is off');
      return sim.simulate(b);
    }

    throw new HttpError(404, 'not found');
  }

  function validateRule(r) {
    const T = ['flic', 'geo', 'time', 'power', 'offline', 'online', 'state', 'manual'];
    if (!r.name) throw new HttpError(400, 'rule needs a name');
    if (!r.trigger || !T.includes(r.trigger.type)) throw new HttpError(400, `trigger.type must be one of ${T.join(', ')}`);
    if (!Array.isArray(r.actions)) throw new HttpError(400, 'actions must be a list');
    const A = ['set', 'scene', 'wait', 'wait_until', 'if', 'notify', 'cycle', 'timer'];
    const walk = list => list.forEach(a => {
      if (!A.includes(a.type)) throw new HttpError(400, `unknown action type: ${a.type}`);
      [a.then, a.else].forEach(l => l && walk(l));
    });
    walk(r.actions);
  }

  // ---- public hooks: Flic buttons & phone automations --------------------------
  async function hooks(req, res, url, parts) {
    // /hook/<hookKey>/flic/<button>/<click>
    if (parts[0] === 'hook') {
      if (!same(parts[1] || '', s().settings.hookKey)) throw new HttpError(401, 'bad hook key');
      if (parts[2] === 'flic' && parts[3]) {
        const click = normClick(parts[4] || url.searchParams.get('click') || 'click');
        if (!click) throw new HttpError(400, 'click must be click, double or hold');
        app.flic(decodeURIComponent(parts[3]), click);
        return { ok: true };
      }
    }
    // /geo/<personToken>  POST {lat,lon,accuracy}    or    /geo/<personToken>/<zone>/<enter|leave>
    if (parts[0] === 'geo') {
      const p = app.geo.byToken(parts[1] || '');
      if (!p) throw new HttpError(401, 'bad token');
      if (parts[2] && parts[3]) return { event: app.geo.event(p, decodeURIComponent(parts[2]), parts[3] === 'enter') || { unchanged: true } };
      const x = req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams);
      const lat = +x.lat, lon = +x.lon;
      if (!isFinite(lat) || !isFinite(lon)) throw new HttpError(400, 'lat/lon required');
      return { events: app.geo.report(p, { lat, lon, accuracy: +x.accuracy || 0 }) };
    }
    return undefined;
  }

  function serveStatic(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.join(WEB, rel);
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj ?? null)); };
    try {
      if (parts[0] === 'healthz') json(200, { ok: true, devices: app.registry.devices.size });
      else if (parts[0] === 'api') {
        const key = req.headers['x-api-key'] || url.searchParams.get('key') || '';
        if (!same(key, s().settings.adminKey)) throw new HttpError(401, 'unauthorised');
        const out = await api(req, res, url, parts.slice(1));
        if (out !== undefined) json(200, out);
      } else if (parts[0] === 'hook' || parts[0] === 'geo') {
        json(200, await hooks(req, res, url, parts));
      } else serveStatic(res, url.pathname);
    } catch (e) {
      if (res.headersSent) return res.end();
      json(e.code || 500, { error: e.message });
      if (!e.code) app.log('error', `${req.method} ${url.pathname}: ${e.message}`);
    }
  });
}

// ---- entry point ------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 8787, host = process.env.HOST || '0.0.0.0';
  const demo = process.env.HOMEHUB_DEMO === '1';
  const app = new App({ dataDir: process.env.HOMEHUB_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), demo });
  await app.start();
  const srv = createServer(app);
  srv.listen(port, host, () => {
    const k = app.settings;
    console.log(`\nHomeHub${demo ? ' (demo mode)' : ''} running\n  Open:      http://localhost:${port}/\n  Admin key: ${k.adminKey}   (the web app asks for this once)\n  Hook key:  ${k.hookKey}   (used in Flic / phone-automation URLs)\n`);
  });
  const quit = async () => { await app.stop(); process.exit(0); };
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
}
