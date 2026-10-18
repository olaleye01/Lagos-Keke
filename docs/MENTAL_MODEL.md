# Pedal Rush – Architecture & Mental Model Guide

> **System Overview**: Pedal Rush is an ultra-optimized, low-poly 3D bicycle arcade game built specifically for the **Snapchat Web Lens** platform and modern mobile/desktop web browsers. It runs on the **PlayCanvas Engine (v2.23+)** with vanilla HTML5/CSS3 and `@snap/web-lens-api`.

---

## 1. Executive Summary & Core Philosophy

Pedal Rush puts the player in the seat of a bicycle rider racing against the clock through vibrant, bustling city streets ("The Hood"). To win, the player must navigate through 9 distant checkpoints scattered across outer tarmac ring roads and hazardous interior muddy shortcuts.

```
       +-----------------------------------------------------------+
       |                  PEDAL RUSH ARCHITECTURE                  |
       +-----------------------------------------------------------+
       |                                                           |
       |  +------------------+   +-------------------------------+ |
       |  |   HTML5 UI / HUD |   |     PlayCanvas 3D Engine      | |
       |  |  (DOM Overlay)   |   |   (Procedural WebGL Scene)    | |
       |  +--------+---------+   +---------------+---------------+ |
       |           |                             |                 |
       |           v                             v                 |
       |  +-----------------------------------------------------+  |
       |  |              Main Orchestrator (main.js)             |  |
       |  |       Game State Machine, Camera, Render Loop       |  |
       |  +---+--------------------+------------------------+---+  |
       |      |                    |                        |      |
       |      v                    v                        v      |
       |  +-------+          +-----------+            +----------+ |
       |  | Player|          | AI Traffic|            | Procedural| |
       |  |Phys/FX|          |  & NPCs   |            |   World  | |
       |  +-------+          +-----------+            +----------+ |
       |      |                    |                        |      |
       |      +--------------------+------------------------+      |
       |                           |                               |
       |                           v                               |
       |       +---------------------------------------+           |
       |       | Snap Web Lens Bridge (snapLens.js)    |           |
       |       |  Leaderboards | Bitmoji | Cloud Storage|           |
       |       +---------------------------------------+           |
       +-----------------------------------------------------------+
```

### Core Design Principles
1. **Zero External Heavy Assets (Payload < 1.2 MB Zipped)**:
   - There are **no 3D `.gltf`/`.glb` files** or raster texture packs loaded over the network for the map, vehicles, or characters.
   - Everything—buildings, shacks, trees, bicycle, Danfos, Kekes, Okadas, and pedestrians—is generated procedurally in code using low-poly primitive builders (`GeoBuilder`) and vertex colors.
   - There are **no external `.mp3`/`.wav` audio files**. The entire soundscape (rolling tires, sprint wind whoosh, horns, checkpoint chimes, crash impacts, crowds) is synthesized in real time via the Web Audio API (`audio.js`).
2. **Snapchat Web Lens First**:
   - Built to run seamlessly inside the Snapchat app viewport with full support for Snapchat Bitmoji (2D profile portrait), Native In-Lens Leaderboards, and Persistent Cloud Storage.
   - The 3D Bitmoji is deliberately **not** mounted on the rider: Snap's GLB ships in T-pose with no animation clips (it can't ride/pedal) and costs ~2.5 MB + memory on low-end devices.
   - Adheres strictly to Snapchat's **120-second hard session limit** with a fast-paced 85-second baseline countdown extended by +5-second checkpoint bonuses.
3. **Graceful Desktop & Web Fallbacks**:
   - When opened outside Snapchat (e.g. desktop Chrome, Safari, mobile web), the engine gracefully detects stub mode and swaps in local storage, SVG avatar fallbacks, and standard keyboard/touch controls without crashing.

---

## 2. What We Built (Subsystem Inventory)

The codebase is organized cleanly inside `my-web-lens/src/`:

```
my-web-lens/
├── index.html                   # Arcade UI, DOM HUD, Overlays & Modals
├── package.json                 # Dependencies (playcanvas, @snap/web-lens-api, vite, terser)
├── vite.config.js               # Minification, chunking, and asset packaging rules
└── src/
    ├── main.js                  # Master application orchestrator & game loop
    ├── style.css                # Glassmorphism, animations, sticker-bubble UI
    ├── game/
    │   ├── constants.js         # Map matrix, bike tuning, checkpoints, ramps, vehicle configs
    │   ├── player.js            # Bicycle dynamics, lean, sprint stamina, stunt animation
    │   ├── map.js               # 21x21 procedural city generator, solids, drain, ramps
    │   ├── vehicles.js          # 16-car multi-lane autonomous AI traffic system
    │   ├── npcs.js              # Pedestrian crowd simulation & crossing AI
    │   ├── racingLine.js        # Dynamic 3D pathfinding chevrons to current checkpoint
    │   ├── input.js             # Touch drag-to-steer, steer meter, keyboard listeners
    │   ├── audio.js             # Zero-byte procedural Web Audio synthesizer
    │   └── snapLens.js          # Snapchat Web Lens SDK bridge with offline fallback
    └── graphics/
        ├── builder.js           # Procedural mesh geometry builder (tri, quad, box, cylinder)
        ├── models.js            # Low-poly model generators (Bicycle, Danfo, Keke, Okada, etc.)
        └── palette.js           # Authentic African street color palette & seeded RNG
```

### Detailed Subsystem Breakdown

| File / Component | Role & Responsibility | Key Dependencies |
| :--- | :--- | :--- |
| **`src/main.js`** | Controls game lifecycle states (`TITLE`, `COUNTDOWN`, `PLAYING`, `PAUSED`, `GAMEOVER`, `VICTORY`), coordinates camera views, updates HUD (timer, stamina, speedometer, minimap), dispatches collisions, and manages the preloader. | PlayCanvas, all game & graphic modules |
| **`src/game/map.js`** | Builds the 21x21 grid world into 9 frustum-culled spatial chunks. Places buildings, shacks, vegetation, street poles, guardrails, zebra crossings, potholes, the central courtyard storm drain with wooden bridges, and speed kickers. | `builder.js`, `constants.js`, `palette.js` |
| **`src/game/player.js`** | Simulates bike physics: acceleration, braking, friction on tarmac vs mud, banking/leaning on turns, stamina consumption during sprint, jump stunts (wheelie, frontflip, backflip, 360° spin), and headlight rigging. | `models.js`, `constants.js` |
| **`src/game/vehicles.js`** | Manages a fleet of 16 autonomous AI traffic vehicles (Danfos, Okadas, Kekes, cars) moving on inner/outer perimeter ring road lanes with collision avoidance, following distance, and horn triggers. | `models.js`, `constants.js` |
| **`src/game/npcs.js`** | Spawns and animates pedestrians crossing at zebra locations. Features proximity panic (npcs run when bike speeds nearby) and shouts humorous collision toasts. | `models.js`, `constants.js` |
| **`src/game/racingLine.js`** | Computes shortest waypoint path from player to active checkpoint and renders an animated, additive glowing double-chevron ribbon on the road surface. | `builder.js`, `constants.js` |
| **`src/game/snapLens.js`** | Wraps `@snap/web-lens-api`. Handles the 2D Bitmoji portrait, high-score cloud storage sync, and native leaderboard dialog presentation. | `@snap/web-lens-api`, `localStorage` |
| **`src/game/audio.js`** | Procedural Web Audio synthesizer generating bicycle rolling noise, wind dash effects, horns, checkpoint chimes, and crash impacts with zero external audio assets. | Web Audio API |
| **`src/game/input.js`** | Unified input handling: drag-anywhere pointer steering, steer meter, dedicated sprint/brake buttons, and WASD/arrow keys. | DOM Event Listeners |

---

## 3. What It Does (Gameplay Mechanics & Rules)

