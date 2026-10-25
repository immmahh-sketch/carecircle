import { Adapter } from './base.js';

/**
 * Demo devices so the whole app (rules, geofence, power logic) can be tried without hardware.
 * The car charger behaves like a real one: plug the "car" in and it draws ~7 kW for a while,
 * then drops to a few watts of standby once the battery is full.
 */
export class SimAdapter extends Adapter {
  constructor(cfg, registry, log) {
    super('sim', cfg, registry, log);
    this.speed = cfg.speed || 1;      // >1 makes charging finish sooner
    this.carPlugged = false;
    this.chargeLeft = 0;              // seconds of charging remaining
    this.cut = new Set();             // devices with simulated power cut
  }

  async start() {
    const r = this.registry, A = 'sim';
    r.upsert({ id: 'sim:charger', name: 'Car charger', adapter: A, type: 'plug', caps: ['onoff', 'power'], state: { on: false, power: 0, energy: 0 } });
    r.upsert({ id: 'sim:lounge', name: 'Lounge lamp', adapter: A, type: 'light', caps: ['onoff', 'dim', 'color', 'temp'], state: { on: false, brightness: 80, color: null, colorTemp: 30 } });
    r.upsert({ id: 'sim:strip', name: 'TV light strip', adapter: A, type: 'light', caps: ['onoff', 'dim', 'color', 'temp'], state: { on: true, brightness: 60, color: { h: 260, s: 90, v: 60 }, colorTemp: 30 } });
    r.upsert({ id: 'sim:freezer', name: 'Garage freezer', adapter: A, type: 'plug', caps: ['onoff', 'power'], state: { on: true, power: 85 } });
    r.upsert({ id: 'sim:alarm', name: 'Hall siren light', adapter: A, type: 'light', caps: ['onoff', 'dim', 'color'], state: { on: false, brightness: 100, color: null } });
    r.upsert({ id: 'sim:heating', name: 'Living room', adapter: A, type: 'heating', caps: ['heat'], state: { temp: 19.2, target: 20 } });
    this.health = { ok: true, msg: 'simulated' };
    this._timer = setInterval(() => this.tick(), 2000);
  }
  stop() { clearInterval(this._timer); super.stop(); }

  async command(d, p) {
    if (this.cut.has(d.id)) throw new Error('device unreachable');
    if (d.id === 'sim:charger' && p.on === true && this.carPlugged && this.chargeLeft <= 0) this.chargeLeft = 120;
  }

  /** Called from the UI's "simulate" buttons. */
  simulate(action) {
    const r = this.registry;
    switch (action) {
      case 'plug-car': this.carPlugged = true; this.chargeLeft = 120; break;
      case 'unplug-car': this.carPlugged = false; this.chargeLeft = 0; break;
      case 'cut-freezer': this.cut.add('sim:freezer'); r.markOffline('sim:freezer'); break;
      case 'restore-freezer': this.cut.delete('sim:freezer'); r.update('sim:freezer', { online: true }); break;
      default: throw new Error(`unknown simulation: ${action}`);
    }
    return { carPlugged: this.carPlugged, freezerCut: this.cut.has('sim:freezer') };
  }

  tick() {
    const r = this.registry, c = r.get('sim:charger');
    if (c && !this.cut.has(c.id)) {
      let w = 0;
      if (c.state.on) {
        if (this.carPlugged && this.chargeLeft > 0) { w = 7000 + Math.random() * 200; this.chargeLeft -= 2 * this.speed; }
        else w = this.carPlugged ? 3 + Math.random() * 2 : 1;  // standby
      }
      r.update(c.id, { power: Math.round(w * 10) / 10 });
    }
    const f = r.get('sim:freezer');
    if (f && f.state.online !== false) r.update(f.id, { power: f.state.on ? Math.round(70 + Math.random() * 30) : 0 });
    const h = r.get('sim:heating');
    if (h) r.update(h.id, { temp: Math.round((h.state.temp + (h.state.target - h.state.temp) * 0.02) * 10) / 10 });
  }
}
