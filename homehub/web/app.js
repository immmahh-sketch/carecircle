// HomeHub web app. Vanilla JS, no build step. All DOM is built with h() (text via textContent), never innerHTML.

const $ = s => document.querySelector(s);
const view = $('#view'), sheet = $('#sheet');
let S = null;                       // server state snapshot
let tab = localStorage.tab || 'home';
let key = localStorage.key || new URLSearchParams(location.search).get('key') || '';
let openCard = null;                // expanded device id
let busy = 0;                       // >0 while the user is dragging a control: don't re-render under them

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) { askKey(); throw new Error('unauthorised'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || `Error ${r.status}`); throw new Error(j.error); }
  return j;
}
const act = (fn) => async (...a) => { try { await fn(...a); } catch (e) { /* toasted */ } };
const throttle = (fn, ms) => { let t = 0, last, timer; return (...a) => { last = a; const d = Date.now(); clearTimeout(timer); if (d - t > ms) { t = d; fn(...last); } else timer = setTimeout(() => { t = Date.now(); fn(...last); }, ms); }; };

function toast(msg) {
  const t = h('div', { style: { position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)', background: '#333', padding: '8px 14px', borderRadius: '9px', zIndex: 50 } }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3000);
}

// ---- helpers ------------------------------------------------------------------------
const devName = id => S.devices.find(d => d.id === id || d.name === id)?.name || id;
const personName = id => id === '*' ? 'anyone' : S.people.find(p => p.id === id)?.name || id;
const zoneName = id => S.zones.find(z => z.id === id)?.name || id;
const sceneName = id => S.scenes.find(s => s.id === id || s.name === id)?.name || id;
const ICON = { plug: '🔌', light: '💡', switch: '🔘', heating: '🌡️' };
const hsv2css = c => c ? `hsl(${c.h} ${c.s}% ${Math.max(20, 100 - c.s / 2 - (100 - c.v) / 2)}%)` : '';
const ago = t => { if (!t) return ''; const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
const hex = c => { const f = n => { const k = (n + c.h / 60) % 6; const v = c.v / 100, s = c.s / 100; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0'); }; return `#${f(5)}${f(3)}${f(1)}`; };
const hexToHsv = x => { const n = parseInt(x.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); let hh = 0; if (d) { hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh = Math.round(hh * 60); if (hh < 0) hh += 360; } return { h: hh, s: Math.round(mx ? d / mx * 100 : 0), v: Math.round(mx * 100) }; };

function openSheet(...content) {
  sheet.replaceChildren(h('div', { class: 'panel' }, ...content));
  sheet.hidden = false;
  sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
}
const closeSheet = () => { sheet.hidden = true; sheet.replaceChildren(); };

function askKey() {
  openSheet(h('h2', {}, 'Sign in'), h('p', { class: 'sub' }, 'Enter the admin key printed when HomeHub started (also in data/homehub.json).'),
    h('input', { id: 'k', placeholder: 'admin key', style: { width: '100%' } }),
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: () => { key = $('#k').value.trim(); localStorage.key = key; closeSheet(); boot(); } }, 'Connect')));
}

// ---- devices ------------------------------------------------------------------------
function powerLine(d) {
  const s = d.state;
  if (typeof s.power === 'number') return `${s.power >= 1000 ? (s.power / 1000).toFixed(2) + ' kW' : Math.round(s.power) + ' W'}`;
  return '';
}

function deviceCard(d) {
  const s = d.state, offline = s.online === false, open = openCard === d.id;
  const heating = d.type === 'heating';
  const status = offline ? h('span', { class: 'badge bad' }, 'offline ' + ago(s.offlineSince))
    : heating ? h('span', { class: 'sub' }, `${s.temp ?? '–'}° → ${s.target ?? '–'}°${s.auto === false ? ' (manual)' : ''}`)
    : h('span', { class: 'sub' }, [s.on ? 'On' : 'Off', d.caps.includes('dim') && s.on ? `${s.brightness}%` : '', powerLine(d)].filter(Boolean).join(' · '));
  const timers = S.timers.filter(t => t.device === d.id);
  const card = h('div', { class: 'card' + (offline ? ' off' : ''), 'data-id': d.id },
    h('div', { class: 'row' },
      h('div', { class: 'ico', style: { filter: s.on && !heating ? 'none' : 'grayscale(1)', color: hsv2css(s.color) } }, ICON[d.type] || '🔌'),
      h('div', { class: 'grow', onclick: () => { openCard = open ? null : d.id; render(); }, style: { cursor: 'pointer' } },
        h('div', { class: 'name' }, d.name), h('div', { class: 'row' }, status, d.room ? h('span', { class: 'sub' }, '· ' + d.room) : null, timers.length ? h('span', { class: 'badge warn' }, '⏲ ' + Math.max(1, Math.round((timers[0].at - Date.now()) / 60000)) + 'm') : null)),
      d.caps.includes('onoff') ? h('button', { class: 'sw' + (s.on ? ' on' : ''), 'aria-label': 'toggle', onclick: act(() => api(`/devices/${enc(d.id)}/command`, 'POST', { patch: { toggle: true } })) }) : null),
    open ? deviceDetail(d) : null);
  return card;
}
const enc = encodeURIComponent;

function deviceDetail(d) {
  const s = d.state, cmd = patch => api(`/devices/${enc(d.id)}/command`, 'POST', { patch }).catch(() => {});
  const box = h('div', { class: 'gap' });
  if (d.type === 'heating') {
    box.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => cmd({ target: (s.target || 18) - 0.5 }) }, '−'), h('div', { class: 'grow', style: { textAlign: 'center', fontSize: '22px' } }, `${s.target ?? '–'}°C`), h('button', { class: 'btn', onclick: () => cmd({ target: (s.target || 18) + 0.5 }) }, '+'),
      h('button', { class: 'btn', onclick: () => cmd({ auto: true }) }, 'Back to schedule')));
  }
  if (d.caps.includes('dim')) {
    const send = throttle(v => cmd({ brightness: +v }), 300);
    box.append(h('label', { class: 'f' }, 'Brightness'), h('input', { type: 'range', min: 1, max: 100, value: s.brightness ?? 100, oninput: e => { busy++; send(e.target.value); }, onchange: e => { busy = 0; cmd({ brightness: +e.target.value }); } }));
  }
  if (d.caps.includes('color') || d.caps.includes('temp')) {
    box.append(h('label', { class: 'f' }, 'Colour'));
    const chips = h('div', { class: 'chips' });
    for (const p of S.presets) {
      const bg = p.color ? p.color : `hsl(${p.temp < 50 ? 32 : 210} ${p.temp < 50 ? 100 : 80}% ${p.temp < 50 ? 70 : 85}%)`;
      if (p.color && !d.caps.includes('color')) continue;
      chips.append(h('button', { class: 'chip', title: p.name, style: { background: bg }, onclick: () => api(`/devices/${enc(d.id)}/command`, 'POST', { preset: p.id }).catch(() => {}) }));
    }
    if (d.caps.includes('color')) {
      const send = throttle(v => cmd({ color: hexToHsv(v), brightness: s.brightness ?? 80 }), 300);
      chips.append(h('input', { type: 'color', value: s.color ? hex(s.color) : '#ffffff', title: 'any colour', oninput: e => { busy++; send(e.target.value); }, onchange: e => { busy = 0; cmd({ color: hexToHsv(e.target.value), brightness: s.brightness ?? 80 }); } }));
    }
    box.append(chips);
    if (d.caps.includes('temp')) box.append(h('label', { class: 'f' }, 'White: warm ↔ cool'), h('div', { class: 'warmcool' }), h('input', { type: 'range', min: 0, max: 100, value: s.colorTemp ?? 50, onchange: e => { busy = 0; cmd({ colorTemp: +e.target.value }); }, oninput: () => busy++ }));
  }
  if (d.caps.includes('onoff')) {
    box.append(h('label', { class: 'f' }, s.on ? 'Turn off in…' : 'Turn on for…'));
    const row = h('div', { class: 'chips' });
    for (const m of [5, 10, 30, 60, 120]) row.append(h('button', { class: 'chip txt', onclick: act(async () => {
      if (!s.on) await cmd({ on: true });
      await api(`/devices/${enc(d.id)}/timer`, 'POST', { minutes: m, patch: { on: false } }); toast(`Will switch off in ${m >= 60 ? m / 60 + 'h' : m + 'min'}`);
    }) }, m >= 60 ? m / 60 + 'h' : m + 'm'));
    for (const t of S.timers.filter(t => t.device === d.id)) row.append(h('button', { class: 'chip txt bad', onclick: act(() => api(`/timers/${t.id}`, 'DELETE')) }, '✕ cancel timer'));
    box.append(row);
  }
  if (d.caps.includes('power')) {
    const cv = h('canvas', { class: 'spark', width: 600, height: 68 });
    box.append(h('label', { class: 'f' }, `Power ${powerLine(d)}  ·  peak since on: ${Math.round(s.peak || 0)} W`), cv);
    api(`/devices/${enc(d.id)}/history`).then(hist => spark(cv, hist)).catch(() => {});
  }
  box.append(h('div', { class: 'row wrap gap' },
    h('button', { class: 'btn sm', onclick: () => rename(d) }, 'Rename / room'),
    h('span', { class: 'sub' }, d.id)));
  return box;
}

