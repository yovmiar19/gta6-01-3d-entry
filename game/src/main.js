// SOLMAR HEAT 3D — entrypoint: boot, game loop, screen state machine
// (title / play / pause / over), the player on foot and in a car, stealing,
// ramming, pickups, shooting, wanted heat, missions, saving, and the
// ?shot= staging hook. Everything here is written fresh in this session.

import { PLAYER } from './config.js';
import { makeRng } from './random.js';
import { buildWorld } from './world.js';
import { createCarState, stepCar } from './car.js';
import { createFootState, stepFoot } from './onfoot.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { loadSave, saveGame } from './save.js';
import { createInput, ACT_ENTER, ACT_PAUSE, ACT_MUTE, ACT_SHOOT, ACT_CONFIRM } from './input.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const CAR_NAMES = ['RUKAN PELO GT', 'VESPA MARLIN S', 'CORAL SUNSET R', 'BAHARI GT 500', 'PELICAN X', 'SOLMAR SPYDER'];
const PICKUP_DEFS = [
  { kind: 'cash', amount: 150, color: 0x57b368 },
  { kind: 'cash', amount: 100, color: 0x57b368 },
  { kind: 'cash', amount: 200, color: 0x57b368 },
  { kind: 'health', amount: 30, color: 0xf2f2f2 },
  { kind: 'health', amount: 30, color: 0xf2f2f2 },
  { kind: 'armour', amount: 30, color: 0x4f9fd8 },
  { kind: 'armour', amount: 30, color: 0x4f9fd8 },
  { kind: 'cash', amount: 120, color: 0x57b368 },
  { kind: 'cash', amount: 80, color: 0x57b368 },
  { kind: 'health', amount: 30, color: 0xf2f2f2 },
];

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = params.get('seed');
const SEED = seedParam ? parseInt(seedParam, 10) || 7 : 7;

// --- renderer / scene / camera ---------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(200, 90, 60);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- the game object ---------------------------------------------------------
// shots.js drives this object; the render loop below steps it.
const game = {
  seed: SEED,
  screen: 'title',
  time: 0,
  shotMode: false,
  hidePlayer: false,
  titleAngle: Math.PI / 2,
  cameraSnap: true,
  lookTarget: new THREE.Vector3(0, 1.5, 0),
  bustedTimer: 0,
  hitCooldown: 0,
  ramCooldowns: new Map(),
  saveTimer: 0,
  winShown: false,
  winTimer: 0,
  overKind: null,
  rivalCar: null,
  pickups: [],
  pickupGroup: null,
  playerGroup: null,
  player: null,
  world: null,
  traffic: null,
  police: null,
  missions: null,
  combat: null,
  hud: null,
  audio: null,
  input: null,
  fPressed: false,

  clockText() {
    const start = 17 * 60 + 30;
    const total = start + Math.floor(this.time / 60);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  },
};

// --- systems -----------------------------------------------------------------
function buildDynamicSystems(seed) {
  // The static city (buildings, palms, lights) is built once and never
  // changes, so a reset only rebuilds the moving parts from fresh RNGs.
  const traffic = new Traffic(scene, game.world, makeRng(seed + 101));
  const police = new Police(scene, game.world, makeRng(seed + 202));
  const missions = new Missions(scene, game.world, makeRng(seed + 303));
  return { traffic, police, missions };
}

function removeDynamicSystems() {
  if (game.traffic) scene.remove(game.traffic.group);
  if (game.police) scene.remove(game.police.group);
  if (game.missions) scene.remove(game.missions.group);
  if (game.pickupGroup) scene.remove(game.pickupGroup);
  if (game.playerGroup) scene.remove(game.playerGroup);
}

function buildPlayer() {
  const group = new THREE.Group();
  scene.add(group);
  game.playerGroup = group;
  const spawn = game.world.spawn;
  const foot = createFootState(spawn.x, spawn.z, spawn.heading);
  group.add(foot.mesh);
  const player = {
    mode: 'foot',
    foot,
    car: null,
    hasCar: false,
    carName: 'RUKAN PELO GT',
    money: PLAYER.startMoney,
    respect: 0,
    health: PLAYER.health,
    armour: 0,
    x: spawn.x,
    z: spawn.z,
  };
  game.player = player;
  return player;
}

