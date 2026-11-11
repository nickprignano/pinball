// The 3D view: owns its own canvas and WebGL renderer, the camera, lights and the quality tier,
// and draws the table built by parts.js. Loaded with import() only when 3D is chosen.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import * as THREE from '../../vendor/three/three.module.js';
import { RoomEnvironment } from '../../vendor/three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { Palette } from '../theme.js';
import { loadArt } from './art.js';
import { toWorld } from './geometry.js';
import { buildTable } from './parts.js';

// The table always sits in a dark room, so element colors use the theme's dark values.
const DARK_TOKENS = { '--bg': '#0d1117', '--fg': '#e6edf3', '--muted': '#8b949e', '--accent': '#58a6ff', '--active': '#3fb950', '--border': '#2a313c' };

export const supportsWebGL2 = () => Boolean(document.createElement('canvas').getContext('webgl2'));

export class ThreeView {
  // tier: 'high' or 'low'. onContextLost(view) is called if the GPU drops the WebGL context.
  constructor(stage, tier, { onContextLost } = {}) {
    this.stage = stage;
    this.tier = tier;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-3d';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Pinball table in 3D. Tap the left or right half, or press Z and slash, to flip.');
    stage.prepend(this.canvas);
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      // dispose() drops the context on purpose; only a loss the GPU causes counts.
      if (!this.disposed) onContextLost?.(this);
    });

    const high = tier === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !high, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070b);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.15;
    this.scene.add(new THREE.HemisphereLight(0x8090ff, 0x100808, 0.4));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(high ? 1024 : 512);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    if (high) {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.95);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.table = null;
  }

  // entry is the table's line in tables/index.json.
  async setTable(field, entry) {
    const art = await loadArt(entry);
    const { name, id: tableId } = entry;
    this.table?.dispose();
    if (this.table) this.scene.remove(this.table.group);
    this.field = field;
    this.table = buildTable(field, { art, palette: new Palette(DARK_TOKENS, true), tier: this.tier, name, reducedMotion: this.reducedMotion });
    this.scene.add(this.table.group);
    this.tableId = tableId;
    const { width: W, height: H } = field;
    this.sun.position.set(-W * 0.3, 24, H * 0.4);
    Object.assign(this.sun.shadow.camera, { left: -W / 2 - 1, right: W / 2 + 1, top: H / 2 + 1, bottom: -H / 2 - 1, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.resize();
    this.table.sync(0, 16);
    // Compile every shader now, so the first seconds of play don't stutter.
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  bind(field) {
    this.field = field;
    this.table.bind(field);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.stage;
    if (!w || !h || !this.field) return;
    const ratio = Math.min(devicePixelRatio || 1, this.tier === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
    }
    this.fitCamera(w / h);
  }

  // Looks down the table from the player's end, as close as it can while the whole table fits,
  // then centres the table on screen. Portrait screens are width-limited, so their camera looks
  // more nearly straight down, which makes the table taller on screen.
  fitCamera(aspect) {
    const { width: W, height: H } = this.field;
    const camera = this.camera;
    camera.aspect = aspect;
    const portrait = aspect < 1;
    const direction = new THREE.Vector3(0, 1, portrait ? 0.45 : 0.62).normalize();
    const target = new THREE.Vector3(0, 0, 0);
    const corners = [[-W / 2 - 0.8, H / 2 + 0.2], [W / 2 + 0.8, H / 2 + 0.2], [-W / 2 - 0.8, -H / 2 - 0.8], [W / 2 + 0.8, -H / 2 - 0.8]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z));
    const p = new THREE.Vector3();
    let box;
    for (let distance = 8; distance < 200; distance += 0.25) {
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (const c of corners) {
        p.copy(c).project(camera);
        box = { minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x), minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y) };
      }
      if (box.maxX - box.minX <= 1.94 && box.maxY - box.minY <= 1.94) break;
    }
    // Shift the picture so the table sits in the middle of the screen.
    camera.projectionMatrix.elements[8] = (box.minX + box.maxX) / 2;
    camera.projectionMatrix.elements[9] = (box.minY + box.maxY) / 2;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  // Screen position (CSS pixels within the stage) of a point on the table, height above it.
  project(fx, fy, height = 0.6) {
    const p = toWorld(this.field, fx, fy);
    const v = new THREE.Vector3(p.x, height, p.z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.stage.clientWidth, y: ((1 - v.y) / 2) * this.stage.clientHeight };
  }

  frame(nowMs, dtMs) {
    this.table.sync(nowMs, dtMs);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.table?.dispose();
    this.environment.dispose();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
