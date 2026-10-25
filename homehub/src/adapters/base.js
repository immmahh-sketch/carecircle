/** Adapter contract. Adapters discover devices into the registry and keep their state fresh. */
export class Adapter {
  constructor(name, cfg, registry, log = () => {}) {
    this.name = name; this.cfg = cfg || {}; this.registry = registry; this.log = log;
    this.health = { ok: false, msg: 'not started' };
    this._timer = null;
    this.failures = new Map();
  }
  async start() {}
  stop() { clearTimeout(this._timer); this._timer = null; this.stopped = true; }
  async command() { throw new Error(`${this.name}: control not supported`); }

  /** Run `fn` now and every `seconds`, never overlapping, never dying on an exception. */
  loop(fn, seconds) {
    const run = async () => {
      if (this.stopped) return;
      try { await fn(); this.health = { ok: true, msg: 'ok', at: Date.now() }; }
      catch (e) { this.health = { ok: false, msg: e.message, at: Date.now() }; this.log('warn', `${this.name}: ${e.message}`); }
      if (!this.stopped) this._timer = setTimeout(run, seconds * 1000);
    };
    return run();
  }

  /**
   * A device only counts as lost after `threshold` consecutive failed polls, so one dropped
   * packet never fires a "lost power" automation.
   */
  fail(id, threshold = 2) {
    const n = (this.failures.get(id) || 0) + 1;
    this.failures.set(id, n);
    if (n >= threshold) this.registry.markOffline(id);
  }
  ok(id) { this.failures.set(id, 0); }
}

export async function http(url, { method = 'GET', headers = {}, body, timeout = 8000 } = {}) {
  const res = await fetch(url, {
    method, headers, signal: AbortSignal.timeout(timeout),
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}${json?.msg ? `: ${json.msg}` : ''}`);
  return json;
}
