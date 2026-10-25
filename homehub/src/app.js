import path from 'node:path';
import crypto from 'node:crypto';
import { bus } from './core/bus.js';
import { Store, uid } from './core/store.js';
import { Registry } from './core/registry.js';
import { Engine, realClock } from './core/engine.js';
import { Timers } from './core/timers.js';
import { Geo } from './core/geo.js';
import { RECIPES } from './core/recipes.js';
import { SimAdapter } from './adapters/sim.js';
import { TuyaAdapter } from './adapters/tuya.js';
import { MerossAdapter } from './adapters/meross.js';
import { WiserAdapter } from './adapters/wiser.js';

const ADAPTERS = { tuya: TuyaAdapter, meross: MerossAdapter, wiser: WiserAdapter };

/** Wires everything together. server.js adds HTTP on top; tests use this directly. */
export class App {
  constructor({ dataDir = './data', demo = false, clock = realClock, persist = true } = {}) {
    this.demo = demo;
    this.clock = clock;
    this.store = new Store(persist ? path.join(dataDir, 'homehub.json') : null);
    this.activity = [];
    this.log = (level, msg) => bus.emit('log', { level, msg });
    this._logHandler = e => {
      this.activity.unshift({ t: Date.now(), level: e.level, msg: e.msg });
      this.activity.length = Math.min(this.activity.length, 200);
    };
    bus.on('log', this._logHandler);
    this.registry = new Registry(this.store, () => clock.now());
    this.timers = new Timers({ store: this.store, registry: this.registry, clock, log: this.log });
    this.engine = new Engine({
      store: this.store, registry: this.registry, timers: this.timers, clock, log: this.log,
      notifier: msg => this.notify(msg),
    });
    this.geo = new Geo(this.store);
    this.adapters = new Map();
  }

  get settings() { return this.store.data.settings; }

  async start() {
    const s = this.settings;
    // First run: mint the two secrets. adminKey guards the UI/API; hookKey is the only thing
    // you paste into Flic / phone automations, so a leaked button URL can't edit your config.
    if (!s.adminKey) s.adminKey = crypto.randomBytes(18).toString('base64url');
    if (!s.hookKey) s.hookKey = crypto.randomBytes(12).toString('base64url');
    if (!this.store.data.zones.length) this.store.data.zones.push({ id: 'home', name: 'Home', lat: s.lat ?? 0, lon: s.lon ?? 0, radius: 150, unset: s.lat == null });
    if (!this.store.data.people.length) this.geo.addPerson('Me');
    this.store.flush();

    this.engine.start();
    this.timers.start();
    await this.startAdapters();
    this._tick = setInterval(() => bus.emit('tick', { now: this.clock.now() }), 15000);
  }

  async startAdapters() {
    for (const a of this.adapters.values()) a.stop();
    this.adapters.clear();
    this.registry.adapters.clear();
    const list = [];
    if (this.demo) list.push(new SimAdapter({ speed: 1 }, this.registry, this.log));
    for (const [name, Cls] of Object.entries(ADAPTERS)) {
      const cfg = this.store.data.integrations[name];
      if (cfg && cfg.enabled !== false) list.push(new Cls(cfg, this.registry, this.log));
    }
    for (const a of list) {
      this.adapters.set(a.name, a);
      this.registry.addAdapter(a);
      a.start().catch(e => this.log('error', `${a.name}: ${e.message}`));
    }
  }

  async stop() {
    clearInterval(this._tick);
    bus.off('log', this._logHandler);
    this.engine.stop(); this.timers.stop();
    this.adapters.forEach(a => a.stop());
    this.store.flush();
  }

  async notify(message) {
    const url = this.settings.notifyUrl;
    if (!url) return;
    try { await fetch(url, { method: 'POST', body: message, signal: AbortSignal.timeout(5000) }); } // ntfy.sh style
    catch (e) { this.log('warn', `notify failed: ${e.message}`); }
  }

  // ---- Flic -----------------------------------------------------------------

  /** Called by the webhook. Unknown buttons are auto-registered so "press it to add it" works. */
  flic(button, click) {
    const b = this.store.data.buttons;
    const isNew = !b[button];
    b[button] ||= { name: button, actions: {} };
    Object.assign(b[button], { lastSeen: this.clock.now(), lastClick: click });
    this.store.save();
    if (isNew) bus.emit('change', { kind: 'buttons' });
    this.log('info', `🔘 ${b[button].name} ${click}`);
    bus.emit('flic', { button, click });
  }

  /** Assign what a click does. action = null | {kind:'toggle'|'on'|'off'|'scene'|'rule', ref} */
  setButtonAction(button, click, action) {
    const b = this.store.data.buttons[button];
    if (!b) throw new Error('unknown button');
    const id = `flic:${button}:${click}`;
    const rules = this.store.data.rules;
    const i = rules.findIndex(r => r.id === id);
    if (i >= 0) rules.splice(i, 1);
    delete b.actions[click];
    if (action) {
      const actions = {
        toggle: [{ type: 'set', device: action.ref, patch: { toggle: true } }],
        on: [{ type: 'set', device: action.ref, patch: { on: true } }],
        off: [{ type: 'set', device: action.ref, patch: { on: false } }],
        scene: [{ type: 'scene', scene: action.ref }],
        timer: [{ type: 'set', device: action.ref, patch: { on: true } }, { type: 'timer', device: action.ref, minutes: action.minutes || 10, patch: { on: false } }],
      }[action.kind];
      if (!actions) throw new Error(`bad action kind: ${action.kind}`);
      rules.push({ id, name: `${b.name} ${click}`, enabled: true, managedBy: 'flic', trigger: { type: 'flic', button, click }, conditions: [], actions });
      b.actions[click] = action;
    }
    this.store.save();
    bus.emit('change', { kind: 'rules' });
  }

  // ---- Recipes ---------------------------------------------------------------

  addRecipe(recipeId, params) {
    const rec = RECIPES.find(r => r.id === recipeId);
    if (!rec) throw new Error('unknown recipe');
    const p = {};
    for (const f of rec.fields) p[f.key] = params[f.key] ?? f.default;
    const rule = { id: uid('r'), enabled: true, conditions: [], mode: 'restart', ...rec.build(p) };
    this.store.data.rules.push(rule);
    this.store.save();
    bus.emit('change', { kind: 'rules' });
    return rule;
  }
}
