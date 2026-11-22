// Combat: four weapon slots (fists, pistol, SMG, rifle). Shooting is a hitscan
// ray from the camera through the crosshair; a hit pedestrian falls and runs,
// a hit police car loses condition, and every shot raises the heat.

import { WEAPONS } from './config.js';

export class Combat {
  constructor() {
    this.weapons = WEAPONS.map((w) => ({ ...w, ammo: w.ammo }));
    this.current = 0;
    this.cooldown = 0;
    this.flash = 0;
    this.raycaster = new THREE.Raycaster();
  }

  get weapon() {
    return this.weapons[this.current];
  }

  select(index) {
    if (index >= 0 && index < this.weapons.length) this.current = index;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flash > 0) this.flash -= dt;
  }

  /** Fire the current weapon. Returns a small event for sound/HUD. */
  shoot(camera, player, traffic, police) {
    if (this.cooldown > 0) return null;
    const w = this.weapon;
    if (w.ammo !== Infinity && w.ammo <= 0) {
      this.cooldown = 0.25;
      return { kind: 'dry', weapon: w.name };
    }
    if (w.ammo !== Infinity) w.ammo -= 1;
    this.cooldown = w.name === 'FISTS' ? 0.45 : w.name === 'SMG' ? 0.09 : 0.3;
    this.flash = 0.06;

    if (w.name === 'FISTS') {
      // A swing at arm's length: knock down a pedestrian right in front.
      let hit = null;
      for (const ped of traffic.peds) {
        if (ped.fallen) continue;
        const dx = ped.x - player.x;
        const dz = ped.z - player.z;
        if (Math.sqrt(dx * dx + dz * dz) < w.range) {
          hit = ped;
          break;
        }
      }
      if (hit) {
        hit.fallen = true;
        hit.mesh.rotation.x = -Math.PI / 2;
        hit.mesh.position.y = 0.4;
        return { kind: 'punch-hit', weapon: w.name };
      }
      return { kind: 'punch-miss', weapon: w.name };
    }

    // Hitscan: from the camera through the centre of the screen.
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    this.raycaster.far = w.range;
    const targets = [];
    for (const ped of traffic.peds) if (!ped.fallen) targets.push(ped.mesh);
    for (const unit of police.units) targets.push(unit.mesh);
    for (const car of traffic.cars) if (!car.wrecked) targets.push(car.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      // Find which pedestrian / police unit / traffic car owns this mesh.
      for (const ped of traffic.peds) {
        if (ped.mesh === hits[0].object || isDescendant(ped.mesh, hits[0].object)) {
          ped.fallen = true;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.4;
          ped.scared = 0;
          return { kind: 'hit-ped', weapon: w.name };
        }
      }
      for (const unit of police.units) {
        if (isDescendant(unit.mesh, hits[0].object)) {
          unit.condition -= w.damage;
          if (unit.condition <= 0) {
            unit.condition = 0;
            unit.speed = 0;
            unit.mesh.rotation.z = 0.3;
          }
          return { kind: 'hit-police', weapon: w.name };
        }
      }
      for (const car of traffic.cars) {
        if (isDescendant(car.mesh, hits[0].object)) {
          car.wrecked = true;
          car.mesh.rotation.z = 0.25;
          return { kind: 'hit-car', weapon: w.name };
        }
      }
      return { kind: 'hit', weapon: w.name };
    }
    return { kind: 'miss', weapon: w.name };
  }
}

function isDescendant(root, obj) {
  let node = obj;
  while (node) {
    if (node === root) return true;
    node = node.parent;
  }
  return false;
}
