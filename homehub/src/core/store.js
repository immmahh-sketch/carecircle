import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = () => ({
  settings: { lat: null, lon: null, notifyUrl: '', adminKey: '', hookKey: '', timezone: '' },
  integrations: {},      // { tuya:{...}, meross:{...}, wiser:{...} }
  deviceMeta: {},        // { [deviceId]: { name, room, hidden } }
  scenes: [],            // { id, name, icon, targets:[{device, patch}] }
  rules: [],             // see engine.js
  timers: [],            // { id, device, at(ms), patch }
  buttons: {},           // { [buttonId]: { name, lastSeen, lastClick } }
  people: [],            // { id, name, token, inside:[zoneId], last:{lat,lon,at} }
  zones: [],             // { id, name, lat, lon, radius }
});

/** Tiny JSON-file store. Writes are debounced and atomic (tmp file + rename). */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = DEFAULTS();
    this._t = null;
    if (file && fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const d = DEFAULTS();
      this.data = { ...d, ...raw, settings: { ...d.settings, ...raw.settings } };
    }
  }
  save() {
    if (!this.file) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 200);
  }
  flush() {
    if (!this.file) return;
    clearTimeout(this._t);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    // 0600: this file holds cloud credentials and API keys
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

let n = 0;
export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
