// Solmar Bay itself: a sun-soaked coastal city built from boxes, cylinders and
// cones. One function grows the whole city from a seed — roads on a grid, pastel
// buildings, palm-lined boulevard, beach, ocean, pier and marina — and hands back
// the colliders and spawn points the rest of the game drives on.

import { COLOURS, WORLD } from './config.js';

// Shared geometry/material caches so hundreds of meshes stay cheap.
const geoCache = new Map();
const matCache = new Map();

function boxGeo(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}
function cylGeo(rt, rb, h, seg = 8) {
  const key = `c${rt}|${rb}|${h}|${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key);
}
function coneGeo(r, h, seg = 6) {
  const key = `k${r}|${h}|${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(key);
}
function lambert(color, emissive = 0x000000, emissiveIntensity = 1) {
  const key = `m${color}|${emissive}|${emissiveIntensity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity }));
  }
  return matCache.get(key);
}
function mesh(geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

function roadLines() {
  const lines = [];
  for (let i = 0; i <= 10; i += 1) lines.push(-WORLD.half + i * WORLD.block);
  return lines;
}

export function buildWorld(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const roads = { xs: roadLines(), zs: roadLines() };

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(COLOURS.sky);
  scene.fog = new THREE.Fog(COLOURS.fog, 120, 620);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x3f6b4a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLOURS.sun, 2.1);
  sun.position.set(-180, 140, 260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  // Low sun disc on the horizon, straight down the boulevard.
  const sunDisc = mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }), 420, 46, -40);
  sunDisc.lookAt(0, 46, -40);
  group.add(sunDisc);
  // A few flat clouds.
  for (let i = 0; i < 9; i += 1) {
    const c = mesh(new THREE.SphereGeometry(rng.range(14, 26), 8, 6), lambert(0xfff4e0), rng.range(-320, 320), rng.range(90, 150), rng.range(-320, 320));
    c.scale.y = 0.35;
    group.add(c);
  }

  // --- ground, sand, ocean --------------------------------------------------
  const ground = mesh(new THREE.PlaneGeometry(WORLD.half * 2 + 80, WORLD.half * 2 + 80), lambert(COLOURS.ground), 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const sand = mesh(new THREE.PlaneGeometry(48, WORLD.half * 2 + 80), lambert(COLOURS.sand), WORLD.beachX + 16, 0.05, 0);
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = mesh(new THREE.PlaneGeometry(240, WORLD.half * 2 + 260), lambert(COLOURS.ocean), WORLD.oceanX + 130, 0.02, 0);
  ocean.rotation.x = -Math.PI / 2;
  group.add(ocean);

  // --- roads -----------------------------------------------------------------
  for (const x of roads.xs) {
    const road = mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.half * 2), lambert(COLOURS.road), x, 0.08, 0);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);
    const line = mesh(new THREE.PlaneGeometry(0.6, WORLD.half * 2), lambert(COLOURS.roadLine), x, 0.1, 0);
    line.rotation.x = -Math.PI / 2;
    group.add(line);
  }
  for (const z of roads.zs) {
    const road = mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.roadWidth), lambert(COLOURS.road), 0, 0.08, z);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);
    const line = mesh(new THREE.PlaneGeometry(WORLD.half * 2, 0.6), lambert(COLOURS.roadLine), 0, 0.1, z);
    line.rotation.x = -Math.PI / 2;
    group.add(line);
  }

  // --- buildings -------------------------------------------------------------
  const buildings = [];
  for (let ix = 0; ix < 10; ix += 1) {
    for (let iz = 0; iz < 10; iz += 1) {
      const cx = -WORLD.half + WORLD.block / 2 + ix * WORLD.block;
      const cz = -WORLD.half + WORLD.block / 2 + iz * WORLD.block;
      // Beach strip and the marina corner stay open.
      if (cx > 220) continue;
      if (cx > 150 && cz < -180) continue;
      // Safehouse plot stays clear (its house is placed by hand below).
      if (Math.abs(cx - WORLD.safehouse.x) < 40 && Math.abs(cz - WORLD.safehouse.z) < 40) continue;
      const count = rng.chance(0.55) ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const ox = (b === 0 ? -11 : 11) + rng.range(-3, 3);
        const oz = rng.range(-11, 11);
        const w = rng.range(13, 20);
        const d = rng.range(13, 20);
        const h = rng.range(9, 52);
        const color = rng.pick(COLOURS.buildings);
        const bx = cx + ox;
        const bz = cz + oz;
        const body = mesh(boxGeo(w, h, d), lambert(color), bx, h / 2, bz, rng.chance(0.5) ? 0 : Math.PI / 2);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        const roof = mesh(boxGeo(w + 1, 1.2, d + 1), lambert(COLOURS.roof), bx, h + 0.6, bz);
        group.add(roof);
        // Lit window band on the front face, warm against the dusk.
        if (h > 16) {
          const band = mesh(boxGeo(w * 0.7, Math.min(2.2, h * 0.12), 0.3), lambert(0x332211, 0xffc46b, 1.4), bx, h * 0.62, bz + d / 2 + 0.2);
          group.add(band);
        }
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        buildings.push({ x: bx, z: bz, w, d, h });
      }
    }
  }
  // Safehouse: a small house with a green roof, marked on the minimap.
  const sh = { x: WORLD.safehouse.x, z: WORLD.safehouse.z };
  const shBody = mesh(boxGeo(16, 8, 12), lambert(0xf2e3c6), sh.x, 4, sh.z);
  shBody.castShadow = true;
  group.add(shBody);
  const shRoof = mesh(coneGeo(11, 5, 4), lambert(0x3e7a44), sh.x, 10.5, sh.z, Math.PI / 4);
  shRoof.scale.z = 0.8;
  group.add(shRoof);
  colliders.push({ minX: sh.x - 8, maxX: sh.x + 8, minZ: sh.z - 6, maxZ: sh.z + 6 });

  // --- palms along the boulevard + scattered ----------------------------------
  const palms = [];
  function palm(x, z, s = 1) {
    const trunk = mesh(cylGeo(0.35 * s, 0.55 * s, 9 * s, 6), lambert(COLOURS.palmTrunk), x, 4.5 * s, z);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = mesh(coneGeo(3.4 * s, 3.2 * s, 6), lambert(rng.chance(0.5) ? COLOURS.palmLeaf : COLOURS.palmLeaf2), x, 10.2 * s, z);
    crown.scale.y = 0.7;
    crown.castShadow = true;
    group.add(crown);
    palms.push({ x, z });
  }
  for (let z = -280; z <= 280; z += 28) {
    palm(266, z + rng.range(-4, 4), rng.range(0.9, 1.2));
    if (rng.chance(0.5)) palm(244, z + 14 + rng.range(-4, 4), rng.range(0.8, 1.1));
  }
  for (let i = 0; i < 14; i += 1) {
    palm(rng.range(-260, 220), rng.range(-260, 260), rng.range(0.8, 1.3));
  }

  // --- streetlights ------------------------------------------------------------
  const lamps = [];
  for (const x of roads.xs) {
    for (const z of roads.zs) {
      if ((x + z) % 120 !== 0) continue;
      if (x > 240) continue;
      const pole = mesh(cylGeo(0.18, 0.22, 7, 6), lambert(COLOURS.lamp), x + 7, 3.5, z + 7);
      group.add(pole);
      const glow = mesh(new THREE.SphereGeometry(0.7, 8, 6), lambert(0x443311, COLOURS.lampGlow, 2.2), x + 7, 7.2, z + 7);
      group.add(glow);
      lamps.push({ x: x + 7, z: z + 7 });
    }
  }

  // --- pier ---------------------------------------------------------------------
  const pierGroup = new THREE.Group();
  for (let px = WORLD.beachX + 8; px < WORLD.beachX + 8 + WORLD.pierLength; px += 4) {
    const plank = mesh(boxGeo(4, 0.5, 10), lambert(0x8a6b46), px, 1.2, WORLD.pierZ);
    pierGroup.add(plank);
  }
  for (let px = WORLD.beachX + 10; px < WORLD.beachX + 8 + WORLD.pierLength; px += 12) {
    for (const pz of [-4.5, 4.5]) {
      pierGroup.add(mesh(cylGeo(0.3, 0.3, 3, 6), lambert(0x6b4e33), px, 0.2, WORLD.pierZ + pz));
    }
  }
  const hut = mesh(boxGeo(8, 5, 7), lambert(0xe8a87c), WORLD.beachX + 8 + WORLD.pierLength - 4, 3.7, WORLD.pierZ);
  hut.castShadow = true;
  pierGroup.add(hut);
  group.add(pierGroup);

  // --- marina boats --------------------------------------------------------------
  const boats = [];
  for (let i = 0; i < 5; i += 1) {
    const bx = WORLD.marina.x + rng.range(-24, 24);
    const bz = WORLD.marina.z + rng.range(-14, 14);
    const hull = mesh(boxGeo(9, 2, 3.4), lambert(rng.pick([0xf2f2f2, 0xd94f3d, 0x3d7bd9])), bx, 0.8, bz, rng.range(-0.4, 0.4));
    hull.castShadow = true;
    group.add(hull);
    const cabin = mesh(boxGeo(3, 1.8, 2.4), lambert(0xf2e3c6), bx, 2.6, bz, hull.rotation.y);
    group.add(cabin);
    boats.push({ hull, cabin, x: bx, z: bz, phase: rng.range(0, Math.PI * 2) });
  }

  // --- beach umbrellas -------------------------------------------------------------
  for (let i = 0; i < 10; i += 1) {
    const ux = WORLD.beachX + 8 + rng.range(0, 22);
    const uz = rng.range(-260, 260);
    const pole = mesh(cylGeo(0.12, 0.12, 3, 5), lambert(0xf2f2f2), ux, 1.5, uz);
    group.add(pole);
    const top = mesh(coneGeo(2.6, 1.4, 8), lambert(rng.pick([0xe85d5d, 0x4f9fd8, 0xf2c94c, 0xffffff])), ux, 3.4, uz);
    group.add(top);
  }

  // --- distant skyline silhouettes ---------------------------------------------------
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const r = 430;
    const h = rng.range(40, 120);
    const b = mesh(boxGeo(rng.range(18, 34), h, rng.range(18, 34)), lambert(0x8a6a72), Math.cos(a) * r, h / 2, Math.sin(a) * r);
    group.add(b);
  }

  return {
    group, colliders, roads, buildings, palms, lamps, boats, sun,
    beachX: WORLD.beachX,
    safehouse: { ...WORLD.safehouse },
    marina: { ...WORLD.marina },
    pierEnd: { ...WORLD.pierEnd },
    spawn: { x: 258, z: 60, heading: -Math.PI / 2 },
  };
}

/** Push a circle (x, z, radius) out of every building AABB it overlaps. */
export function collideCircle(world, x, z, radius) {
  let hit = false;
  for (const c of world.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = x - c.minX;
      const pr = c.maxX - x;
      const pt = z - c.minZ;
      const pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - radius;
      else if (m === pr) x = c.maxX + radius;
      else if (m === pt) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z, hit };
}

/** True when the point is on a road (within the road width of a grid line). */
export function onRoad(world, x, z) {
  const half = WORLD.roadWidth / 2 + 1;
  for (const rx of world.roads.xs) if (Math.abs(x - rx) < half) return true;
  for (const rz of world.roads.zs) if (Math.abs(z - rz) < half) return true;
  return false;
}

/** A random point on a road, with the road's axis and a driving direction. */
export function randomRoadPoint(world, rng) {
  if (rng.chance(0.5)) {
    const x = rng.pick(world.roads.xs);
    return { x: x + rng.range(-2.5, 2.5), z: rng.range(-WORLD.half, WORLD.half), axis: 'z', dir: rng.chance(0.5) ? 1 : -1 };
  }
  const z = rng.pick(world.roads.zs);
  return { x: rng.range(-WORLD.half, WORLD.half), z: z + rng.range(-2.5, 2.5), axis: 'x', dir: rng.chance(0.5) ? 1 : -1 };
}
