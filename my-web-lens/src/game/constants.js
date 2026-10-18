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
    POTHOLE_PENALTY: 2, // seconds lost when you hit a pothole
    NPC_HIT_PENALTY: 2, // seconds lost when you bump a pedestrian
    VEHICLE_HIT_PENALTY: 5, // seconds lost when you collide with a vehicle
    CHECKPOINT_RADIUS: 3.4,
    COUNTDOWN: 3
};

/**
 * General collision toast shouts shared across NPCs and vehicles.
 */
export const GENERAL_COLLISION_SHOUTS = [
    'Watch road o!',
    'Oga look front!',
    'Wetin be this?!',
    'Comot for road!',
    'Ah ah, bicycle!'
];

export const VEHICLE_CONFIG = {
    // Welcome screen initial fleet offsets: distributed across all 4 main roads (North, West, South, East)
    // with South Road vehicles immediately cruising across the welcome camera view.
    WELCOME_OFFSETS: [
        // Outer lane (8 vehicles): North, West, South, East
        0.08, 0.19, 0.33, 0.44, 0.58, 0.69, 0.83, 0.94,
        // Inner lane (8 vehicles): North, East, South, West
        0.07, 0.18, 0.32, 0.43, 0.57, 0.68, 0.82, 0.93
    ],

    // Fleet of 16 vehicles (doubled from 8): authentic street mix (Danfos, Kekes, Cars, Okadas)
    // 8 on outer lane (counter-clockwise) and 8 on inner lane (clockwise).
    FLEET: [
        // Outer Lane (CCW: 0=North, 1=West, 2=South, 3=East)
        { type: 'danfo', speed: 7.6, lane: 'outer', road: 'north', offset01: 0.08 },
        { type: 'okada', speed: 8.3, lane: 'outer', road: 'north', offset01: 0.19 },
        { type: 'keke',  speed: 7.2, lane: 'outer', road: 'west',  offset01: 0.33 },
        { type: 'car',   speed: 8.0, lane: 'outer', road: 'west',  offset01: 0.44 },
        { type: 'danfo', speed: 7.5, lane: 'outer', road: 'south', offset01: 0.58 },
        { type: 'okada', speed: 8.4, lane: 'outer', road: 'south', offset01: 0.69 },
        { type: 'keke',  speed: 7.2, lane: 'outer', road: 'east',  offset01: 0.83 },
        { type: 'car',   speed: 7.9, lane: 'outer', road: 'east',  offset01: 0.94 },

        // Inner Lane (CW: 0=North, 1=East, 2=South, 3=West)
        { type: 'car',   speed: 8.0, lane: 'inner', road: 'north', offset01: 0.07 },
        { type: 'keke',  speed: 7.2, lane: 'inner', road: 'north', offset01: 0.18 },
        { type: 'danfo', speed: 7.6, lane: 'inner', road: 'east',  offset01: 0.32 },
        { type: 'okada', speed: 8.4, lane: 'inner', road: 'east',  offset01: 0.43 },
        { type: 'car',   speed: 7.9, lane: 'inner', road: 'south', offset01: 0.57 },
        { type: 'keke',  speed: 7.2, lane: 'inner', road: 'south', offset01: 0.68 },
        { type: 'danfo', speed: 7.5, lane: 'inner', road: 'west',  offset01: 0.82 },
        { type: 'okada', speed: 8.3, lane: 'inner', road: 'west',  offset01: 0.93 }
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
    TURN_RATE: 2.9, // rad/s at full steer
    WHEEL_RADIUS: 0.34,
    MAX_STAMINA: 100,
    STAMINA_DRAIN: 28,
    STAMINA_RECOVERY: 18,
    MIN_BOOST_STAMINA_PCT: 5 // Cutoff threshold: boost stops immediately if stamina is less than 5%
};

export const HAZARDS = {
    POTHOLE_COUNT: 0, // removed all potholes on the main road
    MUD_POTHOLE_COUNT: 10, // doubled mud potholes/puddles in the muddy alleys (from 5 to 10)
    POTHOLE_SPEED_KEEP: 0.4, // fraction of speed kept after hitting a pothole
    NPC_COUNT: 14,
    NPC_RADIUS: 0.4
};

/**
 * 9 distant checkpoints across opposite ends of the Hood (67m - 98m per leg).
 * Fits within the 2-minute (120s) Snapchat gameplay limit.
 */
export const CHECKPOINTS = [
    { name: 'Suya Corner', r: 6, c: 5, type: 'mud' },
    { name: "Zambezi Lane", r: 1, c: 15, type: 'road' },
    { name: 'Baobab Spot', r: 14, c: 15, type: 'mud' },
    { name: 'Uhuru Junction', r: 19, c: 5, type: 'road' },
    { name: 'Ketu Passage', r: 6, c: 15, type: 'mud' },
    { name: "Maasai Market", r: 1, c: 5, type: 'road' },
    { name: 'Yaba Lane', r: 14, c: 5, type: 'mud' },
    { name: 'Mzee Junction', r: 10, c: 19, type: 'road' },
    { name: 'Afisuru Shop', r: 19, c: 10, type: 'road' }
];

export const START = { r: 19, c: 10, yaw: 0 };

/**
 * 4 Interactive Speed Ramps placed on the four interior muddy alley streets.
 * Each ramp deterministically triggers a unique automatic bicycle stunt:
 *  - Ramp 1: Front-wheel lift (smooth wheelie-style jump)
 *  - Ramp 2: Forward somersault (complete front flip in the air)
 *  - Ramp 3: Backward somersault (complete backflip in the air)
 *  - Ramp 4: Stylish sideways spin (rotating rider and bicycle 360° in the air)
 */
export const SPEED_RAMPS = [
    {
        id: 1,
        name: 'West Mud Alley Kicker',
        street: 'West Alley (Col 5)',
        x: -30.0,
        z: 0.0,
        axis: 'z',
        stunt: 'wheelie',
        label: 'WHEELIE JUMP'
    },
    {
        id: 2,
        name: 'North Mud Alley Kicker',
        street: 'North Alley (Row 6)',
        x: -14.0,
        z: -24.0,
        axis: 'x',
        stunt: 'frontflip',
        label: 'FRONT SOMERSAULT'
    },
    {
        id: 3,
        name: 'East Mud Alley Kicker',
        street: 'East Alley (Col 15)',
        x: 30.0,
        z: 0.0,
        axis: 'z',
        stunt: 'backflip',
        label: 'BACK SOMERSAULT'
    },
    {
        id: 4,
        name: 'South Mud Alley Kicker',
        street: 'South Alley (Row 14)',
        x: 14.0,
        z: 24.0,
        axis: 'x',
        stunt: 'spin360',
        label: '360° SIDEWAYS SPIN'
    }
];
