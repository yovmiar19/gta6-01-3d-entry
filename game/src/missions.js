// The story: Raka, a wheelman building respect in Solmar Bay, and the crew
// who sends him work — Mira the driver, Lio the mechanic, Kiki the lookout.
// Five missions with stages, objectives, dialogue and rewards. Each mission is
// data, so the panel, the marker and the dialogue all read from the same place.

import { WORLD } from './config.js';

const CREW = {
  mira: { name: 'MIRA KESANG', role: 'Driver', color: '#e85d8a' },
  lio: { name: 'LIO', role: 'Mechanic', color: '#4f9fd8' },
  kiki: { name: 'KIKI', role: 'Lookout', color: '#9a6bc0' },
};

const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    giver: 'mira',
    brief: 'No car, no crew, Raka. Steal something with four wheels and bring it home. The cops will notice — lose them at the safehouse.',
    stages: [
      { objective: 'Steal a car (walk up to one and press E)', type: 'steal' },
      { objective: 'Reach the safehouse to lose the tail', type: 'reach', target: 'safehouse' },
    ],
    reward: 300, respect: 10,
  },
  {
    id: 'pier-run',
    title: 'PIER RUN',
    giver: 'lio',
    brief: 'A rival is running a red coupe to the pier to ship it out. Wreck it before it gets there. Ram it — three good hits should do it.',
    stages: [
      { objective: 'Find the rival coupe (follow the marker)', type: 'reach', target: 'rival' },
      { objective: 'Wreck the rival coupe — ram it 3 times', type: 'ram', hits: 3 },
    ],
    reward: 800, respect: 20,
  },
  {
    id: 'the-package',
    title: 'THE PACKAGE',
    giver: 'kiki',
    brief: 'A package is waiting at the marina. Pick it up, then run it to the pier. The harbour cops are watching — expect company.',
    stages: [
      { objective: 'Pick up the package at the marina', type: 'reach', target: 'marina' },
      { objective: 'Deliver the package to the pier', type: 'reach', target: 'pier' },
    ],
    reward: 1200, respect: 25,
  },
  {
    id: 'manhunt',
    title: 'MANHUNT',
    giver: 'mira',
    brief: 'Three stars, Raka, and every unit in the city is looking for you. Survive a full minute, then vanish at the safehouse.',
    stages: [
      { objective: 'Survive the manhunt — 60 seconds at 3 stars', type: 'survive', seconds: 60 },
      { objective: 'Reach the safehouse to disappear', type: 'reach', target: 'safehouse' },
    ],
    reward: 2000, respect: 40,
  },
  {
    id: 'golden-hour',
    title: 'GOLDEN HOUR',
    giver: 'lio',
    brief: 'Last job of the day: drive a client across the city to the yacht at the marina. Smooth, fast, no heat above two stars. Do this and you run Solmar Bay.',
    stages: [
      { objective: 'Pick up the client downtown', type: 'reach', target: 'downtown' },
      { objective: 'Deliver the client to the marina yacht', type: 'reach', target: 'marina' },
    ],
    reward: 3500, respect: 60,
  },
];

const RIVAL = { x: 180, z: -60 };

