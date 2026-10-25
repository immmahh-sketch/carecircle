import { uid } from './store.js';

/** Persistent one-shot device timers ("turn off in 30 min"). Survive restarts. */
export class Timers {
  constructor({ store, registry, clock, log = () => {} }) {
    Object.assign(this, { store, registry, clock, log });
    this.handles = new Map();
  }
  get list() { return this.store.data.timers; }

  start() { this.list.forEach(t => this._arm(t)); }
  stop() { this.handles.forEach(h => this.clock.clearTimeout(h)); this.handles.clear(); }

  add(device, ms, patch) {
    const t = { id: uid('tm'), device, at: this.clock.now() + ms, patch: patch || { on: false } };
    this.list.push(t);
    this.store.save();
    this._arm(t);
    return t;
  }

  cancel(id) {
    const i = this.list.findIndex(t => t.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    this.clock.clearTimeout(this.handles.get(id));
    this.handles.delete(id);
    this.store.save();
    return true;
  }

  _arm(t) {
    const h = this.clock.setTimeout(async () => {
      this.handles.delete(t.id);
      const i = this.list.findIndex(x => x.id === t.id);
      if (i >= 0) this.list.splice(i, 1);
      this.store.save();
      try { await this.registry.command(t.device, t.patch); this.log('info', `⏲ timer: ${t.device}`); }
      catch (e) { this.log('error', `timer ${t.device}: ${e.message}`); }
    }, Math.max(0, t.at - this.clock.now()));
    this.handles.set(t.id, h);
  }
}
