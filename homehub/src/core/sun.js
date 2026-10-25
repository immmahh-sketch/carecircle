// Sunrise / sunset (NOAA approximation). Returns a Date (UTC instant) or null (polar day/night).
const rad = Math.PI / 180;

export function sunTimes(date, lat, lon) {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const jd = day / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008 - lon / 360);
  const Jstar = 2451545.0 + 0.0009 + lon / 360 + n;
  const M = (357.5291 + 0.98560028 * (Jstar - 2451545.0)) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jt = Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
  const dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) return null;
  const H = Math.acos(cosH) / rad;
  const toDate = j => new Date((j - 2440587.5) * 86400000);
  return { sunrise: toDate(Jt - H / 360), sunset: toDate(Jt + H / 360) };
}
