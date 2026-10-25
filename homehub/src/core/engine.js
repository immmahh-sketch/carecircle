import { bus } from './bus.js';
import { sunTimes } from './sun.js';
import { presetPatch, PRESETS, RAINBOW, hexToHsv } from './color.js';
import { uid } from './store.js';

export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: t => clearTimeout(t),
};

const OPS = {
  eq: (a, b) => a === b, ne: (a, b) => a !== b,
  lt: (a, b) => a < b, lte: (a, b) => a <= b,
  gt: (a, b) => a > b, gte: (a, b) => a >= b,
};

const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

/**
 * Rules: { id, name, enabled, mode:'restart'|'single'|'parallel', trigger, conditions[], actions[] }
 *
 * Triggers
 *   flic      {button, click:'click'|'double'|'hold'}
 *   geo       {person, zone, event:'enter'|'leave'}      person '*' = anyone
 *   time      {at:'HH:MM'|'sunrise'|'sunset', offset:minutes, days:[0..6]}  (0 = Sunday)
 *   power     {device, below?, above?, wasAbove?, for?}  level trigger, fires on the edge
 *   offline   {device, for?}                              device unreachable (e.g. lost power)
 *   online    {device, for?}
 *   state     {device, attr, op, value, for?}
 *   manual    {}                                          only via "Run now"
 * Conditions (all must pass): state, person, time
 * Actions: set, scene, wait, wait_until, if, notify, cycle, timer
 */
export class Engine {
  constructor({ store, registry, timers, clock = realClock, log = () => {}, notifier = async () => {} }) {
    Object.assign(this, { store, registry, timers, clock, log, notifier });
    this.runs = new Map();    // ruleId -> Set<AbortController>
    this.level = new Map();   // ruleId -> {active:boolean, timer}
    this.fired = new Map();   // ruleId -> 'YYYY-MM-DD' for time triggers
    this._off = [];
  }

  get rules() { return this.store.data.rules; }

  start() {
    const on = (ev, fn) => { bus.on(ev, fn); this._off.push(() => bus.off(ev, fn)); };
    on('state', e => this._onState(e));
    on('flic', e => this._onFlic(e));
    on('geo', e => this._onGeo(e));
    on('tick', e => this._onTick(e));
  }
  stop() {
    this._off.forEach(f => f()); this._off = [];
    for (const s of this.runs.values()) s.forEach(c => c.abort());
    for (const l of this.level.values()) l.timer && this.clock.clearTimeout(l.timer);
  }

  // ---- trigger dispatch ---------------------------------------------------

  _enabled(type) { return this.rules.filter(r => r.enabled !== false && r.trigger?.type === type); }

  _onFlic({ button, click }) {
    for (const r of this._enabled('flic')) {
      if (r.trigger.button === button && (r.trigger.click || 'click') === click) this.fire(r, { button, click });
    }
  }

  _onGeo({ person, zone, event }) {
    for (const r of this._enabled('geo')) {
      const t = r.trigger;
      if ((t.person === '*' || t.person === person) && t.zone === zone && t.event === event) this.fire(r, { person, zone, event });
    }
  }

  _onTick({ now }) {
    const d = new Date(now);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    for (const r of this._enabled('time')) {
      const t = r.trigger;
      if (t.days?.length && !t.days.includes(d.getDay())) continue;
      const at = this._timeOfDay(t.at, t.offset || 0, d);
      if (at == null) continue;
      const target = new Date(d); target.setHours(0, 0, 0, 0); target.setMinutes(at);
      const late = d - target;
      // Fire once per day, within 5 min of the target (so a restart doesn't replay old schedules).
      if (late >= 0 && late < 5 * 60000 && this.fired.get(r.id) !== dayKey) {
        this.fired.set(r.id, dayKey);
        this.fire(r, { at: t.at });
      }
    }
  }

