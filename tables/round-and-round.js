// Rules for "Round and Round", rewritten in JS from Vector Pinball's Field2Delegate.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const TAU = 2 * Math.PI;

// Bumper groups that circle a center point. Kept per field, since each game gets a new one.
const groupsByField = new WeakMap();

function createRotatingGroup(field, ids, cx, cy, speed) {
  const first = field.getFieldElementById(ids[0]).getCenter();
  return {
    ids,
    cx,
    cy,
    speed,
    radius: Math.hypot(first.x - cx, first.y - cy),
    angle: Math.atan2(first.y - cy, first.x - cx),
    increment: TAU / ids.length,
  };
}

function setupRotatingGroups(field) {
  const center = field.getFieldElementById('CenterBumper1').getCenter();
  return [
    createRotatingGroup(
      field,
      ['RotatingBumper1A', 'RotatingBumper1B', 'RotatingBumper1C', 'RotatingBumper1D'],
      center.x,
      center.y,
      field.getValueWithKey('RotatingBumper1Speed'),
    ),
    createRotatingGroup(
      field,
      ['RotatingBumper2A', 'RotatingBumper2B'],
      field.getValueWithKey('RotatingBumper2CenterX'),
      field.getValueWithKey('RotatingBumper2CenterY'),
      field.getValueWithKey('RotatingBumper2Speed'),
    ),
  ];
}

export function tick(field, ms) {
  if (!groupsByField.has(field)) groupsByField.set(field, setupRotatingGroups(field));
  for (const g of groupsByField.get(field)) {
    g.angle = (((g.angle + (ms / 1000) * g.speed) % TAU) + TAU) % TAU;
    g.ids.forEach((id, i) => {
      const angle = g.angle + g.increment * i;
      field.getFieldElementById(id).setCenter(g.cx + g.radius * Math.cos(angle), g.cy + g.radius * Math.sin(angle));
    });
  }
}

function restoreBallSaver(field, side) {
  field.getFieldElementById(`BallSaver-${side}`).setRetracted(false);
}

function setLaunchBarrierEnabled(field, enabled) {
  field.getFieldElementById('LaunchBarrier').setRetracted(!enabled);
}

function startMultiball(field) {
  field.showGameMessage('Multiball!', 2000);
  restoreBallSaver(field, 'left');
  restoreBallSaver(field, 'right');
  const launch = () => {
    if (field.getBalls().length < 3) field.launchBall();
  };
  field.scheduleAction(1000, launch);
  field.scheduleAction(3500, launch);
}

export function isFieldActive() {
  return true;
}

export function allRolloversInGroupActivated(field, group) {
  group.setAllRolloversActivated(false);
  field.incrementAndDisplayScoreMultiplier(1500);
}

// Hitting the red center bumper starts multiball once all the multiball lights are lit.
export function processCollision(field, element) {
  if (element.getElementId() === 'CenterBumper1') {
    const lights = field.getFieldElementById('ExtraBallRollovers');
    if (lights.allRolloversActive()) {
      startMultiball(field);
      lights.setAllRolloversActivated(false);
    }
  }
}

// Each drop target bank lights the next multiball light in its own column of three.
export function allDropTargetsInGroupHit(field, group) {
  const id = group.getElementId();
  let index = -1;
  if (id === 'DropTargetLeft') {
    restoreBallSaver(field, 'left');
    field.showGameMessage('Left Save Enabled', 1500);
    index = 0;
  } else if (id === 'DropTargetRight') {
    restoreBallSaver(field, 'right');
    field.showGameMessage('Right Save Enabled', 1500);
    index = 2;
  } else if (id === 'DropTargetTopLeft') {
    index = 1;
  }
  if (index < 0) return;
  const lights = field.getFieldElementById('ExtraBallRollovers');
  for (; index < lights.numberOfRollovers(); index += 3) {
    if (!lights.isRolloverActiveAtIndex(index)) {
      lights.setRolloverActiveAtIndex(index, true);
      if (lights.allRolloversActive()) field.showGameMessage('Shoot Red Bumper', 1500);
      break;
    }
  }
}

export function ballInSensorRange(field, sensor) {
  if (sensor.getElementId() === 'LaunchBarrierSensor') setLaunchBarrierEnabled(field, true);
  else if (sensor.getElementId() === 'LaunchBarrierRetract') setLaunchBarrierEnabled(field, false);
}

export function gameStarted(field) {
  setLaunchBarrierEnabled(field, false);
}

export function ballLost(field) {
  setLaunchBarrierEnabled(field, false);
}