```
                    +-----------------------------+
                    |    Loading Screen (100%)    |
                    +--------------+--------------+
                                   |
                                   v
                    +-----------------------------+
                    |  TITLE STATE (Welcome Screen|
                    |  - Orbiting Turntable Cam   |
                    |  - 16 Vehicles Cruising     |
                    |  - Noon / Night Mode Switch |
                    |  - Leaderboards & Bitmoji   |
                    +--------------+--------------+
                                   | (Player Taps "RIDE NOW")
                                   v
                    +-----------------------------+
                    |   COUNTDOWN STATE (3..2..1) |
                    |   Camera drops behind rider |
                    +--------------+--------------+
                                   |
                                   v
                    +-----------------------------+
    +-------------->|        PLAYING STATE        |<-------------+
    |               |  - Clock ticks from 85s down|              |
    |               |  - Steer, Sprint, Brake     |              |
    |               +--------------+--------------+              |
    |                              |                             |
    |             +----------------+----------------+            |
    |             |                                 |            |
    |   [Checkpoint Hit]                   [Obstacle Collision]   |
    |   - +5 Seconds Bonus                 - Pothole: -2s        |
    |   - Next Checkpoint active           - Pedestrian: -2s     |
    |   - Racing line updates              - Vehicle: -5s        |
    |             |                        - Drain Drop: Respawn |
    |             |                                 |            |
    |             +----------------+----------------+            |
    |                              |                             |
    +------------------------------+                             |
                                   |                             |
                 +-----------------+-----------------+           |
                 |                                   |           |
                 v                                   v           |
      [All 9 Checkpoints Clear]                 [Timer Hits 0]   |
                 |                                   |           |
                 v                                   v           |
        +-----------------+                 +-----------------+  |
        |  VICTORY STATE  |                 | GAMEOVER STATE  |  |
        | - Score & Stars |                 | - "Time's Up!"  |  |
        | - Bitmoji Cheer |                 | - Final Score   |  |
        | - Submit Score  |                 | - Try Again CTA |  |
        +--------+--------+                 +--------+--------+  |
                 |                                   |           |
                 +-----------------+-----------------+           |
                                   | (Tap "RIDE AGAIN")          |
                                   +-----------------------------+
```

### Game Balancing & Mechanics
- **Timer & Checkpoints**: Starts at **85.0s**. There are **9 checkpoints** (Suya Corner, Zambezi Lane, Baobab Spot, Uhuru Junction, Ketu Passage, Maasai Market, Yaba Lane, Mzee Junction, Afisuru Shop). Reaching a checkpoint awards **+5 seconds**.
- **Tarmac vs Mud**:
  - *Tarmac Roads*: Fast top speed (10.5 m/s), smooth rolling, but longer routes with vehicular traffic.
  - *Muddy Alleys*: Slower top speed (8.6 m/s) and mud drag, but cuts substantial distance off each checkpoint leg.
- **Sprint / Dash Boost**:
  - Player can sprint up to **13.6 m/s**.
  - Sprints consume stamina (drain rate 28/s). Recharges when coasting (recovery 18/s).
  - Sprint activates speed-lines canvas overlay, dynamic FOV camera widening, and wind tunnel SFX.
- **Speed Ramps & Stunts**:
  - 4 kickers located in mud alleys trigger automatic aerial stunts:
    1. West Alley: Wheelie Jump
    2. North Alley: Front Somersault (front flip)
    3. East Alley: Back Somersault (back flip)
    4. South Alley: 360° Sideways Spin
- **Hazards & Penalties**:
  - *Potholes*: -2 seconds penalty + speed dropped to 40%.
  - *Pedestrian Bump*: -2 seconds penalty + pedestrian panic toast shout.
  - *Vehicle Crash*: -5 seconds penalty + bicycle wipeout crash reaction.
  - *Storm Drain Fall*: If the rider falls off the plank bridge into the 1.6m deep courtyard drain, the screen flashes with a strobe overlay and the rider is safely respawned at the entrance.
- **Noon & Night Race Modes**:
  - Independent day/night toggle with persistent high scores tracked separately for Noon and Night races.
  - Night mode activates dynamic streetlights, glowing windows, and bicycle spotlight + omni fill.

---

## 4. How It Works (Technical Under the Hood)