function spark(cv, hist) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  if (hist.length < 2) return;
  const mx = Math.max(10, ...hist.map(p => p.w));
  c.strokeStyle = '#2dd4bf'; c.lineWidth = 2; c.beginPath();
  hist.forEach((p, i) => { const x = i / (hist.length - 1) * W, y = H - 4 - p.w / mx * (H - 8); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke();
}

function rename(d) {
  const n = h('input', { value: d.name, style: { width: '100%' } }), r = h('input', { value: d.room, placeholder: 'e.g. Garage', style: { width: '100%' } });
  openSheet(h('h2', {}, 'Rename'), h('label', { class: 'f' }, 'Name'), n, h('label', { class: 'f' }, 'Room'), r,
    h('div', { class: 'row gap' }, h('button', { class: 'btn pri', onclick: act(async () => { await api(`/devices/${enc(d.id)}/meta`, 'PUT', { name: n.value, room: r.value }); closeSheet(); }) }, 'Save'),
      h('button', { class: 'btn', onclick: act(async () => { await api(`/devices/${enc(d.id)}/meta`, 'PUT', { hidden: true }); closeSheet(); }) }, 'Hide')));
}

function renderHome() {
  const devs = S.devices.filter(d => !d.hidden);
  if (!devs.length) return h('div', { class: 'empty' }, 'No devices yet.', h('br'), 'Connect SmartLife, Meross or Wiser under ', h('b', {}, 'More → Connections'), '.');
  const rooms = [...new Set(devs.map(d => d.room || 'Devices'))];
  const offline = devs.filter(d => d.state.online === false);
  return h('div', {},
    offline.length ? h('div', { class: 'note', style: { borderColor: 'var(--bad)' } }, `⚠ ${offline.map(d => d.name).join(', ')} ${offline.length > 1 ? 'are' : 'is'} offline`) : null,
    rooms.map(r => [h('h2', {}, r), h('div', { class: 'grid' }, devs.filter(d => (d.room || 'Devices') === r).map(deviceCard))]));
}

// ---- scenes -------------------------------------------------------------------------
function renderScenes() {
  return h('div', {}, h('h2', {}, 'Scenes'),
    S.scenes.length ? h('div', { class: 'grid' }, S.scenes.map(sc => h('div', { class: 'card tile', onclick: act(() => api(`/scenes/${sc.id}/activate`, 'POST').then(() => toast(sc.name))) },
      h('span', { class: 'ico' }, sc.icon), h('div', { class: 'name' }, sc.name), h('div', { class: 'sub' }, `${sc.targets.length} devices`),
      h('button', { class: 'btn sm bad', style: { marginTop: '8px' }, onclick: e => { e.stopPropagation(); if (confirm(`Delete ${sc.name}?`)) act(() => api(`/scenes/${sc.id}`, 'DELETE'))(); } }, 'Delete')))) : h('div', { class: 'empty' }, 'No scenes yet.'),
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: newScene }, '+ New scene from current state')));
}
function newScene() {
  const checks = S.devices.filter(d => !d.hidden && d.caps.includes('onoff')).map(d => ({ d, c: h('input', { type: 'checkbox', checked: d.type === 'light' || null }) }));
  const name = h('input', { placeholder: 'Movie night', style: { width: '100%' } }), icon = h('input', { value: '🎬', style: { width: '70px' } });
  openSheet(h('h2', {}, 'New scene'), h('p', { class: 'sub' }, 'Set your lights how you want them first, then tick what to include — HomeHub saves each device’s current on/off, brightness and colour.'),
    h('div', { class: 'row' }, icon, name),
    h('div', { class: 'gap' }, checks.map(({ d, c }) => h('label', { class: 'row', style: { padding: '6px 0' } }, c, d.name, h('span', { class: 'sub' }, d.state.on ? 'on' : 'off')))),
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: act(async () => {
      if (!name.value) return toast('Give it a name');
      await api('/scenes', 'POST', { name: name.value, icon: icon.value, capture: checks.filter(x => x.c.checked).map(x => x.d.id) }); closeSheet();
    }) }, 'Save scene')));
}

