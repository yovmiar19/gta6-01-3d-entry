// The player's car: a box-built low-poly sports car and the arcade driving
// model that moves it. Steering, throttle, brake, reverse and handbrake, with
// simple circle-vs-building collision and a speed readout for the HUD.

import { CAR, WORLD } from './config.js';
import { collideCircle } from './world.js';

const bodyGeo = new THREE.BoxGeometry(2.1, 0.62, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 10);
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
const spoilerGeo = new THREE.BoxGeometry(1.9, 0.09, 0.42);

function carMaterial(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/** A low-poly sports car: body, cabin, spoiler, four wheels, headlights. */
export function buildCarMesh(color) {
  const g = new THREE.Group();
  const paint = carMaterial(color);
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e, emissive: 0x0a1a24, emissiveIntensity: 0.6 });

  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glass);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const spoiler = new THREE.Mesh(spoilerGeo, dark);
  spoiler.position.set(0, 1.0, -2.05);
  g.add(spoiler);
  const lightMat = new THREE.MeshLambertMaterial({ color: 0x444422, emissive: 0xffe9a8, emissiveIntensity: 2.4 });
  for (const sx of [-0.65, 0.65]) {
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(sx, 0.62, 2.22);
    g.add(light);
  }
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    g.add(wheel);
    wheels.push(wheel);
  }
  g.userData.wheels = wheels;
  g.userData.body = body;
  return g;
}

/** Fresh driving state at a spawn point. */
export function createCarState(x, z, heading, color = 0xe85d3d) {
  return {
    mesh: buildCarMesh(color),
    x, z, heading,
    speed: 0,
    steer: 0,
    condition: 100,
    color,
  };
}

/** One fixed step of arcade driving. `drive` is {throttle, steer, handbrake}. */
export function stepCar(car, drive, dt, world) {
  const grip = drive.handbrake ? CAR.handbrakeGrip : CAR.grip;
  const targetSteer = drive.steer * CAR.steerMax * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
  car.steer += (targetSteer - car.steer) * Math.min(1, CAR.steerSpeed * dt * 3);

  if (drive.throttle > 0) car.speed += CAR.accel * dt;
  else if (drive.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  }
  if (drive.handbrake) car.speed -= Math.sign(car.speed) * CAR.brake * 0.9 * dt;
  car.speed -= car.speed * CAR.drag * dt;
  if (Math.abs(car.speed) < 0.05 && drive.throttle === 0) car.speed = 0;
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

  // Sand slows the car down.
  const onSand = car.x > WORLD.beachX - 4;
  const speedScale = onSand ? 0.55 : 1;

  car.heading += (car.steer * car.speed * 0.055 * grip) / 6.5 * dt * speedScale;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt * speedScale;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt * speedScale;

  // Stay out of the ocean and inside the city.
  const clampedX = Math.max(-WORLD.half - 20, Math.min(WORLD.oceanX + 26, nx));
  const clampedZ = Math.max(-WORLD.half - 20, Math.min(WORLD.half + 20, nz));
  const hitWall = clampedX !== nx || clampedZ !== nz;
  const solved = collideCircle(world, clampedX, clampedZ, CAR.radius);
  if (solved.hit || hitWall) {
    // A hard hit costs speed and a little condition.
    if (Math.abs(car.speed) > 14) car.condition = Math.max(0, car.condition - 3);
    car.speed *= 0.45;
  }
  car.x = solved.x;
  car.z = solved.z;

  // Sync the mesh: position, heading, wheel spin and front-wheel steer.
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.38;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
  const front = car.mesh.userData.wheels.slice(0, 2);
  for (const wheel of front) wheel.rotation.y = car.steer * 0.5;
  return solved.hit;
}

export function carSpeedKmh(car) {
  return Math.abs(car.speed) * 3.6;
}
