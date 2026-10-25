import { App } from '../src/app.js';
import { Adapter } from '../src/adapters/base.js';

export class FakeClock {
  constructor() { this.t = 1_700_000_000_000; this.q = []; this.n = 0; }
  now() { return this.t; }
  setTimeout(fn, ms) { const h = { fn, at: this.t + ms, id: ++this.n }; this.q.push(h); return h; }
  clearTimeout(h) { this.q = this.q.filter(x => x !== h); }
  async settle() { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); }
  async advance(ms) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift(); this.t = next.at; next.fn(); await this.settle();
    }
    this.t = end; await this.settle();
  }
}

/** Adapter that just records commands. */
export class FakeAdapter extends Adapter {
  constructor(registry) { super('fake', {}, registry); this.cmds = []; }
  async command(d, p) { this.cmds.push([d.id, p]); }
}

export async function makeApp() {
  const clock = new FakeClock();
  const app = new App({ persist: false, clock });
  const fake = new FakeAdapter(app.registry);
  app.registry.addAdapter(fake);
  app.engine.start(); app.timers.start();
  const add = (id, name, caps, state = {}) => app.registry.upsert({ id, name, adapter: 'fake', type: 'plug', caps, state: { on: false, ...state } });
  add('charger', 'Charger', ['onoff', 'power'], { power: 0 });
  add('lamp', 'Lamp', ['onoff', 'dim', 'color']);
  add('freezer', 'Freezer', ['onoff', 'power'], { on: true, power: 80 });
  app.geo.zones.push({ id: 'home', name: 'Home', lat: 51.5, lon: -0.1, radius: 100 });
  const me = app.geo.addPerson('Me');
  const stop = () => app.stop();
  return { app, clock, fake, me, stop, reg: app.registry };
}
