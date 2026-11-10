// Copies three.js into vendor/three/ from the npm package, checked against its published hash.
// Usage: node tools/vendor-three.mjs [three-<version>.tgz]
// With no argument it downloads the package from the npm registry. To upgrade three.js, change
// VERSION and INTEGRITY (from `npm view three@<version> dist.integrity`) and run it again.
// Bare `from 'three'` imports in the add-ons are rewritten to relative paths, so the browser
// loads them without an import map or a build step.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';

const VERSION = '0.187.0';
const INTEGRITY = 'sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==';

// Package path → path under vendor/three/.
const FILES = {
  'LICENSE': 'LICENSE',
  'build/three.core.js': 'three.core.js',
  'build/three.module.js': 'three.module.js',
  'examples/jsm/environments/RoomEnvironment.js': 'addons/environments/RoomEnvironment.js',
  'examples/jsm/postprocessing/EffectComposer.js': 'addons/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/MaskPass.js': 'addons/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/OutputPass.js': 'addons/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/Pass.js': 'addons/postprocessing/Pass.js',
  'examples/jsm/postprocessing/RenderPass.js': 'addons/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js': 'addons/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js': 'addons/postprocessing/UnrealBloomPass.js',
  'examples/jsm/shaders/CopyShader.js': 'addons/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js': 'addons/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js': 'addons/shaders/OutputShader.js',
};

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const out = join(root, 'vendor/three');

const tgz = process.argv[2]
  ? readFileSync(process.argv[2])
  : Buffer.from(await (await fetch(`https://registry.npmjs.org/three/-/three-${VERSION}.tgz`)).arrayBuffer());
const hash = `sha512-${createHash('sha512').update(tgz).digest('base64')}`;
if (hash !== INTEGRITY) throw new Error(`three@${VERSION} doesn't match its published hash`);

// A minimal tar reader: 512-byte headers, each followed by the file padded to 512 bytes.
const tar = gunzipSync(tgz);
const entries = new Map();
for (let at = 0; at + 512 <= tar.length; ) {
  const header = tar.subarray(at, at + 512);
  const field = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/s, '');
  const name = field(0, 100);
  if (!name) break;
  const prefix = field(345, 155);
  const size = parseInt(field(124, 12).trim(), 8);
  const path = (prefix ? `${prefix}/${name}` : name).replace(/^package\//, '');
  entries.set(path, tar.subarray(at + 512, at + 512 + size));
  at += 512 + Math.ceil(size / 512) * 512;
}

rmSync(out, { recursive: true, force: true });
for (const [from, to] of Object.entries(FILES)) {
  const data = entries.get(from);
  if (!data) throw new Error(`${from} is missing from three@${VERSION}`);
  let text = data.toString('utf8');
  if (to.startsWith('addons/')) {
    const module = posix.relative(posix.dirname(to), 'three.module.js');
    text = text.replaceAll("from 'three';", `from '${module}';`);
  }
  mkdirSync(dirname(join(out, to)), { recursive: true });
  writeFileSync(join(out, to), text);
  console.log(`${relative(root, join(out, to))}`);
}
writeFileSync(join(out, 'VERSION'), `three@${VERSION} from the npm registry, ${INTEGRITY}\n`);
