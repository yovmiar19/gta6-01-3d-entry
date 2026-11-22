// On foot: a simple low-poly person, walk/run with WASD, and getting in and out
// of cars — including stealing a traffic car, which the police notice.

import { FOOT, WORLD } from './config.js';
import { collideCircle } from './world.js';

const torsoGeo = new THREE.CylinderGeometry(0.34, 0.42, 0.95, 8);
const headGeo = new THREE.SphereGeometry(0.3, 10, 8);
const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.26);
const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);

/** A low-poly person: torso, head, arms and legs that swing while walking. */
export function buildPersonMesh(shirt = 0x3d7bd9, skin = 0xc98a6b, pants = 0x2e2e33) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const legs = [];
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(sx, 0.42, 0);
    g.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.5, 0.5]) {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    arm.position.set(sx, 1.1, 0);
    g.add(arm);
    arms.push(arm);
  }
  g.userData.legs = legs;
  g.userData.arms = arms;
  return g;
}

export function createFootState(x, z, heading) {
  return {
    mesh: buildPersonMesh(),
    x, z, heading,
    walkPhase: 0,
    moving: false,
  };
}

/** One fixed step on foot. `move` is {x, z} in world space, already normalised. */
export function stepFoot(foot, move, running, dt, world) {
  const speed = running ? FOOT.runSpeed : FOOT.walkSpeed;
  const mx = move.x * speed * dt;
  const mz = move.z * speed * dt;
  foot.moving = mx !== 0 || mz !== 0;
  if (foot.moving) {
    foot.heading = Math.atan2(mx, mz);
    foot.walkPhase += dt * (running ? 13 : 9);
  }
  const nx = foot.x + mx;
  const nz = foot.z + mz;
  const clampedX = Math.max(-WORLD.half - 20, Math.min(WORLD.oceanX + 20, nx));
  const clampedZ = Math.max(-WORLD.half - 20, Math.min(WORLD.half + 20, nz));
  const solved = collideCircle(world, clampedX, clampedZ, FOOT.radius);
  foot.x = solved.x;
  foot.z = solved.z;

  foot.mesh.position.set(foot.x, 0, foot.z);
  foot.mesh.rotation.y = foot.heading;
  const swing = foot.moving ? Math.sin(foot.walkPhase) * 0.55 : 0;
  foot.mesh.userData.legs[0].rotation.x = swing;
  foot.mesh.userData.legs[1].rotation.x = -swing;
  foot.mesh.userData.arms[0].rotation.x = -swing * 0.8;
  foot.mesh.userData.arms[1].rotation.x = swing * 0.8;
  return solved.hit;
}

/** Distance from the person to a point. */
export function footDistanceTo(foot, x, z) {
  const dx = foot.x - x;
  const dz = foot.z - z;
  return Math.sqrt(dx * dx + dz * dz);
}