function spawnPickups(seed) {
  const group = new THREE.Group();
  scene.add(group);
  game.pickupGroup = group;
  const rng = makeRng(seed + 404);
  const pickups = [];
  for (const def of PICKUP_DEFS) {
    // On a road, spread across the city, never inside a building.
    const x = rng.range(-260, 260);
    const z = rng.range(-260, 260);
    const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const mat = new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.2, z);
    mesh.castShadow = true;
    group.add(mesh);
    pickups.push({ mesh, x, z, kind: def.kind, amount: def.amount, taken: false, phase: rng.range(0, Math.PI * 2) });
  }
  game.pickups = pickups;
}

function resetDynamic(seed) {
  removeDynamicSystems();
  const sys = buildDynamicSystems(seed);
  game.traffic = sys.traffic;
  game.police = sys.police;
  game.missions = sys.missions;
  buildPlayer();
  spawnPickups(seed);
  game.time = 0;
  game.bustedTimer = 0;
  game.hitCooldown = 0;
  game.ramCooldowns.clear();
  game.saveTimer = 0;
  game.winShown = false;
  game.winTimer = 0;
  game.overKind = null;
  game.rivalCar = null;
  game.cameraSnap = true;
  game.hidePlayer = false;
}

// --- player mode ---------------------------------------------------------------
game.setMode = function setMode(mode, x, z, heading) {
  const p = game.player;
  if (mode === 'car') {
    if (!p.hasCar) {
      // The default car: a red Rukan Pelo GT, waiting at the spawn.
      const car = createCarState(x, z, heading, 0xd94f3d);
      game.playerGroup.add(car.mesh);
      p.car = car;
      p.hasCar = true;
      p.carName = 'RUKAN PELO GT';
    } else {
      p.car.x = x;
      p.car.z = z;
      p.car.heading = heading;
      p.car.speed = 0;
      p.car.mesh.position.set(x, 0, z);
      p.car.mesh.rotation.y = heading;
    }
    p.mode = 'car';
    p.foot.mesh.visible = false;
    p.car.mesh.visible = true;
    p.x = p.car.x;
    p.z = p.car.z;
  } else {
    p.mode = 'foot';
    p.foot.x = x;
    p.foot.z = z;
    p.foot.heading = heading;
    p.foot.mesh.position.set(x, 0, z);
    p.foot.mesh.rotation.y = heading;
    p.foot.mesh.visible = true;
    if (p.car) p.car.mesh.visible = true;
    p.x = x;
    p.z = z;
  }
  game.cameraSnap = true;
};

game.setTitleCamera = function setTitleCamera() {
  game.titleAngle = Math.PI / 2;
  game.cameraSnap = true;
};

game.startMission = function startMission(index) {
  if (!game.missions.start(index)) return false;
  if (index === 1 && !game.rivalCar) {
    // Pier Run: the rival coupe appears and drives for the pier.
    const target = { x: game.world.pierEnd.x - 40, z: game.world.pierEnd.z };
    const rival = game.traffic.spawnRivalCar(180, -60, target);
    rival.condition = 100;
    game.rivalCar = rival;
    game.missions.rival = { x: rival.x, z: rival.z };
  }
  return true;
};

// fresh=true skips the save, so a staged screenshot is the same on any machine.
game.reset = function reset(seed, fresh) {
  game.seed = seed;
  resetDynamic(seed);
  if (!fresh) {
    const save = loadSave();
    if (save) {
      game.player.money = save.money;
      game.player.respect = save.respect;
      game.missions.done = save.missionsDone.slice();
      game.player.carName = save.bestCar || game.player.carName;
      game.audio.setMuted(save.muted);
    }
  }
};

// --- stealing ------------------------------------------------------------------
function carNameFor(color) {
  return CAR_NAMES[color % CAR_NAMES.length];
}

