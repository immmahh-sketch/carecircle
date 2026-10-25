// Colour helpers. Internal colour model is HSV: h 0-360, s 0-100, v 0-100.

export function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max * 100) };
}

export function hsvToHex({ h, s, v }) {
  s /= 100; v /= 100;
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

export const hsvToRgbInt = c => parseInt(hsvToHex(c).slice(1), 16);
export const rgbIntToHsv = n => hexToHsv('#' + (n & 0xffffff).toString(16).padStart(6, '0'));

/** One-tap presets shown in the UI. `temp` = white colour temperature (0 warm .. 100 cool). */
export const PRESETS = [
  { id: 'warm', name: 'Warm white', temp: 5, brightness: 80 },
  { id: 'neutral', name: 'Neutral', temp: 50, brightness: 90 },
  { id: 'daylight', name: 'Daylight', temp: 100, brightness: 100 },
  { id: 'candle', name: 'Candle', color: '#ff8a1f', brightness: 35 },
  { id: 'sunset', name: 'Sunset', color: '#ff5a2a', brightness: 60 },
  { id: 'red', name: 'Red', color: '#ff0000', brightness: 80 },
  { id: 'green', name: 'Green', color: '#00ff40', brightness: 80 },
  { id: 'blue', name: 'Blue', color: '#2040ff', brightness: 80 },
  { id: 'purple', name: 'Purple', color: '#9a30ff', brightness: 80 },
  { id: 'pink', name: 'Pink', color: '#ff40a0', brightness: 80 },
];

/** Turn a preset (or {color:'#hex'}) into a device patch. */
export function presetPatch(p) {
  const patch = { on: true };
  if (p.brightness != null) patch.brightness = p.brightness;
  if (p.color) patch.color = hexToHsv(p.color);
  else if (p.temp != null) { patch.colorTemp = p.temp; patch.color = null; }
  return patch;
}

/** Rainbow list for colour-cycle effects. */
export const RAINBOW = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8000ff', '#ff00ff'];