// ---- automations ----------------------------------------------------------------------
function describeTrigger(t) {
  switch (t.type) {
    case 'flic': return `Flic "${S.buttons[t.button]?.name || t.button}" ${t.click}`;
    case 'geo': return `${personName(t.person)} ${t.event === 'enter' ? 'arrives at' : 'leaves'} ${zoneName(t.zone)}`;
    case 'time': return `At ${t.at}${t.offset ? ` ${t.offset > 0 ? '+' : ''}${t.offset}min` : ''}${t.days?.length && t.days.length < 7 ? ' on ' + t.days.map(i => 'SMTWTFS'[i]).join('') : ''}`;
    case 'power': return `${devName(t.device)} ${t.wasAbove != null ? `was over ${t.wasAbove} W and ` : ''}${t.below != null ? `drops below ${t.below} W` : ''}${t.above != null ? `rises above ${t.above} W` : ''}${t.for ? ` for ${t.for}s` : ''}`;
    case 'offline': return `${devName(t.device)} goes offline${t.for ? ` for ${t.for}s` : ''}`;
    case 'online': return `${devName(t.device)} comes back online`;
    case 'state': return `${devName(t.device)} ${t.attr} ${t.op || '='} ${t.value}`;
    default: return 'Manual';
  }
}
function describeAction(a) {
  switch (a.type) {
    case 'set': { const p = a.patch || {}; const who = [].concat(a.devices || a.device).map(devName).join(', '); return p.toggle ? `Toggle ${who}` : p.on === true && Object.keys(p).length === 1 ? `Turn on ${who}` : p.on === false ? `Turn off ${who}` : `Set ${who} ${Object.keys(p).join('/')}`; }
    case 'scene': return `Scene “${sceneName(a.scene)}”`;
    case 'wait': return `Wait ${a.seconds ?? a.minutes + ' min'}${a.seconds != null ? 's' : ''}`;
    case 'wait_until': return `Wait up to ${a.timeoutMinutes ?? a.timeoutSeconds / 60} min for ${(a.conditions || []).map(c => `${devName(c.device)} ${c.attr} ${c.op === 'gt' ? '>' : c.op === 'lt' ? '<' : '='} ${c.value}`).join(' & ')} → then [${(a.then || []).map(describeAction).join('; ') || 'nothing'}] otherwise [${(a.else || []).map(describeAction).join('; ') || 'nothing'}]`;
    case 'timer': return `Timer: ${devName(a.device)} ${a.patch?.on === false ? 'off' : 'set'} after ${a.minutes} min`;
    case 'notify': return `Notify “${a.message}”`;
    case 'cycle': return `Colour-cycle ${devName(a.device)}`;
    case 'if': return 'If … then … else';
    default: return a.type;
  }
}

