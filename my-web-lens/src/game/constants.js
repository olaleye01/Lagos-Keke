// Game tuning + the hand-authored neighbourhood layout.
//
// Coordinates: right-handed, +Y up, metres. Row 0 of MAP is north (-Z), column 0 is west (-X).
// A heading `yaw` of 0 faces north (-Z); forward = (-sin(yaw), 0, -cos(yaw)).

/** Size of one map cell in metres. */
export const CELL = 6;

/**
 * Legend:
 *  #  boundary fence / bush (solid)
 *  R  tarmac main road (ring around the neighbourhood)
 *  M  muddy alley (shortcut)
 *  .  open dirt yard (walkable mud)
 *  B  house / shop (solid)
 *  T  palm tree in a yard (solid trunk, walkable around)
 */
const INTERIOR = [
    'BBBMBBBBMBBBBMBBB',
    'BTBMBBBBMBBBBMBTB',
    'BBBMBB..M..BBMBBB',
    'BBBMBBB.M.BBBMBBB',
    'MMMMMMMMMMMMMMMMM',
    'BBBMBBBBMBBBBMBBB',
    'BBTMBB....BBBMTBB',
    'BBBMBB.TT.BBBMBBB',
    'BBBMMM....MMMMBBB',
    'BBBMBB.TT.BBBMBBB',
    'BBTMBB....BBBMTBB',
    'BBBMBBBBMBBBBMBBB',
    'MMMMMMMMMMMMMMMMM',
    'BBBMBBB.M.BBBMBBB',
    'BBBMBB..M..BBMBBB',
    'BTBMBBBBMBBBBMBTB',
    'BBBMBBBBMBBBBMBBB'
];

const EDGE = '#'.repeat(INTERIOR[0].length + 4);
const ROAD = '#' + 'R'.repeat(INTERIOR[0].length + 2) + '#';

export const MAP = [EDGE, ROAD, ...INTERIOR.map(row => `#R${row}R#`), ROAD, EDGE];
export const GRID = MAP.length; // 21
export const HALF = (GRID - 1) / 2; // 10

export const cellCenter = (r, c) => ({ x: (c - HALF) * CELL, z: (r - HALF) * CELL });
export const worldToCell = (x, z) => ({ r: Math.round(z / CELL + HALF), c: Math.round(x / CELL + HALF) });
export const cellAt = (r, c) => (r < 0 || c < 0 || r >= GRID || c >= GRID ? '#' : MAP[r][c]);

export const GAME = {
    TIME_LIMIT: 90,
    CHECKPOINT_BONUS: 5, // seconds added per stop reached
    NPC_HIT_PENALTY: 2, // seconds lost when you bump a pedestrian
    CHECKPOINT_RADIUS: 3.4,
    COUNTDOWN: 3
};

export const BIKE = {
    RADIUS: 0.55,
    ROAD_MAX_SPEED: 10.5, // m/s on tarmac
    MUD_MAX_SPEED: 8.6, // m/s in the alleys – slower, but the route is much shorter
    ACCEL: 5.5,
    MUD_ACCEL: 4.2,
    COAST_DECEL: 3,
    BRAKE_DECEL: 16,
    TURN_RATE: 2.5, // rad/s at full steer
    WHEEL_RADIUS: 0.34
};

export const HAZARDS = {
    POTHOLE_COUNT: 16,
    POTHOLE_SPEED_KEEP: 0.4, // fraction of speed kept after hitting a pothole
    NPC_COUNT: 14,
    NPC_RADIUS: 0.4
};

/** Stops alternate between the north and south roads so every leg has a mud shortcut. */
export const CHECKPOINTS = [
    { name: "Mama Caro's Shop", r: 1, c: 10 },
    { name: 'Football Field', r: 19, c: 5 },
    { name: "Iya Basira's Bukka", r: 1, c: 15 },
    { name: 'Home Sweet Home', r: 19, c: 15 }
];

export const START = { r: 19, c: 10, yaw: 0 };
