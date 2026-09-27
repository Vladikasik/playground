/* Orbit flight patterns: offsets from the head in metres (x = the person's left, y = up, z = forward).
   No dependencies, so the site can plot them without loading three.js. */
const TAU = Math.PI * 2;
const smooth = u => u * u * (3 - 2 * u);

const DART = [[0.12, 0.05, 0.4], [-0.22, 0.12, 0.36], [0.46, 0.0, 0.16], [0.0, 0.3, 0.34], [-0.46, 0.04, 0.14], [0.06, -0.04, 0.42]];
export const PATTERNS = {
  orbit: {
    name: 'Orbit', note: 'Tight circle at eye level, half a meter out.',
    f(t, o) { const a = 0.35 + t * TAU / 2.3, R = 0.5 + 0.04 * Math.sin(1.3 * t); return o.set(R * Math.sin(a), 0.08 + 0.05 * Math.sin(2.1 * t + 0.8), R * Math.cos(a)); },
  },
  figure8: {
    name: 'Figure-8', note: 'Crosses the line of sight twice a cycle.',
    f(t, o) { const w = TAU / 2.4; return o.set(0.36 * Math.sin(w * t), 0.1 + 0.11 * Math.sin(2 * w * t), 0.42 + 0.06 * Math.cos(2 * w * t)); },
  },
  dart: {
    name: 'Dart', note: 'Holds, then jumps to a new angle. Hard to track, harder to swat.',
    f(t, o) {
      const period = 0.72, i = Math.floor(t / period), u = (t - i * period) / period;
      const a = DART[i % DART.length], b = DART[(i + 1) % DART.length];
      const k = u < 0.55 ? 0 : smooth((u - 0.55) / 0.45);
      return o.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    },
  },
  halo: {
    name: 'Halo', note: 'Circles overhead and lights the eyes from above.',
    f(t, o) { const a = t * TAU / 1.7; return o.set(0.3 * Math.sin(a), 0.36 + 0.03 * Math.sin(3 * t), 0.3 * Math.cos(a)); },
  },
  spiral: {
    name: 'Spiral', note: 'Reverses direction and sweeps up and down.',
    f(t, o) { const a = -t * TAU / 2.2; return o.set(0.55 * Math.sin(a), -0.02 + 0.26 * (0.5 - 0.5 * Math.cos(1.5 * t)), 0.55 * Math.cos(a)); },
  },
  wide: {
    name: 'Wide orbit', note: 'Backs off to 0.8 m and varies its speed.',
    f(t, o) { const a = t * TAU / 3.2 + 0.4 * Math.sin(0.9 * t); return o.set(0.78 * Math.sin(a), 0.12 + 0.06 * Math.sin(1.7 * t), 0.78 * Math.cos(a)); },
  },
};

