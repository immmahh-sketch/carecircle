import { bus } from './bus.js';
import { uid } from './store.js';
import crypto from 'node:crypto';

export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Presence tracking. A phone either reports positions (PWA / Tasker / Shortcuts)
 * or just fires enter/leave events itself (OS geofence -> webhook). Both end up as
 * bus 'geo' events {person, zone, event}.
 */
export class Geo {
  constructor(store) { this.store = store; }
  get people() { return this.store.data.people; }
  get zones() { return this.store.data.zones; }

  addPerson(name) {
    const p = { id: uid('p'), name, token: crypto.randomBytes(16).toString('hex'), inside: [], last: null };
    this.people.push(p);
    this.store.save();
    return p;
  }

  byToken(token) { return this.people.find(p => p.token === token); }

  /** Phone reported a position. Hysteresis: must go 20% (min 30 m) beyond the radius to count as left. */
  report(person, { lat, lon, accuracy = 0 }) {
    person.last = { lat, lon, accuracy, at: Date.now() };
    const events = [];
    for (const z of this.zones) {
      const d = distanceM({ lat, lon }, z);
      const inside = person.inside.includes(z.id);
      // A fuzzy fix (cell tower) must not trigger "arrived"; allow leaving only if clearly outside.
      if (!inside && d <= z.radius && accuracy <= Math.max(150, z.radius)) events.push(this._set(person, z, true));
      else if (inside && d - accuracy > z.radius + Math.max(z.radius * 0.2, 30)) events.push(this._set(person, z, false));
    }
    this.store.save();
    return events.filter(Boolean);
  }

  /** Explicit event from the phone's own geofence. */
  event(person, zoneRef, enter) {
    const z = this.zones.find(z => z.id === zoneRef || z.name.toLowerCase() === String(zoneRef).toLowerCase());
    if (!z) throw new Error(`unknown zone: ${zoneRef}`);
    const e = this._set(person, z, enter);
    this.store.save();
    return e;
  }

  _set(person, zone, enter) {
    const has = person.inside.includes(zone.id);
    if (enter === has) return null;
    person.inside = enter ? [...person.inside, zone.id] : person.inside.filter(x => x !== zone.id);
    const e = { person: person.id, zone: zone.id, event: enter ? 'enter' : 'leave' };
    bus.emit('geo', e);
    bus.emit('log', { level: 'info', msg: `📍 ${person.name} ${enter ? 'arrived at' : 'left'} ${zone.name}` });
    return e;
  }
}