function stealCar(trafficCar) {
  const p = game.player;
  const color = trafficCar.mesh.userData.body
    ? trafficCar.mesh.userData.body.material.color.getHex()
    : 0xd94f3d;
  game.traffic.removeCar(trafficCar);
  if (p.car) game.playerGroup.remove(p.car.mesh);
  const car = createCarState(trafficCar.x, trafficCar.z, trafficCar.heading, color);
  game.playerGroup.add(car.mesh);
  p.car = car;
  p.hasCar = true;
  p.carName = carNameFor(color);
  game.setMode('car', car.x, car.z, car.heading);
  game.police.addWanted(1, 'stolen car');
  game.missions.onSteal();
  game.hud.showMessage(`Stole a ${p.carName} — the cops noticed`, 4);
  game.audio.pickup();
}

// --- camera ----------------------------------------------------------------------
function updateCamera(dt) {
  if (game.screen === 'title') {
    const angle = game.titleAngle + game.time * 0.03;
    const r = 230;
    camera.position.set(Math.sin(angle) * r, 100, Math.cos(angle) * r);
    camera.lookAt(0, 12, 0);
    game.lookTarget.set(0, 12, 0);
    return;
  }
  const p = game.player;
  const heading = p.mode === 'car' ? p.car.heading : p.foot.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const dist = p.mode === 'car' ? 12 : 7.5;
  const height = p.mode === 'car' ? 5 : 3.8;
  const lookAhead = p.mode === 'car' ? 9 : 5;
  const desiredX = p.x - fx * dist;
  const desiredZ = p.z - fz * dist;
  const targetX = p.x + fx * lookAhead;
  const targetZ = p.z + fz * lookAhead;
  if (game.cameraSnap) {
    camera.position.set(desiredX, height, desiredZ);
    game.lookTarget.set(targetX, 1.6, targetZ);
    game.cameraSnap = false;
  } else {
    const k = 1 - Math.exp(-dt * 5);
    camera.position.x += (desiredX - camera.position.x) * k;
    camera.position.y += (height - camera.position.y) * k;
    camera.position.z += (desiredZ - camera.position.z) * k;
    const kt = 1 - Math.exp(-dt * 7);
    game.lookTarget.x += (targetX - game.lookTarget.x) * kt;
    game.lookTarget.y += (1.6 - game.lookTarget.y) * kt;
    game.lookTarget.z += (targetZ - game.lookTarget.z) * kt;
  }
  camera.lookAt(game.lookTarget);
}

// --- live input --------------------------------------------------------------------
// `actions` is taken once per frame by the render loop and handed to the first
// step only, so a one-shot press (E, click) fires exactly once.
function readLiveInput(actions) {
  const inp = game.input;
  const f = game.fPressed;
  game.fPressed = false;
  return {
    throttle: inp.throttle(),
    steer: inp.steer(),
    handbrake: inp.handbrake(),
    walkX: inp.walkX(),
    walkZ: inp.walkZ(),
    run: inp.run(),
    shoot: inp.firing() || (actions & ACT_SHOOT) !== 0 || f,
    actions,
    weaponKey: inp.weaponKey(),
  };
}

