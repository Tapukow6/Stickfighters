# Stickfighters (Canvas)

Summary
-------
A small 2D stick-figure arena game built with HTML5 Canvas and vanilla JavaScript. Features local PvP, an AI opponent, chests with pickups (guns, missiles, heals, speed boost), melee punches, dashing, homing missiles, and a simple progression system with level-up choices.

Project structure
-----------------
- game/
  - app.js        — Main game logic, rendering and AI.
  - index.html    — Page + menu markup.
  - style.css     — Styling for menu and HUD.
- study/          — misc experiments and utilities (not required to run the game)
- requirements.txt — (if present) environment information

Code architecture
-----------------
- Single-file game logic: `game/app.js` contains the game loop, physics, rendering and AI.
- Main loop: `requestAnimationFrame(loop)` drives physics updates and drawing.
- Data model: two player objects (`player1`, `player2`) and arrays for entities (`obstacles`, `spikes`, `chests`, `bullets`, `missiles`, `punches`, `popups`).
- UI: HUD and simple HTML overlay menus in `index.html`; inventory strips/popup drawn on the canvas.

Key functions (high-level)
--------------------------
- `loop(now)`
  - Core game update + render. Handles AI input generation, physics integration, collisions, entity updates, and draws world + HUD.

- `drawHealthBars()`
  - Renders player HUDs (HP, XP, level) and inventory/hotbar visuals. Calls inventory rendering when toggled.

- `drawInventoryStrip(player, side)`
  - Draws a vertical inventory strip (6 slots) on the left or right canvas edge when a player's inventory is open.

- `roundRect(ctx, x, y, w, h, r)`
  - Helper to create rounded rectangle paths used for HUD/inventory drawing.

- `attemptDash(owner, dir)`
  - Starts a dash for a player in `dir` if cooldowns allow. Sets dash state and velocity.

- `spawnChest()` / `openChest(player, chest)`
  - Spawns decorative chests on platforms periodically; opening a chest grants a random reward (heal, gun ammo, homing missile, or temporary speed boost).

- `spawnBullet(owner)` / `spawnMissile(owner, target)`
  - Create ranged projectiles. Bullets are straight shots that deduct ammo; missiles home in on a target.

- `applyLevelChoice(player, choice)`
  - Apply a chosen level-up reward: `hp` (+10 max HP) or `dmg` (+1 damage). Players receive a pending level-up on leveling.

- `resetGame()`
  - Resets player positions/state, clears entities (chests, bullets, missiles, popups), rebuilds obstacles and spikes, and restarts timers.

- World helpers: `buildObstacles()`, `spawnSpikes()`, `platformUnder(x,y)`
  - Generate random platforms, spike hazards and query platforms under a position.

- AI helpers: `aiShouldJump(pl, targetX, targetY)`, `isObstacleBlocking(pl, dir)`, pathfinding BFS logic
  - Used by the bot to chase players, seek chests, dodge, and parkour across platforms.

Controls / User manual
----------------------
Run locally
- From the repo root run a simple HTTP server and open the `game/index.html` in a browser:

```bash
# Python 3
python3 -m http.server 8000 --directory game
# then open http://localhost:8000 in your browser
```

Main menu
- Click `Play` to start a match vs bot.
- Click `Two Player` to start a local two-player match (P2 uses arrow keys).
- Use the lobby to toggle bot/human for player 2 and set basic options.

Controls
- Player 1 (left side):
  - Move left/right: `A` / `D`
  - Jump: `W`
  - Punch / shoot (if armed): `S`
  - Toggle inventory: `Q` (opens the left inventory strip)
  - Toggle infinite ammo (debug): `I`

- Player 2 (right side):
  - Move left/right: `ArrowLeft` / `ArrowRight`
  - Jump: `ArrowUp`
  - Punch / shoot (if armed): `ArrowDown`
  - Toggle inventory: `>` (Shift + `.`) or `?` (alternate)
  - Toggle infinite ammo (debug): `O`

Mechanics
- Melee: short-range punch with cooldown.
- Dash: double-tap left/right or AI-triggered dash with cooldown.
- Guns: picked up from chests. Each gun grants +3 ammo and increments `gunCount`.
- Missiles: homing projectiles spawned by chests.
- Inventory: press inventory key to reveal a 6-slot strip showing owned guns (HUD hides ammo/gun counts until inventory is open).
- Leveling: gain XP on kills; when leveling you receive a pending level-up and can click `+HP` or `+DMG` on the HUD to choose.

Notes and debugging
-------------------
- A `#debug-status` element on the page shows runtime counts for errors, chests, bullets and missiles.
- If click targets on the HUD appear unresponsive, confirm the page is served over HTTP (some browsers restrict canvas events in file:// context).

Contributing / Extending
------------------------
- The core logic resides in `game/app.js`. Consider splitting rendering, physics, and AI into separate modules for maintainability.
- To add new items or weapons: implement new chest reward branches in `openChest()` and add drawing logic in HUD/inventory.

License
-------
Include your preferred license when publishing to GitHub.
