// Maps Vector Pinball's element colors onto the site theme's light and dark palettes.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.
//
// Hues near the theme's accent (blue) or active (green) color take that color's hue, so tables
// match the site. Every color keeps its own brightness ordering and transparency, so a lit
// element still looks different from an unlit one, and lightness is adjusted to stay readable
// on the theme's background.

const TOKENS = ['--bg', '--fg', '--muted', '--accent', '--active', '--border'];
const HUE_SNAP_DEGREES = 30;

function parseHex(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export class Palette {
  constructor(tokens, dark) {
    this.tokens = tokens;
    this.dark = dark;
    this.accentHue = rgbToHsl(parseHex(tokens['--accent']))[0];
    this.activeHue = rgbToHsl(parseHex(tokens['--active']))[0];
    this.cache = new Map();
  }

  // Reads the theme's CSS variables from the page.
  static fromDocument() {
    const style = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(t).trim()]));
    const [, , bgLightness] = rgbToHsl(parseHex(tokens['--bg']));
    return new Palette(tokens, bgLightness < 0.5);
  }

  css(color) {
    const key = color.join(',');
    let value = this.cache.get(key);
    if (!value) {
      value = this.map(color);
      this.cache.set(key, value);
    }
    return value;
  }

  map([r, g, b, a]) {
    let [h, s, l] = rgbToHsl([r, g, b]);
    if (s > 0.15) {
      if (hueDistance(h, this.accentHue) <= HUE_SNAP_DEGREES) h = this.accentHue;
      else if (hueDistance(h, this.activeHue) <= HUE_SNAP_DEGREES) h = this.activeHue;
    }
    // Vector Pinball was drawn on black. On a dark background keep colors bright enough to see;
    // on a light one, flip lightness so bright colors become deep ones.
    l = this.dark ? 0.35 + l * 0.55 : 0.62 - l * 0.45;
    s = Math.min(s, this.dark ? 0.9 : 0.85);
    return `hsla(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%,${(a / 255).toFixed(2)})`;
  }
}

// Calls fn whenever the light/dark theme changes, from the site toggle or the system setting.
export function onThemeChange(fn) {
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}