function renderRules() {
  const rules = S.rules.filter(r => r.managedBy !== 'flic');
  return h('div', {}, h('h2', {}, 'Automations'),
    h('div', { class: 'list' }, rules.length ? rules.map(r => h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, r.name)),
        h('button', { class: 'sw' + (r.enabled !== false ? ' on' : ''), onclick: act(() => api(`/rules/${r.id}`, 'PUT', { enabled: r.enabled === false })) })),
      h('div', { class: 'sub gap' }, h('b', {}, 'When '), describeTrigger(r.trigger)),
      (r.conditions || []).length ? h('div', { class: 'sub' }, h('b', {}, 'Only if '), r.conditions.map(c => c.type === 'person' ? `${personName(c.person || '*')} ${c.home === false ? 'not home' : 'home'}` : c.type).join(', ')) : null,
      h('div', { class: 'sub' }, h('b', {}, 'Then '), r.actions.map(describeAction).join(' → ')),
      h('div', { class: 'row gap' }, h('button', { class: 'btn sm', onclick: act(() => api(`/rules/${r.id}/run`, 'POST').then(() => toast('Running'))) }, '▶ Run now'),
        h('button', { class: 'btn sm', onclick: () => editJson(r) }, 'Edit'),
        h('button', { class: 'btn sm bad', onclick: () => { if (confirm(`Delete “${r.name}”?`)) act(() => api(`/rules/${r.id}`, 'DELETE'))(); } }, 'Delete')))) : h('div', { class: 'empty' }, 'No automations yet. Pick a recipe below.')),
    h('h2', {}, 'Add from a recipe'),
    S.recipes.map(rc => h('div', { class: 'card', style: { marginBottom: '8px', cursor: 'pointer' }, onclick: () => recipeForm(rc) }, rc.title)),
    h('div', { class: 'gap' }, h('button', { class: 'btn sm', onclick: () => editJson(null) }, 'Advanced: write a rule as JSON')));
}