// --- the fixed step ------------------------------------------------------------------
game.step = function step(dt, scriptedInput, titleMode, liveActions) {
  game.time += dt;
  const inp = scriptedInput || readLiveInput(liveActions || 0);
  if (titleMode) {
    game.traffic.update(dt, game.player);
    updateCamera(dt);
    return;
  }

  const p = game.player;

  // --- player movement ---
  if (p.mode === 'car') {
    stepCar(p.car, { throttle: inp.throttle, steer: inp.steer, handbrake: inp.handbrake }, dt, game.world);
    if (p.car.condition <= 0) {
      // Wrecked: it crawls.
      p.car.speed = Math.max(-2, Math.min(2, p.car.speed));
    }
    p.x = p.car.x;
    p.z = p.car.z;
  } else {
    // Walk direction is camera-relative: W walks away from the camera.
    const look = game.lookTarget;
    let cx = look.x - camera.position.x;
    let cz = look.z - camera.position.z;
    const len = Math.hypot(cx, cz) || 1;
    cx /= len;
    cz /= len;
    const rx = -cz;
    const rz = cx;
    const mx = cx * inp.walkZ + rx * inp.walkX;
    const mz = cz * inp.walkZ + rz * inp.walkX;
    const mlen = Math.hypot(mx, mz);
    stepFoot(p.foot, mlen > 0 ? { x: mx / mlen, z: mz / mlen } : { x: 0, z: 0 }, inp.run, dt, game.world);
    p.x = p.foot.x;
    p.z = p.foot.z;
  }

  // --- enter / exit (E) ---
  if (inp.actions & ACT_ENTER) {
    if (p.mode === 'foot') {
      const near = game.traffic.nearestCar(p.x, p.z, 4.5);
      if (near) stealCar(near);
      else if (p.hasCar && Math.hypot(p.car.x - p.x, p.car.z - p.z) < 4.5) {
        game.setMode('car', p.car.x, p.car.z, p.car.heading);
        game.hud.showMessage('Back in your car', 2);
      }
    } else {
      const rx = -Math.cos(p.car.heading);
      const rz = Math.sin(p.car.heading);
      game.setMode('foot', p.car.x + rx * 3, p.car.z + rz * 3, p.car.heading);
    }
  }

  // --- weapon select (1–4) ---
  if (inp.weaponKey) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[inp.weaponKey];
    if (n !== undefined) game.combat.select(n);
  }

  // --- ramming traffic (in a car) ---
  if (p.mode === 'car') {
    for (const car of game.traffic.cars) {
      if (car.wrecked || car === p.car) continue;
      const d = Math.hypot(car.x - p.car.x, car.z - p.car.z);
      if (d > 4.4) continue;
      const cd = game.ramCooldowns.get(car) || 0;
      if (cd > 0) continue;
      game.ramCooldowns.set(car, 0.6);
      if (car.rival) {
        car.condition = (car.condition || 100) - 34;
        game.missions.onRam();
        if (car.condition <= 0) {
          car.wrecked = true;
          car.speed = 0;
          car.mesh.rotation.z = 0.25;
        }
        game.hud.showMessage(`Rammed the rival coupe (${3 - game.missions.ramHits} to go)`, 3);
      } else {
        // Shove the traffic car out of the way.
        const push = Math.max(0.001, d);
        car.x += ((car.x - p.car.x) / push) * 2.5;
        car.z += ((car.z - p.car.z) / push) * 2.5;
        car.speed = 2;
        p.car.condition = Math.max(0, p.car.condition - 1);
      }
      if (Math.abs(p.car.speed) > 8) game.audio.crash();
      p.car.speed *= 0.85;
    }
  }

  // --- traffic running the player over (on foot) ---
  if (game.hitCooldown > 0) game.hitCooldown -= dt;
  if (p.mode === 'foot' && game.hitCooldown <= 0) {
    for (const car of game.traffic.cars) {
      if (car.wrecked) continue;
      if (Math.hypot(car.x - p.x, car.z - p.z) < 1.6) {
        p.health = Math.max(0, p.health - 12);
        game.hitCooldown = 1;
        game.audio.crash();
        game.hud.showMessage('Hit by a car! Watch the road', 3);
        const push = Math.max(0.001, Math.hypot(car.x - p.x, car.z - p.z));
        p.foot.x += ((p.x - car.x) / push) * 2;
        p.foot.z += ((p.z - car.z) / push) * 2;
        p.x = p.foot.x;
        p.z = p.foot.z;
        break;
      }
    }
  }
  for (const [car, cd] of game.ramCooldowns) {
    if (cd <= dt) game.ramCooldowns.delete(car);
    else game.ramCooldowns.set(car, cd - dt);
  }

  // --- pickups ---
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    pk.mesh.position.y = 1.2 + Math.sin(game.time * 2 + pk.phase) * 0.3;
    pk.mesh.rotation.y += dt * 1.2;
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < 3) {
      pk.taken = true;
      pk.mesh.visible = false;
      if (pk.kind === 'cash') {
        p.money += pk.amount;
        game.hud.showMessage(`+$${pk.amount}`, 3);
      } else if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + pk.amount);
        game.hud.showMessage(`Health +${pk.amount}`, 3);
      } else {
        p.armour = Math.min(100, p.armour + pk.amount);
        game.hud.showMessage(`Armour +${pk.amount}`, 3);
      }
      game.audio.pickup();
    }
  }

  // --- shooting (on foot) ---
  if (inp.shoot && p.mode === 'foot') {
    const ev = game.combat.shoot(camera, p, game.traffic, game.police);
    if (ev) {
      if (ev.kind === 'hit-ped' || ev.kind === 'hit-police' || ev.kind === 'hit-car') {
        game.police.addWanted(1, 'shooting');
        game.audio.gunshot();
      } else if (ev.kind === 'miss' || ev.kind === 'hit') {
        game.audio.gunshot();
      } else if (ev.kind === 'punch-hit') {
        game.police.addWanted(1, 'assault');
        game.audio.blip(120, 0.15, 'square', 0.15);
      } else if (ev.kind === 'punch-miss') {
        game.audio.blip(120, 0.08, 'square', 0.08);
      } else if (ev.kind === 'dry') {
        game.audio.blip(1200, 0.05, 'square', 0.08);
      }
    }
  }

  // --- systems ---
  game.traffic.update(dt, p);
  if (game.rivalCar) {
    game.missions.rival = { x: game.rivalCar.x, z: game.rivalCar.z };
  }
  const policeEvent = game.police.update(dt, p, game.traffic);
  if (policeEvent && policeEvent.clearedAtSafehouse) {
    game.hud.showMessage('You lost the cops at the safehouse', 4);
    game.audio.pickup();
  }
  const reward = game.missions.update(dt, p, game.police);
  if (reward) {
    p.money += reward.money;
    p.respect = Math.min(100, p.respect + reward.respect);
    game.hud.showMessage(`Mission complete: +$${reward.money}  ·  Respect +${reward.respect}`, 5);
    game.audio.sting();
    saveGame({ money: p.money, respect: p.respect, missionsDone: game.missions.done, bestCar: p.carName, muted: game.audio.muted });
    if (game.missions.done.length >= 5 && !game.winShown) {
      game.winShown = true;
      game.winTimer = 6;
      document.getElementById('win-banner').style.opacity = '1';
    }
  }
  game.combat.update(dt);
  game.audio.update(dt, p, game.police);
  if (game.winTimer > 0) {
    game.winTimer -= dt;
    if (game.winTimer <= 0) document.getElementById('win-banner').style.opacity = '0';
  }

  // --- busted / wasted ---
  if (p.mode === 'foot') {
    let nearUnit = false;
    for (const unit of game.police.units) {
      if (Math.hypot(unit.x - p.x, unit.z - p.z) < 3.5) {
        nearUnit = true;
        break;
      }
    }
    if (nearUnit && game.police.wanted > 0) {
      game.bustedTimer += dt;
      if (game.bustedTimer > 1.2) return endRun('BUSTED');
    } else {
      game.bustedTimer = 0;
    }
  }
  if (p.health <= 0) return endRun('WASTED');

  // --- periodic save ---
  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    saveGame({ money: p.money, respect: p.respect, missionsDone: game.missions.done, bestCar: p.carName, muted: game.audio.muted });
  }

  updateCamera(dt);
};