### A. Procedural Geometry & Draw Call Optimization (`map.js` + `builder.js`)
Instead of loading dozens of 3D meshes that cause frame stutters and high draw-call counts:
1. `GeoBuilder` constructs dynamic vertex buffers storing positions, normals, and 32-bit packed vertex colors (`[R, G, B]`).
2. The 21x21 grid world is divided into **9 spatial chunks** (3x3 grid).
3. Each chunk merges all its static buildings, pavement, shacks, and trees into a single mesh instance with an unlit or basic diffuse material.
4. The PlayCanvas engine frustum-culls non-visible chunks, keeping draw calls ultra-low (< 35 draw calls) and frame rates pegged at 60 FPS on mobile.

### B. Parametric AI Traffic System (`vehicles.js`)
Vehicle paths are computed with closed-form mathematical precision:
- `LoopTrack`: Evaluates the track coordinate distance `s` along a rectangular loop with corner fillet arcs.
- Quadrant arithmetic determines vehicle heading yaw and world `(x, z)` smoothly through 90-degree curved corners.
- Traffic vehicles scan forward along their lane. If a car detects another vehicle ahead within threshold distance, it decelerates to match speeds, eliminating unrealistic pile-ups.

### C. Dynamic Racing Line (`racingLine.js`)
- Uses a grid graph pathfinder across walkable road/mud cells to calculate shortest route to the active checkpoint.
- Spawns procedural double-chevron arrow meshes that undulate with an additive glowing shader.
- As the player rides forward, chevrons behind the rider fade out, while chevrons ahead pulse toward the goal.

### D. Audio Synthesis Engine (`audio.js`)
- Standard browser `AudioContext`.
- Rolling tire noise: White noise generator fed through a modulated `BiquadFilterNode` (cutoff frequency scaled by bicycle speed).
- Bells & Chimes: Sine wave oscillators with fast exponential gain decays.
- Horns: Dual sawtooth oscillators slightly detuned (e.g. 240 Hz + 360 Hz) for authentic dual-tone Danfo horns.

### E. Snapchat Web Lens Bridge (`snapLens.js`)
- Initializes `@snap/web-lens-api`.
- Checks capabilities via `snapchat.isSupported('leaderboards')`, `snapchat.isSupported('bitmoji')`, and `snapchat.isSupported('storage')`.
- Safe asynchronous storage pipeline: writes are queued sequentially via chained promises (`pendingSave`) to avoid `ERR_QUOTA_EXCEEDED` on Snapchat's rate-limited backend.
- LocalStorage mirror: seeds state synchronously on startup, ensuring the game renders instantly even if network initialization lags.

---

## 5. How It Can Fail (Failure Modes & Edge Cases)

Understanding how the system can fail helps in diagnosing and preventing bugs:

```
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| Failure Mode              | Root Cause                                            | Symptom / Impact                                    |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 1. Audio Stays Silent     | Web Audio Autoplay Policy                             | No sound plays even though game is running.         |
|                           | AudioContext suspended until user gesture.            | Console warning: "AudioContext was not allowed..."  |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 2. Snap API Errors        | Missing capability check in stub / desktop browser    | Uncaught TypeError calling undefined snapchat API   |
|                           | (e.g. calling openLeaderboard without isSupported)   | Leaderboard modal fails or crashes application      |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 3. WebGL Context Loss     | Mobile RAM pressure, app switching, or GPU crash      | Screen goes black, canvas freezes, error in log:    |
|                           |                                                       | "WebGL context lost"                                |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 4. Cloud Storage Quota    | Rapid score updates firing parallel async requests    | Promise rejection: ERR_QUOTA_EXCEEDED               |
|                           |                                                       | New high scores fail to persist to cloud            |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 5. Physics Tunneling      | Low FPS spike (<15 FPS) during high speed sprint      | Rider clips through drain edge or solid wall        |
|                           | Large frame delta moves rider across colliders        | Rider gets stuck inside building geometry           |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
| 6. Bundle Size Rejection  | Accidentally importing large libs, 3D glTF, or mp3s   | Snapchat Lens Studio rejects upload:                |
|                           | Exceeding uncompressed 4MB / compressed 2MB limit     | "Lens bundle exceeds maximum allowed size"          |
+---------------------------+-------------------------------------------------------+-----------------------------------------------------+
```

---

## 6. How to Get It Back Up (Operations & Recovery Playbook)