function fieldInput(f) {
  const dev = S.devices.filter(d => !d.hidden);
  switch (f.kind) {
    case 'device': return h('select', {}, dev.map(d => h('option', { value: d.id }, d.name)));
    case 'devices': { const wrap = h('div', {}, dev.filter(d => d.caps.includes('onoff')).map(d => h('label', { class: 'row' }, h('input', { type: 'checkbox', value: d.id }), d.name))); wrap.get = () => [...wrap.querySelectorAll('input:checked')].map(i => i.value); return wrap; }
    case 'person': return h('select', {}, h('option', { value: '*' }, 'Anyone'), S.people.map(p => h('option', { value: p.id }, p.name)));
    case 'zone': return h('select', {}, S.zones.map(z => h('option', { value: z.id }, z.name)));
    case 'scene': return h('select', {}, S.scenes.map(s => h('option', { value: s.id }, s.name)));
    case 'number': { const i = h('input', { type: 'number', value: f.default, step: 'any' }); i.get = () => +i.value; return h('div', { class: 'row' }, i, f.unit ? h('span', { class: 'sub' }, f.unit) : null); }
    case 'time': return h('input', { value: f.default || '18:30', placeholder: '18:30 · sunrise · sunset' });
    case 'onoff': return h('select', {}, h('option', { value: 'true' }, 'On'), h('option', { value: 'false' }, 'Off'));
    case 'days': { const on = new Set(f.default); const w = h('div', { class: 'row days' }, 'SMTWTFS'.split('').map((l, i) => { const b = h('button', { class: 'btn' + (on.has(i) ? ' on' : ''), onclick: () => { on.has(i) ? on.delete(i) : on.add(i); b.classList.toggle('on'); } }, l); return b; })); w.get = () => [...on]; return w; }
  }
  return h('input', {});
}
function recipeForm(rc) {
  const inputs = rc.fields.map(f => ({ f, el: fieldInput(f) }));
  const val = ({ f, el }) => el.get ? el.get() : el.matches?.('select') && f.kind === 'onoff' ? el.value === 'true' : el.value || el.querySelector?.('input')?.value;
  openSheet(h('h2', {}, rc.title), inputs.map(x => [h('label', { class: 'f' }, x.f.label), x.el]),
    h('div', { class: 'gap row' }, h('button', { class: 'btn pri', onclick: act(async () => {
      const p = {}; inputs.forEach(x => { p[x.f.key] = val(x); });
      for (const x of inputs) if (x.f.kind === 'number') p[x.f.key] = +x.el.querySelector('input').value;
      await api(`/recipes/${rc.id}`, 'POST', p); closeSheet(); toast('Automation added');
    }) }, 'Add automation')));
}
function editJson(rule) {
  const base = rule || { name: 'My rule', trigger: { type: 'manual' }, conditions: [], actions: [{ type: 'set', device: S.devices[0]?.id || '', patch: { on: true } }] };
  const ta = h('textarea', {}, JSON.stringify(base, null, 2));
  openSheet(h('h2', {}, rule ? 'Edit rule' : 'New rule'),
    h('p', { class: 'sub' }, 'Triggers: flic, geo, time, power, offline, online, state, manual. Actions: set, scene, wait, wait_until, if, notify, timer, cycle.'), ta,
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: act(async () => {
      let o; try { o = JSON.parse(ta.value); } catch { return toast('That isn’t valid JSON'); }
      await api(rule ? `/rules/${rule.id}` : '/rules', rule ? 'PUT' : 'POST', o); closeSheet();
    }) }, 'Save')));
}

// ---- Flic buttons -----------------------------------------------------------------------
function actionSelect(btnId, click, current) {
  const kinds = [['', '— nothing —'], ['toggle', 'Toggle'], ['on', 'Turn on'], ['off', 'Turn off'], ['timer', 'Turn on, then off after…'], ['scene', 'Scene']];
  const kind = h('select', {}, kinds.map(([v, l]) => h('option', { value: v, selected: current?.kind === v || null }, l)));
  const ref = h('select', {});
  const mins = h('input', { type: 'number', value: current?.minutes || 10, style: { width: '64px' } });
  const fill = () => { ref.replaceChildren(...(kind.value === 'scene' ? S.scenes.map(s => h('option', { value: s.id, selected: current?.ref === s.id || null }, s.name)) : S.devices.filter(d => d.caps.includes('onoff')).map(d => h('option', { value: d.id, selected: current?.ref === d.id || null }, d.name)))); ref.hidden = !kind.value; mins.hidden = kind.value !== 'timer'; };
  const save = act(() => api(`/buttons/${enc(btnId)}/${click}`, 'PUT', { action: kind.value ? { kind: kind.value, ref: ref.value, minutes: +mins.value } : null }));
  kind.onchange = () => { fill(); save(); }; ref.onchange = save; mins.onchange = save;
  fill();
  return h('div', { class: 'row wrap' }, kind, ref, mins, h('span', { class: 'sub', hidden: kind.value !== 'timer' }, 'min'));
}
function renderButtons() {
  const origin = location.origin, hk = S.settings.hookKey;
  const ids = Object.keys(S.buttons).sort((a, b) => (S.buttons[b].lastSeen || 0) - (S.buttons[a].lastSeen || 0));
  return h('div', {}, h('h2', {}, 'Flic buttons'),
    h('div', { class: 'note' }, h('b', {}, 'Add a button: '), 'in the Flic app (or on the Flic Hub), set the button’s click / double-click / hold to ', h('b', {}, 'Internet Request'), ' and paste the URL below, changing ', h('code', {}, 'kitchen'), ' to any name for that button. Press it once and it appears here — then choose what it does.'),
    h('div', { class: 'sub' }, 'URL pattern (GET or POST):'),
    h('div', {}, ['click', 'double', 'hold'].map(c => h('div', { style: { margin: '4px 0' } }, h('code', {}, `${origin}/hook/${hk}/flic/kitchen/${c}`)))),
    ids.length ? ids.map(id => { const b = S.buttons[id]; return h('div', { class: 'card gap' },
      h('div', { class: 'row' }, h('div', { class: 'ico' }, '🔘'), h('div', { class: 'grow' }, h('div', { class: 'name' }, b.name), h('div', { class: 'sub' }, b.lastSeen ? `last: ${b.lastClick} ${ago(b.lastSeen)} ago${Date.now() - b.lastSeen < 15000 ? ' ✔ heard just now' : ''}` : 'not pressed yet')),
        h('button', { class: 'btn sm', onclick: () => { const n = prompt('Name', b.name); if (n) act(() => api(`/buttons/${enc(id)}`, 'PUT', { name: n }))(); } }, 'Rename'),
        h('button', { class: 'btn sm bad', onclick: () => { if (confirm('Remove button?')) act(() => api(`/buttons/${enc(id)}`, 'DELETE'))(); } }, '✕')),
      ['click', 'double', 'hold'].map(c => h('div', { class: 'gap' }, h('div', { class: 'sub' }, c === 'click' ? 'Single click' : c === 'double' ? 'Double click' : 'Hold'), actionSelect(id, c, b.actions?.[c])))); })
      : h('div', { class: 'empty' }, 'No buttons heard yet — press one.'),
    h('div', { class: 'gap' }, h('button', { class: 'btn sm', onclick: () => { const id = prompt('Button name (as used in the URL)'); if (id) act(() => api('/buttons', 'POST', { id }))(); } }, '+ Add by name')));
}