function endRun(kind) {
  game.overKind = kind;
  game.screen = 'over';
  const over = document.getElementById('gameover-screen');
  document.getElementById('gameover-title').textContent = kind;
  document.getElementById('gameover-sub').textContent = kind === 'BUSTED'
    ? 'The Solmar Bay PD caught up with you. $200 bail, back to the safehouse.'
    : 'You got flattened. The crew patched you up at the safehouse — $200.';
  over.style.display = 'flex';
  return null;
}

function respawn() {
  const p = game.player;
  p.money = Math.max(0, p.money - 200);
  p.health = PLAYER.health;
  p.armour = 0;
  game.police.clearWanted();
  game.bustedTimer = 0;
  game.setMode('foot', game.world.safehouse.x + 12, game.world.safehouse.z + 8, 0);
  document.getElementById('gameover-screen').style.display = 'none';
  game.screen = 'play';
}

// --- screens / menus -------------------------------------------------------------
function showTitle() {
  document.getElementById('title-screen').style.display = 'flex';
  document.getElementById('pause-screen').style.display = 'none';
  document.getElementById('gameover-screen').style.display = 'none';
}

function hideTitle() {
  document.getElementById('title-screen').style.display = 'none';
}

function startGame(missionIndex) {
  game.audio.ensure();
  hideTitle();
  game.screen = 'play';
  const spawn = game.world.spawn;
  game.setMode('foot', spawn.x, spawn.z, spawn.heading);
  if (missionIndex >= 0) {
    game.startMission(missionIndex);
  } else {
    game.hud.showMessage('Free roam — press M for the mission list, E to steal a car', 6);
  }
}

