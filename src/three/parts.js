// Builds the 3D table from a Field's elements and keeps it in step with the game every frame.
// Parts are built once per table, then bound to each new game's Field by element index.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import * as THREE from '../../vendor/three/three.module.js';
import { BumperElement } from '../elements/bumper.js';
import { FlipperElement } from '../elements/flipper.js';
import { DropTargetGroupElement, RolloverGroupElement } from '../elements/targets.js';
import { DEFAULT_WALL_COLOR } from '../elements/base.js';
import { rgb } from '../util.js';
import { DEFAULT_PLASTIC, paintPlayfield } from './art.js';
import { cornerHeights, newLight, SIZES, solidCells, stepLight, toWorld, wallSegments } from './geometry.js';

const DEFAULT_BUMPER = rgb(0, 0, 255);
const DEFAULT_OUTER = rgb(0, 0, 255, 128);
const DEFAULT_FLIPPER = rgb(0, 255, 0);
const DEFAULT_TARGET = rgb(0, 255, 0);
const WHITE = new THREE.Color(1, 1, 1);

// The soft round glow used behind lights, shared by every table.
let haloTexture = null;
function halo() {
  if (!haloTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(c);
    haloTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return haloTexture;
}

function haloSprite(color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: halo(),
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }));
  sprite.scale.setScalar(size);
  sprite.userData.size = size;
  return sprite;
}

