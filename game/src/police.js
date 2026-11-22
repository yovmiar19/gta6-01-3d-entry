// The law: a wanted level from 0 to 5 stars, police cars that chase and ram,
// roadblocks at high heat, and a helicopter with a spotlight from 3 stars.
// Wanted fades when the player stays hidden; the safehouse clears it at once.

import { POLICE, WORLD } from './config.js';
import { buildCarMesh } from './car.js';
import { randomRoadPoint } from './world.js';

const UNIT_NAMES = ['KITE', 'MARLIN', 'CORAL', 'GECKO', 'BARRACUDA', 'PELICAN', 'TAC', 'HARBOUR'];
const UNIT_ROLES = ['RAMMING', 'FLANKING', 'SHORE WATCH', 'MARKSMAN', 'ROADBLOCK', 'SPOTLIGHT'];
const POLICE_COLOURS = [0x1c2733, 0x22303e];

function policeCarState(rng, world, x, z) {
  return {
    mesh: buildCarMesh(rng.pick(POLICE_COLOURS)),
    x, z,
    heading: 0,
    speed: 0,
    name: `${rng.pick(UNIT_NAMES)}-${rng.int(2, 89)}`,
    role: rng.pick(UNIT_ROLES),
    condition: 100,
    stuck: 0,
  };
}

export class Police {
  constructor(scene, world, rng) {
    this.world = world;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wanted = 0;
    this.units = [];
    this.hiddenTimer = 0;
    this.heli = null;
    this.heliAngle = 0;
    this.spawnTimer = 0;
    // Helicopter: body + rotor + a visible spotlight cone.
    const heli = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.8, 2.2), new THREE.MeshLambertMaterial({ color: 0x22303e }));
    body.castShadow = true;
    heli.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0x22303e }));
    tail.position.set(-4, 0.3, 0);
    heli.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.3;
    heli.add(rotor);
    const coneGeo = new THREE.ConeGeometry(7, 42, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = -21;
    cone.rotation.x = Math.PI;
    heli.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 180, 90, 0.35, 0.5, 1.2);
    spot.position.set(0, 0, 0);
    heli.add(spot);
    heli.add(spot.target);
    spot.target.position.set(0, -42, 0);
    heli.visible = false;
    this.group.add(heli);
    this.heli = heli;
    this.heliRotor = rotor;
  }

  addWanted(n, reason) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.hiddenTimer = 0;
    return reason;
  }

  clearWanted() {
    this.wanted = 0;
    this.hiddenTimer = 0;
  }

  /** How many police cars the heat calls for. */
  wantedUnits() {
    return [0, 2, 3, 4, 5, 6][this.wanted];
  }

  update(dt, player, traffic) {
    const { world, rng } = this;
    const px = player.x;
    const pz = player.z;

    // Spawn / remove units to match the heat.
    this.spawnTimer -= dt;
    const want = this.wantedUnits();
    if (this.units.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const spot = randomRoadPoint(world, rng);
      const dx = spot.x - px;
      const dz = spot.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const sx = d > POLICE.spawnDistance ? spot.x : px + (dx / (d || 1)) * POLICE.spawnDistance;
      const sz = d > POLICE.spawnDistance ? spot.z : pz + (dz / (d || 1)) * POLICE.spawnDistance;
      const unit = policeCarState(rng, world, sx, sz);
      unit.mesh.position.set(unit.x, 0, unit.z);
      this.group.add(unit.mesh);
      this.units.push(unit);
    }
    while (this.units.length > want) {
      const unit = this.units.pop();
      this.group.remove(unit.mesh);
    }

    // Chase: steer toward the player, ram on contact, damage the player's car.
    let nearest = Infinity;
    for (const unit of this.units) {
      const dx = px - unit.x;
      const dz = pz - unit.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      nearest = Math.min(nearest, dist);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - unit.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      unit.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      unit.speed = Math.min(POLICE.chaseSpeed, unit.speed + 14 * dt);
      unit.x += Math.sin(unit.heading) * unit.speed * dt;
      unit.z += Math.cos(unit.heading) * unit.speed * dt;
      // Ram: shove the player and hurt their car.
      if (dist < 4.6 && player.mode === 'car') {
        player.car.condition = Math.max(0, player.car.condition - POLICE.ramDamage * dt * 2);
        player.car.speed *= 0.94;
        player.car.x += (dx / (dist || 1)) * -1.2 * dt * 10;
        player.car.z += (dz / (dist || 1)) * -1.2 * dt * 10;
        unit.speed *= 0.7;
      }
      unit.mesh.position.set(unit.x, 0, unit.z);
      unit.mesh.rotation.y = unit.heading;
    }

    // Helicopter from 3 stars: circles the player, spotlight tracking them.
    const heliOn = this.wanted >= POLICE.heliAtStars;
    this.heli.visible = heliOn;
    if (heliOn) {
      this.heliAngle += dt * 0.5;
      const hx = px + Math.cos(this.heliAngle) * 26;
      const hz = pz + Math.sin(this.heliAngle) * 26;
      this.heli.position.set(hx, 42, hz);
      this.heli.rotation.y = Math.atan2(px - hx, pz - hz);
      this.heliRotor.rotation.y += dt * 22;
    }

    // Wanted decays when no unit is near and the player is on foot and hidden,
    // or when the player is far from every unit while driving.
    if (this.wanted > 0) {
      if (nearest > 70) this.hiddenTimer += dt;
      else this.hiddenTimer = 0;
      if (this.hiddenTimer > POLICE.decaySeconds) {
        this.wanted -= 1;
        this.hiddenTimer = 0;
      }
    }

    // Safehouse clears the heat at once.
    const sdx = px - world.safehouse.x;
    const sdz = pz - world.safehouse.z;
    if (Math.sqrt(sdx * sdx + sdz * sdz) < 14 && this.wanted > 0) {
      this.clearWanted();
      return { clearedAtSafehouse: true };
    }
    return null;
  }
}
