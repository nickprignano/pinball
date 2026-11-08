// Rules for "Ringmaster", rewritten in JS from Vector Pinball's Field3Delegate.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.
//
// Bumper hits build "energy", and the upper and lower target banks each fill an indicator.
// When all three are full, the multiball rollover lights; a ramp shot then starts multiball.
// Ramp shots also start a timed bumper bonus that makes bumpers worth more.

const BASE_BUMPER_SCORE = 500;
const MAX_BUMPER_ENERGY = 200;
const MAX_UPPER_TARGETS = 2;
const MAX_LOWER_TARGETS = 5;
const BASE_BONUS_MS = 15_000;
const BASE_BONUS_MULTIPLIER = 5;
const BONUS_MS_INCREMENT = 1000;

// Blue through green and yellow to red, the same 53 steps as upstream.
const TEMPERATURE_COLORS = [
  ...Array.from({ length: 16 }, (_, i) => [0, i * 16, 255]),
  ...Array.from({ length: 8 }, (_, i) => [0, 255, 240 - i * 32]),
  ...Array.from({ length: 8 }, (_, i) => [16 + i * 32, 255, 0]),
  [255, 240, 0],
  ...Array.from({ length: 20 }, (_, i) => [255, 228 - i * 12, 0]),
].map(([r, g, b]) => [r, g, b, 255]);

function colorForTemperatureRatio(ratio) {
  const n = TEMPERATURE_COLORS.length;
  if (ratio <= 0) return TEMPERATURE_COLORS[0];
  if (ratio >= 1) return TEMPERATURE_COLORS[n - 1];
  return TEMPERATURE_COLORS[Math.round((n - 1) * ratio)];
}

// Each game gets a new field, so rule state is kept per field.
const states = new WeakMap();
const stateFor = (field) => states.get(field);

function resetBumperBonuses(field, s) {
  s.bonusMs = BASE_BONUS_MS;
  s.bonusMultiplier = BASE_BONUS_MULTIPLIER;
  s.bumperEnergy = 0;
  s.upperCompleted = 0;
  s.lowerCompleted = 0;
  for (const id of ['UpperTargetIndicator', 'LowerTargetIndicator', 'BumperIndicator']) {
    field.getFieldElementById(id).setNewColor(null);
  }
  setMultiballRolloverActive(field, false);
}

function restoreBallSaver(field, side) {
  field.getFieldElementById(`BallSaver-${side}`).setRetracted(false);
}

function setLaunchBarrierEnabled(field, enabled) {
  field.getFieldElementById('LaunchBarrier').setRetracted(!enabled);
}

function setColorForBumpers(s, color) {
  for (const bumper of s.bumpers) {
    bumper.setNewColor(color);
    bumper.setNewOuterColor(color && [color[0], color[1], color[2], 128]);
  }
}

function startBumperBonus(s) {
  s.bonusActive = true;
  s.bonusElapsedMs = 0;
}

function endBumperBonus(s) {
  s.bonusActive = false;
  setColorForBumpers(s, null);
}

function checkForEnableMultiball(field, s) {
  if (s.bumperEnergy >= MAX_BUMPER_ENERGY && s.upperCompleted >= MAX_UPPER_TARGETS && s.lowerCompleted >= MAX_LOWER_TARGETS) {
    setMultiballRolloverActive(field, true);
  }
}

function isMultiballRolloverActive(field, s) {
  return s.multiball === 'inactive' && field.getFieldElementById('BumperIndicator').isRolloverActiveAtIndex(0);
}

function setMultiballRolloverActive(field, ready) {
  field.getFieldElementById('BumperIndicator').setAllRolloversActivated(ready);
}

function startMultiball(field, s) {
  field.showGameMessage('Multiball!', 2000);
  s.multiball = 'pending';
  restoreBallSaver(field, 'left');
  restoreBallSaver(field, 'right');
  const launch = () => {
    if (field.getBalls().length < 3) field.launchBall();
    if (s.multiball !== 'active') {
      s.multiball = 'active';
      s.flashValues = [0, 0, 0];
      s.flashIncrements = [0, 0, 0].map(() => 0.2 + 0.3 * field.random());
    }
  };
  field.scheduleAction(1000, launch);
  field.scheduleAction(3500, launch);
  s.bonusMultiplier += 1;
  s.bonusMs += BONUS_MS_INCREMENT;
}

