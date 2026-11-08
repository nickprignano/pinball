// SensorElement, after Vector Pinball's class of the same name: an invisible rectangle that tells
// the table's rules when a ball is inside it.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { nums } from '../util.js';
import { FieldElement } from './base.js';

export class SensorElement extends FieldElement {
  constructor(params) {
    super(params);
    const [x1, y1, x2, y2] = nums(params.rect);
    this.xmin = Math.min(x1, x2);
    this.ymin = Math.min(y1, y2);
    this.xmax = Math.max(x1, x2);
    this.ymax = Math.max(y1, y2);
    this.recordBallTimes = params.recordBallTimes === true;
    this.ballEntryTimes = new Map();
  }

  ballInRange(ball) {
    const p = ball.getPosition();
    return p.x >= this.xmin && p.x <= this.xmax && p.y >= this.ymin && p.y <= this.ymax;
  }

  tick(field, ms) {
    for (const ball of field.getBalls()) {
      if (this.ballInRange(ball)) {
        if (this.recordBallTimes && !this.ballEntryTimes.has(ball)) {
          this.ballEntryTimes.set(ball, field.getGameTimeMs());
        }
        field.delegate.ballInSensorRange?.(field, this, ball);
        ball.mostRecentSensorId = this.id;
      } else if (this.recordBallTimes) {
        this.ballEntryTimes.delete(ball);
      }
    }
  }

  ballEntryTimeMs(ball) {
    return this.ballEntryTimes.get(ball) ?? null;
  }
}
