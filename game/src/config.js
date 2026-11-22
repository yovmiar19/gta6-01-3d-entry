// Solmar Bay — tuning and constants for the 3D open-world crime game.
// Everything the world, the car, the police and the missions agree on lives here,
// so a single number change retunes the whole game.

export const WORLD = {
  // City extents (metres). Roads run on a grid; the beach is the east edge.
  half: 300,
  block: 60,
  roadWidth: 12,
  // East of this x the ground is sand, then ocean.
  beachX: 276,
  oceanX: 312,
  // The pier reaches into the ocean from the boulevard at z = 0.
  pierZ: 0,
  pierLength: 64,
  // Safehouse (where wanted clears) and marina pickup.
  safehouse: { x: -210, z: 210 },
  marina: { x: 236, z: -216 },
  pierEnd: { x: 336, z: 0 },
};

export const COLOURS = {
  sky: 0xff9e57,
  skyTop: 0x7fb2e8,
  fog: 0xf7a05c,
  sun: 0xffd9a0,
  ground: 0x3f7a44,
  sand: 0xe8cf9a,
  ocean: 0x2a7fa8,
  road: 0x2e2e33,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a938a,
  // Warm pastel building palette, golden-hour friendly.
  buildings: [0xf2e3c6, 0xe8a87c, 0xd9826e, 0x7fb5a3, 0xe8c95a, 0xc98a6b, 0x9fc3d8, 0xf0b429],
  roof: 0x5c4a3a,
  palmTrunk: 0x8a6b46,
  palmLeaf: 0x3e9e4d,
  palmLeaf2: 0x57b368,
  lamp: 0x3a3a40,
  lampGlow: 0xffe9a8,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  steerMax: 0.55,
  steerSpeed: 2.4,
  grip: 6.5,
  handbrakeGrip: 2.2,
  drag: 0.35,
  radius: 2.3,
};

export const FOOT = {
  walkSpeed: 5,
  runSpeed: 9,
  radius: 0.7,
};

export const TRAFFIC = {
  cars: 16,
  carSpeed: 9,
  peds: 18,
  pedSpeed: 1.6,
};

export const POLICE = {
  maxUnits: 6,
  chaseSpeed: 34,
  ramDamage: 8,
  heliAtStars: 3,
  decaySeconds: 9,
  spawnDistance: 90,
};

export const PLAYER = {
  health: 100,
  armour: 100,
  startMoney: 400,
  carCondition: 100,
};

export const WEAPONS = [
  { key: '1', name: 'FISTS', ammo: Infinity, damage: 12, range: 2.2 },
  { key: '2', name: '.38', ammo: 60, damage: 25, range: 60 },
  { key: '3', name: 'SMG', ammo: 120, damage: 14, range: 55 },
  { key: '4', name: 'AR-9', ammo: 90, damage: 30, range: 80 },
];

export const DISTRICTS = [
  { name: 'BEACHFRONT', test: (x, z) => x > 230 },
  { name: 'MARINA', test: (x, z) => x > 150 && z < -150 },
  { name: 'DOWNTOWN', test: (x, z) => Math.abs(x) < 120 && Math.abs(z) < 120 },
  { name: 'NORTHSIDE', test: (x, z) => z < -150 },
  { name: 'SOUTHSIDE', test: (x, z) => z > 150 },
  { name: 'WEST END', test: () => true },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'SOLMAR BAY';
}
