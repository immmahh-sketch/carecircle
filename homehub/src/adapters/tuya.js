import crypto from 'node:crypto';
import { Adapter, http } from './base.js';

const HOSTS = {
  eu: 'https://openapi.tuyaeu.com', 'eu-w': 'https://openapi-weaz.tuyaeu.com',
  us: 'https://openapi.tuyaus.com', 'us-e': 'https://openapi-ueaz.tuyaus.com',
  cn: 'https://openapi.tuyacn.com', in: 'https://openapi.tuyain.com',
};
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const pick = (codes, list) => list.find(c => codes.has(c));

/**
 * SmartLife / Tuya via the Tuya IoT Cloud OpenAPI.
 * cfg: { accessId, accessSecret, region:'eu'|'us'|'cn'|'in'|..., uid, pollSeconds?, powerScale? }
 *   uid = the Smart Life account's user id, shown in the Tuya IoT console under
 *         Cloud > your project > Devices > Link App Account.
 *   powerScale: Tuya sockets usually report cur_power in 0.1 W units (default 0.1).
 */
export class TuyaAdapter extends Adapter {
  constructor(cfg, registry, log) { super('tuya', cfg, registry, log); this.token = null; this.exp = 0; this.dps = new Map(); }

  get host() { return HOSTS[this.cfg.region || 'eu'] || HOSTS.eu; }

  async api(method, path, body) {
    if (path !== '/v1.0/token?grant_type=1') await this.ensureToken();
    const t = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const token = path.startsWith('/v1.0/token') ? '' : this.token;
    const toSign = [method, sha256(bodyStr), '', path].join('\n');
    const sign = crypto.createHmac('sha256', this.cfg.accessSecret).update(this.cfg.accessId + token + t + toSign).digest('hex').toUpperCase();
    const j = await http(this.host + path, {
      method, body: bodyStr || undefined,
      headers: { client_id: this.cfg.accessId, sign, t, sign_method: 'HMAC-SHA256', ...(token ? { access_token: token } : {}), 'Content-Type': 'application/json' },
    });
    if (!j?.success) throw new Error(`Tuya ${j?.code}: ${j?.msg}`);
    return j.result;
  }

  async ensureToken() {
    if (this.token && Date.now() < this.exp - 60000) return;
    this.token = null;
    const r = await this.api('GET', '/v1.0/token?grant_type=1');
    this.token = r.access_token;
    this.exp = Date.now() + r.expire_time * 1000;
  }

  async start() {
    if (!this.cfg.accessId || !this.cfg.accessSecret || !this.cfg.uid) { this.health = { ok: false, msg: 'not configured' }; return; }
    await this.loop(() => this.poll(), this.cfg.pollSeconds || 30);
  }

  async poll() {
    if (!this.known) {
      this.known = await this.api('GET', `/v1.0/users/${this.cfg.uid}/devices`);
      for (const d of this.known) this.register(d);
    }
    // Batch of up to 20 per call keeps us well inside the API quota.
    const ids = this.known.map(d => d.id);
    for (let i = 0; i < ids.length; i += 20) {
      const res = await this.api('GET', `/v1.0/devices?device_ids=${ids.slice(i, i + 20).join(',')}`);
      for (const d of res.devices || []) this.registry.update(`tuya:${d.id}`, this.parse(d));
    }
  }

  register(d) {
    const codes = new Set((d.status || []).map(s => s.code));
    this.dps.set(d.id, codes);
    const caps = [];
    let type = 'plug';
    if (pick(codes, ['switch_1', 'switch', 'switch_led'])) caps.push('onoff');
    if (pick(codes, ['bright_value_v2', 'bright_value'])) { caps.push('dim'); type = 'light'; }
    if (pick(codes, ['colour_data_v2', 'colour_data'])) { caps.push('color'); type = 'light'; }
    if (pick(codes, ['temp_value_v2', 'temp_value'])) caps.push('temp');
    if (codes.has('cur_power')) caps.push('power');
    this.registry.upsert({ id: `tuya:${d.id}`, name: d.name, adapter: 'tuya', type, caps, native: { tuyaId: d.id }, state: this.parse(d) });
  }

  parse(d) {
    const s = { online: !!d.online };
    const v = {};
    (d.status || []).forEach(x => (v[x.code] = x.value));
    const sw = pick(new Set(Object.keys(v)), ['switch_1', 'switch', 'switch_led']);
    if (sw) s.on = !!v[sw];
    if (v.bright_value_v2 != null) s.brightness = Math.round((v.bright_value_v2 - 10) / 990 * 99 + 1);
    else if (v.bright_value != null) s.brightness = Math.round(v.bright_value / 255 * 100);
    if (v.temp_value_v2 != null) s.colorTemp = Math.round(v.temp_value_v2 / 10);
    else if (v.temp_value != null) s.colorTemp = Math.round(v.temp_value / 255 * 100);
    const cd = v.colour_data_v2 ?? v.colour_data;
    if (cd && v.work_mode === 'colour') {
      const c = typeof cd === 'string' ? JSON.parse(cd) : cd;
      const max = v.colour_data_v2 != null ? 1000 : 255;
      s.color = { h: c.h, s: Math.round(c.s / max * 100), v: Math.round(c.v / max * 100) };
      s.brightness = s.color.v;
    } else if (v.work_mode === 'white') s.color = null;
    if (v.cur_power != null) s.power = Math.round(v.cur_power * (this.cfg.powerScale ?? 0.1) * 10) / 10;
    if (v.add_ele != null) s.energy = v.add_ele / 1000;
    return s;
  }

  async command(dev, p) {
    const id = dev.native.tuyaId, codes = this.dps.get(id) || new Set();
    const cmds = [];
    const sw = pick(codes, ['switch_1', 'switch', 'switch_led']);
    if (p.on != null && sw) cmds.push({ code: sw, value: !!p.on });
    const v2 = codes.has('colour_data_v2'), bv2 = codes.has('bright_value_v2');
    if (p.color) {
      const m = v2 ? 1000 : 255, bright = p.brightness ?? p.color.v;
      cmds.push({ code: 'work_mode', value: 'colour' });
      cmds.push({ code: v2 ? 'colour_data_v2' : 'colour_data', value: JSON.stringify({ h: Math.round(p.color.h), s: Math.round(p.color.s / 100 * m), v: Math.round(bright / 100 * m) }) });
    } else if (p.brightness != null) {
      const inColour = dev.state.color && !p.colorTemp;
      if (inColour) {
        const m = v2 ? 1000 : 255, c = dev.state.color;
        cmds.push({ code: v2 ? 'colour_data_v2' : 'colour_data', value: JSON.stringify({ h: c.h, s: Math.round(c.s / 100 * m), v: Math.round(p.brightness / 100 * m) }) });
      } else {
        if (codes.has('work_mode')) cmds.push({ code: 'work_mode', value: 'white' });
        cmds.push(bv2 ? { code: 'bright_value_v2', value: Math.round(10 + (p.brightness - 1) / 99 * 990) } : { code: 'bright_value', value: Math.round(p.brightness / 100 * 255) });
      }
    }
    if (p.colorTemp != null && !p.color) {
      if (codes.has('work_mode')) cmds.push({ code: 'work_mode', value: 'white' });
      cmds.push(codes.has('temp_value_v2') ? { code: 'temp_value_v2', value: Math.round(p.colorTemp * 10) } : { code: 'temp_value', value: Math.round(p.colorTemp / 100 * 255) });
    }
    if (!cmds.length) return;
    await this.api('POST', `/v1.0/devices/${id}/commands`, { commands: cmds });
  }
}
