import crypto from 'node:crypto';
import { Adapter, http } from './base.js';
import { hsvToRgbInt, rgbIntToHsv } from '../core/color.js';

const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const CLOUD = { eu: 'https://iotx-eu.meross.com', us: 'https://iotx-us.meross.com', ap: 'https://iotx-ap.meross.com' };
const SECRET = '23x17ahWarFH6w29'; // public app-signing constant used by the Meross mobile app

/**
 * Meross. The Meross cloud is used once to log in and fetch the device list + per-account key;
 * after that every poll and command goes directly to the device over the LAN (HTTP, signed with that key),
 * so control is fast, works without internet, and an unplugged / unpowered device is noticed within seconds.
 *
 * cfg: { email, password, region:'eu'|'us'|'ap', ips:{ "<uuid or device name>": "192.168.1.50" }, pollSeconds? }
 * Give each device a fixed IP (DHCP reservation) and list it in `ips`.
 */
export class MerossAdapter extends Adapter {
  constructor(cfg, registry, log) { super('meross', cfg, registry, log); this.devs = new Map(); }

  async login() {
    const params = Buffer.from(JSON.stringify({ email: this.cfg.email, password: this.cfg.password, encryption: 1 })).toString('base64');
    const timestamp = Date.now(), nonce = crypto.randomBytes(8).toString('hex');
    const base = CLOUD[this.cfg.region || 'eu'] || CLOUD.eu;
    const sign = md5(SECRET + timestamp + nonce + params);
    const r = await http(`${base}/v1/Auth/signIn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { params, sign, timestamp, nonce } });
    if (r?.apiStatus !== 0) throw new Error(`Meross login failed (${r?.apiStatus}): ${r?.info}`);
    this.auth = r.data; // { token, key, userId, domain }
    const list = await http(`${base}/v1/Device/devList`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${this.auth.token}` }, body: { params: Buffer.from('{}').toString('base64'), timestamp, nonce, sign: md5(SECRET + timestamp + nonce + Buffer.from('{}').toString('base64')) } });
    return list.data || [];
  }

  async start() {
    if (!this.cfg.email || !this.cfg.password) { this.health = { ok: false, msg: 'not configured' }; return; }
    await this.loop(() => this.poll(), this.cfg.pollSeconds || 10);
  }

  async poll() {
    if (!this.devs.size) {
      for (const d of await this.login()) {
        const ip = this.cfg.ips?.[d.uuid] || this.cfg.ips?.[d.devName];
        const type = /^msl|^mss56|^msg/i.test(d.deviceType) ? 'light' : 'plug';
        const caps = type === 'light' ? ['onoff', 'dim', 'color', 'temp'] : ['onoff'];
        if (/^mss310|^mss315|^mss305/i.test(d.deviceType)) caps.push('power');
        const id = `meross:${d.uuid}`;
        this.devs.set(id, { uuid: d.uuid, ip });
        this.registry.upsert({ id, name: d.devName, adapter: 'meross', type, caps, native: { uuid: d.uuid, ip }, state: { online: false } });
        if (!ip) this.log('warn', `meross: no IP set for "${d.devName}" (${d.uuid}); add it to integrations.meross.ips`);
      }
    }
    await Promise.all([...this.devs.entries()].map(async ([id, { ip }]) => {
      if (!ip) return;
      try {
        const all = (await this.call(ip, 'Appliance.System.All', 'GET', {})).all.digest;
        const s = { online: true };
        const tx = [].concat(all.togglex || []).find(t => t.channel === 0) || {};
        const light = all.light;
        if (tx.onoff != null) s.on = !!tx.onoff;
        if (light) {
          if (light.onoff != null) s.on = !!light.onoff;
          if (light.luminance != null) s.brightness = light.luminance;
          if (light.capacity & 1 && light.rgb > 0) s.color = rgbIntToHsv(light.rgb);
          else if (light.temperature != null) { s.colorTemp = light.temperature; s.color = null; }
        }
        if (this.registry.get(id).caps.includes('power')) {
          const e = (await this.call(ip, 'Appliance.Control.Electricity', 'GET', {})).electricity;
          s.power = Math.round(e.power / 100) / 10; // mW -> W
        }
        this.ok(id);
        this.registry.update(id, s);
      } catch { this.fail(id); }
    }));
  }

  /** Signed local HTTP request to a device. */
  async call(ip, namespace, method, payload) {
    const messageId = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000);
    const body = { header: { messageId, namespace, method, payloadVersion: 1, from: `http://${ip}/config`, timestamp, timestampMs: 0, sign: md5(messageId + this.auth.key + timestamp), triggerSrc: 'Android' }, payload };
    const r = await http(`http://${ip}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, timeout: 4000 });
    if (r?.header?.method === 'ERROR') throw new Error(`Meross error: ${JSON.stringify(r.payload)}`);
    return r.payload;
  }

  async command(dev, p) {
    const { ip } = this.devs.get(dev.id) || {};
    if (!ip) throw new Error('no LAN IP configured for this Meross device');
    if (dev.type === 'light') {
      const light = { channel: 0, onoff: p.on == null ? undefined : p.on ? 1 : 0 };
      if (p.brightness != null) { light.luminance = p.brightness; }
      if (p.color) { light.rgb = hsvToRgbInt(p.color); light.capacity = 1; if (p.brightness == null) light.luminance = p.color.v; }
      else if (p.colorTemp != null) { light.temperature = p.colorTemp; light.capacity = 2; }
      await this.call(ip, 'Appliance.Control.Light', 'SET', { light });
    } else if (p.on != null) {
      await this.call(ip, 'Appliance.Control.ToggleX', 'SET', { togglex: { channel: 0, onoff: p.on ? 1 : 0 } });
    }
  }
}
