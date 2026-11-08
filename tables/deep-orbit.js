// Rules for "Deep Orbit", an original table for this game.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.
//
// You fly missions. One mission is active at a time; finishing it raises your rank, lights the
// next rank light and pays a bonus that grows with rank. Reaching Navigator starts multiball, and
// finishing all five missions earns an extra ball before the missions start over, harder.
// The fuel and shield targets restore the left and right ball savers, as on Classic.

const RANKS = ['Trainee', 'Pilot', 'Navigator', 'Captain', 'Commander', 'Star Commander'];
const MULTIBALL_RANK = 2;

const MISSIONS = [
  { name: 'Hit the planets', count: (lap) => 8 + lap * 4, event: 'planet' },
  { name: 'Light the orbit', count: () => 1, event: 'OrbitLights' },
  { name: 'Clear the asteroids', count: (lap) => 1 + lap, event: 'AsteroidTargets' },
  { name: 'Light the launch lanes', count: () => 1, event: 'LaunchLanes' },
  { name: 'Hit the moon', count: (lap) => 3 + lap, event: 'Moon' },
];

// Each game gets a new field, so rule state is kept per field.
const states = new WeakMap();

function restoreBallSaver(field, side) {
  field.getFieldElementById(`BallSaver-${side}`).setRetracted(false);
}

function setLaunchBarrierEnabled(field, enabled) {
  field.getFieldElementById('LaunchBarrier').setRetracted(!enabled);
}

function announceMission(field, s) {
  const mission = MISSIONS[s.mission];
  const left = s.needed - s.progress;
  field.showGameMessage(left > 1 ? `${mission.name}: ${left}` : mission.name, 2000);
}

function startMission(field, s) {
  s.progress = 0;
  s.needed = MISSIONS[s.mission].count(s.lap);
  announceMission(field, s);
}

function startMultiball(field) {
  restoreBallSaver(field, 'left');
  restoreBallSaver(field, 'right');
  const launch = () => {
    if (field.getBalls().length < 3) field.launchBall();
  };
  field.scheduleAction(1000, launch);
  field.scheduleAction(3500, launch);
}

function completeMission(field, s) {
  s.rank = Math.min(s.rank + 1, RANKS.length - 1);
  field.addScore(5000 * s.rank);
  const lights = field.getFieldElementById('RankLights');
  lights.setRolloverActiveAtIndex(s.mission, true);
  if (s.rank === MULTIBALL_RANK && s.lap === 0) {
    field.showGameMessage(`${RANKS[s.rank]}! Multiball`, 2500);
    startMultiball(field);
  } else {
    field.showGameMessage(`Mission complete: ${RANKS[s.rank]}`, 2000);
  }
  s.mission += 1;
  if (s.mission === MISSIONS.length) {
    s.mission = 0;
    s.lap += 1;
    field.addExtraBall();
    lights.setAllRolloversActivated(false);
    field.scheduleAction(2200, () => field.showGameMessage('Extra ball!', 2000));
  }
  field.scheduleAction(2500, () => startMission(field, s));
}

function missionEvent(field, event) {
  const s = states.get(field);
  if (!s || MISSIONS[s.mission].event !== event) return;
  s.progress += 1;
  if (s.progress >= s.needed) completeMission(field, s);
  else if (event !== 'planet' || (s.needed - s.progress) % 4 === 0) announceMission(field, s);
}

export function gameStarted(field) {
  setLaunchBarrierEnabled(field, false);
  field.getFieldElementById('RankLights').setAllRolloversActivated(false);
  const s = { rank: 0, mission: 0, lap: 0, progress: 0, needed: 0 };
  states.set(field, s);
  startMission(field, s);
}

export function ballLost(field) {
  setLaunchBarrierEnabled(field, false);
}

export function processCollision(field, element) {
  if (element.constructor.name !== 'BumperElement') return;
  missionEvent(field, element.getElementId() === 'Moon' ? 'Moon' : 'planet');
}

export function allRolloversInGroupActivated(field, group) {
  group.setAllRolloversActivated(false);
  field.incrementAndDisplayScoreMultiplier(1500);
  missionEvent(field, group.getElementId());
}

export function allDropTargetsInGroupHit(field, group) {
  const id = group.getElementId();
  if (id === 'FuelTargets') {
    restoreBallSaver(field, 'left');
    field.showGameMessage('Fuel full: left save on', 1500);
  } else if (id === 'ShieldTargets') {
    restoreBallSaver(field, 'right');
    field.showGameMessage('Shields up: right save on', 1500);
  }
  missionEvent(field, id);
}

export function ballInSensorRange(field, sensor) {
  if (sensor.getElementId() === 'LaunchBarrierSensor') setLaunchBarrierEnabled(field, true);
  else if (sensor.getElementId() === 'LaunchBarrierRetract') setLaunchBarrierEnabled(field, false);
}
