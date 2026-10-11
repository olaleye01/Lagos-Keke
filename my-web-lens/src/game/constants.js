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
    'BBTMBBBBMBBBBMTBB',
    'BBBMBBB...BBBMBBB',
    'BBBMMMM...MMMMBBB',
    'BBBMBBB...BBBMBBB',
    'BBTMBBBBMBBBBMTBB',
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
    TIME_LIMIT: 85, // initial time in seconds
    MAX_SESSION_TIME: 120, // strict 2-minute Snapchat limit
    CHECKPOINT_BONUS: 5, // seconds added per stop reached
    NPC_HIT_PENALTY: 2, // seconds lost when you bump a pedestrian
    VEHICLE_HIT_PENALTY: 4, // seconds lost when you collide with a vehicle
    CHECKPOINT_RADIUS: 3.4,
    COUNTDOWN: 3
};

export const VEHICLE_CONFIG = {
    FLEET: [
        { type: 'danfo', speed: 7.6, lane: 'outer', offset01: 0.08 },
        { type: 'keke', speed: 6.2, lane: 'outer', offset01: 0.35 },
        { type: 'car', speed: 8.4, lane: 'outer', offset01: 0.68 },
        { type: 'okada', speed: 9.0, lane: 'outer', offset01: 0.90 },
        { type: 'okada', speed: 9.0, lane: 'inner', offset01: 0.12 },
        { type: 'danfo', speed: 7.4, lane: 'inner', offset01: 0.35 },
        { type: 'keke', speed: 6.4, lane: 'inner', offset01: 0.68 },
        { type: 'car', speed: 8.2, lane: 'inner', offset01: 0.88 }
    ]
};

export const BIKE = {
    RADIUS: 0.55,
    ROAD_MAX_SPEED: 10.5, // m/s on tarmac
    MUD_MAX_SPEED: 8.6, // m/s in the alleys – slower, but the route is much shorter
    SPRINT_MAX_SPEED: 13.6, // m/s when sprinting/pedalling hard
    ACCEL: 5.5,
    MUD_ACCEL: 4.2,
    SPRINT_ACCEL: 9.5,
    COAST_DECEL: 3,
    BRAKE_DECEL: 16,
    TURN_RATE: 2.5, // rad/s at full steer
    WHEEL_RADIUS: 0.34,
    MAX_STAMINA: 100,
    STAMINA_DRAIN: 28,
    STAMINA_RECOVERY: 18,
    MIN_BOOST_STAMINA_PCT: 5 // Cutoff threshold: boost stops immediately if stamina is less than 5%
};

export const HAZARDS = {
    POTHOLE_COUNT: 16,
    POTHOLE_SPEED_KEEP: 0.4, // fraction of speed kept after hitting a pothole
    NPC_COUNT: 14,
    NPC_RADIUS: 0.4
};

/**
 * 9 distant checkpoints across opposite ends of Lagos (67m - 98m per leg).
 * Fits within the 2-minute (120s) Snapchat gameplay limit.
 */
export const CHECKPOINTS = [
    { name: 'Suya Alley Mud Corner', r: 6, c: 5, type: 'mud' },
    { name: "Iya Basira's Bukka", r: 1, c: 15, type: 'road' },
    { name: 'Timber Yard Mud Route', r: 14, c: 15, type: 'mud' },
    { name: 'Football Field Gate', r: 19, c: 5, type: 'road' },
    { name: 'Ketu Mud Passage', r: 6, c: 15, type: 'mud' },
    { name: "Mama Caro's Provisions", r: 1, c: 5, type: 'road' },
    { name: 'Vulcanizer Mud Lane', r: 14, c: 5, type: 'mud' },
    { name: 'CMS Terminal East', r: 10, c: 19, type: 'road' },
    { name: 'Home Sweet Home', r: 19, c: 10, type: 'road' }
];

export const START = { r: 19, c: 10, yaw: 0 };