// ---- people / zones / connections / settings ---------------------------------------------
const phoneId = () => localStorage.phone || '';
let watchId = null;
function startSharing(p) {
  if (!navigator.geolocation) return toast('This browser has no location support');
  if (!window.isSecureContext) return toast('Browsers only share location over HTTPS — see README (Tailscale/Caddy). Use the shortcut URLs below instead.');
  stopSharing();
  localStorage.phone = p.id;
  watchId = navigator.geolocation.watchPosition(pos => fetch(`/geo/${p.token}`, { method: 'POST', body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }) }).catch(() => {}),
    e => toast('Location: ' + e.message), { enableHighAccuracy: true, maximumAge: 30000 });
  toast('Sharing this phone’s location while the app is open'); render();
}
function stopSharing() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; delete localStorage.phone; }

function renderPlaces() {
  const origin = location.origin;
  return h('div', {}, h('h2', {}, 'People'),
    S.people.map(p => h('div', { class: 'card', style: { marginBottom: '8px' } },
      h('div', { class: 'row' }, h('div', { class: 'ico' }, '📱'), h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name),
        h('div', { class: 'sub' }, p.inside.length ? 'At ' + p.inside.map(zoneName).join(', ') : 'Away')),
        h('button', { class: 'btn sm' + (watchId != null && phoneId() === p.id ? ' pri' : ''), onclick: () => (watchId != null && phoneId() === p.id ? (stopSharing(), render()) : startSharing(p)) }, watchId != null && phoneId() === p.id ? 'Sharing ✔' : 'This is my phone'),
        h('button', { class: 'btn sm bad', onclick: () => { if (confirm(`Remove ${p.name}?`)) act(() => api(`/people/${p.id}`, 'DELETE'))(); } }, '✕')),
      h('details', { class: 'gap' }, h('summary', { class: 'sub' }, 'Phone automation URLs (iOS Shortcuts / Tasker / MacroDroid)'),
        h('div', { class: 'sub' }, 'Arrive: '), h('code', {}, `${origin}/geo/${p.token}/home/enter`),
        h('div', { class: 'sub' }, 'Leave: '), h('code', {}, `${origin}/geo/${p.token}/home/leave`),
        h('div', { class: 'sub' }, 'Or POST {lat,lon,accuracy} to: '), h('code', {}, `${origin}/geo/${p.token}`)),
      S.zones.length ? h('div', { class: 'row wrap gap' }, h('span', { class: 'sub' }, 'Test:'), S.zones.map(z => [
        h('button', { class: 'btn sm', onclick: act(() => api(`/geo-test/${p.id}/${z.id}/enter`, 'POST')) }, `arrive ${z.name}`),
        h('button', { class: 'btn sm', onclick: act(() => api(`/geo-test/${p.id}/${z.id}/leave`, 'POST')) }, `leave ${z.name}`)])) : null)),
    h('div', {}, h('button', { class: 'btn sm', onclick: () => { const n = prompt('Name'); if (n) act(() => api('/people', 'POST', { name: n }))(); } }, '+ Add person')),
    h('h2', {}, 'Zones'),
    S.zones.map(z => h('div', { class: 'card', style: { marginBottom: '8px' } },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, z.name), h('div', { class: 'sub' }, z.unset ? '⚠ location not set yet' : `${(+z.lat).toFixed(5)}, ${(+z.lon).toFixed(5)} · ${z.radius} m`)),
        h('button', { class: 'btn sm', onclick: () => editZone(z) }, 'Edit'),
        z.id !== 'home' ? h('button', { class: 'btn sm bad', onclick: () => { if (confirm('Delete zone?')) act(() => api(`/zones/${z.id}`, 'DELETE'))(); } }, '✕') : null))),
    h('button', { class: 'btn sm', onclick: () => editZone(null) }, '+ Add zone'),
    h('div', { class: 'note' }, 'Arrival detection needs your phone to reach HomeHub when it arrives (usually on mobile data), so expose it via Tailscale or a tunnel — see the README.'));
}
function editZone(z) {
  const name = h('input', { value: z?.name || '', placeholder: 'Work', style: { width: '100%' } }), lat = h('input', { value: z?.unset ? '' : z?.lat ?? '', placeholder: 'latitude', inputmode: 'decimal' }), lon = h('input', { value: z?.unset ? '' : z?.lon ?? '', placeholder: 'longitude', inputmode: 'decimal' }), rad = h('input', { type: 'number', value: z?.radius || 150 });
  openSheet(h('h2', {}, z ? 'Edit zone' : 'New zone'), h('label', { class: 'f' }, 'Name'), name,
    h('button', { class: 'btn gap', onclick: () => navigator.geolocation?.getCurrentPosition(p => { lat.value = p.coords.latitude.toFixed(6); lon.value = p.coords.longitude.toFixed(6); }, e => toast(window.isSecureContext ? e.message : 'Location needs HTTPS — type the coordinates instead (right-click a map → copy coordinates)')) }, '📍 Use my current location'),
    h('div', { class: 'row gap' }, lat, lon), h('label', { class: 'f' }, 'Radius (metres) — 100–200 works well'), rad,
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: act(async () => {
      const b = { name: name.value, lat: lat.value, lon: lon.value, radius: rad.value };
      await api(z ? `/zones/${z.id}` : '/zones', z ? 'PUT' : 'POST', b);
      if (z?.id === 'home') await api('/settings', 'PUT', { lat: lat.value, lon: lon.value }); // also drives sunrise/sunset
      closeSheet();
    }) }, 'Save')));
}