### Step 1: Starting the Local Development Environment
Navigate to the subproject folder and run the Vite dev server:
```bash
cd /Users/mac/Documents/GitHub/Lagos-Keke/my-web-lens
npm install
npm run dev
```
Open `http://localhost:5173` in Chrome or Safari. Use Mobile Device Emulation (Cmd+Shift+M in Chrome DevTools) to test touch gestures.

### Step 2: Testing the Production Build Locally
Always test the minified bundle before packaging for Snapchat:
```bash
cd /Users/mac/Documents/GitHub/Lagos-Keke/my-web-lens
npm run build
npx vite preview --port 4173
```
Open `http://localhost:4173`. Ensure no Terser mangling bugs exist and all UI buttons respond.

### Step 3: Packaging for Snapchat Web Lens
To package the lens for upload to Snapchat Lens Studio or the Web Lens Developer Portal:
```bash
cd /Users/mac/Documents/GitHub/Lagos-Keke/my-web-lens
npm run build
# Ensure dist/ contains only index.html and assets/
cd dist
zip -r ../pedal-rush-v1.zip ./*
```
Verify `pedal-rush-v1.zip` is smaller than 2 MB (current build is ~1.1 MB).

---

## 7. Quick Troubleshooting & Diagnostics

### Problem A: "Sound isn't playing when the game starts"
- **Diagnosis**: The user did not trigger a direct `pointerdown` event on an unlocked element, or `audio.unlock()` was not invoked inside the tap handler.
- **Fix**: Check `main.js` line ~600 (`btnPlay.addEventListener('pointerdown', () => audio.unlock())`). Ensure audio unlocking is bound to `pointerdown` rather than delayed asynchronous callbacks.

### Problem B: "Leaderboard or Bitmoji button causes a crash"
- **Diagnosis**: Code attempted to invoke `snapchat.openLeaderboard()` or access Bitmoji without checking `snapLens.leaderboardsSupported`.
- **Fix**: Wrap all platform calls in feature guard conditionals:
  ```javascript
  if (snapLens.leaderboardsSupported) {
      snapLens.openNativeLeaderboard();
  } else {
      // Fallback to in-game DOM leaderboard modal
      openCustomLeaderboard();
  }
  ```

### Problem C: "Player falls through the floor or clips through drain walls"
- **Diagnosis**: Delta time spike (`dt > 0.1s`).
- **Fix**: Ensure frame delta clamping in `main.js`:
  ```javascript
  app.on('update', (dt) => {
      const clampedDt = Math.min(dt, 0.05); // cap at 20 FPS step equivalent
      player.update(clampedDt);
  });
  ```

### Problem D: "High score resets when closing the lens"
- **Diagnosis**: Asynchronous `snapchat.setStorage()` did not finish before the page unloaded.
- **Fix**: Ensure `visibilitychange` flushes any pending save data immediately:
  ```javascript
  document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
          snapLens.flushSave();
      }
  });
  ```

---

## 8. Key Reference Constants

For quick game balancing and adjustments, modify `src/game/constants.js`:

```javascript
export const GAME = {
    TIME_LIMIT: 85,             // Base race timer in seconds
    MAX_SESSION_TIME: 120,      // Hard Snapchat 2-minute session cap
    CHECKPOINT_BONUS: 5,        // Seconds added per checkpoint
    POTHOLE_PENALTY: 2,         // Seconds deducted on pothole hit
    NPC_HIT_PENALTY: 2,         // Seconds deducted on pedestrian bump
    VEHICLE_HIT_PENALTY: 5,     // Seconds deducted on vehicle crash
    CHECKPOINT_RADIUS: 3.4      // Checkpoint trigger radius in metres
};

export const BIKE = {
    ROAD_MAX_SPEED: 10.5,       // Max speed on tarmac (m/s)
    MUD_MAX_SPEED: 8.6,         // Max speed in muddy alleys (m/s)
    SPRINT_MAX_SPEED: 13.6,     // Max sprint speed (m/s)
    MAX_STAMINA: 100,           // Max stamina pool
    STAMINA_DRAIN: 28,          // Stamina consumed per second sprinting
    STAMINA_RECOVERY: 18        // Stamina restored per second coasting
};
```
