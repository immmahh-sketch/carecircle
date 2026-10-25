import { bus } from './bus.js';

const HISTORY = 180;

/**
 * Holds every known device and its live state. Adapters push state in via
 * upsert()/update(); everything else (UI, engine) reads and commands through here.
 *
 * Device shape:
 *   { id, name, adapter, type:'plug'|'light'|'switch'|'heating', caps:[...],
 *     state:{ online, on, brightness(0-100), color:{h,s,v}|null, colorTemp(0-100),
 *             power(W), energy(kWh), temp, target, peak, offlineSince, onSince } }
 * caps: onoff, dim, color, temp, power, heat
 */
export class Registry {
  constructor(store, now = () => Date.now()) {
    this.store = store;
    this.now = now;
    this.devices = new Map();
    this.adapters = new Map();
    this.history = new Map(); // id -> [{t, w}]
  }

  addAdapter(adapter) { this.adapters.set(adapter.name, adapter); }

  meta(id) { return this.store.data.deviceMeta[id] || {}; }

  upsert(def) {
    const prev = this.devices.get(def.id);
    if (!prev) {
      this.devices.set(def.id, {
        id: def.id, name: def.name, adapter: def.adapter, type: def.type || 'plug',
        caps: def.caps || ['onoff'], native: def.native || {},
        state: { online: true, ...(def.state || {}) },
      });
      this._derive(this.devices.get(def.id), {});
      bus.emit('change', { kind: 'devices' });
    } else {
      Object.assign(prev, { name: def.name ?? prev.name, caps: def.caps ?? prev.caps, native: { ...prev.native, ...(def.native || {}) } });
      if (def.state) this.update(def.id, def.state);
    }
  }

  /** Merge a partial state; emits 'state' with the set of changed keys. */
  update(id, partial) {
    const d = this.devices.get(id);
    if (!d) return;
    const prev = { ...d.state };
    const next = { ...d.state, ...partial };
    const changes = [];
    for (const k of Object.keys(partial)) {
      if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) changes.push(k);
    }
    d.state = next;
    this._derive(d, prev);
    if (typeof next.power === 'number') {
      const h = this.history.get(id) || [];
      h.push({ t: this.now(), w: next.power });
      if (h.length > HISTORY) h.shift();
      this.history.set(id, h);
    }
    if (changes.length || d.state.peak !== prev.peak) {
      bus.emit('state', { id, prev, next: d.state, changes });
    }
  }

  /** Bookkeeping: online/offline timestamps, on-since, and peak watts since switched on. */
  _derive(d, prev) {
    const s = d.state, t = this.now();
    if (s.online === false) s.offlineSince = s.offlineSince || t;
    else s.offlineSince = null;
    if (s.on === true) s.onSince = s.onSince || t;
    else if (s.on === false) { s.onSince = null; s.peak = 0; }
    if (typeof s.power === 'number' && s.on !== false) s.peak = Math.max(s.peak || 0, s.power);
  }

  markOffline(id) { this.update(id, { online: false }); }

  get(id) { return this.devices.get(id); }

  view(d) {
    const m = this.meta(d.id);
    return {
      id: d.id, name: m.name || d.name, room: m.room || '', hidden: !!m.hidden,
      adapter: d.adapter, type: d.type, caps: d.caps, state: d.state,
    };
  }

  list() { return [...this.devices.values()].map(d => this.view(d)); }

  /** Case-insensitive lookup by id or display name (used by rules & scenes). */
  find(ref) {
    if (this.devices.has(ref)) return this.devices.get(ref);
    const low = String(ref).toLowerCase();
    return [...this.devices.values()].find(d => (this.meta(d.id).name || d.name).toLowerCase() === low);
  }

  /** Send a patch ({on, brightness, color, colorTemp, target}) to a device. */
  async command(ref, patch) {
    const d = this.find(ref);
    if (!d) throw new Error(`unknown device: ${ref}`);
    const adapter = this.adapters.get(d.adapter);
    if (!adapter) throw new Error(`no adapter for ${d.id}`);
    const p = { ...patch };
    if (p.toggle) { p.on = !d.state.on; delete p.toggle; }
    if (p.brightness != null) p.brightness = Math.max(1, Math.min(100, Math.round(p.brightness)));
    if (p.colorTemp != null) p.colorTemp = Math.max(0, Math.min(100, Math.round(p.colorTemp)));
    // Setting a colour/brightness/temp on a light implies it should be on.
    if (p.on === undefined && (p.color || p.brightness != null || p.colorTemp != null) && d.caps.includes('onoff')) p.on = true;
    await adapter.command(d, p);
    this.update(d.id, p); // optimistic; next poll confirms
    return this.view(d);
  }

  getHistory(id) { return this.history.get(id) || []; }
}