const FORMS = {
  tuya: { title: 'SmartLife / Tuya', help: 'Create a free project at iot.tuya.com (Cloud → Development), subscribe to “Smart Home Devices Management”, link your Smart Life app account (Devices → Link App Account → scan QR), then copy the Access ID/Secret and the linked account’s UID.', fields: [['accessId', 'Access ID'], ['accessSecret', 'Access Secret', 'password'], ['uid', 'App account UID'], ['region', 'Region (eu, eu-w, us, us-e, cn, in)', 'text', 'eu'], ['pollSeconds', 'Poll every (seconds)', 'number', 30]] },
  meross: { title: 'Meross', help: 'Your Meross account is used once to fetch the device key; after that devices are controlled directly over your Wi-Fi, so give each a fixed IP in your router and list it below as JSON, e.g. {"Kitchen plug":"192.168.1.50"}.', fields: [['email', 'Email'], ['password', 'Password', 'password'], ['region', 'Region (eu, us, ap)', 'text', 'eu'], ['ips', 'Device IPs (JSON: name or uuid → ip)', 'json', {}]] },
  wiser: { title: 'Wiser (Drayton heating hub)', help: 'Hub IP address (reserve it in your router) and the hub secret. See the README for how to retrieve the secret.', fields: [['ip', 'Hub IP'], ['secret', 'Hub secret', 'password']] },
};
function renderMore() {
  const set = S.settings;
  const lat = h('input', { value: set.lat ?? '', placeholder: 'lat', inputmode: 'decimal' }), lon = h('input', { value: set.lon ?? '', placeholder: 'lon', inputmode: 'decimal' }), nu = h('input', { value: set.notifyUrl || '', placeholder: 'https://ntfy.sh/my-secret-topic', style: { width: '100%' } });
  return h('div', {}, h('h2', {}, 'Connections'),
    Object.entries(FORMS).map(([k, f]) => { const cfg = S.integrations[k]; const hl = cfg?._health;
      return h('div', { class: 'card', style: { marginBottom: '8px' }, onclick: () => integrationForm(k) },
        h('div', { class: 'row' }, h('div', { class: 'grow name' }, f.title), cfg ? h('span', { class: 'badge ' + (hl?.ok ? 'good' : 'bad') }, hl?.ok ? 'connected' : hl?.msg || 'error') : h('span', { class: 'badge' }, 'set up'))); }),
    S.demo ? [h('h2', {}, 'Demo simulator'), h('div', { class: 'note' }, 'Demo mode is on: simulated devices only. Use these to try the automations.'),
      h('div', { class: 'chips' }, [['plug-car', '🚗 Plug car in'], ['unplug-car', 'Unplug car'], ['cut-freezer', '⚡ Cut freezer power'], ['restore-freezer', 'Restore freezer']].map(([a, l]) => h('button', { class: 'btn sm', onclick: act(() => api(`/sim/${a}`, 'POST').then(() => toast(l))) }, l)))] : null,
    h('h2', {}, 'Home location (for sunrise/sunset)'), h('div', { class: 'row' }, lat, lon),
    h('h2', {}, 'Push notifications'), h('div', { class: 'sub' }, 'Automations can send notifications by POSTing the message to this URL (works with ntfy.sh).'), nu,
    h('div', { class: 'gap' }, h('button', { class: 'btn pri', onclick: act(async () => { await api('/settings', 'PUT', { lat: lat.value, lon: lon.value, notifyUrl: nu.value }); toast('Saved'); }) }, 'Save')),
    h('h2', {}, 'Timers'), S.timers.length ? S.timers.map(t => h('div', { class: 'row sub' }, `${devName(t.device)} → ${t.patch.on === false ? 'off' : 'on'} in ${Math.max(1, Math.round((t.at - Date.now()) / 60000))} min`)) : h('div', { class: 'sub' }, 'None running'),
    h('h2', {}, 'Activity'), h('div', { class: 'log' }, S.activity.map(a => h('div', { class: a.level }, `${new Date(a.t).toLocaleTimeString()}  ${a.msg}`))));
}
function integrationForm(name) {
  const f = FORMS[name], cur = S.integrations[name] || {};
  const ins = f.fields.map(([k, label, type, def]) => {
    const v = cur[k] ?? def ?? '';
    return { k, type, el: h('input', { type: type === 'password' ? 'password' : type === 'number' ? 'number' : 'text', value: type === 'json' ? JSON.stringify(v) : v, style: { width: '100%' } }), label };
  });
  openSheet(h('h2', {}, f.title), h('div', { class: 'note' }, f.help), ins.map(i => [h('label', { class: 'f' }, i.label), i.el]),
    h('div', { class: 'row gap' }, h('button', { class: 'btn pri', onclick: act(async () => {
      const o = {}; for (const i of ins) { if (i.el.value === '') continue; try { o[i.k] = i.type === 'json' ? JSON.parse(i.el.value) : i.type === 'number' ? +i.el.value : i.el.value; } catch { return toast(`${i.label}: invalid JSON`); } }
      await api(`/integrations/${name}`, 'PUT', o); closeSheet(); toast('Saved — connecting…');
    }) }, 'Save & connect'), cur.accessId || cur.email || cur.ip ? h('button', { class: 'btn bad', onclick: act(async () => { await api(`/integrations/${name}`, 'DELETE'); closeSheet(); }) }, 'Remove') : null));
}

