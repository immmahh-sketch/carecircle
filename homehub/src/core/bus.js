import { EventEmitter } from 'node:events';

// Single in-process event bus. Event names used across the app:
//   state     {id, prev, next, changes}   a device state changed
//   flic      {button, click}             a Flic button was pressed
//   geo       {person, zone, event}       person entered/left a zone
//   tick      {now}                       scheduler heartbeat
//   log       {level, msg, ...}           activity feed entry
//   change    {kind}                      config (rules/scenes/...) changed, for UI refresh
export const bus = new EventEmitter();
bus.setMaxListeners(100);