function buildMissionList() {
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  game.missions.defs.forEach((def, i) => {
    const done = game.missions.done.includes(def.id);
    const row = document.createElement('button');
    row.className = 'mission-row';
    row.innerHTML = `<span class="mission-key">${i + 1}</span><span class="mission-name">${def.title}</span><span class="mission-reward">$${def.reward}</span><span class="mission-state">${done ? 'DONE ✓' : 'START →'}</span>`;
    row.addEventListener('click', () => startGame(i));
    list.appendChild(row);
  });
  const free = document.createElement('button');
  free.className = 'mission-row free';
  free.innerHTML = `<span class="mission-key">⏎</span><span class="mission-name">FREE ROAM</span><span class="mission-reward">—</span><span class="mission-state">START →</span>`;
  free.addEventListener('click', () => startGame(-1));
  list.appendChild(free);
}

// --- boot --------------------------------------------------------------------------
game.world = buildWorld(scene, makeRng(SEED));
game.combat = new Combat();
game.hud = new HUD();
game.audio = new AudioSys();
game.input = createInput(canvas);
game.reset(SEED);
buildMissionList();
showTitle();

// F key shoots / punches (keyboard alternative to the mouse).
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF' && !event.repeat) game.fPressed = true;
  // Mission select on the title screen.
  if (game.screen === 'title') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[event.code];
    if (n !== undefined) startGame(n);
  }
});

document.getElementById('resume-btn').addEventListener('click', () => {
  document.getElementById('pause-screen').style.display = 'none';
  game.screen = 'play';
});
document.getElementById('continue-btn').addEventListener('click', respawn);
document.getElementById('title-start-btn').addEventListener('click', () => startGame(-1));

// --- the render loop -----------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game.shotMode) {
    // One-shot presses, taken once per frame; screen changes here, the rest
    // goes to the first fixed step only.
    const actions = game.input.takeActions();
    if ((actions & ACT_PAUSE) !== 0) {
      if (game.screen === 'play') {
        game.screen = 'paused';
        document.getElementById('pause-screen').style.display = 'flex';
      } else if (game.screen === 'paused') {
        game.screen = 'play';
        document.getElementById('pause-screen').style.display = 'none';
      }
    }
    if ((actions & ACT_MUTE) !== 0) {
      game.audio.setMuted(!game.audio.muted);
      if (game.screen === 'play') game.hud.showMessage(game.audio.muted ? 'Sound off' : 'Sound on', 2);
    }
    if ((actions & ACT_CONFIRM) !== 0) {
      if (game.screen === 'title') startGame(-1);
      else if (game.screen === 'over') respawn();
    }
    if (game.screen === 'play' || game.screen === 'title') {
      acc += dt;
      let n = 0;
      let first = true;
      while (acc >= STEP && n < 5 && (game.screen === 'play' || game.screen === 'title')) {
        game.step(STEP, null, game.screen === 'title', first ? actions : 0);
        first = false;
        acc -= STEP;
        n += 1;
      }
      if (n === 5) acc = 0;
    }
  }
  game.hud.update(game, dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// --- screenshot staging (?shot=chase|street|mission|title) ---------------------------
if (shotName) {
  const result = stageShot(shotName, game);
  game.screen = result.screen;
  game.shotMode = true;
  buildMissionList();
  if (result.screen === 'play') hideTitle();
  else showTitle();
  game.hud.update(game, 0);
  renderer.render(scene, camera);
}
