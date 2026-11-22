// A small seeded random number generator (mulberry32) plus the helpers the world
// builder uses: the same seed always grows the same city, which is what makes the
// screenshot scenes repeatable.

export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    next: random,
    // Float in [min, max).
    range(min, max) {
      return min + random() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(random() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
    // True with probability p.
    chance(p) {
      return random() < p;
    },
  };
}