function tickMultiballFlashers(field, s, ms) {
  const ids = ['UpperTargetIndicator', 'LowerTargetIndicator', 'BumperIndicator'];
  ids.forEach((id, i) => {
    let v = s.flashValues[i] + (ms / 1000) * s.flashIncrements[i];
    if (v > 2) v -= 2;
    s.flashValues[i] = v;
    field.getFieldElementById(id).setNewColor(colorForTemperatureRatio(Math.abs(v - 1)));
  });
}

export function gameStarted(field) {
  setLaunchBarrierEnabled(field, false);
  const s = {
    bumpers: field.elements.filter((e) => e.constructor.name === 'BumperElement'),
    bonusActive: false,
    bonusElapsedMs: 0,
    multiball: 'inactive',
  };
  states.set(field, s);
  resetBumperBonuses(field, s);
}

export function ballLost(field) {
  const s = stateFor(field);
  setLaunchBarrierEnabled(field, false);
  endBumperBonus(s);
  if (s.multiball === 'active') {
    resetBumperBonuses(field, s);
    s.multiball = 'inactive';
  }
}

export function allRolloversInGroupActivated(field, group) {
  const s = stateFor(field);
  const id = group.getElementId();
  if (id === 'LeftRampRollover' || id === 'RightRampRollover') {
    startBumperBonus(s);
    if (s.multiball === 'inactive' && isMultiballRolloverActive(field, s)) startMultiball(field, s);
    if (s.multiball === 'active') field.addScore(group.getScore());
  } else {
    group.setAllRolloversActivated(false);
    field.incrementAndDisplayScoreMultiplier(1500);
  }
}

export function allDropTargetsInGroupHit(field, group) {
  const s = stateFor(field);
  const id = group.getElementId();
  if (id === 'DropTargetLeftSave') {
    restoreBallSaver(field, 'left');
    field.showGameMessage('Left Save Enabled', 1500);
  } else if (id === 'DropTargetRightSave') {
    restoreBallSaver(field, 'right');
    field.showGameMessage('Right Save Enabled', 1500);
  } else if (id === 'LowerMultiballTargets' && s.lowerCompleted < MAX_LOWER_TARGETS) {
    s.bonusMs += BONUS_MS_INCREMENT;
    s.lowerCompleted += 1;
    field.getFieldElementById('LowerTargetIndicator').setNewColor(colorForTemperatureRatio(s.lowerCompleted / MAX_LOWER_TARGETS));
    checkForEnableMultiball(field, s);
  } else if (id === 'UpperMultiballTargets' && s.upperCompleted < MAX_UPPER_TARGETS) {
    s.bonusMultiplier += 1;
    s.upperCompleted += 1;
    field.getFieldElementById('UpperTargetIndicator').setNewColor(colorForTemperatureRatio(s.upperCompleted / MAX_UPPER_TARGETS));
    checkForEnableMultiball(field, s);
  }
}

export function tick(field, ms) {
  const s = stateFor(field);
  if (!s) return;
  if (s.bonusActive) {
    s.bonusElapsedMs += ms;
    if (s.bonusElapsedMs >= s.bonusMs) endBumperBonus(s);
    else setColorForBumpers(s, colorForTemperatureRatio(1 - s.bonusElapsedMs / s.bonusMs));
  }
  if (s.multiball === 'active') {
    if (field.getBalls().length <= 1) {
      resetBumperBonuses(field, s);
      s.multiball = 'inactive';
    } else {
      tickMultiballFlashers(field, s, ms);
    }
  }
}

export function processCollision(field, element, body, ball) {
  if (element.constructor.name !== 'BumperElement') return;
  const s = stateFor(field);
  let extraEnergy = 0;
  let score = BASE_BUMPER_SCORE;
  if (s.bonusActive) {
    extraEnergy = (1 - s.bonusElapsedMs / s.bonusMs) * s.bonusMultiplier;
    score += Math.round((BASE_BUMPER_SCORE * extraEnergy) / 10) * 10;
  }
  field.addScoreWithAnimation(score, ball.getPosition());
  field.audio.play('score');
  s.bumperEnergy = Math.min(s.bumperEnergy + 1 + extraEnergy, MAX_BUMPER_ENERGY);
  field.getFieldElementById('BumperIndicator').setNewColor(colorForTemperatureRatio(s.bumperEnergy / MAX_BUMPER_ENERGY));
  checkForEnableMultiball(field, s);
}

export function ballInSensorRange(field, sensor) {
  if (sensor.getElementId() === 'LaunchBarrierSensor') setLaunchBarrierEnabled(field, true);
  else if (sensor.getElementId() === 'LaunchBarrierRetract') setLaunchBarrierEnabled(field, false);
}
