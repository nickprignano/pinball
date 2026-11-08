# Pinball spec (v1)

Status: draft, red-teamed once, waiting for the owner's approval. Nothing gets built until it's approved.

## What it is

A browser pinball game for `pinball.prignano.ai`. It plays tables written in the
[Vector Pinball](https://github.com/dozingcat/Vector-Pinball) JSON table format, so it starts
with a library of tables that have already been tuned, and new tables are added by dropping in a
JSON file.

It's plain JavaScript and canvas, with no build step. The repo is the site: any static host can
serve it as is.

## Decisions so far

| # | Question | Answer |
| --- | --- | --- |
| 1 | 2D or 3D | A flat 2D table with fake depth (tricks from Google's I/O Pinball) |
| 2 | Look | Vector Pinball's line-drawn style in prignano-theme colors, following the site's light/dark mode |
| 3 | Adding tables | Mainly Claude writes the table JSON and its rules from a description. Files from the Vector Pinball Editor also load |
| 4 | High scores | Stored on the player's device in v1. A shared top 10 on Cloudflare later |
| 5 | Hosting | `pinball.prignano.ai`, served from this repo as static files on Cloudflare |
| 6 | v1 scope | 3 Vector Pinball tables plus 1 new table. The other 6 come later, one at a time |
| - | License | GPL-3.0-only, because we reuse Vector Pinball's tables (its README says "version 3 of the GPL", with no "or later") |

## Prior art and what we take from each

| Source | License | What we use |
| --- | --- | --- |
| [Vector Pinball](https://github.com/dozingcat/Vector-Pinball) | GPL-3 | The table JSON format; tables 1-3 (Classic, Round and Round, Ringmaster); the rules in `Field1-3Delegate`, rewritten in JS; possibly its sounds (see open questions) |
| [Vector Pinball Editor](https://github.com/dozingcat/Vector-Pinball-Editor) | GPL-3 | Not part of our code. The owner can use it to make tables, and the player must load what it saves |
| [planck.js](https://github.com/piqnt/planck.js) | MIT | The physics engine, a JS port of Box2D. Vector Pinball uses Box2D too, so the tables' units and tuning carry over. One vendored file, pinned to an exact version |
| [I/O Pinball](https://github.com/flutter/pinball) | MIT | Ideas only, no code or art: a fixed coordinate system scaled to the screen, a ball that shrinks near the top, a ball drawn above whatever layer it's riding on, tapping each half of the screen for each flipper |
| pookyl/pinball, igorski/pinball-schminball | none | Not used. They have no license, so we only looked |
| Space Cadet decompilation, vpx-js | MIT / GPL-2 | Not used. Space Cadet needs Microsoft's game files, and vpx-js ships no tables |

## How it works

### Files

```
index.html          page, canvas, theme header, table picker
src/engine.js       game loop, physics world, balls, scoring, game state
src/elements/*.js   one file per element type (see below)
src/render.js       drawing, fake depth, theme colors
src/input.js        touch, keyboard, nudge
src/audio.js        sound effects and mute
src/scores.js       high scores on the device
tables/index.json   list of tables shown in the picker
tables/<id>.json    table layout (Vector Pinball format, unchanged)
tables/<id>.js      optional rules for the table (replaces the Java delegate)
vendor/planck.min.js
tools/check-table.mjs  table checker (Node, runs in CI)
```

ES modules loaded directly by the browser. No bundler, and no npm packages needed in production.
The checker and tests need only Node.

### Table format

We read Vector Pinball JSON **without changing it**, so tables move both ways between the
original app, its editor and this game. What to handle:

- Numbers are sometimes stored as strings (`"gravity": "4"`). The loader converts them.
- Field coordinates use y pointing up, like Box2D, with the field typically 20 by 30 units.
  The renderer flips and scales them.
- Top-level keys used by tables 1-3: `name`, `version`, `width`, `height`, `gravity`,
  `numballs`, `ballradius`, `ballcolor`, `targetTimeRatio`, `delegate`, `variables`,
  `launchPosition`, `launchVelocity`, `launchVelocityRandomDelta`, `launchDeadZone`,
  `elements`. Keys with upstream defaults that players notice (from `FieldLayout.java`):
  `mercyBallDuration` (20000 ms: a ball lost within 20 s is given back once, with a
  message), `multiballSaverDuration` (30000), `preserveMultiplierIncreaseDuration` (7500),
  `secondaryBallColor`. `script` (editor Groovy) is ignored. Other unknown keys are kept and
  ignored, with one console warning per key.
- v1 element types (all that tables 1-3 use): `WallElement`, `WallArcElement`,
  `WallPathElement`, `BumperElement`, `FlipperElement`, `DropTargetGroupElement`,
  `RolloverGroupElement`, `SensorElement`. Element properties (`kill`, `kick`, `score`, `color`,
  `reset`, and the rest) follow the Java classes in Vector Pinball's `elements` package. The JS
  versions are rewrites, not line-by-line translations.
- `SpinnerElement` and multi-layer ramps (`layer`, used by tables 6-9) come later. A table that
  uses an unsupported element doesn't appear in the picker, and the checker says why.
- The Vector Pinball Editor's saved format hasn't been checked yet. The first editor table
  the owner makes is the test.

### Table rules

A table's `delegate` names its rules. In this game, the rules are `tables/<id>.js`, a module
exporting any of the hooks in Vector Pinball's `Field.Delegate` interface (`model/Field.java`):
`gameStarted`, `gameEnded`, `ballLost`, `tick`, `processCollision`, `flippersActivated`,
`allRolloversInGroupActivated`, `allDropTargetsInGroupHit`, `ballInSensorRange`,
`isFieldActive` (and `spinnerActivated` later).

The `field` API each hook receives is **the union of every call `Field1-3Delegate` make**,
written down in the first build PR before any rules are ported. At least: score (plain, with
animation, multiplier increase and display), `scheduleAction`, `getFieldElementById`, element
colors (`setNewColor`, `setNewOuterColor`), wall `setRetracted`, rollover helpers
(`setAllRolloversActivated`, `isRolloverActiveAtIndex`, `activateFirstUnactivatedRollover`),
`launchBall`, multiball, messages, table `variables`, and moving an element's position (Round
and Round moves its bumpers every frame).

Without a rules file, a table still plays on standard rules: elements score their `score`
values, drop targets come back after their `reset` delay, and each rollover turns off after its
own `reset` delay. Groups reset as a whole only when a rules file says so, as upstream does.

### Physics

- planck.js (a port of Box2D 2.3, the same version libgdx wraps for Vector Pinball) with gravity
  from the table.
- Fixed step in **game time**: each frame adds `realDt × targetTimeRatio` to an accumulator,
  which is drained in 1/120 s steps with 10 velocity and 10 position iterations (upstream's
  values). The accumulator is clamped after a pause or a hidden tab, so the game never jumps
  ahead. Rendering uses `requestAnimationFrame`.
- Body settings copied from upstream as starting values: ball restitution 0.6, friction 0.3,
  density scaled to radius, bullet (continuous collision detection); walls friction 0.2,
  restitution only when the table sets one, half-thickness 0.05; flipper density 5, half-width
  0.12, motor torque 1000, motor slowed near the top of its swing (`Ball.java`,
  `Box2DFactory.java`, `FlipperElement.java`).
- Hits count when contact *ends*, as upstream does (`endContact`), so scoring timing matches.
- Stuck balls: like upstream, a ball that hasn't moved for 10 s (not counting time a flipper
  is held up) gets a small bump.
- planck uses 64-bit numbers where libgdx uses 32-bit, so expect some small retuning; the
  three ported tables are tuned by playing them.

### Look

- Lines and circles only. Colors come from prignano-theme tokens (`--fg`, `--accent`,
  `--active`, `--muted`, `--bg`), read from CSS when the game starts and again when the theme
  toggles. Each element's `color` is mapped by **hue** to a family of theme colors (light and
  dark versions of each), keeping its brightness, transparency, and the lit or unlit state the
  rules set, so a lit target still looks different from an unlit one in both modes. Upstream
  uses up to 17 colors per table, some with transparency.
- Fake depth: the playfield is drawn with a slight perspective (narrower at the top), the ball
  shrinks by up to about 15% near the top and has a soft shadow, and lit elements glow a
  little. Walls that never change are drawn once to an offscreen canvas, since glow effects are
  slow on low-end phones. `prefers-reduced-motion` turns off glow, shadow and shrinking.
- The canvas is sized for `devicePixelRatio` and redraws on resize and rotation.
- The table is scaled to fit the screen with its proportions kept. It's portrait on phones and
  centered with side margins on desktop.
- The site's shared header from prignano-theme sits above the game. It can be collapsed while
  playing.

### Controls

- Phone: tap the left or right half of the screen for each flipper (several fingers work at
  once); tap a launch button to start; a nudge button sits above the flippers (a swipe from the
  bottom edge would fight the phone's own gestures). The game area sets `touch-action: none`
  and blocks double-tap zoom and pull-to-refresh.
- Keyboard: Z or Left Shift for the left flipper, / or Right Shift for the right, Enter to
  launch, Space to nudge, P to pause, M to mute.
- Resuming after a pause shows a 3-second countdown.
- The picker and every button have labels screen readers can read.
- Nudging pushes the ball a little. Nudging three times within 2 seconds tilts the table and
  costs the ball.
- Turning a phone sideways shows a "turn your phone upright" note.
- The game pauses when its browser tab is hidden.

### Sound

- Short effects for bumpers, flippers, rollovers, drop targets, launching and losing the ball,
  played with the Web Audio API.
- Starts muted until the first tap or key press (browsers require this). The mute setting is
  saved on the device.
- Source: Vector Pinball's `.ogg` files if their license is confirmed (see open questions),
  otherwise short synthesized sounds generated in code.

### High scores

- Top 10 per table, saved in `localStorage` with a 3-letter name, like an arcade. If storage is
  blocked, the game still plays and just doesn't keep scores.
- The format stays simple, so a shared Cloudflare leaderboard can use it later (v2, not
  built now).

### Table checker

`node tools/check-table.mjs tables/<id>.json` runs on every pull request and checks:

1. The JSON is valid, and every element type is supported (or the table is marked as not
   shown in the picker).
2. The table builds in planck.js without errors, and the ball fits through the launch lane.
3. **Smoke test:** a headless run plays N balls with random flipper presses (fixed seed, fixed
   step, rules file running, Node version pinned in CI) and fails if a ball leaves the field,
   if any ball needs more than 3 stuck-ball bumps in a row (it's truly trapped), if a ball
   never drains within a time limit, or if anything throws. Time with a flipper held up or the
   ball in the launch lane's dead zone doesn't count as stuck.
4. The rules file, if there is one, only uses hooks and `field` calls that exist.

When Claude writes a new table, it must pass the checker before the pull request opens.

### Hosting

- Cloudflare Workers static assets (or Pages) pointed at this repo, with `pinball.prignano.ai`
  as a custom domain. No server code in v1.
- The owner does the Cloudflare setup (connecting the repo and adding the domain). Claude writes
  the step-by-step instructions and doesn't touch the account.

## v1 checklist

- [ ] Loader, physics and the 8 element types
- [ ] Classic, Round and Round, Ringmaster, with their rules rewritten in JS
- [ ] One new table written by Claude from the owner's description
- [ ] Table picker, the look in both themes, fake depth
- [ ] Touch, keyboard, nudge and tilt
- [ ] Sound with a mute button
- [ ] High scores on the device
- [ ] Table checker plus CI
- [ ] README with credits, LICENSE (GPL-3.0), AGENTS.md
- [ ] Owner's Cloudflare setup steps

### Pull requests

v1 lands as four PRs the owner can skim, not one large one:

1. Loader, physics, the 8 element types, Classic with its rules, the checker and CI.
2. Round and Round and Ringmaster rules.
3. Look, sound, controls, scores, picker.
4. The new table, plus the Cloudflare setup steps.

**Done means:** all 4 tables play on a phone and on a desktop, both themes look right, the checker
passes in CI, and a scripted browser run (Playwright) loads every table, launches a ball and
scores points.

## Not in v1

Shared leaderboard, tables 4-9, spinners and ramps, a table editor in the browser, music,
tilting the phone to nudge, and installing the game as an app.

## Open questions

1. **Sound license.** Vector Pinball's README credits its sounds to Peter Drescher
   (Twittering Machine) separately from the code. They're in the GPL repo, but the README never
   says they're under the GPL. Default: use synthesized sounds in v1 and ask dozingcat to
   confirm; switch to the originals if they say yes.
2. **Credits and notice.** The README and the in-game "About" screen credit Vector Pinball
   (dozingcat) and link to its source, as GPL-3 requires. Our own changes are noted in the
   file headers. planck.js and prignano-theme (both MIT) keep their license notices, and the
   README links planck's exact source tag, since the vendored file is minified.