// ---- shell ------------------------------------------------------------------------------------
const TABS = [['home', '🏠', 'Home', renderHome], ['scenes', '🎬', 'Scenes', renderScenes], ['rules', '⚙️', 'Automate', renderRules], ['buttons', '🔘', 'Buttons', renderButtons], ['places', '📍', 'Places', renderPlaces], ['more', '☰', 'More', renderMore]];
function render() {
  if (!S) return;
  $('#tabs').replaceChildren(...TABS.map(([id, i, l]) => h('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; localStorage.tab = id; render(); } }, h('span', { class: 'i' }, i), l)));
  const y = scrollY;
  view.replaceChildren(TABS.find(t => t[0] === tab)[3]());
  scrollTo(0, y);
}
const softRender = throttle(() => { if (!busy && sheet.hidden && !document.activeElement?.matches('input,select,textarea')) render(); }, 400);

let es;
async function boot() {
  if (!key) return askKey();
  try { S = await api('/state'); } catch { return; }
  render();
  es?.close();
  es = new EventSource(`/api/events?key=${encodeURIComponent(key)}`);
  es.onopen = () => $('#conn').classList.add('live');
  es.onerror = () => $('#conn').classList.remove('live');
  es.addEventListener('state', e => {
    const { id, state } = JSON.parse(e.data), d = S.devices.find(x => x.id === id);
    if (d) { d.state = state; if (tab === 'home') softRender(); }
  });
  es.addEventListener('change', async () => { try { S = await api('/state'); if (!busy && sheet.hidden) render(); } catch {} });
  es.addEventListener('log', e => { const l = JSON.parse(e.data); S.activity.unshift(l); if (tab === 'more') softRender(); });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
setInterval(() => { if (tab === 'more' || tab === 'buttons') softRender(); }, 5000);
boot();