  /** Minutes since local midnight for 'HH:MM' | 'sunrise' | 'sunset' (+offset), or null. */
  _timeOfDay(at, offset, d) {
    if (at === 'sunrise' || at === 'sunset') {
      const { lat, lon } = this.store.data.settings;
      if (lat == null || lon == null) return null;
      const s = sunTimes(d, lat, lon);
      if (!s) return null;
      const x = s[at];
      return x.getHours() * 60 + x.getMinutes() + offset;
    }
    return hm(at) + offset;
  }

  _evalLevel(t, s) {
    if (!s) return false;
    switch (t.type) {
      case 'offline': return s.online === false;
      case 'online': return s.online !== false;
      case 'power':
        return s.online !== false && typeof s.power === 'number' && s.on !== false &&
          (t.below == null || s.power < t.below) &&
          (t.above == null || s.power > t.above) &&
          (t.wasAbove == null || (s.peak || 0) >= t.wasAbove);
      case 'state': return (OPS[t.op || 'eq'] || OPS.eq)(s[t.attr], t.value);
    }
    return false;
  }

  _onState({ id, prev, next }) {
    const dev = this.registry.get(id);
    if (!dev) return;
    for (const r of this.rules) {
      if (r.enabled === false || !['power', 'offline', 'online', 'state'].includes(r.trigger?.type)) continue;
      const tdev = this.registry.find(r.trigger.device);
      if (!tdev || tdev.id !== id) continue;
      let lv = this.level.get(r.id);
      // First time we see this rule: baseline from the *previous* state so the very first change can still fire.
      if (!lv) { lv = { active: this._evalLevel(r.trigger, prev), timer: null }; this.level.set(r.id, lv); }
      const now = this._evalLevel(r.trigger, next);
      if (now && !lv.active) {
        lv.active = true;
        const hold = (r.trigger.for || 0) * 1000;
        const go = () => {
          lv.timer = null;
          if (this._evalLevel(r.trigger, tdev.state)) this.fire(r, { device: id });
        };
        if (hold > 0) lv.timer = this.clock.setTimeout(go, hold); else go();
      } else if (!now && lv.active) {
        lv.active = false;
        if (lv.timer) { this.clock.clearTimeout(lv.timer); lv.timer = null; }
      }
    }
  }

  // ---- running ------------------------------------------------------------

  /** Start a rule run (after checking conditions + concurrency mode). */
  async fire(rule, ctx = {}) {
    if (!this.checkAll(rule.conditions)) { this.log('debug', `${rule.name}: conditions not met`); return false; }
    const set = this.runs.get(rule.id) || new Set();
    this.runs.set(rule.id, set);
    const mode = rule.mode || 'restart';
    if (mode === 'single' && set.size) return false;
    if (mode === 'restart') { set.forEach(c => c.abort()); set.clear(); }
    const ac = new AbortController();
    set.add(ac);
    this.log('info', `▶ ${rule.name}`);
    try {
      await this.runActions(rule.actions || [], ac.signal, rule);
    } catch (e) {
      if (e.name !== 'AbortError') this.log('error', `${rule.name}: ${e.message}`);
    } finally {
      set.delete(ac);
    }
    return true;
  }

  runNow(id) {
    const r = this.rules.find(x => x.id === id);
    if (!r) throw new Error('no such rule');
    return this.fire({ ...r, conditions: [] }, { manual: true });
  }

