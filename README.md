# Pinball

A browser pinball game for [pinball.prignano.ai](https://pinball.prignano.ai). It plays tables in
the [Vector Pinball](https://github.com/dozingcat/Vector-Pinball) JSON format, so its tables can be
shared with that Android game and its editor.

It's plain JavaScript and canvas with no build step: serve the folder with any static file server
and open `index.html`. The plan is in [docs/SPEC.md](docs/SPEC.md).

## Controls

- Phone: tap the left or right half of the screen to flip. Any tap launches a ball. The Nudge
  button nudges the table. Play holds the phone upright.
- Keyboard: Z, Left Shift or Left arrow (left flipper), /, Right Shift or Right arrow (right
  flipper), Enter to launch, Space to nudge, P or Esc to pause, M to mute.
- Three nudges within 2 seconds tilt the table: the flippers stop until the ball drains.

The table is drawn in the [prignano-theme](https://github.com/nickprignano/prignano-theme) colors
and follows its light/dark switch. The theme's stylesheet and site header load at runtime from a
pinned commit; if they can't load, `styles.css` has the same colors and the game works without
the header. Sounds are synthesized in the browser. High scores (top 10 per table) stay on the
player's device.

## Install as an app

The game is an installable web app. On Android (Chrome), use the menu's **Install app** or the
**Install as an app** button in the table menu. On iPhone and iPad (Safari), tap **Share**, then
**Add to Home Screen**. Once installed it opens full screen without the browser bar and plays
offline.

`sw.js` keeps a copy of every game file. After changing any game file, run
`node tools/sw-version.mjs`: it updates the file list and version in `sw.js`, and `node --test`
fails until you do. Players get the new version through **Update the game** in the table menu, or
the next time they open the app. The icons are drawn in `icons/icon.svg`; after changing it, run
`node tools/make-icons.mjs` (needs Playwright) to redraw the PNGs.

## Tables

Tables live in `tables/` as `<id>.json` (the layout, unchanged Vector Pinball format) plus an
optional `<id>.js` with the table's rules. `tables/index.json` lists the ones the game offers.

| Table | Source |
| --- | --- |
| Classic | Vector Pinball table 1, rules rewritten from `Field1Delegate` |
| Round and Round | Vector Pinball table 2, rules rewritten from `Field2Delegate` |
| Ringmaster | Vector Pinball table 3, rules rewritten from `Field3Delegate` |
| Deep Orbit | Original table for this game: fly five missions to climb the ranks, with multiball at Navigator. Its walls start from Classic's outline |

Check a table before adding it:

```bash
node tools/check-table.mjs tables/<id>.json
```

## Hosting

Cloudflare Workers static assets serves the folder as-is. Setup steps are in
[docs/DEPLOY.md](docs/DEPLOY.md).

## 3D view

Pick **Graphics** in the table menu: Flat (the line drawing), 3D (starts on high quality and
steps down if frames are slow), or 3D high or low. `?gfx=flat|auto|high|low` in the address
overrides it for testing, and `?fps=1` shows the frame time. The plan is in
[docs/SPEC-3D.md](docs/SPEC-3D.md).

The 3D view draws the same game with [three.js](https://github.com/mrdoob/three.js); physics and
rules don't change. Raised plastics are worked out from where the ball can't go. A table's
playfield art is drawn in code in `tables/<id>.art.js`, marked with `"art": true` in
`tables/index.json`; without one, a plain default is used.

- `node tools/vendor-three.mjs` refreshes `vendor/three/` from the npm package, checked against
  its published hash. Change the version and hash in the tool to upgrade.
- `node tools/check-3d.mjs [folder] [table]` plays every table in 3D in a headless browser
  (needs Playwright) and saves screenshots. Run it before a pull request that touches the 3D
  view.

## Checks

```bash
node --test
node tools/check-table.mjs
node tools/check-3d.mjs   # when the 3D view changed; needs Playwright
```

## Credits and license

- Game engine, element behavior and tables are a JavaScript port of
  [Vector Pinball](https://github.com/dozingcat/Vector-Pinball) by dozingcat, GPL-3.0.
- Physics: [planck.js](https://github.com/piqnt/planck.js) v1.5.1 (MIT), vendored unminified as
  `vendor/planck.mjs` (the `dist/planck.mjs` file of the
  [npm package](https://www.npmjs.com/package/planck/v/1.5.1)) with its license in
  `vendor/planck.LICENSE`.
- 3D view: [three.js](https://github.com/mrdoob/three.js) r187 (MIT), the `three@0.187.0` npm
  package's `build/three.core.js`, `build/three.module.js` and a few add-ons, vendored unminified
  in `vendor/three/` with its license in `vendor/three/LICENSE`.
- This project is licensed under the GNU General Public License version 3 only (GPL-3.0-only);
  see [LICENSE](LICENSE).
