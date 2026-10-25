// One-form "recipes" for the common automations. Each has fields (rendered as a form in the UI)
// and build(params) -> a rule. The UI never needs raw JSON for these.

const dev = (key, label, def) => ({ key, label, kind: 'device', default: def });
const num = (key, label, def, unit) => ({ key, label, kind: 'number', default: def, unit });

export const RECIPES = [
  {
    id: 'ev-arrive',
    title: 'Arrive home → charger on, off again if not charging',
    fields: [
      { key: 'person', label: 'Who', kind: 'person', default: '*' },
      { key: 'zone', label: 'Zone', kind: 'zone', default: 'home' },
      dev('device', 'Charger plug'),
      num('minutes', 'Give it this long to start charging', 10, 'min'),
      num('watts', 'Counts as "charging" above', 100, 'W'),
    ],
    build: p => ({
      name: 'Arrive home: charge car',
      trigger: { type: 'geo', person: p.person, zone: p.zone, event: 'enter' },
      mode: 'restart',
      actions: [
        { type: 'set', device: p.device, patch: { on: true } },
        {
          type: 'wait_until', timeoutMinutes: p.minutes,
          conditions: [{ type: 'state', device: p.device, attr: 'power', op: 'gt', value: p.watts }],
          then: [{ type: 'notify', message: 'Car is charging' }],
          else: [{ type: 'set', device: p.device, patch: { on: false } }, { type: 'notify', message: `Car didn't start charging within ${p.minutes} min — charger switched off` }],
        },
      ],
    }),
  },
  {
    id: 'standby-off',
    title: 'Power drops to standby → switch off',
    fields: [
      dev('device', 'Device (e.g. car charger)'),
      num('wasAbove', 'It must first have drawn more than', 1000, 'W'),
      num('below', 'and then fall below', 15, 'W'),
      num('for', 'for at least', 120, 'seconds'),
    ],
    build: p => ({
      name: 'Standby: switch off',
      trigger: { type: 'power', device: p.device, wasAbove: p.wasAbove, below: p.below, for: p.for },
      actions: [{ type: 'set', device: p.device, patch: { on: false } }, { type: 'notify', message: 'Finished — switched off' }],
    }),
  },
  {
    id: 'offline-react',
    title: 'Device loses power / connection → react',
    fields: [
      dev('device', 'When this goes offline'),
      num('for', 'for at least', 30, 'seconds'),
      dev('target', 'switch this'),
      { key: 'on', label: 'to', kind: 'onoff', default: true },
    ],
    build: p => ({
      name: 'Offline alert',
      trigger: { type: 'offline', device: p.device, for: p.for },
      actions: [{ type: 'set', device: p.target, patch: { on: p.on === true || p.on === 'true' } }, { type: 'notify', message: 'A device lost power or connection' }],
    }),
  },
  {
    id: 'back-online',
    title: 'Device comes back online → react',
    fields: [dev('device', 'When this comes back'), dev('target', 'switch this'), { key: 'on', label: 'to', kind: 'onoff', default: false }],
    build: p => ({
      name: 'Back online',
      trigger: { type: 'online', device: p.device },
      actions: [{ type: 'set', device: p.target, patch: { on: p.on === true || p.on === 'true' } }],
    }),
  },
  {
    id: 'schedule',
    title: 'Schedule (time or sunrise/sunset) → scene',
    fields: [
      { key: 'at', label: 'At', kind: 'time', default: 'sunset' },
      num('offset', 'Offset', 0, 'min'),
      { key: 'days', label: 'Days', kind: 'days', default: [0, 1, 2, 3, 4, 5, 6] },
      { key: 'scene', label: 'Scene', kind: 'scene' },
    ],
    build: p => ({
      name: `Schedule: ${p.at}`,
      trigger: { type: 'time', at: p.at, offset: p.offset || 0, days: p.days },
      actions: [{ type: 'scene', scene: p.scene }],
    }),
  },
  {
    id: 'timed-on',
    title: 'Turn on for a set time, then off',
    fields: [{ key: 'person', label: 'Who arrives', kind: 'person', default: '*' }, { key: 'zone', label: 'Zone', kind: 'zone', default: 'home' }, dev('device', 'Device'), num('minutes', 'Stay on for', 10, 'min')],
    build: p => ({
      name: 'Arrive: temporary on',
      trigger: { type: 'geo', person: p.person, zone: p.zone, event: 'enter' },
      actions: [{ type: 'set', device: p.device, patch: { on: true } }, { type: 'timer', device: p.device, minutes: p.minutes, patch: { on: false } }],
    }),
  },
  {
    id: 'leave-all-off',
    title: 'Everyone leaves → turn things off',
    fields: [{ key: 'zone', label: 'Zone', kind: 'zone', default: 'home' }, { key: 'devices', label: 'Devices', kind: 'devices' }],
    build: p => ({
      name: 'Everyone left: switch off',
      trigger: { type: 'geo', person: '*', zone: p.zone, event: 'leave' },
      conditions: [{ type: 'person', person: '*', zone: p.zone, home: false }],
      actions: [{ type: 'set', devices: p.devices, patch: { on: false } }],
    }),
  },
];
