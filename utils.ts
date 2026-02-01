export const Utils = {
  dist: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
  rand: (min: number, max: number) => Math.random() * (max - min) + min,
  lerp: (a: number, b: number, t: number) => a * (1 - t) + b * t,
  clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  normalizeAngle: (a: number) => { while (a <= -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2; return a; },
  angleDiff: (from: number, to: number) => Utils.normalizeAngle(to - from),
  uid: (prefix = 'e') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  inBounds: (x: number, y: number, w: number, h: number, pad = 50) => x >= -pad && x <= w + pad && y >= -pad && y <= h + pad,
  getSpawnPos: (w: number, h: number, offset = 100) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.hypot(w / 2, h / 2) + offset;
    return { x: w / 2 + Math.cos(angle) * dist, y: h / 2 + Math.sin(angle) * dist };
  },
};