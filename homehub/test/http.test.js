import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/app.js';
import { createServer } from '../src/server.js';

async function boot() {
  const app = new App({ persist: false, demo: true });
  await app.start();
  const srv = createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const key = app.settings.adminKey, hook = app.settings.hookKey;
  const call = async (method, path, body, k = key) => {
    const r = await fetch(base + path, { method, headers: { 'x-api-key': k, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { app, srv, call, hook, base, close: async () => { srv.closeAllConnections(); srv.close(); await app.stop(); } };
}

test('api requires key; state lists demo devices', async () => {
  const t = await boot();
  assert.equal((await t.call('GET', '/api/state', null, 'wrong')).status, 401);
  const s = await t.call('GET', '/api/state');
  assert.equal(s.status, 200);
  assert.ok(s.body.devices.find(d => d.id === 'sim:charger'));
  assert.equal(s.body.integrations.tuya, undefined);
  await t.close();
});

test('flic webhook auto-registers button; assign action; press controls device', async () => {
  const t = await boot();
  assert.equal((await fetch(`${t.base}/hook/nope/flic/b1/click`)).status, 401);
  assert.equal((await fetch(`${t.base}/hook/${t.hook}/flic/b1/single_click`)).status, 200);
  let s = (await t.call('GET', '/api/state')).body;
  assert.ok(s.buttons.b1);
  await t.call('PUT', '/api/buttons/b1/click', { action: { kind: 'toggle', ref: 'Lounge lamp' } });
  await fetch(`${t.base}/hook/${t.hook}/flic/b1/click`);
  await new Promise(r => setTimeout(r, 50));
  s = (await t.call('GET', '/api/state')).body;
  assert.equal(s.devices.find(d => d.id === 'sim:lounge').state.on, true);
  await t.close();
});

test('colour preset and scene capture', async () => {
  const t = await boot();
  const r = await t.call('POST', '/api/devices/sim:lounge/command', { preset: 'blue' });
  assert.equal(r.body.state.color.h > 200, true);
  const sc = await t.call('POST', '/api/scenes', { name: 'Movie', capture: ['sim:lounge', 'sim:strip'] });
  assert.equal(sc.body.targets.length, 2);
  await t.call('POST', '/api/devices/sim:lounge/command', { patch: { on: false } });
  await t.call('POST', `/api/scenes/${sc.body.id}/activate`);
  const s = (await t.call('GET', '/api/state')).body;
  assert.equal(s.devices.find(d => d.id === 'sim:lounge').state.on, true);
  await t.close();
});

test('geo webhook via person token fires zone events; bad rule rejected; secrets masked', async () => {
  const t = await boot();
  const tok = t.app.store.data.people[0].token;
  t.app.store.data.zones[0] = { id: 'home', name: 'Home', lat: 51.5, lon: -0.1, radius: 150 };
  let r = await (await fetch(`${t.base}/geo/${tok}/home/enter`)).json();
  assert.equal(r.event.event, 'enter');
  r = await (await fetch(`${t.base}/geo/${tok}`, { method: 'POST', body: JSON.stringify({ lat: 51.5, lon: -0.1, accuracy: 5 }) })).json();
  assert.deepEqual(r.events, []);
  assert.equal((await t.call('POST', '/api/rules', { name: 'x', trigger: { type: 'bogus' }, actions: [] })).status, 400);
  await t.call('PUT', '/api/integrations/wiser', { ip: '10.0.0.1', secret: 'shh' });
  const s = (await t.call('GET', '/api/state')).body;
  assert.equal(s.integrations.wiser.secret, '••••••');
  assert.equal(t.app.store.data.integrations.wiser.secret, 'shh');
  await t.call('PUT', '/api/integrations/wiser', s.integrations.wiser);
  assert.equal(t.app.store.data.integrations.wiser.secret, 'shh', 'masked value keeps stored secret');
  await t.close();
});

test('healthz is public and reveals nothing sensitive', async () => {
  const t = await boot();
  const r = await fetch(`${t.base}/healthz`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(await r.json()).sort(), ['devices', 'ok']);
  await t.close();
});

test('static files served, traversal blocked', async () => {
  const t = await boot();
  assert.equal((await fetch(`${t.base}/%2e%2e/package.json`)).status, 404);
  await t.close();
});
