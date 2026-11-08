// Helpers for reading Vector Pinball table JSON, where numbers are sometimes strings.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

export function num(value, fallback = 0) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

export function nums(list) {
  return list ? list.map((v) => num(v)) : null;
}

export const toRadians = (deg) => (deg * Math.PI) / 180;

// Colors are [r, g, b, a] with a in 0-255, like the upstream Color class.
export function color(list, fallback = null) {
  if (!list) return fallback;
  const [r, g, b, a = 255] = list.map((v) => num(v));
  return [r, g, b, a];
}

export const rgb = (r, g, b, a = 255) => [r, g, b, a];

export const inverse = ([r, g, b, a]) => [255 - r, 255 - g, 255 - b, a];

// Small seeded random number generator, so headless runs repeat exactly.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
