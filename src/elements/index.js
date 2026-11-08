// Maps the "class" names used in Vector Pinball table JSON to our element classes.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { BumperElement } from './bumper.js';
import { FlipperElement } from './flipper.js';
import { SensorElement } from './sensor.js';
import { DropTargetGroupElement, RolloverGroupElement } from './targets.js';
import { WallArcElement, WallElement, WallPathElement } from './walls.js';

export const ELEMENT_CLASSES = {
  WallElement,
  WallArcElement,
  WallPathElement,
  BumperElement,
  FlipperElement,
  DropTargetGroupElement,
  RolloverGroupElement,
  SensorElement,
};

export function unsupportedClasses(table) {
  const names = new Set(table.elements.map((e) => e.class).filter((c) => !(c in ELEMENT_CLASSES)));
  return [...names];
}

export function createElement(params) {
  const ElementClass = ELEMENT_CLASSES[params.class];
  if (!ElementClass) throw new Error(`Unsupported element class: ${params.class}`);
  return new ElementClass(params);
}
