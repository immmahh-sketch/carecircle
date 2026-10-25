import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.js';

const on = (fake, id) => fake.cmds.filter(([d]) => d === id).map(([, p]) => p.on);

test('arrive home: charger on, and off again if not charging within 10 min', async () => {
  const { app, clock, fake, me, stop } = await makeApp();
  app.addRecipe('ev-arrive', { person: me.id, zone: 'home', device: 'charger', minutes: 10, watts: 100 });
  app.geo.event(me, 'home', true);
  await clock.settle();
  assert.deepEqual(on(fake, 'charger'), [true]);
  await clock.advance(9 * 60_000);
  assert.deepEqual(on(fake, 'charger'), [true], 'still on before the deadline');
  await clock.advance(61_000);
  assert.deepEqual(on(fake, 'charger'), [true, false], 'switched off after 10 min of no charging');
  stop();
});

test('arrive home: stays on when charging starts', async () => {
  const { app, clock, fake, me, reg, stop } = await makeApp();
  app.addRecipe('ev-arrive', { person: me.id, zone: 'home', device: 'charger', minutes: 10, watts: 100 });
  app.geo.event(me, 'home', true);
  await clock.settle();
  await clock.advance(2 * 60_000);
  reg.update('charger', { power: 7200 });
  await clock.settle();
  await clock.advance(20 * 60_000);
  assert.deepEqual(on(fake, 'charger'), [true]);
  stop();
});

test('charger finished: high -> standby for 2 min switches it off', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  app.addRecipe('standby-off', { device: 'charger', wasAbove: 1000, below: 15, for: 120 });
  reg.update('charger', { on: true, power: 7000 });
  await clock.advance(1000);
  reg.update('charger', { power: 4 });
  await clock.advance(119_000);
  assert.equal(fake.cmds.length, 0);
  await clock.advance(2000);
  assert.deepEqual(on(fake, 'charger'), [false]);
  stop();
});

test('standby-off does not fire if power recovers (taper) before the hold time', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  app.addRecipe('standby-off', { device: 'charger', wasAbove: 1000, below: 15, for: 120 });
  reg.update('charger', { on: true, power: 7000 });
  reg.update('charger', { power: 5 });
  await clock.advance(60_000);
  reg.update('charger', { power: 6500 });
  await clock.advance(300_000);
  assert.equal(fake.cmds.length, 0);
  stop();
});

test('standby-off ignores a device that was never drawing real power', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  app.addRecipe('standby-off', { device: 'charger', wasAbove: 1000, below: 15, for: 60 });
  reg.update('charger', { on: true, power: 3 });
  await clock.advance(600_000);
  assert.equal(fake.cmds.length, 0);
  stop();
});

test('one device losing power makes another react (with debounce)', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  app.addRecipe('offline-react', { device: 'freezer', for: 30, target: 'lamp', on: true });
  reg.markOffline('freezer');
  await clock.advance(10_000);
  reg.update('freezer', { online: true });          // blip
  await clock.advance(60_000);
  assert.equal(fake.cmds.length, 0, 'short blip ignored');
  reg.markOffline('freezer');
  await clock.advance(31_000);
  assert.deepEqual(fake.cmds.map(([d, p]) => [d, p.on]), [['lamp', true]]);
  stop();
});

test('level triggers do not re-fire while the condition stays true', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  app.addRecipe('offline-react', { device: 'freezer', for: 0, target: 'lamp', on: true });
  reg.markOffline('freezer');
  reg.update('freezer', { power: 0 });
  reg.update('freezer', { power: 1 });
  await clock.settle();
  assert.equal(fake.cmds.length, 1);
  stop();
});

test('flic button toggles a device and can be reassigned', async () => {
  const { app, clock, fake, stop } = await makeApp();
  app.flic('abc', 'click');
  app.setButtonAction('abc', 'click', { kind: 'toggle', ref: 'Lamp' });
  app.flic('abc', 'click');
  await clock.settle();
  assert.deepEqual(fake.cmds.map(([d, p]) => [d, p.on]), [['lamp', true]]);
  app.setButtonAction('abc', 'click', null);
  app.flic('abc', 'click');
  await clock.settle();
  assert.equal(fake.cmds.length, 1);
  stop();
});

test('colour set implies on, and brightness is clamped', async () => {
  const { reg, fake, stop } = await makeApp();
  await reg.command('lamp', { color: { h: 120, s: 100, v: 100 }, brightness: 500 });
  assert.equal(fake.cmds[0][1].on, true);
  assert.equal(fake.cmds[0][1].brightness, 100);
  stop();
});

test('persistent timer turns device off and is removed', async () => {
  const { app, clock, fake, reg, stop } = await makeApp();
  reg.update('lamp', { on: true });
  app.timers.add('lamp', 30 * 60_000, { on: false });
  assert.equal(app.store.data.timers.length, 1);
  await clock.advance(30 * 60_000 + 1);
  assert.deepEqual(on(fake, 'lamp'), [false]);
  assert.equal(app.store.data.timers.length, 0);
  stop();
});

test('conditions: only when nobody is home', async () => {
  const { app, clock, fake, me, stop } = await makeApp();
  me.inside = [];
  app.store.data.rules.push({ id: 'r1', name: 't', enabled: true, trigger: { type: 'flic', button: 'b', click: 'click' }, conditions: [{ type: 'person', home: false }], actions: [{ type: 'set', device: 'lamp', patch: { on: true } }] });
  app.flic('b', 'click'); await clock.settle();
  assert.equal(fake.cmds.length, 1);
  me.inside = ['home'];
  app.flic('b', 'click'); await clock.settle();
  assert.equal(fake.cmds.length, 1);
  stop();
});

test('one failing device does not stop the rest of an action', async () => {
  const { app, clock, fake, stop } = await makeApp();
  const orig = fake.command.bind(fake);
  fake.command = async (d, p) => { if (d.id === 'lamp') throw new Error('boom'); return orig(d, p); };
  app.store.data.rules.push({ id: 'r', name: 't', enabled: true, trigger: { type: 'flic', button: 'b', click: 'click' }, actions: [{ type: 'set', devices: ['lamp', 'charger'], patch: { on: true } }] });
  app.flic('b', 'click'); await clock.settle();
  assert.deepEqual(fake.cmds.map(c => c[0]), ['charger']);
  stop();
});
