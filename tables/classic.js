// Rules for "Classic", rewritten in JS from Vector Pinball's Field1Delegate.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

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

export function allRolloversInGroupActivated(field, group) {
  group.setAllRolloversActivated(false);
  field.incrementAndDisplayScoreMultiplier(1500);
  if (group.getElementId() === 'RampRollovers') {
    const extraBall = field.getFieldElementById('ExtraBallRollovers');
    if (extraBall.allRolloversActive()) {
      extraBall.setAllRolloversActivated(false);
      startMultiball(field);
    }
  }
}

export function allDropTargetsInGroupHit(field, group) {
  const id = group.getElementId();
  if (id === 'DropTargetLeftSave') {
    restoreBallSaver(field, 'left');
    field.showGameMessage('Left Save Enabled', 1500);
  } else if (id === 'DropTargetRightSave') {
    restoreBallSaver(field, 'right');
    field.showGameMessage('Right Save Enabled', 1500);
  }
  const extraBall = field.getFieldElementById('ExtraBallRollovers');
  if (extraBall && !extraBall.allRolloversActive()) {
    extraBall.activateFirstUnactivatedRollover();
    if (extraBall.allRolloversActive()) field.showGameMessage('Shoot Ramp for Multiball', 1500);
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
