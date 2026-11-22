// The HUD: every DOM panel the player reads, and the minimap. The layout mirrors
// the top entries — mission panel top-left, money and wanted stars top-right,
// weapon slots right, minimap bottom-left, dialogue bottom-centre, speed
// bottom-right — so a screenshot reads as a complete open-world game at a glance.

import { WORLD, districtAt } from './config.js';

const MAP_SIZE = 200;

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.weaponSlots = [];
    const weaponsEl = this.el('weapons');
    for (let i = 0; i < 4; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'weapon-slot';
      weaponsEl.appendChild(slot);
      this.weaponSlots.push(slot);
    }
    this.messageTimer = 0;
    this.lastClock = '';
  }

  showMessage(text, seconds = 4) {
    const el = this.el('message');
    el.textContent = text;
    el.style.opacity = '1';
    this.messageTimer = seconds;
  }

  showDialogue(speaker, role, color, text) {
    const box = this.el('dialogue');
    const sp = this.el('dialogue-speaker');
    sp.textContent = `${speaker} · ${role}`;
    sp.style.color = color;
    this.el('dialogue-text').textContent = text;
    box.style.opacity = '1';
  }

  hideDialogue() {
    this.el('dialogue').style.opacity = '0';
  }

  update(game, dt) {
    // The HUD only shows during play; the title / pause / over screens have
    // their own overlays.
    this.el('hud').style.display = game.screen === 'play' ? 'block' : 'none';
    if (game.screen !== 'play') return;
    const p = game.player;
    // Money, wanted, clock.
    this.el('money').textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < game.police.wanted ? '★' : '☆';
    const starsEl = this.el('stars');
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', game.police.wanted >= 3);
    const clock = game.clockText();
    if (clock !== this.lastClock) {
      this.el('clock').textContent = clock;
      this.lastClock = clock;
    }
    // Mission panel.
    const panel = this.el('mission-panel');
    if (game.missions.active) {
      const m = game.missions.current;
      const stage = game.missions.stage;
      panel.style.display = 'block';
      this.el('mission-title').textContent = `${m.title}`;
      this.el('mission-stage').textContent = `STAGE ${game.missions.stageIndex + 1}/${m.stages.length}`;
      this.el('mission-objective').textContent = stage.objective;
      const next = m.stages[game.missions.stageIndex + 1];
      this.el('mission-next').textContent = next ? `NEXT  ${next.objective}` : 'NEXT  Collect your reward';
    } else {
      panel.style.display = 'none';
    }
    // Police response list.
    const list = this.el('police-list');
    if (game.police.wanted > 0 && game.police.units.length > 0) {
      list.style.display = 'block';
      this.el('police-count').textContent = `${game.police.units.length} UNITS · CODE ${game.police.wanted}`;
      const rows = this.el('police-rows');
      rows.innerHTML = '';
      for (const unit of game.police.units.slice(0, 5)) {
        const d = Math.round(Math.hypot(unit.x - p.x, unit.z - p.z));
        const row = document.createElement('div');
        row.className = 'police-row';
        row.innerHTML = `<span class="dot"></span><span>${unit.name}</span><span class="role">${unit.role}</span><span class="dist">${d} m</span>`;
        rows.appendChild(row);
      }
      if (game.police.units.length > 5) {
        const more = document.createElement('div');
        more.className = 'police-more';
        more.textContent = `+${game.police.units.length - 5} more units`;
        rows.appendChild(more);
      }
    } else {
      list.style.display = 'none';
    }
    // Health / armour / district.
    this.el('health-bar').style.width = `${Math.max(0, p.health)}%`;
    this.el('armour-bar').style.width = `${Math.max(0, p.armour)}%`;
    this.el('health-num').textContent = `${Math.round(p.health)}`;
    this.el('armour-num').textContent = `${Math.round(p.armour)}`;
    this.el('district').textContent = districtAt(p.x, p.z);
    // Weapons.
    game.combat.weapons.forEach((w, i) => {
      const slot = this.weaponSlots[i];
      const ammo = w.ammo === Infinity ? '∞' : String(w.ammo);
      slot.textContent = `${i + 1}  ${w.name}  ${ammo}`;
      slot.classList.toggle('active', i === game.combat.current);
    });
    // Speed / car / radio.
    if (p.mode === 'car') {
      this.el('speed').textContent = `${Math.round(Math.abs(p.car.speed) * 3.6)}`;
      this.el('car-name').textContent = p.carName;
      this.el('car-condition-fill').style.width = `${Math.max(0, p.car.condition)}%`;
      this.el('car-condition-label').textContent = `${Math.round(p.car.condition)}% ${p.car.condition > 60 ? 'OK' : p.car.condition > 25 ? 'DENTED' : 'WRECKED'}`;
      this.el('vehicle-box').style.display = 'block';
    } else {
      this.el('vehicle-box').style.display = 'none';
      this.el('speed').textContent = '0';
    }
    // Dialogue.
    if (game.missions.dialogue) {
      const d = game.missions.dialogue;
      this.showDialogue(d.speaker, d.role, d.color, d.text);
    } else {
      this.hideDialogue();
    }
    // Toast message fade.
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el('message').style.opacity = '0';
    }
    // Respect / rank line.
    this.el('respect').textContent = `RESPECT · ${p.respect} / 100`;
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const s = MAP_SIZE;
    const span = WORLD.half * 2 + 60;
    const toMap = (x, z) => [((x + span / 2) / span) * s, ((z + span / 2) / span) * s];
    ctx.clearRect(0, 0, s, s);
    // Ground.
    ctx.fillStyle = '#22401f';
    ctx.fillRect(0, 0, s, s);
    // Ocean + sand (east edge).
    const [ox] = toMap(WORLD.oceanX, 0);
    ctx.fillStyle = '#1d5f7d';
    ctx.fillRect(ox, 0, s - ox, s);
    const [bx] = toMap(WORLD.beachX, 0);
    ctx.fillStyle = '#c9ad72';
    ctx.fillRect(bx, 0, ox - bx, s);
    // Roads.
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 4;
    for (const rx of game.world.roads.xs) {
      const [mx] = toMap(rx, 0);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, s);
      ctx.stroke();
    }
    for (const rz of game.world.roads.zs) {
      const [, mz] = toMap(0, rz);
      ctx.beginPath();
      ctx.moveTo(0, mz);
      ctx.lineTo(s, mz);
      ctx.stroke();
    }
    // Safehouse.
    const [shx, shz] = toMap(game.world.safehouse.x, game.world.safehouse.z);
    ctx.fillStyle = '#57b368';
    ctx.fillRect(shx - 4, shz - 4, 8, 8);
    // Mission marker.
    if (game.missions.marker) {
      const [mx, mz] = toMap(game.missions.marker.x, game.missions.marker.z);
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 6);
      ctx.lineTo(mx + 6, mz);
      ctx.lineTo(mx, mz + 6);
      ctx.lineTo(mx - 6, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#e5534b';
    for (const unit of game.police.units) {
      const [ux, uz] = toMap(unit.x, unit.z);
      ctx.beginPath();
      ctx.arc(ux, uz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(game.player.x, game.player.z);
    const heading = game.player.mode === 'car' ? game.player.car.heading : game.player.foot.heading;
    ctx.save();
    ctx.translate(px, pz);
    // Map y is world +z (south); the arrow starts pointing north, so rotate by
    // PI - heading to face the direction of travel.
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', s / 2, 12);
  }
}
