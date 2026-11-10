// Service worker: keeps a copy of every game file so the installed app plays offline.
// VERSION and FILES are written by `node tools/sw-version.mjs`; a test fails if they're stale.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const VERSION = 'a1f9921ceaaf';
const FILES = [
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  '/',
  'manifest.webmanifest',
  'src/audio.js',
  'src/ball.js',
  'src/elements/base.js',
  'src/elements/bumper.js',
  'src/elements/flipper.js',
  'src/elements/index.js',
  'src/elements/sensor.js',
  'src/elements/targets.js',
  'src/elements/walls.js',
  'src/field.js',
  'src/input.js',
  'src/main.js',
  'src/physics.js',
  'src/render.js',
  'src/scores.js',
  'src/theme.js',
  'src/three/art.js',
  'src/three/geometry.js',
  'src/three/parts.js',
  'src/three/view.js',
  'src/util.js',
  'styles.css',
  'tables/classic.art.js',
  'tables/classic.js',
  'tables/classic.json',
  'tables/deep-orbit.art.js',
  'tables/deep-orbit.js',
  'tables/deep-orbit.json',
  'tables/index.json',
  'tables/ringmaster.art.js',
  'tables/ringmaster.js',
  'tables/ringmaster.json',
  'tables/round-and-round.art.js',
  'tables/round-and-round.js',
  'tables/round-and-round.json',
  'vendor/planck.mjs',
  'vendor/three/addons/environments/RoomEnvironment.js',
  'vendor/three/addons/postprocessing/EffectComposer.js',
  'vendor/three/addons/postprocessing/MaskPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/postprocessing/Pass.js',
  'vendor/three/addons/postprocessing/RenderPass.js',
  'vendor/three/addons/postprocessing/ShaderPass.js',
  'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/shaders/CopyShader.js',
  'vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'vendor/three/addons/shaders/OutputShader.js',
  'vendor/three/three.core.js',
  'vendor/three/three.module.js',
];
// The shared theme, pinned to a commit so it never changes. Kept if it loads, skipped if not.
const EXTRA = [
  'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/theme.css',
  'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js',
];
const CACHE = `pinball-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' skips the browser's HTTP cache, so a new version never keeps old files.
      await cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })));
      await Promise.allSettled(EXTRA.map((url) => cache.add(url)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page posts this when the player taps Update.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pages (including ?table=...) are all the one app page, cached as "/".
      const cached = request.mode === 'navigate'
        ? await cache.match('/')
        : await cache.match(request, { ignoreSearch: new URL(request.url).origin === location.origin });
      return cached || fetch(request);
    })(),
  );
});
