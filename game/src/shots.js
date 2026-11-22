// The screenshot scenes behind ?shot=chase|street|mission|title. Each one plays
// the real simulation forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what real gameplay looks like
// and the same seed always gives the same frame.

const STEP = 1 / 60;

function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Drive toward a heading while staying near a target x (the boulevard). */
function driveAutopilot(game, targetHeading, targetX) {
  const car = game.player.car;
  const steer = Math.max(-1, Math.min(1, angleDiff(targetHeading, car.heading) * 2.2 + (targetX - car.x) * 0.04));
  return { throttle: 1, steer, handbrake: false, walkX: 0, walkZ: 0, run: false, shoot: false };
}

/**
 * Set the game to the named scene and return the screen to show.
 * `game` is the object main.js built; game.step(dt, scriptedInput) advances it.
 */
export function stageShot(name, game) {
  const seed = game.seed;
  // Fresh reset: no save, so the frame is identical on any machine.
  game.reset(seed, true);
  const p = game.player;

  if (name === 'title') {
    // Title over the city: fixed cinematic camera, traffic rolling, no player.
    game.setTitleCamera();
    for (let i = 0; i < 5 / STEP; i += 1) {
      game.step(STEP, { throttle: 0, steer: 0, handbrake: false, walkX: 0, walkZ: 0, run: false, shoot: false }, true);
    }
    return { screen: 'title' };
  }

  if (name === 'street') {
    // On foot on the boulevard at sunset: walk north, traffic and pedestrians
    // around, mission 1 briefing on screen.
    game.setMode('foot', game.world.spawn.x, game.world.spawn.z, Math.PI);
    game.startMission(0);
    for (let i = 0; i < 3 / STEP; i += 1) {
      game.step(STEP, { throttle: 0, steer: 0, handbrake: false, walkX: 0, walkZ: 1, run: false, shoot: false }, false);
    }
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission 3 (The Package): driving to the marina pickup, dialogue showing,
    // one star of heat.
    game.setMode('car', 200, 120, Math.PI * 0.75);
    game.startMission(2);
    game.police.addWanted(1, 'package');
    for (let i = 0; i < 5 / STEP; i += 1) {
      game.step(STEP, driveAutopilot(game, Math.PI * 0.8, 210), false);
    }
    return { screen: 'play' };
  }

  // Default: chase. Mission 2 (Pier Run), 3 stars, helicopter overhead,
  // police on the tail, driving north up the beachfront boulevard.
  game.setMode('car', 262, 120, Math.PI);
  game.startMission(1);
  game.missions.advance();
  game.police.addWanted(3, 'chase');
  for (let i = 0; i < 4 / STEP; i += 1) {
    game.step(STEP, driveAutopilot(game, Math.PI, 262), false);
  }
  return { screen: 'play' };
}
