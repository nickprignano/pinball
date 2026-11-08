# Pinball

A browser pinball game for [pinball.prignano.ai](https://pinball.prignano.ai). It plays tables in
the [Vector Pinball](https://github.com/dozingcat/Vector-Pinball) JSON format, so its tables can be
shared with that Android game and its editor.

It's plain JavaScript and canvas with no build step: serve the folder with any static file server
and open `index.html`. The plan is in [docs/SPEC.md](docs/SPEC.md).

## Controls

- Phone: tap the left or right half of the screen to flip. Any tap launches a ball.
- Keyboard: Z or Left Shift (left flipper), / or Right Shift (right flipper), Enter to launch.

## Tables

Tables live in `tables/` as `<id>.json` (the layout, unchanged Vector Pinball format) plus an
optional `<id>.js` with the table's rules. `tables/index.json` lists the ones the game offers.

| Table | Source |
| --- | --- |
| Classic | Vector Pinball table 1, rules rewritten from `Field1Delegate` |
| Round and Round | Vector Pinball table 2, rules rewritten from `Field2Delegate` |
| Ringmaster | Vector Pinball table 3, rules rewritten from `Field3Delegate` |

Check a table before adding it:

```bash
node tools/check-table.mjs tables/<id>.json
```

## Checks

```bash
node --test
node tools/check-table.mjs
```

## Credits and license

- Game engine, element behavior and tables are a JavaScript port of
  [Vector Pinball](https://github.com/dozingcat/Vector-Pinball) by dozingcat, GPL-3.0.
- Physics: [planck.js](https://github.com/piqnt/planck.js) v1.5.1 (MIT), vendored unminified as
  `vendor/planck.mjs` (the `dist/planck.mjs` file of the
  [npm package](https://www.npmjs.com/package/planck/v/1.5.1)) with its license in
  `vendor/planck.LICENSE`.
- This project is licensed under the GNU General Public License version 3 only (GPL-3.0-only);
  see [LICENSE](LICENSE).