  sleep(ms, signal) {
    return new Promise((res, rej) => {
      if (signal?.aborted) return rej(abortErr());
      const t = this.clock.setTimeout(() => { signal?.removeEventListener('abort', onAbort); res(); }, ms);
      const onAbort = () => { this.clock.clearTimeout(t); rej(abortErr()); };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async runActions(actions, signal, rule) {
    for (const a of actions) {
      if (signal?.aborted) throw abortErr();
      await this.runAction(a, signal, rule);
    }
  }

  async runAction(a, signal, rule) {
    switch (a.type) {
      case 'set': {
        const targets = [].concat(a.devices || a.device);
        // allSettled: one dead device must not stop the others reacting
        const res = await Promise.allSettled(targets.map(d => this.registry.command(d, a.patch || {})));
        res.forEach((r, i) => r.status === 'rejected' && this.log('error', `${targets[i]}: ${r.reason.message}`));
        return;
      }
      case 'scene': return this.activateScene(a.scene);
      case 'wait': return this.sleep((a.seconds ?? (a.minutes || 0) * 60) * 1000, signal);
      case 'notify': this.log('info', `🔔 ${a.message}`); return this.notifier(a.message, rule);
      case 'if': return this.runActions(this.checkAll(a.conditions) ? a.then || [] : a.else || [], signal, rule);
      case 'wait_until': {
        const ok = await this.waitUntil(a.conditions, (a.timeoutSeconds ?? (a.timeoutMinutes || 0) * 60) * 1000, signal);
        return this.runActions(ok ? a.then || [] : a.else || [], signal, rule);
      }
      case 'timer': {
        const ms = (a.seconds ?? (a.minutes || 0) * 60) * 1000;
        return this.timers.add(a.device, ms, a.patch);
      }
      case 'cycle': return this.cycle(a, signal);
      default: throw new Error(`unknown action type: ${a.type}`);
    }
  }

  /** Resolves true as soon as the conditions hold, false on timeout (0/undefined = wait forever). */
  waitUntil(conds, ms, signal) {
    return new Promise((res, rej) => {
      if (this.checkAll(conds)) return res(true);
      let timer = null;
      const done = v => { bus.off('state', check); signal?.removeEventListener('abort', onAbort); timer && this.clock.clearTimeout(timer); res(v); };
      const check = () => this.checkAll(conds) && done(true);
      const onAbort = () => { bus.off('state', check); timer && this.clock.clearTimeout(timer); rej(abortErr()); };
      bus.on('state', check);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (ms > 0) timer = this.clock.setTimeout(() => done(false), ms);
    });
  }

  async cycle(a, signal) {
    const colors = (a.colors?.length ? a.colors : RAINBOW).map(hexToHsv);
    const every = (a.everySeconds || 5) * 1000;
    const end = a.durationSeconds ? this.clock.now() + a.durationSeconds * 1000 : Infinity;
    for (let i = 0; this.clock.now() < end; i++) {
      await this.registry.command(a.device, { on: true, color: colors[i % colors.length], brightness: a.brightness ?? 80 });
      await this.sleep(every, signal);
    }
  }

  async activateScene(ref) {
    const sc = this.store.data.scenes.find(s => s.id === ref || s.name.toLowerCase() === String(ref).toLowerCase());
    if (!sc) throw new Error(`unknown scene: ${ref}`);
    this.log('info', `🎬 scene ${sc.name}`);
    const res = await Promise.allSettled(sc.targets.map(t => this.registry.command(t.device, t.patch)));
    res.forEach((r, i) => r.status === 'rejected' && this.log('error', `${sc.targets[i].device}: ${r.reason.message}`));
  }

  // ---- conditions ---------------------------------------------------------

  checkAll(conds = []) { return conds.every(c => this.check(c)); }

  check(c) {
    switch (c.type) {
      case 'state': {
        const d = this.registry.find(c.device);
        return !!d && (OPS[c.op || 'eq'] || OPS.eq)(d.state[c.attr], c.value);
      }
      case 'person': {
        const zone = c.zone || 'home';
        const people = c.person && c.person !== '*' ? this.store.data.people.filter(p => p.id === c.person) : this.store.data.people;
        const here = people.some(p => p.inside?.includes(zone));
        return c.home === false ? !here : here;
      }
      case 'time': {
        const d = new Date(this.clock.now());
        const now = d.getHours() * 60 + d.getMinutes();
        const a = this._timeOfDay(c.after, 0, d), b = this._timeOfDay(c.before, 0, d);
        if (a == null || b == null) return false;
        return a <= b ? now >= a && now < b : now >= a || now < b;
      }
    }
    return false;
  }
}

function abortErr() { const e = new Error('aborted'); e.name = 'AbortError'; return e; }

export { presetPatch, PRESETS, uid };