// A flipper paddle: round at the pivot, narrower round tip, along +x.
function paddleShape(length, r0, r1) {
  const shape = new THREE.Shape();
  const a = Math.asin((r0 - r1) / length);
  shape.absarc(0, 0, r0, Math.PI / 2 + a, Math.PI * 1.5 - a, false);
  shape.absarc(length, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  shape.closePath();
  return shape;
}

// Lays a shape (drawn with y up the table) flat on the playfield and extrudes it upward.
function extrudeFlat(shape, depth, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// options: { art, palette, tier: 'high'|'low', name, reducedMotion }
export function buildTable(field, { art, palette, tier, name, reducedMotion }) {
  const group = new THREE.Group();
  const updaters = [];
  const disposables = [];
  const track = (thing) => (disposables.push(thing), thing);
  const w = (fx, fy) => toWorld(field, fx, fy);
  const colorCache = new Map();
  const color = (c) => {
    const key = c.join(',');
    if (!colorCache.has(key)) {
      const [h, s, l] = palette.css(c).match(/[\d.]+/g).map(Number);
      colorCache.set(key, new THREE.Color().setHSL(h / 360, s / 100, l / 100, THREE.SRGBColorSpace));
    }
    return colorCache.get(key);
  };
  const baseColor = (e, fallback) => e.newColor ?? e.initialColor ?? fallback;
  const scratch = new THREE.Color();
  let current = field; // the Field of the game being played
  const el = (index) => current.elements[index];
  const indexOf = (element) => field.elements.indexOf(element);

  // Playfield, with the table's art under a clear coat.
  const pxPerUnit = Math.min((tier === 'high' ? 2048 : 1024) / field.width, (tier === 'high' ? 3072 : 1536) / field.height);
  const artCanvas = paintPlayfield(field, art, pxPerUnit, name);
  const artTexture = track(new THREE.CanvasTexture(artCanvas));
  artTexture.colorSpace = THREE.SRGBColorSpace;
  artTexture.anisotropy = 8;
  // Free the 2D canvas once the texture is on the GPU.
  artTexture.onUpdate = () => {
    artCanvas.width = artCanvas.height = 1;
  };
  const playfieldMaterial = tier === 'high'
    ? new THREE.MeshPhysicalMaterial({ map: artTexture, roughness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ map: artTexture, roughness: 0.45 });
  const playfield = new THREE.Mesh(track(new THREE.PlaneGeometry(field.width, field.height)), track(playfieldMaterial));
  playfield.rotation.x = -Math.PI / 2;
  playfield.receiveShadow = true;
  group.add(playfield);

  // Raised plastics wherever the ball can never go.
  {
    const cells = solidCells(field);
    const { nx, ny, cell } = cells;
    const heights = cornerHeights(cells);
    const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i;
        const p = w(Math.min(i * cell, field.width), Math.min(j * cell, field.height));
        positions.set([p.x, heights[k], p.z], k * 3);
      }
    }
    const index = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        if (heights[a] || heights[b] || heights[c] || heights[d]) index.push(a, b, c, b, d, c); // facing up
      }
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material = track(new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(art.plastic ?? DEFAULT_PLASTIC),
      roughness: 0.25,
      clearcoat: tier === 'high' ? 1 : 0,
      clearcoatRoughness: 0.1,
    }));
    const plastics = new THREE.Mesh(geometry, material);
    plastics.receiveShadow = true;
    group.add(plastics);
  }

  // Wooden cabinet sides around the playfield.
  {
    const wood = track(new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.65 }));
    const W = field.width;
    const H = field.height;
    for (const [x, z, sx, sz] of [[-W / 2 - 0.4, 0, 0.8, H + 1.6], [W / 2 + 0.4, 0, 0.8, H + 1.6], [0, -H / 2 - 0.4, W + 1.6, 0.8]]) {
      const side = new THREE.Mesh(track(new THREE.BoxGeometry(sx, 1.4, sz)), wood);
      side.position.set(x, 0.7, z);
      group.add(side);
    }
  }

  // Rails: one instanced mesh for the metal and one for the lit top edges.
  {
    const segments = wallSegments(field).map((s) => ({ ...s, index: indexOf(s.element) }));
    const n = segments.length;
    const body = new THREE.InstancedMesh(
      track(new THREE.BoxGeometry(1, SIZES.railHeight, SIZES.railHalfWidth * 2)),
      track(new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.28 })),
      n,
    );
    const top = new THREE.InstancedMesh(
      track(new THREE.BoxGeometry(1, 0.05, SIZES.railHalfWidth * 1.3)),
      track(new THREE.MeshBasicMaterial()),
      n,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const shown = segments.map(() => null);
    const tint = segments.map(() => '');
    const lights = new Map();
    const place = (s, i, visible) => {
      const flat = s.element.params.ignoreBall === true;
      const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + SIZES.railHalfWidth * 2;
      const mid = w((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
      quaternion.setFromAxisAngle(up, Math.atan2(s.y2 - s.y1, s.x2 - s.x1));
      // Hidden pieces drop out of sight below the table. Scaling them to zero instead would
      // break the lighting math (zero-size normals) and blank the bloom pass.
      const drop = visible ? 0 : -50;
      const size = new THREE.Vector3(length, 1, 1);
      body.setMatrixAt(i, matrix.compose(new THREE.Vector3(mid.x, SIZES.railHeight / 2 + (flat ? -50 : drop), mid.z), quaternion, size));
      top.setMatrixAt(i, matrix.compose(new THREE.Vector3(mid.x, (flat ? 0.01 : SIZES.railHeight + 0.02) + drop, mid.z), quaternion, size));
    };
    segments.forEach((s, i) => {
      place(s, i, true);
      const kick = s.element.kick > 0.01;
      body.setColorAt(i, kick ? new THREE.Color(0.92, 0.92, 0.92) : new THREE.Color(0.62, 0.65, 0.72));
      top.setColorAt(i, new THREE.Color());
    });
    body.castShadow = false;
    group.add(body, top);
    updaters.push((now, dt) => {
      let moved = false;
      let recolored = false;
      segments.forEach((s, i) => {
        const e = el(s.index);
        const visible = e.visible !== false && !e.isRetracted?.();
        if (visible !== shown[i]) {
          shown[i] = visible;
          place(s, i, visible);
          moved = true;
        }
        let light = 0;
        if (e.kick > 0.01) {
          if (!lights.has(s.index)) lights.set(s.index, newLight());
          light = reducedMotion ? 0 : stepLight(lights.get(s.index), e.flashMs > 0, now, dt);
        }
        const c = baseColor(e, DEFAULT_WALL_COLOR);
        const key = `${c}|${light.toFixed(2)}`;
        if (key !== tint[i]) {
          tint[i] = key;
          scratch.copy(e.kick > 0.01 ? WHITE : color(c)).multiplyScalar(1.5 + light * 2.5);
          top.setColorAt(i, scratch);
          recolored = true;
        }
      });
      if (moved) {
        body.instanceMatrix.needsUpdate = true;
        top.instanceMatrix.needsUpdate = true;
      }
      if (recolored) top.instanceColor.needsUpdate = true;
    });
  }

  // Pop bumpers: white body and colored cap at the collider's radius, a flat chrome ring for
  // the outer radius, and a halo that flares when hit.
  for (const e of field.elements) {
    if (!(e instanceof BumperElement)) continue;
    const index = indexOf(e);
    const bumper = new THREE.Group();
    const ring = new THREE.Mesh(
      track(new THREE.RingGeometry(e.radius * 0.98, Math.max(e.outerRadius, e.radius * 1.2), 48)),
      track(new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.25 })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    const body = new THREE.Mesh(
      track(new THREE.CylinderGeometry(e.radius * 0.92, e.radius, 0.5, 40)),
      track(new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.35 })),
    );
    body.position.y = 0.25;
    const capMaterial = track(new THREE.MeshStandardMaterial({ roughness: 0.25 }));
    const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(e.radius, e.radius * 0.95, 0.24, 40)), capMaterial);
    cap.position.y = 0.62;
    const glow = haloSprite(0xffffff, e.radius * 4);
    glow.position.y = 0.8;
    track(glow.material);
    bumper.add(ring, body, cap, glow);
    group.add(bumper);
    const light = newLight();
    updaters.push((now, dt) => {
      const b = el(index);
      const p = w(b.cx, b.cy);
      bumper.position.set(p.x, 0, p.z);
      const level = reducedMotion ? 0 : stepLight(light, b.flashMs > 0, now, dt);
      const c = color(baseColor(b, DEFAULT_BUMPER));
      capMaterial.color.copy(c);
      capMaterial.emissive.copy(c);
      capMaterial.emissiveIntensity = 0.5 + level * 2.5;
      ring.material.color.copy(color(b.newOuterColor ?? b.outerColor ?? DEFAULT_OUTER)).lerp(WHITE, 0.6);
      glow.material.color.copy(c);
      glow.material.opacity = 0.35 + level * 0.65;
      glow.scale.setScalar(glow.userData.size * (1 + level * 0.4));
    });
  }

  // Flippers: white paddle the shape of the physics bar, with a colored rubber edge.
  for (const e of field.elements) {
    if (!(e instanceof FlipperElement)) continue;
    const index = indexOf(e);
    const length = Math.abs(e.length);
    const flipper = new THREE.Group();
    const rubber = new THREE.Mesh(
      track(extrudeFlat(paddleShape(length, SIZES.flipperPivotRadius, SIZES.flipperTipRadius), 0.2)),
      track(new THREE.MeshStandardMaterial({ roughness: 0.6 })),
    );
    rubber.position.y = 0.1;
    const plastic = new THREE.Mesh(
      track(extrudeFlat(paddleShape(length, SIZES.flipperPivotRadius - 0.04, SIZES.flipperTipRadius - 0.03), 0.42, 0.02)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 })),
    );
    const pin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12)), track(new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.2 })));
    pin.position.y = 0.25;
    flipper.add(rubber, plastic, pin);
    group.add(flipper);
    updaters.push(() => {
      const f = el(index);
      const pos = f.anchorBody.getPosition();
      const joint = Math.min(Math.max(f.joint.getJointAngle(), f.lowerAngle), f.upperAngle);
      const p = w(pos.x, pos.y);
      flipper.position.set(p.x, 0, p.z);
      flipper.rotation.y = f.downAngle + joint + (f.length < 0 ? Math.PI : 0);
      rubber.material.color.copy(color(baseColor(f, DEFAULT_FLIPPER)));
    });
  }

  // Drop targets stand up and sink into the playfield when knocked down.
  for (const e of field.elements) {
    if (!(e instanceof DropTargetGroupElement)) continue;
    const index = indexOf(e);
    const material = track(new THREE.MeshStandardMaterial({ roughness: 0.3 }));
    e.positions.forEach(([x1, y1, x2, y2], k) => {
      const length = Math.hypot(x2 - x1, y2 - y1);
      const target = new THREE.Mesh(track(new THREE.BoxGeometry(length * 0.94, 0.6, SIZES.dropTargetHalfThickness * 2)), material);
      const p = w((x1 + x2) / 2, (y1 + y2) / 2);
      target.position.set(p.x, 0.3, p.z);
      target.rotation.y = Math.atan2(y2 - y1, x2 - x1);
      group.add(target);
      updaters.push((now, dt) => {
        const up = el(index).bodies[k].isActive();
        const goal = up ? 0.3 : -0.32;
        target.position.y += (goal - target.position.y) * Math.min(1, dt / 40);
        target.visible = target.position.y > -0.3;
      });
    });
    updaters.push(() => {
      const c = color(baseColor(el(index), DEFAULT_TARGET));
      material.color.copy(c);
      material.emissive.copy(c);
      material.emissiveIntensity = 0.3;
    });
  }

  // Rollover lights: inserts under the clear coat, with a halo when lit.
  {
    const inserts = [];
    for (const e of field.elements) {
      if (!(e instanceof RolloverGroupElement)) continue;
      e.rollovers.forEach((r, k) => inserts.push({ index: indexOf(e), k, r }));
    }
    if (inserts.length) {
      const mesh = new THREE.InstancedMesh(
        track(new THREE.CircleGeometry(1, 40)),
        track(new THREE.MeshBasicMaterial()),
        inserts.length,
      );
      const matrix = new THREE.Matrix4();
      const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      const glows = inserts.map(({ r }, i) => {
        const p = w(r.x, r.y);
        mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(p.x, 0.006, p.z), flat, new THREE.Vector3(r.radius, r.radius, 1)));
        mesh.setColorAt(i, new THREE.Color());
        const glow = haloSprite(0xffffff, r.radius * 4.5);
        track(glow.material);
        glow.position.set(p.x, 0.15, p.z);
        group.add(glow);
        return glow;
      });
      group.add(mesh);
      const lights = inserts.map(() => newLight());
      updaters.push((now, dt) => {
        inserts.forEach(({ index, k }, i) => {
          const e = el(index);
          const r = e.rollovers[k];
          const lit = e.visible !== false && e.active.has(r);
          // Lit inserts change with the game, not as flashes, but still rise at most 3 times a second.
          const level = reducedMotion ? (lit ? 1 : 0) : stepLight(lights[i], lit, now, dt);
          const c = color(r.color ?? baseColor(e, DEFAULT_TARGET));
          scratch.copy(c).multiplyScalar(e.visible === false ? 0 : 0.18 + level * 1.6);
          mesh.setColorAt(i, scratch);
          glows[i].material.color.copy(c);
          glows[i].material.opacity = level * 0.8;
          glows[i].visible = level > 0.01;
        });
        mesh.instanceColor.needsUpdate = true;
      });
    }
  }

  // Balls: polished steel that reflects the room, casting the only real shadow.
  {
    const geometry = track(new THREE.SphereGeometry(1, 40, 28));
    const material = track(new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.07, envMapIntensity: 3 }));
    const balls = [];
    updaters.push(() => {
      while (balls.length < current.balls.length) {
        const ball = new THREE.Mesh(geometry, material);
        ball.castShadow = true;
        group.add(ball);
        balls.push(ball);
      }
      balls.forEach((ball, i) => {
        const b = current.balls[i];
        ball.visible = Boolean(b);
        if (!b) return;
        const pos = b.getPosition();
        const p = w(pos.x, pos.y);
        ball.scale.setScalar(b.radius);
        ball.position.set(p.x, b.radius, p.z);
      });
    });
  }

  return {
    group,
    bind(next) {
      current = next;
    },
    sync(nowMs, dtMs) {
      for (const update of updaters) update(nowMs, dtMs);
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
