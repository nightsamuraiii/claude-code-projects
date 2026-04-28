# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the projects

No build step or server required — open the HTML files directly in a browser:

- **Tic Tac Toe:** `tictactoe.html`
- **Vector Kill (shooter):** `shooter/index.html`

## Git workflow

**This is mandatory, not optional.** Commit and push to GitHub at the end of every task — no exceptions. The goal is that the remote always reflects the latest working state so nothing is ever lost.

```bash
git add <files>
git commit -m "short imperative subject line"
git push
```

Remote: `https://github.com/nightsamuraiii/claude-code-projects` (branch: `master`)

Rules:
- Commit after **every meaningful unit of work**: new feature, bug fix, new file, content change, config update.
- Never batch multiple unrelated changes into one commit — one logical change per commit.
- Commit messages use the imperative mood and a short subject line (e.g. `Add enemy rage mode`, `Fix sniper telegraph offset`, `Update level 3 wave counts`).
- Push immediately after every commit — do not let commits pile up locally.

## Project structure

```
tictactoe.html        # Self-contained: HTML + CSS + JS in one file
shooter/
  index.html          # HTML shell — sets canvas size, loads game.js
  game.js             # All game logic (~1000 lines)
```

## shooter/ architecture

`game.js` is structured in layers, top to bottom:

1. **Global config** — `W`, `H`, `PLAYER_SPEED`, `FIRE_RATE`, etc. Tweak gameplay constants here.
2. **`C` (color palette)** — all colors referenced by name. The aesthetic is CRT terminal green; add colors here before using them in draw methods.
3. **`ENEMY_DEF`** — one entry per enemy type with stats (`r`, `spd`, `hp`, `score`, `shootInt`, `bspd`, `shootMinLevel`). Adding a new enemy type means adding an entry here plus a `_draw<Type>` method on `Enemy`.
4. **`LEVELS`** — array of level objects, each with a `waves` array. Each wave is `{ type: count, ... }`. This is the only place to change level/wave composition.
5. **Classes:** `Particle` → `Bullet` → `Player` → `Enemy` → `Game`
6. **`Game`** — orchestrates everything: state machine, input, game loop, collision, spawn queue, HUD, screen effects.

### Game loop

`Game._loop(ts)` drives everything via `requestAnimationFrame`. Delta time (`dt`, capped at 50ms) is passed to all `update()` methods. Render order each frame: particles → player bullets → enemy bullets → enemies → player → HUD → overlays → CRT effect.

### State machine

`Game.state` is one of: `MENU` → `PLAYING` ↔ `WAVE_CLEAR` ↔ `LEVEL_CLEAR` → `WIN` or `GAME_OVER`.  
`_update()` and `_render()` both branch on `this.state`. Transition states (`WAVE_CLEAR`, `LEVEL_CLEAR`) just count down `transitionTimer` then call `_buildSpawnQueue()` to resume.

### Enemy spawning

`_buildSpawnQueue()` converts the current wave definition into a time-staggered queue of `{ type, x, y, delay }` objects. Enemies spawn from random canvas edges one at a time; the wave isn't "complete" until both `spawnQueue` and `enemies` are empty.

### Mouse coordinates

Canvas is CSS-scaled for responsiveness. Mouse position is always corrected by the canvas scale factor:
```js
this.mouse.x = (e.clientX - rect.left) * (W / rect.width);
```

### Drawing sprites

All sprites are drawn procedurally with Canvas 2D API — no image files. Each enemy type has a private `_draw<Type>(ctx, color)` method on `Enemy`. The `ctx` is already translated to `(enemy.x, enemy.y)` before these are called. The sniper's telegraph line is drawn after `ctx.restore()` so it renders in world space.

### Adding a new enemy type

1. Add entry to `ENEMY_DEF` with all stat fields including `shootMinLevel`
2. Add a `_draw<Type>(ctx, color)` method on `Enemy`
3. Add a `case` in `Enemy.draw()`'s switch statement
4. Add shooting logic in `Enemy._shoot()` if applicable
5. Reference the type string in `LEVELS` wave definitions
