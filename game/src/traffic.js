// Traffic: cars that drive the road grid and pedestrians that walk the
// sidewalks. They make the city feel alive and give the player something to
// steal, dodge and chase.

import { TRAFFIC, WORLD } from './config.js';
import { buildCarMesh } from './car.js';
import { buildPersonMesh } from './onfoot.js';
import { collideCircle, randomRoadPoint } from './world.js';

const TRAFFIC_COLOURS = [0xf2f2f2, 0x3d7bd9, 0xe8c95a, 0x7a7a82, 0x4f9f6b, 0xd94f3d, 0x9a6bc0];
const SHIRT_COLOURS = [0xe85d5d, 0x4f9fd8, 0xf2c94c, 0x7fb5a3, 0xf2f2f2, 0xc98a6b];

function trafficCarState(rng, world) {
  const spot = randomRoadPoint(world, rng);
  return {
    mesh: buildCarMesh(rng.pick(TRAFFIC_COLOURS)),
    x: spot.x,
    z: spot.z,
    axis: spot.axis,
    dir: spot.dir,
    speed: TRAFFIC.carSpeed * rng.range(0.8, 1.15),
    heading: spot.axis === 'z' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    stolen: false,
    wrecked: false,
  };
}

function pedState(rng, world) {
  const spot = randomRoadPoint(world, rng);
  return {
    mesh: buildPersonMesh(rng.pick(SHIRT_COLOURS)),
    x: spot.x + rng.range(-8, 8),
    z: spot.z + rng.range(-8, 8),
    heading: rng.range(0, Math.PI * 2),
    speed: TRAFFIC.pedSpeed * rng.range(0.7, 1.3),
    target: null,
    scared: 0,
    fallen: false,
  };
}

export class Traffic {
  constructor(scene, world, rng) {
    this.world = world;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < TRAFFIC.cars; i += 1) {
      const car = trafficCarState(rng, world);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      this.group.add(car.mesh);
      this.cars.push(car);
    }
    for (let i = 0; i < TRAFFIC.peds; i += 1) {
      const ped = pedState(rng, world);
      ped.mesh.position.set(ped.x, 0, ped.z);
      this.group.add(ped.mesh);
      this.peds.push(ped);
    }
  }

  /** The nearest drivable traffic car within maxDist of (x, z), or null. */
  nearestCar(x, z, maxDist) {    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.stolen || car.wrecked) continue;
      const dx = car.x - x;
      const dz = car.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** A car the player just stole stops being traffic. */
  removeCar(car) {
    this.group.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }

  /** The rival coupe for the Pier Run mission: drives for the pier, red, fast. */
  spawnRivalCar(x, z, target) {
    const car = {
      mesh: buildCarMesh(0xd94f3d),
      x, z,
      axis: 'rival',
      dir: 1,
      speed: 19,
      heading: Math.atan2(target.x - x, target.z - z),
      stolen: false,
      wrecked: false,
      rival: true,
      target,
    };
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = car.heading;
    this.group.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  update(dt, player) {
    const { world, rng } = this;
    this.time = (this.time || 0) + dt;
    for (const car of this.cars) {
      if (car.wrecked) continue;
      if (car.rival) {
        // The rival drives straight for its target (the pier), not the roads.
        const tx = car.target.x - car.x;
        const tz = car.target.z - car.z;
        const td = Math.max(0.001, Math.sqrt(tx * tx + tz * tz));
        if (td > 6) {
          const want = Math.atan2(tx, tz);
          let diff = want - car.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          car.heading += Math.max(-1.4 * dt, Math.min(1.4 * dt, diff));
          car.x += Math.sin(car.heading) * car.speed * dt;
          car.z += Math.cos(car.heading) * car.speed * dt;
        }
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        continue;
      }
      // Slow down for the car ahead on the same road.
      let ahead = false;
      for (const other of this.cars) {
        if (other === car || other.wrecked) continue;
        if (other.axis !== car.axis || Math.sign(other.dir) !== Math.sign(car.dir)) continue;
        const along = car.axis === 'z' ? (other.z - car.z) * car.dir : (other.x - car.x) * car.dir;
        const side = car.axis === 'z' ? Math.abs(other.x - car.x) : Math.abs(other.z - car.z);
        if (along > 0 && along < 9 && side < 4) {
          ahead = true;
          break;
        }
      }
      // And for the player blocking the road.
      if (player && player.mode === 'car') {
        const along = car.axis === 'z' ? (player.car.z - car.z) * car.dir : (player.car.x - car.x) * car.dir;
        const side = car.axis === 'z' ? Math.abs(player.car.x - car.x) : Math.abs(player.car.z - car.z);
        if (along > 0 && along < 10 && side < 4.5) ahead = true;
      }
      const speed = ahead ? car.speed * 0.25 : car.speed;
      if (car.axis === 'z') car.z += car.dir * speed * dt;
      else car.x += car.dir * speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const onCross = car.axis === 'z'
        ? world.roads.zs.some((rz) => Math.abs(car.z - rz) < 1.2)
        : world.roads.xs.some((rx) => Math.abs(car.x - rx) < 1.2);
      if (onCross && rng.chance(0.012)) {
        if (car.axis === 'z') {
          car.axis = 'x';
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.z = Math.round(car.z / WORLD.block) * WORLD.block;
        } else {
          car.axis = 'z';
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.heading = car.dir > 0 ? 0 : Math.PI;
          car.x = Math.round(car.x / WORLD.block) * WORLD.block;
        }
      }
      // Wrap around the far edge so the city never runs dry.
      if (car.z > WORLD.half + 10 || car.z < -WORLD.half - 10 || car.x > WORLD.half + 10 || car.x < -WORLD.half - 10) {
        const spot = randomRoadPoint(world, rng);
        car.x = spot.x;
        car.z = spot.z;
        car.axis = spot.axis;
        car.dir = spot.dir;
        car.heading = spot.axis === 'z' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }

    for (const ped of this.peds) {
      if (ped.fallen) continue;
      if (ped.scared > 0) {
        ped.scared -= dt;
        // Run away from the player.
        const dx = ped.x - (player ? player.x : 0);
        const dz = ped.z - (player ? player.z : 0);
        const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
        ped.x += (dx / d) * ped.speed * 2.2 * dt;
        ped.z += (dz / d) * ped.speed * 2.2 * dt;
        ped.heading = Math.atan2(dx, dz);
      } else {
        if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 2) {
          ped.target = { x: ped.x + rng.range(-70, 70), z: ped.z + rng.range(-70, 70) };
        }
        const dx = ped.target.x - ped.x;
        const dz = ped.target.z - ped.z;
        const d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
        ped.x += (dx / d) * ped.speed * dt;
        ped.z += (dz / d) * ped.speed * dt;
        ped.heading = Math.atan2(dx, dz);
      }
      const solved = collideCircle(world, ped.x, ped.z, 0.6);
      ped.x = solved.x;
      ped.z = solved.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(this.time * 9 + ped.x) * 0.4;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
    }
  }
}
