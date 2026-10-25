import { Adapter, http } from './base.js';

/**
 * Drayton / Schneider Wiser Heating hub, local REST API (no cloud).
 * cfg: { ip, secret, pollSeconds? }   secret = the hub's system secret (see README for how to get it)
 *
 * Exposes each Room as a 'heating' device (temp, target) and each SmartPlug as a plug.
 * Room commands: { target: 21 } sets a manual override; { auto: true } returns to the schedule.
 */
export class WiserAdapter extends Adapter {
  constructor(cfg, registry, log) { super('wiser', cfg, registry, log); }

  get base() { return `http://${this.cfg.ip}/data/domain`; }
  get headers() { return { SECRET: this.cfg.secret, 'Content-Type': 'application/json' }; }

  async start() {
    if (!this.cfg.ip || !this.cfg.secret) { this.health = { ok: false, msg: 'not configured' }; return; }
    await this.loop(() => this.poll(), this.cfg.pollSeconds || 15);
  }

  async poll() {
    let d;
    try { d = await http(`${this.base}/`, { headers: this.headers, timeout: 5000 }); }
    catch (e) {
      // Hub itself unreachable: mark its devices offline only after repeated failures.
      for (const dev of this.registry.devices.values()) if (dev.adapter === 'wiser') this.fail(dev.id, 3);
      throw e;
    }
    for (const r of d.Room || []) {
      const id = `wiser:room:${r.id}`;
      this.registry.upsert({ id, name: r.Name, adapter: 'wiser', type: 'heating', caps: ['heat'], native: { kind: 'Room', wid: r.id }, state: {} });
      this.ok(id);
      this.registry.update(id, {
        online: true,
        temp: r.CalculatedTemperature > -100 ? r.CalculatedTemperature / 10 : null,
        target: r.CurrentSetpoint != null ? r.CurrentSetpoint / 10 : r.CurrentSetPoint / 10,
        auto: (r.OverrideType || 'None') === 'None',
      });
    }
    for (const p of d.SmartPlug || []) {
      const id = `wiser:plug:${p.id}`;
      const state = { online: true, on: p.OutputState === 'On' };
      if (p.InstantaneousPower != null) state.power = p.InstantaneousPower;
      this.registry.upsert({ id, name: p.Name, adapter: 'wiser', type: 'plug', caps: p.InstantaneousPower != null ? ['onoff', 'power'] : ['onoff'], native: { kind: 'SmartPlug', wid: p.id }, state: {} });
      this.ok(id);
      this.registry.update(id, state);
    }
  }

  async command(dev, p) {
    const { kind, wid } = dev.native;
    if (kind === 'SmartPlug') {
      if (p.on != null) await http(`${this.base}/SmartPlug/${wid}`, { method: 'PATCH', headers: this.headers, body: { RequestOutput: p.on ? 'On' : 'Off' } });
    } else if (kind === 'Room') {
      if (p.auto) await http(`${this.base}/Room/${wid}`, { method: 'PATCH', headers: this.headers, body: { RequestOverride: { Type: 'None', SetPoint: 0 } } });
      else if (p.target != null) await http(`${this.base}/Room/${wid}`, { method: 'PATCH', headers: this.headers, body: { RequestOverride: { Type: 'Manual', SetPoint: Math.round(p.target * 10) } } });
    }
  }
}
