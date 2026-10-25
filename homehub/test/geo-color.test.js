import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.js';
import { hexToHsv, hsvToHex } from '../src/core/color.js';
import { sunTimes } from '../src/core/sun.js';

test('geofence: enter once, hysteresis on leave, fuzzy fixes ignored', async () => {
  const { app, me, stop } = await makeApp();
  const ev = [];
  const { bus } = await import('../src/core/bus.js');
  bus.on('geo', e => ev.push(e.event));
  const at = (dLat, accuracy = 10) => app.geo.report(me, { lat: 51.5 + dLat, lon: -0.1, accuracy });
  at(0.01);                      // ~1.1 km away
  at(0.0003, 1000);              // inside but a cell-tower fix: ignored
  assert.deepEqual(ev, []);
  at(0.0003);                    // ~33 m, accurate
  at(0.0002);
  assert.deepEqual(ev, ['enter']);
  at(0.0012);                    // ~133 m: outside radius but within hysteresis band (100 + 30)
  assert.deepEqual(ev, ['enter']);
  at(0.002);                     // ~222 m: gone
  assert.deepEqual(ev, ['enter', 'leave']);
  stop();
});

test('hex <-> hsv round trip', () => {
  assert.deepEqual(hexToHsv('#ff0000'), { h: 0, s: 100, v: 100 });
  assert.deepEqual(hexToHsv('#00ff00'), { h: 120, s: 100, v: 100 });
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), '#0000ff');
  assert.equal(hsvToHex(hexToHsv('#ff8000')), '#ff8000');
});

test('sunrise/sunset sane for London midsummer', () => {
  const { sunrise, sunset } = sunTimes(new Date('2026-06-21T12:00:00Z'), 51.5, -0.12);
  assert.ok(sunrise.getUTCHours() === 3 && sunrise.getUTCMinutes() >= 40, sunrise.toISOString());
  assert.ok(sunset.getUTCHours() === 20 && sunset.getUTCMinutes() <= 30, sunset.toISOString());
});