export class Missions {
  constructor(scene, world, rng) {
    this.world = world;
    this.rng = rng;
    this.defs = MISSION_DEFS;
    this.done = [];
    this.current = null;
    this.stageIndex = 0;
    this.stageTimer = 0;
    this.ramHits = 0;
    this.dialogue = null;
    this.dialogueTimer = 0;
    this.marker = null;
    // The 3D beacon: a pulsing ring + a light pillar at the objective.
    this.group = new THREE.Group();
    scene.add(this.group);
    const ringGeo = new THREE.RingGeometry(2.2, 3, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.visible = false;
    this.group.add(this.markerRing);
    const pillarGeo = new THREE.CylinderGeometry(0.7, 0.7, 60, 10, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    this.markerPillar = new THREE.Mesh(pillarGeo, pillarMat);
    this.markerPillar.visible = false;
    this.group.add(this.markerPillar);
    // The rival coupe for mission 2 (built lazily when that mission starts).
    this.rival = null;
    this.rivalHits = 0;
  }

  get active() {
    return this.current !== null;
  }

  get stage() {
    if (!this.current) return null;
    return this.current.stages[this.stageIndex] || null;
  }

  /** Where the current stage points: a world position, or null. */
  stageTarget() {
    const stage = this.stage;
    if (!stage) return null;
    switch (stage.target) {
      case 'safehouse': return { ...this.world.safehouse };
      case 'marina': return { ...this.world.marina };
      case 'pier': return { ...this.world.pierEnd, x: this.world.pierEnd.x - 40 };
      case 'downtown': return { x: 0, z: 0 };
      case 'rival': return this.rival ? { x: this.rival.x, z: this.rival.z } : { ...RIVAL };
      default: return null;
    }
  }

  say(giverKey, text, seconds = 7) {
    const giver = CREW[giverKey];
    this.dialogue = { speaker: giver.name, role: giver.role, color: giver.color, text };
    this.dialogueTimer = seconds;
  }

  start(index) {
    const def = this.defs[index];
    if (!def || this.done.includes(def.id) || this.current) return false;
    this.current = def;
    this.stageIndex = 0;
    this.stageTimer = 0;
    this.ramHits = 0;
    this.say(def.giver, def.brief, 9);
    if (def.id === 'pier-run' && !this.rival) this.spawnRival();
    return true;
  }

  spawnRival() {
    // Built by main.js through the traffic system; here we only track the target.
    this.rival = { ...RIVAL, condition: 100 };
    this.rivalHits = 0;
  }

  /** The player stole a car (mission 1, stage 1). */
  onSteal() {
    if (this.current && this.current.id === 'first-wheels' && this.stageIndex === 0) {
      this.advance();
    }
  }

  /** The player rammed something hard (mission 2, stage 2). */
  onRam() {
    if (this.current && this.current.id === 'pier-run' && this.stageIndex === 1) {
      this.ramHits += 1;
      if (this.ramHits >= 3) this.advance();
      else this.say('lio', `Again! ${3 - this.ramHits} more hit${3 - this.ramHits === 1 ? '' : 's'} and that coupe is done.`, 4);
    }
  }

  advance() {
    this.stageIndex += 1;
    this.stageTimer = 0;
    if (this.stageIndex >= this.current.stages.length) return this.complete();
    this.say(this.current.giver, this.current.stages[this.stageIndex].objective, 6);
    return null;
  }

  complete() {
    const def = this.current;
    this.done.push(def.id);
    this.current = null;
    this.stageIndex = 0;
    this.marker = null;
    this.say(def.giver, `Done. $${def.reward} and the crew knows your name now.`, 8);
    return { money: def.reward, respect: def.respect, id: def.id };
  }

  update(dt, player, police) {
    this.time = (this.time || 0) + dt;
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogue = null;
    }
    if (!this.current) {
      this.markerRing.visible = false;
      this.markerPillar.visible = false;
      return null;
    }
    const stage = this.stage;
    const target = this.stageTarget();
    // Beacon follows the stage target.
    if (target) {
      this.markerRing.visible = true;
      this.markerPillar.visible = true;
      this.markerRing.position.set(target.x, 0.3, target.z);
      this.markerPillar.position.set(target.x, 30, target.z);
      const pulse = 1 + Math.sin(this.time * 3.2) * 0.12;
      this.markerRing.scale.set(pulse, pulse, 1);
      this.marker = target;
    } else {
      this.markerRing.visible = false;
      this.markerPillar.visible = false;
      this.marker = null;
    }
    const px = player.x;
    const pz = player.z;
    const distTo = (t) => Math.hypot(px - t.x, pz - t.z);
    if (stage.type === 'reach' && target && distTo(target) < 10) {
      return this.advance();
    }
    if (stage.type === 'survive') {
      this.stageTimer += dt;
      if (police.wanted < 3) {
        // Heat dropped: the manhunt resets its clock.
        this.stageTimer = Math.max(0, this.stageTimer - dt * 2);
      }
      if (this.stageTimer >= stage.seconds) return this.advance();
    }
    return null;
  }
}
