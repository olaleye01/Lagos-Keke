import { Entity, Vec3 } from 'playcanvas';
import { GeoBuilder } from '../graphics/builder.js';
import { PALETTE, mulberry32, pick } from '../graphics/palette.js';
import { CELL, GRID, MAP, CHECKPOINTS, START, HAZARDS, cellAt, cellCenter, worldToCell } from './constants.js';

const HALF_CELL = CELL / 2;
const SIDES = {
    n: { dr: -1, dc: 0, nx: 0, nz: -1 },
    s: { dr: 1, dc: 0, nx: 0, nz: 1 },
    w: { dr: 0, dc: -1, nx: -1, nz: 0 },
    e: { dr: 0, dc: 1, nx: 1, nz: 0 }
};

const isWalkable = ch => ch === 'R' || ch === 'M' || ch === '.' || ch === 'T';
const shade = (col, k) => [col[0] * k, col[1] * k, col[2] * k];

/**
 * Deep open drain ringing the central courtyard (all distances measured outward from the map centre).
 * The rider is ~1.9 m tall on a ~1.8 m long bike, so a 3 m wide / 1.6 m deep channel reads as a
 * proper Hood storm drain without swallowing the whole courtyard.
 */
export const DRAIN = {
    S: 9.0,             // courtyard boundary (18m square)
    RI: 6.6,            // inner edge of the opening (courtyard side)
    RO: 9.0,            // outer edge of the opening (road alley side, 2.4m wide trench)
    D: 1.6,             // physical depth below road level
    BRIDGE_HALF: 0.8,   // plank bridge half-width (1.6m wide deck)
    PLANK_SPAN: 3.0,    // plank boards span across the 2.4m gap and rest 0.3m on each bank
    RAMP: 0.5           // approach transition ramp length
};
DRAIN.MID = (DRAIN.RI + DRAIN.RO) / 2; // 7.8m

/** Local frames for the four drain sides: lat = along the drain, out = distance from the map centre. */
const DRAIN_SIDES = {
    N: { ns: true, P: (lat, out, y) => new Vec3(lat, y, -out), local: (x, z) => ({ lat: x, out: -z }) },
    S: { ns: true, P: (lat, out, y) => new Vec3(lat, y, out), local: (x, z) => ({ lat: x, out: z }) },
    W: { ns: false, P: (lat, out, y) => new Vec3(-out, y, lat), local: (x, z) => ({ lat: z, out: -x }) },
    E: { ns: false, P: (lat, out, y) => new Vec3(out, y, lat), local: (x, z) => ({ lat: z, out: x }) }
};
const isCourtyardCell = (r, c) => r >= 9 && r <= 11 && c >= 9 && c <= 11;

export const ZEBRA_CROSSINGS = new Set([
    '1,5', '1,10', '1,15',
    '19,5', '19,15',
    '6,1', '14,1',
    '6,19', '14,19'
]);

/**
 * Owns the static neighbourhood: render geometry, collision, surface lookup, hazards and the minimap.
 */
export class HoodMap {
    constructor(app) {
        this.app = app;
        this.rand = mulberry32(1337);
        this.root = new Entity('Neighbourhood');
        /** @type {(null|{type:'box',minX:number,maxX:number,minZ:number,maxZ:number,h:number}|{type:'circle',x:number,z:number,r:number,h:number})[][]} */
        this.solids = [];
        this.potholes = [];
        this.crossings = [];
        this.checkpoints = CHECKPOINTS.map(cp => ({ ...cp, ...cellCenter(cp.r, cp.c) }));
        this.start = { ...cellCenter(START.r, START.c), yaw: START.yaw };

        // 3x3 spatial chunks so the camera frustum can cull most of the city
        this.chunks = Array.from({ length: 9 }, () => new GeoBuilder(this.rand));

        for (let r = 0; r < GRID; r++) {
            this.solids.push([]);
            for (let c = 0; c < GRID; c++) {
                this.solids[r].push(null);
                this._buildCell(r, c);
            }
        }
        this._placePotholes();
        this._placeCrossings();
        this._buildPoles();
        this._buildGuardrails();
        this.drainSolids = [];
        this._buildCenterGutterAndPlanks();

        this.chunks.forEach((b, i) => {
            if (b.vertexCount) this.root.addChild(b.toEntity(app, `Chunk${i}`));
        });
        this.root.addChild(this._buildSurroundings());
        app.root.addChild(this.root);
    }

    _chunk(r, c) {
        return this.chunks[Math.min(2, Math.floor(r / 7)) * 3 + Math.min(2, Math.floor(c / 7))];
    }

    // ------------------------------------------------------------------ cells

    _buildCell(r, c) {
        const ch = MAP[r][c];
        const b = this._chunk(r, c);
        const { x, z } = cellCenter(r, c);
        const x0 = x - HALF_CELL;
        const x1 = x + HALF_CELL;
        const z0 = z - HALF_CELL;
        const z1 = z + HALF_CELL;
        const rand = this.rand;

        switch (ch) {
            case 'R':
                this._buildRoad(b, r, c, x, z);
                break;
            case 'M':
                b.flat(x0, z0, x1, z1, 0, PALETTE.mud, 0.08);
                this._buildMudDetail(b, r, c, x, z);
                break;
            case '.': {
                // The central courtyard builds its own ground with a cut-out for the deep drain. Its cells still
                // draw into a discarded builder so the seeded RNG sequence (and every surrounding house) is unchanged.
                const g = isCourtyardCell(r, c) ? (this._scratch ||= new GeoBuilder(this.rand)) : b;
                g.flat(x0, z0, x1, z1, 0, PALETTE.yard, 0.1);
                if (rand() < 0.5) g.blob(x + (rand() - 0.5) * 3, 0.012, z + (rand() - 0.5) * 3, 0.8 + rand() * 0.6, 7, PALETTE.mudWet, rand);
                break;
            }
            case 'T':
                b.flat(x0, z0, x1, z1, 0, PALETTE.yard, 0.1);
                if (rand() < 0.6) b.blob(x + (rand() - 0.5) * 2, 0.012, z + (rand() - 0.5) * 2, 0.9 + rand() * 0.7, 7, PALETTE.mudWet, rand);
                this._addPalm(b, x, z, 1);
                this.solids[r][c] = { type: 'circle', x, z, r: 0.75, h: 6 };
                break;
            case 'B':
                b.flat(x0, z0, x1, z1, 0, PALETTE.lot, 0.1);
                this._buildHouse(b, r, c, x, z);
                break;
            case '#':
            default:
                this._buildPerimeterMarket(b, r, c, x, z);
                break;
        }
    }

    _roadAxis(r, c) {
        const horizontal = cellAt(r, c - 1) === 'R' || cellAt(r, c + 1) === 'R';
        const vertical = cellAt(r - 1, c) === 'R' || cellAt(r + 1, c) === 'R';
        if (horizontal && vertical) return 'corner';
        return horizontal ? 'x' : 'z';
    }

    _buildRoad(b, r, c, x, z) {
        const x0 = x - HALF_CELL;
        const z0 = z - HALF_CELL;
        const x1 = x + HALF_CELL;
        const z1 = z + HALF_CELL;
        // Uniform solid black asphalt main road surface
        b.flat(x0, z0, x1, z1, 0, PALETTE.tarmac, 0);
        const axis = this._roadAxis(r, c);
        if (ZEBRA_CROSSINGS.has(`${r},${c}`)) {
            // White pedestrian zebra crossing stripes
            const white = [240, 240, 240];
            if (axis === 'x') {
                for (let k = -2; k <= 2; k++) {
                    b.flat(x + k * 0.9 - 0.28, z - 2.4, x + k * 0.9 + 0.28, z + 2.4, 0.022, white);
                }
            } else if (axis === 'z') {
                for (let k = -2; k <= 2; k++) {
                    b.flat(x - 2.4, z + k * 0.9 - 0.28, x + 2.4, z + k * 0.9 + 0.28, 0.022, white);
                }
            }
        } else if (axis === 'x') {
            b.flat(x - 1.6, z - 0.08, x - 0.2, z + 0.08, 0.02, PALETTE.roadLine);
            b.flat(x + 1.4, z - 0.08, x + 2.8, z + 0.08, 0.02, PALETTE.roadLine);
        } else if (axis === 'z') {
            b.flat(x - 0.08, z - 1.6, x + 0.08, z - 0.2, 0.02, PALETTE.roadLine);
            b.flat(x - 0.08, z + 1.4, x + 0.08, z + 2.8, 0.02, PALETTE.roadLine);
        } else if (axis === 'corner') {
            // Corner road turn markings linking perpendicular roads
            const hasNorth = cellAt(r - 1, c) === 'R';
            const hasSouth = cellAt(r + 1, c) === 'R';
            const hasWest = cellAt(r, c - 1) === 'R';
            const hasEast = cellAt(r, c + 1) === 'R';

            if (hasNorth && hasEast) {
                b.flat(x - 0.08, z - 2.0, x + 0.08, z - 0.8, 0.02, PALETTE.roadLine);
                b.flat(x + 0.8, z - 0.08, x + 2.0, z + 0.08, 0.02, PALETTE.roadLine);
            } else if (hasNorth && hasWest) {
                b.flat(x - 0.08, z - 2.0, x + 0.08, z - 0.8, 0.02, PALETTE.roadLine);
                b.flat(x - 2.0, z - 0.08, x - 0.8, z + 0.08, 0.02, PALETTE.roadLine);
            } else if (hasSouth && hasEast) {
                b.flat(x - 0.08, z + 0.8, x + 0.08, z + 2.0, 0.02, PALETTE.roadLine);
                b.flat(x + 0.8, z - 0.08, x + 2.0, z + 0.08, 0.02, PALETTE.roadLine);
            } else if (hasSouth && hasWest) {
                b.flat(x - 0.08, z + 0.8, x + 0.08, z + 2.0, 0.02, PALETTE.roadLine);
                b.flat(x - 2.0, z - 0.08, x - 0.8, z + 0.08, 0.02, PALETTE.roadLine);
            }
        }
        // black-and-yellow Hood kerbs wherever the road meets a house or fence (never across roads or mud alleys)
        for (const key of Object.keys(SIDES)) {
            const s = SIDES[key];
            const n = cellAt(r + s.dr, c + s.dc);
            if (n !== 'B' && n !== '#') continue;
            for (let k = 0; k < 6; k++) {
                const t = -HALF_CELL + 0.5 + k;
                const col = k % 2 ? PALETTE.curbBlack : PALETTE.curbYellow;
                if (s.nz) b.boxAt(x + t, 0.06, z + s.nz * (HALF_CELL - 0.12), 1, 0.12, 0.24, col, 0, 0);
                else b.boxAt(x + s.nx * (HALF_CELL - 0.12), 0.06, z + t, 0.24, 0.12, 1, col, 0, 0);
            }
        }
    }

    _buildMudDetail(b, r, c, x, z) {
        const rand = this.rand;
        const vertical = isWalkable(cellAt(r - 1, c)) || isWalkable(cellAt(r + 1, c));
        const horizontal = isWalkable(cellAt(r, c - 1)) || isWalkable(cellAt(r, c + 1));
        // tyre ruts
        if (vertical) {
            b.flat(x - 1.0, z - HALF_CELL, x - 0.6, z + HALF_CELL, 0.008, PALETTE.mudDark, 0.08);
            b.flat(x + 0.6, z - HALF_CELL, x + 1.0, z + HALF_CELL, 0.008, PALETTE.mudDark, 0.08);
        }
        if (horizontal) {
            b.flat(x - HALF_CELL, z - 1.0, x + HALF_CELL, z - 0.6, 0.009, PALETTE.mudDark, 0.08);
            b.flat(x - HALF_CELL, z + 0.6, x + HALF_CELL, z + 1.0, 0.009, PALETTE.mudDark, 0.08);
        }
        if (rand() < 0.45) {
            b.blob(x + (rand() - 0.5) * 3.5, 0.014, z + (rand() - 0.5) * 3.5, 0.6 + rand() * 0.7, 7, PALETTE.mudWet, rand);
        }
    }

    _buildHouse(b, r, c, x, z) {
        const rand = this.rand;
        const sx = CELL * (0.88 + rand() * 0.06);
        const sz = CELL * (0.88 + rand() * 0.06);
        const twoStorey = rand() < 0.28;
        const h = twoStorey ? 5.4 + rand() * 0.8 : 2.7 + rand() * 0.6;
        const wall = pick(rand, PALETTE.walls);

        this.solids[r][c] = { type: 'box', minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, h: h + 1.5 };

        b.boxAt(x, 0.15, z, sx + 0.12, 0.3, sz + 0.12, [126, 116, 104]);
        b.boxAt(x, h / 2, z, sx, h, sz, wall, 0, 0.05);

        if (twoStorey) {
            b.boxAt(x, h * 0.5, z, sx + 0.08, 0.2, sz + 0.08, shade(wall, 0.8), 0, 0);
            b.boxAt(x, h + 0.25, z, sx + 0.1, 0.5, sz + 0.1, shade(wall, 1.05), 0, 0);
            b.flat(x - sx / 2 + 0.15, z - sz / 2 + 0.15, x + sx / 2 - 0.15, z + sz / 2 - 0.15, h + 0.51, [150, 146, 140]);
            // "Geepee" black water tank on the roof
            const tx = x + (rand() < 0.5 ? -1 : 1) * (sx / 2 - 1);
            const tz = z + (rand() < 0.5 ? -1 : 1) * (sz / 2 - 1);
            b.cylinder(GeoBuilder.trs(tx, h + 0.5, tz, 0, 0, 0, 0.6, 1.2, 0.6), 8, PALETTE.tank, 0.92, 0.1);
        } else {
            const roofH = 1.0 + rand() * 0.5;
            const roofCol = pick(rand, [PALETTE.roofRust, PALETTE.roofRust2, PALETTE.roofZinc, PALETTE.roofRust]);
            if (rand() < 0.65) {
                const alongX = rand() < 0.5;
                const len = (alongX ? sx : sz) + 0.7;
                const wid = (alongX ? sz : sx) + 0.7;
                b.gable(GeoBuilder.trs(x, h, z, 0, alongX ? 0 : 90, 0, len, roofH, wid), roofCol);
            } else {
                b.pyramid(GeoBuilder.trs(x, h, z, 0, 0, 0, sx + 0.7, roofH, sz + 0.7), roofCol);
            }
        }

        // facades: doors, windows, shop signs on sides that face a walkable cell
        const open = Object.entries(SIDES).filter(([, s]) => isWalkable(cellAt(r + s.dr, c + s.dc)));
        const roadSide = open.find(([, s]) => cellAt(r + s.dr, c + s.dc) === 'R');
        const doorSide = (roadSide || open[0] || [null])[0];
        const shutter = pick(rand, [PALETTE.windowBlue, PALETTE.windowGreen, PALETTE.windowDark]);

        const facade = (s, offset, y, w, hh, col, depth = 0.14) => {
            const half = s.nx ? sx / 2 : sz / 2;
            const px = x + s.nx * half + (s.nz ? offset : 0);
            const pz = z + s.nz * half + (s.nx ? offset : 0);
            if (s.nz) b.boxAt(px, y, pz, w, hh, depth, col, 0, 0.04);
            else b.boxAt(px, y, pz, depth, hh, w, col, 0, 0.04);
        };

        for (const [key, s] of open) {
            const isDoor = key === doorSide;
            if (isDoor) {
                facade(s, 0, 1.0, 1.0, 2.0, PALETTE.door, 0.16);
                if (roadSide && key === roadSide[0] && !twoStorey && rand() < 0.75) {
                    // shop sign + compact zinc awning strictly within lot boundary
                    facade(s, 0, h - 0.45, sx * 0.7, 0.6, pick(rand, PALETTE.signs), 0.2);
                    const half = s.nx ? sx / 2 : sz / 2;
                    const maxReach = Math.max(0.1, HALF_CELL - half - 0.15);
                    const ax = x + s.nx * (half + maxReach * 0.5);
                    const az = z + s.nz * (half + maxReach * 0.5);
                    const tilt = s.nz ? s.nz * 12 : 0;
                    const roll = s.nx ? -s.nx * 12 : 0;
                    b.box(GeoBuilder.trs(ax, 2.35, az, tilt, 0, roll, s.nz ? 2.2 : maxReach, 0.05, s.nz ? maxReach : 2.2), PALETTE.roofZinc);
                }
            }
            const winOffsets = isDoor ? [-1.6, 1.6] : [-1.2, 1.2];
            for (const o of winOffsets) {
                facade(s, o, 1.55, 0.85, 0.85, shutter);
                if (twoStorey) facade(s, o, h * 0.5 + 1.3, 0.85, 0.95, shutter);
            }
            if (twoStorey && isDoor) facade(s, 0, h * 0.5 + 1.3, 0.85, 0.95, shutter);
        }
    }

    /**
     * Builds a compact, charming roadside Hood kiosk shop directly behind the rider's initial spawn point.
     * Replaces the oversized two-storey residential block with a low-profile single-storey shop.
     */
    _buildSpawnRearShop(b, r, c, x, z) {
        const x0 = x - HALF_CELL;
        const x1 = x + HALF_CELL;
        const z0 = z - HALF_CELL;
        const z1 = z + HALF_CELL;

        // 1. Paved concrete sidewalk
        b.flat(x0, z0, x1, z1, 0.012, PALETTE.sidewalk, 0.04);

        // Shop dimensions: low-profile single storey (2.35m vs previous 6.4m!)
        const bWidth = 3.6;   // compact width
        const bDepth = 2.4;   // compact depth
        const bh = 2.35;      // single-storey height
        const bx = x;         // centered at x = 0
        const bz = z + 1.4;   // sits at z = 61.4, leaving open sidewalk in front (z = 57..60.2)

        // 2. Solid collision: compact and low-profile so elevated camera never collides
        this.solids[r][c] = {
            type: 'box',
            minX: bx - bWidth / 2 - 0.15,
            maxX: bx + bWidth / 2 + 0.15,
            minZ: bz - bDepth / 2 - 0.15,
            maxZ: z1,
            h: bh + 0.4
        };

        // 3. Shop Foundation & Walls
        // Concrete foundation curb
        b.boxAt(bx, 0.1, bz, bWidth + 0.15, 0.2, bDepth + 0.15, [145, 140, 132], 0, 0.04);

        // Vibrant sunny Hood yellow stucco shop walls
        const wallCol = [238, 185, 68]; // warm golden yellow
        b.boxAt(bx, bh / 2, bz, bWidth, bh, bDepth, wallCol, 0, 0.04);

        // Dark baseboard trim
        b.boxAt(bx, 0.22, bz, bWidth + 0.05, 0.25, bDepth + 0.05, [55, 65, 80], 0, 0);

        // 4. Corrugated Zinc Shed Roof (sloping back slightly)
        const roofOverhangW = bWidth + 0.6; // 4.2m
        const roofOverhangD = bDepth + 0.7; // 3.1m
        b.box(GeoBuilder.trs(bx, bh + 0.08, bz + 0.05, -7, 0, 0, roofOverhangW, 0.08, roofOverhangD), PALETTE.roofZinc);

        // 5. Open Service Counter Hatch & Ledge on front facade (facing North, -Z)
        const frontZ = bz - bDepth / 2;
        // Dark interior recess behind counter hatch
        b.boxAt(bx, 1.35, frontZ + 0.06, 2.2, 1.05, 0.14, [32, 28, 26], 0, 0);

        // Wooden serving counter ledge
        b.boxAt(bx, 0.88, frontZ - 0.16, 2.4, 0.1, 0.42, PALETTE.woodTable, 0, 0.05);

        // Goods displayed on the counter ledge (colorful soda bottles / snack jars)
        b.cylinder(GeoBuilder.trs(bx - 0.75, 0.98, frontZ - 0.15, 0, 0, 0, 0.05, 0.18, 0.05), 6, [210, 45, 40]); // Coca-cola bottle
        b.cylinder(GeoBuilder.trs(bx - 0.58, 0.98, frontZ - 0.15, 0, 0, 0, 0.05, 0.18, 0.05), 6, [245, 165, 30]); // Fanta bottle
        b.cylinder(GeoBuilder.trs(bx - 0.41, 0.98, frontZ - 0.15, 0, 0, 0, 0.05, 0.18, 0.05), 6, [45, 160, 75]);  // Sprite bottle
        b.boxAt(bx + 0.6, 1.02, frontZ - 0.15, 0.28, 0.22, 0.25, [240, 205, 90], 0, 0); // Plantain chips jar
        b.boxAt(bx + 0.85, 1.02, frontZ - 0.15, 0.24, 0.22, 0.24, [215, 80, 45], 0, 0); // Gala sausage jar

        // 6. Striped Fabric Sun Awning over the Counter
        // Alternating orange and yellow awning canopy sloping forward
        const awningY = bh - 0.28; // 2.07m
        const awningZ = frontZ - 0.42;
        b.box(GeoBuilder.trs(bx, awningY, awningZ, 18, 0, 0, 2.7, 0.05, 0.95), [235, 90, 40], 0, 0.05);
        // Yellow accent stripes on awning
        b.box(GeoBuilder.trs(bx - 0.65, awningY + 0.01, awningZ, 18, 0, 0, 0.35, 0.06, 0.96), [248, 215, 60], 0, 0);
        b.box(GeoBuilder.trs(bx + 0.65, awningY + 0.01, awningZ, 18, 0, 0, 0.35, 0.06, 0.96), [248, 215, 60], 0, 0);

        // 7. Colorful Shop Banner Signboard across upper front
        // Royal Blue banner with white/yellow trim
        b.boxAt(bx, bh - 0.05, frontZ - 0.06, 3.2, 0.48, 0.1, [32, 90, 195], 0, 0);
        // Accent border on sign
        b.boxAt(bx, bh - 0.05, frontZ - 0.115, 3.0, 0.38, 0.02, [245, 210, 50], 0, 0);
        b.boxAt(bx, bh - 0.05, frontZ - 0.125, 2.7, 0.26, 0.02, [245, 245, 250], 0, 0);

        // 8. Sidewalk Street Details in Front of the Shop
        // Stack of red & yellow beverage crates on the left
        const crateX = bx - 1.6;
        const crateZ = frontZ - 0.45;
        b.boxAt(crateX, 0.18, crateZ, 0.55, 0.36, 0.45, [210, 45, 40], 5, 0.04);
        b.boxAt(crateX + 0.05, 0.54, crateZ - 0.02, 0.55, 0.36, 0.45, [245, 175, 35], -8, 0.04);
        b.boxAt(crateX - 0.05, 0.88, crateZ + 0.03, 0.52, 0.34, 0.42, [210, 45, 40], 12, 0.04);

        // Small wooden customer bench on the right
        const benchX = bx + 1.55;
        const benchZ = frontZ - 0.4;
        b.boxAt(benchX, 0.38, benchZ, 1.1, 0.08, 0.38, PALETTE.woodTable, 0, 0.04); // seat
        b.boxAt(benchX - 0.42, 0.19, benchZ, 0.08, 0.38, 0.32, [60, 55, 50], 0, 0); // left leg
        b.boxAt(benchX + 0.42, 0.19, benchZ, 0.08, 0.38, 0.32, [60, 55, 50], 0, 0); // right leg

        // Roadside Sandwich Signboard on the sidewalk ("COLD DRINKS / RECHARGE CARD")
        const signBoardX = bx + 1.65;
        const signBoardZ = frontZ - 1.25;
        b.box(GeoBuilder.trs(signBoardX, 0.42, signBoardZ, 12, 0, 0, 0.55, 0.82, 0.06), [240, 205, 50], 0, 0.04);
        b.box(GeoBuilder.trs(signBoardX, 0.42, signBoardZ + 0.14, -12, 0, 0, 0.55, 0.82, 0.06), [240, 205, 50], 0, 0.04);
    }

    _buildPerimeterMarket(b, r, c, x, z) {
        // Special case: Directly behind the player's initial spawn position (r = 20, c = 10)
        // Build a charming, compact roadside provisions shop rather than an oversized residential tenement
        if (r === 20 && c === 10) {
            this._buildSpawnRearShop(b, r, c, x, z);
            return;
        }

        const rand = this.rand;
        const x0 = x - HALF_CELL;
        const x1 = x + HALF_CELL;
        const z0 = z - HALF_CELL;
        const z1 = z + HALF_CELL;

        // Paved concrete sidewalk with dusty edge
        b.flat(x0, z0, x1, z1, 0.012, PALETTE.sidewalk, 0.04);

        const openSides = Object.entries(SIDES).filter(([, s]) => cellAt(r + s.dr, c + s.dc) === 'R');

        if (openSides.length > 0) {
            const [, s] = openSides[0];
            const nx = s.nx;
            const nz = s.nz;

            // 1. Street-facing Hood building at the rear of the cell (away from road)
            const bDepth = 3.6;
            const bWidth = 5.8;
            const bx = x - nx * 1.2;
            const bz = z - nz * 1.2;
            const sx = nx !== 0 ? bDepth : bWidth;
            const sz = nz !== 0 ? bDepth : bWidth;
            const twoStorey = rand() < 0.5;
            const bh = twoStorey ? 5.6 + rand() * 0.8 : 3.2 + rand() * 0.6;
            const wallCol = pick(rand, PALETTE.walls);

            // Building base & walls
            b.boxAt(bx, bh / 2, bz, sx, bh, sz, wallCol, 0, 0.04);

            // Roof (rusty corrugated zinc)
            const roofCol = pick(rand, [PALETTE.roofRust, PALETTE.roofRust2, PALETTE.roofZinc]);
            b.gable(GeoBuilder.trs(bx, bh, bz, 0, nx !== 0 ? 90 : 0, 0, sx + 0.4, 1.1, sz + 0.4), roofCol);

            // Upper floor windows with shutters
            const winCol = pick(rand, [PALETTE.windowBlue, PALETTE.windowGreen, PALETTE.windowDark]);
            if (twoStorey) {
                const off1 = -1.4;
                const off2 = 1.4;
                const wx = bx + nx * (sx / 2 + 0.05);
                const wz = bz + nz * (sz / 2 + 0.05);
                if (nz !== 0) {
                    b.boxAt(bx + off1, bh - 1.2, wz, 0.9, 0.9, 0.1, winCol, 0, 0);
                    b.boxAt(bx + off2, bh - 1.2, wz, 0.9, 0.9, 0.1, winCol, 0, 0);
                } else {
                    b.boxAt(wx, bh - 1.2, bz + off1, 0.1, 0.9, 0.9, winCol, 0, 0);
                    b.boxAt(wx, bh - 1.2, bz + off2, 0.1, 0.9, 0.9, winCol, 0, 0);
                }
            }

            // Shop sign banner across the facade
            const signCol = pick(rand, PALETTE.signs);
            const frontWallX = bx + nx * (sx / 2 + 0.06);
            const frontWallZ = bz + nz * (sz / 2 + 0.06);
            if (nz !== 0) {
                b.boxAt(bx, 2.5, frontWallZ, 3.8, 0.65, 0.12, signCol, 0, 0);
            } else {
                b.boxAt(frontWallX, 2.5, bz, 0.12, 0.65, 3.8, signCol, 0, 0);
            }

            // GeePee black water tank on the roof
            if (rand() < 0.6) {
                const tx = bx + (rand() - 0.5) * 1.5;
                const tz = bz + (rand() - 0.5) * 1.5;
                b.cylinder(GeoBuilder.trs(tx, bh + 0.4, tz, 0, 0, 0, 0.55, 1.1, 0.55), 8, PALETTE.tank, 0.9, 0.08);
            }

            // Solid collision covering the building, stalls, and sidewalk up to the road kerb
            let minX = x - HALF_CELL;
            let maxX = x + HALF_CELL;
            let minZ = z - HALF_CELL;
            let maxZ = z + HALF_CELL;
            if (nx === 1) maxX = x + HALF_CELL - 0.15;
            else if (nx === -1) minX = x - HALF_CELL + 0.15;
            if (nz === 1) maxZ = z + HALF_CELL - 0.15;
            else if (nz === -1) minZ = z - HALF_CELL + 0.15;

            this.solids[r][c] = {
                type: 'box',
                minX,
                maxX,
                minZ,
                maxZ,
                h: bh + 2
            };

            // 2. Roadside Market Stalls on the sidewalk in front of the building
            const stallX = x + nx * 1.5;
            const stallZ = z + nz * 1.5;
            const stallChoice = Math.floor(rand() * 4);

            if (stallChoice === 0) {
                // Large colorful market umbrella + fruit/food table
                const umbCol = pick(rand, PALETTE.marketUmbrellas);
                b.cylinder(GeoBuilder.trs(stallX, 0, stallZ, 0, 0, 0, 0.04, 2.3, 0.04), 6, [60, 60, 60], 1, 0);
                b.pyramid(GeoBuilder.trs(stallX, 2.3, stallZ, 0, rand() * 45, 0, 2.5, 0.55, 2.5), umbCol, 0.12);
                const tw = nz !== 0 ? 1.6 : 0.85;
                const td = nz !== 0 ? 0.85 : 1.6;
                b.boxAt(stallX, 0.4, stallZ, tw, 0.8, td, PALETTE.woodTable, 0, 0.04);
                b.boxAt(stallX - 0.3, 0.86, stallZ, 0.4, 0.14, 0.4, PALETTE.fruitOrange, 0, 0);
                b.boxAt(stallX + 0.3, 0.86, stallZ, 0.4, 0.14, 0.4, PALETTE.fruitGreen, 0, 0);
                const crateCol = pick(rand, PALETTE.crates);
                const cx = stallX + (nz !== 0 ? (rand() < 0.5 ? 1.2 : -1.2) : 0);
                const cz = stallZ + (nx !== 0 ? (rand() < 0.5 ? 1.2 : -1.2) : 0);
                b.boxAt(cx, 0.2, cz, 0.55, 0.38, 0.45, crateCol, rand() * 20, 0);
                b.boxAt(cx, 0.55, cz, 0.52, 0.35, 0.42, crateCol, rand() * 20, 0);
            } else if (stallChoice === 1) {
                // Painted metal container kiosk / provision store
                const kioskCol = pick(rand, PALETTE.kioskMetal);
                const kw = nz !== 0 ? 2.3 : 1.5;
                const kd = nz !== 0 ? 1.5 : 2.3;
                b.boxAt(stallX, 1.1, stallZ, kw, 2.2, kd, kioskCol, 0, 0.04);
                b.boxAt(stallX, 2.24, stallZ, kw + 0.3, 0.08, kd + 0.3, PALETTE.roofZinc, 0, 0);
                const flapX = stallX + nx * (kd / 2 + 0.3);
                const flapZ = stallZ + nz * (kw / 2 + 0.3);
                const tilt = nz ? nz * 25 : 0;
                const roll = nx ? -nx * 25 : 0;
                b.box(GeoBuilder.trs(flapX, 1.85, flapZ, tilt, 0, roll, nz ? kw : 0.8, 0.05, nz ? 0.8 : kd), kioskCol, 0);
                const gx = stallX + (nz !== 0 ? 1.4 : 0);
                const gz = stallZ + (nx !== 0 ? 1.4 : 0);
                b.boxAt(gx, 0.28, gz, 0.65, 0.55, 0.55, [45, 45, 45], 0, 0.05);
                b.boxAt(gx + 0.4, 0.22, gz, 0.25, 0.4, 0.25, [246, 206, 52], 0, 0);
            } else if (stallChoice === 2) {
                // Roadside Bukka / Mama Put canteen with zinc shed
                const bw = nz !== 0 ? 2.5 : 1.2;
                const bd = nz !== 0 ? 1.2 : 2.5;
                for (const px of [-1, 1]) {
                    const postX = stallX + (nz !== 0 ? px * 1.1 : 0);
                    const postZ = stallZ + (nx !== 0 ? px * 1.1 : 0);
                    b.cylinder(GeoBuilder.trs(postX, 0, postZ, 0, 0, 0, 0.05, 2.2, 0.05), 6, PALETTE.trunk, 1, 0);
                }
                b.boxAt(stallX, 2.25, stallZ, bw + 0.4, 0.06, bd + 0.4, PALETTE.roofZinc, 0, 0.05);
                b.boxAt(stallX, 0.4, stallZ, bw * 0.8, 0.75, bd * 0.7, PALETTE.woodTable, 0, 0);
                b.cylinder(GeoBuilder.trs(stallX + (nz !== 0 ? 1.2 : 0), 0.2, stallZ + (nx !== 0 ? 1.2 : 0), 0, 0, 0, 0.35, 0.5, 0.35), 8, [28, 28, 30], 0.9, 0);
            } else {
                // Roadside Tyre Vulcanizer & Hawker stand
                for (let k = 0; k < 3; k++) {
                    b.cylinder(GeoBuilder.trs(stallX - (nz !== 0 ? 0.9 : 0), k * 0.22, stallZ - (nx !== 0 ? 0.9 : 0), 0, 0, 0, 0.4, 0.2, 0.4), 8, [30, 30, 32], 1, 0);
                }
                const umbCol = pick(rand, PALETTE.marketUmbrellas);
                b.pyramid(GeoBuilder.trs(stallX + (nz !== 0 ? 0.6 : 0), 2.2, stallZ + (nx !== 0 ? 0.6 : 0), 0, 0, 0, 1.8, 0.45, 1.8), umbCol, 0.1);
                b.cylinder(GeoBuilder.trs(stallX + (nz !== 0 ? 0.6 : 0), 0, stallZ + (nx !== 0 ? 0.6 : 0), 0, 0, 0, 0.04, 2.2, 0.04), 6, [60, 60, 60], 1, 0);
                b.boxAt(stallX + (nz !== 0 ? 0.6 : 0), 0.45, stallZ + (nx !== 0 ? 0.6 : 0), 0.9, 0.7, 0.7, PALETTE.woodTable, 0, 0);
            }
        } else {
            // Corner commercial plaza (at diagonal corners)
            const h = 7.2 + rand() * 1.5;
            const wCol = pick(rand, PALETTE.walls);
            b.boxAt(x, h / 2, z, 5.8, h, 5.8, wCol, 0, 0.04);
            b.pyramid(GeoBuilder.trs(x, h, z, 0, 0, 0, 6.2, 1.4, 6.2), PALETTE.roofRust);
            const billCol = pick(rand, PALETTE.signs);
            b.boxAt(x, h + 2.2, z, 3.8, 1.6, 0.15, billCol, 25, 0);
            b.boxAt(x - 1.2, h + 0.8, z, 0.1, 1.6, 0.1, [50, 50, 55], 0, 0);
            b.boxAt(x + 1.2, h + 0.8, z, 0.1, 1.6, 0.1, [50, 50, 55], 0, 0);
            this._addPalm(b, x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2, 1.1);

            this.solids[r][c] = {
                type: 'box',
                minX: x - 2.9,
                maxX: x + 2.9,
                minZ: z - 2.9,
                maxZ: z + 2.9,
                h: h + 2
            };
        }
    }

    _addPalm(b, x, z, scale) {
        const rand = this.rand;
        const h = (4.6 + rand() * 1.8) * scale;
        const tilt = 4 + rand() * 8;
        const yaw = rand() * 360;
        const trunk = GeoBuilder.trs(x, 0, z, tilt, yaw, 0, 0.2 * scale, h, 0.2 * scale);
        b.cylinder(trunk, 6, PALETTE.trunk, 0.65, 0.12);
        const top = trunk.transformPoint(new Vec3(0, 1, 0), new Vec3());
        const tx = top.x;
        const ty = top.y;
        const tz = top.z;
        const fronds = 7;
        for (let i = 0; i < fronds; i++) {
            const a = (i / fronds) * 360 + rand() * 20;
            const rad = (a * Math.PI) / 180;
            const droop = 22 + rand() * 18;
            const len = 2.4 * scale;
            const dx = Math.sin(rad);
            const dz = Math.cos(rad);
            const dy = -Math.sin((droop * Math.PI) / 180) * (len / 2);
            b.box(GeoBuilder.trs(tx + dx * len * 0.45, ty + dy, tz + dz * len * 0.45, droop, a, 0, 0.7 * scale, 0.07, len), i % 2 ? PALETTE.palm : PALETTE.palmDark, 0.15);
        }
        b.boxAt(tx, ty - 0.2, tz, 0.5 * scale, 0.4 * scale, 0.5 * scale, [96, 70, 40], 30, 0);
    }

    // ---------------------------------------------------------------- hazards

    _placePotholes() {
        const rand = this.rand;
        const candidates = [];
        const reserved = new Set([`${START.r},${START.c}`, ...CHECKPOINTS.map(cp => `${cp.r},${cp.c}`)]);
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (MAP[r][c] !== 'R') continue;
                const axis = this._roadAxis(r, c);
                if (axis === 'corner' || reserved.has(`${r},${c}`)) continue;
                if (Math.abs(r - START.r) + Math.abs(c - START.c) <= 1) continue;
                candidates.push({ r, c, axis });
            }
        }
        // shuffle
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (const cand of candidates.slice(0, HAZARDS.POTHOLE_COUNT)) {
            const { x, z } = cellCenter(cand.r, cand.c);
            const lateral = (rand() - 0.5) * 3.2;
            const along = (rand() - 0.5) * 3;
            const px = cand.axis === 'x' ? x + along : x + lateral;
            const pz = cand.axis === 'x' ? z + lateral : z + along;
            const radius = 0.75 + rand() * 0.35;
            this.potholes.push({ x: px, z: pz, r: radius, cooldown: 0 });
            const b = this._chunk(cand.r, cand.c);
            b.blob(px, 0.016, pz, radius, 9, PALETTE.potholeRim, rand, 0.35);
            b.blob(px, 0.024, pz, radius * 0.7, 8, PALETTE.potholeWater, rand, 0.3);
            // broken tarmac chunks around the rim
            for (let i = 0; i < 3; i++) {
                const a = rand() * Math.PI * 2;
                b.boxAt(px + Math.cos(a) * radius * 1.05, 0.04, pz + Math.sin(a) * radius * 1.05, 0.25, 0.08, 0.2, PALETTE.tarmacDark, rand() * 90, 0.1);
            }
        }
    }

    _placeCrossings() {
        // 1. Dedicated Zebra Crossings on the Main Ring Road
        for (const coord of ZEBRA_CROSSINGS) {
            const [r, c] = coord.split(',').map(Number);
            const axis = this._roadAxis(r, c);
            const { x, z } = cellCenter(r, c);
            const off = HALF_CELL - 0.45;
            const a = axis === 'x' ? { x, z: z - off } : { x: x - off, z };
            const b = axis === 'x' ? { x, z: z + off } : { x: x + off, z };
            this.crossings.push({ r, c, a, b, isMainRoad: true, axis });
        }

        // 2. Interior Mud Alley Crossings (shortcuts where no cars drive)
        const interiorCoords = [
            [6, 5], [6, 10], [6, 15],
            [14, 5], [14, 10], [14, 15]
        ];
        for (const [r, c] of interiorCoords) {
            if (MAP[r][c] !== 'M') continue;
            const { x, z } = cellCenter(r, c);
            const off = HALF_CELL - 0.5;
            const a = { x, z: z - off };
            const b = { x, z: z + off };
            this.crossings.push({ r, c, a, b, isMainRoad: false, axis: 'x' });
        }
    }

    _buildPoles() {
        // wooden electricity poles with sagging wires along the outer edge of the ring road
        const b = new GeoBuilder(this.rand);
        const poles = [];
        const outer = ((GRID - 1) / 2) * CELL - 2; // behind the fence, inside the boundary cells
        const step = CELL * 2;
        const lim = ((GRID - 3) / 2) * CELL;
        for (let t = -lim; t <= lim + 0.01; t += step) {
            poles.push([t, -outer], [t, outer]);
        }
        const H = 7;
        const lines = { n: [], s: [] };
        for (const [px, pz] of poles) {
            b.cylinder(GeoBuilder.trs(px, 0, pz, 0, 0, 0, 0.12, H, 0.12), 6, PALETTE.pole, 0.8, 0.1);
            b.boxAt(px, H - 0.4, pz, 0.12, 0.12, 1.6, PALETTE.pole, 0, 0.05);
            (pz < 0 ? lines.n : lines.s).push([px, pz]);
        }
        for (const list of Object.values(lines)) {
            for (let i = 0; i < list.length - 1; i++) {
                const [ax, az] = list[i];
                const [bx] = list[i + 1];
                // Keep the player starting view clear of crossing utility wires
                if (az > 0 && Math.abs((ax + bx) / 2) < 22) continue;
                for (const o of [-0.7, 0.7]) {
                    b.boxAt((ax + bx) / 2, H - 0.5, az + o, bx - ax, 0.03, 0.03, [20, 20, 20], 0, 0);
                }
            }
        }
        this.root.addChild(b.toEntity(this.app, 'Poles'));
    }

    _buildGuardrails() {
        // Metallic crash barriers along the outer perimeter of the main road
        const b = new GeoBuilder(this.rand);
        const outer = ((GRID - 3) / 2) * CELL + HALF_CELL - 0.2; // approx 56.8m
        const span = ((GRID - 3) / 2) * CELL + HALF_CELL; // approx 57m
        const railColor = [185, 185, 192];
        const stripeYellow = [246, 206, 52];
        const stripeBlack = [28, 28, 30];
        const postColor = [85, 85, 90];

        const step = 3.0; // support post every 3m
        for (let t = -span; t <= span + 0.01; t += step) {
            const isAlt = Math.floor(Math.abs(t) / step) % 2 === 0;
            const stripe = isAlt ? stripeYellow : stripeBlack;

            // North side (z = -outer)
            b.boxAt(t, 0.45, -outer, 0.14, 0.9, 0.14, postColor, 0, 0);
            b.boxAt(t, 0.55, -outer, step, 0.32, 0.08, railColor, 0, 0);
            b.boxAt(t, 0.55, -outer + 0.045, step * 0.48, 0.12, 0.02, stripe, 0, 0);

            // South side (z = +outer)
            b.boxAt(t, 0.45, outer, 0.14, 0.9, 0.14, postColor, 0, 0);
            b.boxAt(t, 0.55, outer, step, 0.32, 0.08, railColor, 0, 0);
            b.boxAt(t, 0.55, outer - 0.045, step * 0.48, 0.12, 0.02, stripe, 0, 0);

            // West side (x = -outer)
            b.boxAt(-outer, 0.45, t, 0.14, 0.9, 0.14, postColor, 0, 0);
            b.boxAt(-outer, 0.55, t, 0.08, 0.32, step, railColor, 0, 0);
            b.boxAt(-outer + 0.045, 0.55, t, 0.02, 0.12, step * 0.48, stripe, 0, 0);

            // East side (x = +outer)
            b.boxAt(outer, 0.45, t, 0.14, 0.9, 0.14, postColor, 0, 0);
            b.boxAt(outer, 0.55, t, 0.08, 0.32, step, railColor, 0, 0);
            b.boxAt(outer - 0.045, 0.55, t, 0.02, 0.12, step * 0.48, stripe, 0, 0);
        }

        this.root.addChild(b.toEntity(this.app, 'Guardrails'));
    }

    _buildCenterGutterAndPlanks() {
        // Chunk 4 (center chunk) contains the central 4-way intersection (r=9..11, c=9..11)
        const b = this._chunk(10, 10);
        const rand = this.rand;

        // Drain channel dimensions:
        const S = DRAIN.S;             // 9.0m courtyard boundary (18m square)
        const RI = DRAIN.RI;           // 6.6m inner edge of gutter (courtyard side)
        const RO = DRAIN.RO;           // 9.0m outer edge of gutter (road alley side, 2.4m wide channel)
        const D = DRAIN.D;             // 1.6m physical depth below road level
        const bridgeHalfW = DRAIN.BRIDGE_HALF; // 0.8m half-width (1.6m wide bridge)
        const plankLen = DRAIN.PLANK_SPAN;     // 3.0m plank boards spanning across the 2.4m gap
        const trenchWidth = RO - RI;   // 2.4m wide recessed trench
        const midOut = (RI + RO) / 2;  // 7.8m center of trench span

        // 1. CENTRAL COURTYARD MUD PLAZA (Strictly within [-RI, RI], ending at the drain edge)
        b.flat(-RI, -RI, RI, RI, 0.005, PALETTE.mud, 0.06);

        // North-South tyre tracks connecting North and South plank bridges:
        b.flat(-0.55, -RI, -0.25, RI, 0.012, PALETTE.mudDark, 0.04);
        b.flat(0.25, -RI, 0.55, RI, 0.012, PALETTE.mudDark, 0.04);

        // East-West tyre tracks connecting West and East plank bridges:
        b.flat(-RI, -0.55, RI, -0.25, 0.014, PALETTE.mudDark, 0.04);
        b.flat(-RI, 0.25, RI, 0.55, 0.014, PALETTE.mudDark, 0.04);

        // Curved drift ruts in the plaza linking perpendicular routes:
        for (const k of [-1, 1]) {
            for (const m of [-1, 1]) {
                b.flat(k * 1.3, m * 1.3, k * 2.7, m * 2.7, 0.011, PALETTE.mudDark, 0.05);
            }
        }

        // Wet mud puddle discs in the central area:
        b.blob(2.0, 0.018, 2.2, 1.2, 8, PALETTE.mudWet, rand);
        b.blob(-2.2, 0.018, -1.6, 1.1, 8, PALETTE.mudWet, rand);
        b.blob(1.6, 0.018, -2.2, 1.0, 7, PALETTE.mudWet, rand);

        // 2. CORNER SOLID PLATFORMS (NW, NE, SW, SE connecting the perimeter at y = 0.01)
        const corners = [
            { x0: -S, z0: -S, x1: -RI, z1: -RI }, // NW
            { x0: RI, z0: -S, x1: S, z1: -RI },   // NE
            { x0: -S, z0: RI, x1: -RI, z1: S },   // SW
            { x0: RI, z0: RI, x1: S, z1: S }      // SE
        ];
        for (const c of corners) {
            b.flat(c.x0, c.z0, c.x1, c.z1, 0.01, PALETTE.sidewalk, 0.05);
        }

        // 3. BUILD RECESSED DRAIN CHANNELS AND WOODEN PLANK BRIDGES ON ALL 4 APPROACHES
        const buildGutterAndBridge = (sideKey) => {
            const side = DRAIN_SIDES[sideKey];
            const isNS = side.ns;

            // Two open gutter wings flanking the central wooden plank bridge:
            // Wing A: from -RI (-6.6m) to -bridgeHalfW (-0.8m) -> length 5.8m
            // Wing B: from +bridgeHalfW (+0.8m) to +RI (+6.6m) -> length 5.8m
            const wings = [
                [-RI, -bridgeHalfW],
                [bridgeHalfW, RI]
            ];

            for (const [w0, w1] of wings) {
                const wingLen = w1 - w0;
                const midLat = (w0 + w1) / 2;

                // Local box helper:
                // lat: lateral distance along channel (-RI..RI)
                // y: vertical height
                // out: outward distance from center (RI..RO)
                const boxLocal = (lat, y, out, sLat, sY, sOut, color, yaw = 0, jitter = 0.03) => {
                    if (isNS) {
                        const worldZ = (sideKey === 'N') ? -out : out;
                        b.boxAt(lat, y, worldZ, sLat, sY, sOut, color, yaw, jitter);
                    } else {
                        const worldX = (sideKey === 'W') ? -out : out;
                        b.boxAt(worldX, y, lat, sOut, sY, sLat, color, yaw, jitter);
                    }
                };

                // Local horizontal flat quad helper:
                const flatLocal = (lat0, out0, lat1, out1, y, color, jitter = 0) => {
                    if (isNS) {
                        const z0 = (sideKey === 'N') ? -out1 : out0;
                        const z1 = (sideKey === 'N') ? -out0 : out1;
                        b.flat(lat0, z0, lat1, z1, y, color, jitter);
                    } else {
                        const x0 = (sideKey === 'W') ? -out1 : out0;
                        const x1 = (sideKey === 'W') ? -out0 : out1;
                        b.flat(x0, lat0, x1, lat1, y, color, jitter);
                    }
                };

                // --- A. DRAIN FLOOR (Positioned 1.6m below road level!) ---
                // Dark muddy brown concrete trench floor
                flatLocal(w0, RI, w1, RO, -D, PALETTE.drainFloor, 0.05);

                // Murky stagnant water plane (12cm dirty water depth)
                flatLocal(w0 + 0.06, RI + 0.08, w1 - 0.06, RO - 0.08, -D + 0.12, PALETTE.gutterWater);

                // Floating green algae patches & slime slicks
                flatLocal(w0 + 0.35, RI + 0.3, w1 - 0.35, RO - 0.3, -D + 0.125, PALETTE.gutterSlime, 0.08);

                // Authentic low-poly debris on the drain bed: discarded water sachet & concrete chunk
                const sachetPos = w0 + wingLen * 0.45;
                boxLocal(sachetPos, -D + 0.13, RI + 0.7, 0.22, 0.02, 0.15, PALETTE.sachetWhite, 22, 0);
                boxLocal(sachetPos, -D + 0.14, RI + 0.7, 0.12, 0.01, 0.08, PALETTE.sachetBlue, 22, 0);
                boxLocal(w0 + wingLen * 0.72, -D + 0.16, RO - 0.5, 0.28, 0.18, 0.20, [135, 130, 122], 15, 0.05);

                // --- B. OUTER WALL (Road side lip and descending concrete wall) ---
                // Descends from road (y=0) down to floor (y=-1.6) in multi-shaded depth bands:
                boxLocal(midLat, -0.25, RO, wingLen, 0.50, 0.18, PALETTE.drainWallTop, 0, 0.02);
                boxLocal(midLat, -0.75, RO, wingLen, 0.50, 0.18, PALETTE.drainWallMid, 0, 0.02);
                boxLocal(midLat, -1.25, RO, wingLen, 0.50, 0.18, PALETTE.drainWallLow, 0, 0.02);
                boxLocal(midLat, -D + 0.20, RO - 0.02, wingLen, 0.14, 0.14, PALETTE.drainAlgae, 0, 0.02);

                // Raised light beige concrete outer curb lip (y = +0.05, height 0.08m, overhanging)
                boxLocal(midLat, 0.05, RO + 0.08, wingLen, 0.08, 0.26, PALETTE.drainCap, 0, 0.02);
                // Angular shadow strip under the overhanging lip
                boxLocal(midLat, -0.03, RO - 0.02, wingLen, 0.06, 0.06, [46, 42, 38], 0, 0);

                // --- C. INNER WALL (Courtyard side lip and descending concrete wall facing chase camera) ---
                boxLocal(midLat, -0.25, RI, wingLen, 0.50, 0.18, PALETTE.drainWallTop, 0, 0.02);
                boxLocal(midLat, -0.75, RI, wingLen, 0.50, 0.18, PALETTE.drainWallMid, 0, 0.02);
                boxLocal(midLat, -1.25, RI, wingLen, 0.50, 0.18, PALETTE.drainWallLow, 0, 0.02);
                boxLocal(midLat, -D + 0.20, RI + 0.02, wingLen, 0.14, 0.14, PALETTE.drainAlgae, 0, 0.02);

                // Raised light beige concrete inner curb lip (y = +0.05, height 0.08m, overhanging)
                boxLocal(midLat, 0.05, RI - 0.08, wingLen, 0.08, 0.26, PALETTE.drainCap, 0, 0.02);
                boxLocal(midLat, -0.03, RI + 0.02, wingLen, 0.06, 0.06, [46, 42, 38], 0, 0);

                // --- D. END WALL (Sealing channel at corner platform boundary) ---
                const endLat = (w0 === -RI) ? -RI : RI;
                boxLocal(endLat, -D / 2, midOut, 0.18, D, trenchWidth, PALETTE.drainWallMid, 0, 0.03);
            }

            // --- E. WOODEN PLANK BRIDGE SPANNING THE 2.4m GAP ---
            const boxBridge = (lat, y, out, sLat, sY, sOut, color, yaw = 0, jitter = 0.04) => {
                if (isNS) {
                    const worldZ = (sideKey === 'N') ? -out : out;
                    b.boxAt(lat, y, worldZ, sLat, sY, sOut, color, yaw, jitter);
                } else {
                    const worldX = (sideKey === 'W') ? -out : out;
                    b.boxAt(worldX, y, lat, sOut, sY, sLat, color, yaw, jitter);
                }
            };

            // 1. Two underlying heavy timber stringer runner beams spanning across the trench
            for (const sLat of [-0.52, 0.52]) {
                boxBridge(sLat, 0.015, midOut, 0.16, 0.14, plankLen, PALETTE.plankWoodDark, 0, 0.02);
            }

            // 2. Central vertical timber support prop descending down into the deep trench
            for (const sLat of [-0.52, 0.52]) {
                boxBridge(sLat, -D / 2 + 0.02, midOut, 0.14, D, 0.14, PALETTE.plankWoodDark, 0, 0.02);
            }
            boxBridge(0, -0.06, midOut, 1.25, 0.09, 0.14, PALETTE.plankWoodDark, 0, 0.02);

            // 3. Individual rough-hewn timber boards laid side by side across the 1.6m width (5 planks)
            // with visible 0.035m gaps showing through to the deep drain below
            const plankCount = 5;
            const plankW = (bridgeHalfW * 2 - 0.12) / plankCount; // ~0.296m each

            for (let i = 0; i < plankCount; i++) {
                const off = -bridgeHalfW + 0.06 + (i + 0.5) * plankW;
                const woodCol = (i % 3 === 0) ? PALETTE.plankWoodLight : (i % 3 === 1 ? PALETTE.plankWood : PALETTE.plankWoodDark);
                const lenJitter = plankLen + (rand() - 0.5) * 0.16;
                const yOff = 0.055 + (rand() - 0.5) * 0.006;

                // Plank board with visible gap
                boxBridge(off, yOff, midOut, plankW - 0.035, 0.05, lenJitter, woodCol, (rand() - 0.5) * 1.5, 0.06);

                // Hand-driven iron nails over the 2 runner stringers
                boxBridge(off, yOff + 0.028, midOut - 1.1, 0.04, 0.01, 0.04, PALETTE.plankNail, 0, 0);
                boxBridge(off, yOff + 0.028, midOut + 1.1, 0.04, 0.01, 0.04, PALETTE.plankNail, 0, 0);
            }

            // 4. Longitudinal side guide kerb logs along bridge edges
            for (const gLat of [-bridgeHalfW + 0.03, bridgeHalfW - 0.03]) {
                boxBridge(gLat, 0.095, midOut, 0.06, 0.05, plankLen - 0.06, PALETTE.plankWoodDark, 0, 0.02);
            }

            // 5. Packed mud transition approach ramps at both bridge landings
            const flatBridge = (lat0, out0, lat1, out1, y, color) => {
                if (isNS) {
                    const z0 = (sideKey === 'N') ? -out1 : out0;
                    const z1 = (sideKey === 'N') ? -out0 : out1;
                    b.flat(lat0, z0, lat1, z1, y, color);
                } else {
                    const x0 = (sideKey === 'W') ? -out1 : out0;
                    const x1 = (sideKey === 'W') ? -out0 : out1;
                    b.flat(x0, lat0, x1, lat1, y, color);
                }
            };
            flatBridge(-bridgeHalfW, RO, bridgeHalfW, RO + DRAIN.RAMP, 0.025, PALETTE.mudDark);
            flatBridge(-bridgeHalfW, RI - DRAIN.RAMP, bridgeHalfW, RI, 0.025, PALETTE.mudDark);

            // 6. Prominent reflective warning marker bollards tightly flanking the bridge landings
            for (const bLat of [-bridgeHalfW - 0.14, bridgeHalfW + 0.14]) {
                for (const bOut of [RO + 0.4, RI - 0.4]) {
                    boxBridge(bLat, 0.32, bOut, 0.14, 0.64, 0.14, PALETTE.trunk, 0, 0.05);
                    boxBridge(bLat, 0.56, bOut, 0.16, 0.14, 0.16, PALETTE.curbYellow, 0, 0);
                    boxBridge(bLat, 0.44, bOut, 0.15, 0.08, 0.15, PALETTE.curbBlack, 0, 0);
                }
            }
        };

        // Construct gutter channels and wooden plank bridges on all 4 cardinal approaches:
        buildGutterAndBridge('N');
        buildGutterAndBridge('S');
        buildGutterAndBridge('W');
        buildGutterAndBridge('E');

        // 4. CORNER PROPS & STALLS (Firmly situated on the solid corner platforms)
        // NW corner platform: Suya wood table & shelter
        b.boxAt(-7.6, 0.45, -7.6, 1.8, 0.9, 1.1, PALETTE.plankWood, 0, 0.04);
        b.gable(GeoBuilder.trs(-7.6, 1.6, -7.6, 0, 0, 0, 2.4, 0.6, 1.8), PALETTE.roofRust);
        this.solids[9][9] = { type: 'box', minX: -8.6, maxX: -6.6, minZ: -8.6, maxZ: -6.6, h: 2.2 };

        // NE corner platform: stack of used tyres & timber crates
        b.cylinder(GeoBuilder.trs(7.6, 0, -7.6, 0, 0, 0, 0.5, 0.28, 0.5), 8, PALETTE.tank, 1, 0);
        b.cylinder(GeoBuilder.trs(7.6, 0.28, -7.6, 0, 0, 0, 0.5, 0.28, 0.5), 8, PALETTE.tank, 1, 0);
        b.cylinder(GeoBuilder.trs(7.6, 0.56, -7.6, 0, 0, 0, 0.5, 0.28, 0.5), 8, PALETTE.tank, 1, 0);
        this.solids[9][11] = { type: 'circle', x: 7.6, z: -7.6, r: 0.8, h: 1.0 };

        // SW corner platform: generator set & fuel cans
        b.boxAt(-7.6, 0.25, 7.6, 0.9, 0.5, 0.7, [220, 180, 40], 0, 0.05);
        b.boxAt(-7.0, 0.22, 7.6, 0.35, 0.44, 0.35, [210, 45, 35], 0, 0.05);
        this.solids[11][9] = { type: 'box', minX: -8.2, maxX: -6.8, minZ: 7.0, maxZ: 8.2, h: 0.9 };

        // SE corner platform: wooden provisions vendor stall
        b.boxAt(7.6, 0.42, 7.6, 1.6, 0.84, 0.9, PALETTE.plankWoodLight, 0, 0.04);
        b.pyramid(GeoBuilder.trs(7.6, 1.5, 7.6, 0, 0, 0, 2.0, 0.7, 1.5), [240, 186, 40]);
        this.solids[11][11] = { type: 'box', minX: 6.6, maxX: 8.6, minZ: 6.9, maxZ: 8.3, h: 2.2 };
    }

    // ----------------------------------------------------------- surroundings

    _buildSurroundings() {
        const rand = mulberry32(101);
        const b = new GeoBuilder(rand);
        const E = 320;

        // Warm urban laterite ground stretching to the horizon with central courtyard cutout
        // (so the 1.6m deep drain is never clipped or covered by the distant horizon ground plane)
        const C = 9.2;
        b.flat(-E, -E, E, -C, -0.04, PALETTE.lot, 0.08);
        b.flat(-E, C, E, E, -0.04, PALETTE.lot, 0.08);
        b.flat(-E, -C, -C, C, -0.04, PALETTE.lot, 0.08);
        b.flat(C, -C, E, C, -0.04, PALETTE.lot, 0.08);

        // Safe clearance distance around the square map:
        // The outer perimeter of the playable neighbourhood is at ±63m (GRID 21 * CELL 6 / 2 = 63m).
        // Roads are at ±54m. Perimeter shops are at 57m..63m.
        // We enforce that any surrounding building must have its center at least 76m away from the center along the square axis,
        // so with building half-width (up to 5.5m), every building stays strictly > 70m away, leaving a > 13m wide buffer from the road.
        const minCenterDist = (GRID / 2) * CELL + 13.0; // 76.0m

        const ensureClearance = (x, z, minDist) => {
            const curMax = Math.max(Math.abs(x), Math.abs(z));
            if (curMax < minDist) {
                const scale = (minDist + 1.0) / Math.max(0.01, curMax);
                return { x: x * scale, z: z * scale };
            }
            return { x, z };
        };

        // 1. Dense middle-ground neighborhood (76m to 140m) - optimized density
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2 + (rand() - 0.5) * 0.15;
            const d = minCenterDist + 4 + rand() * 65;
            const { x, z } = ensureClearance(Math.cos(a) * d, Math.sin(a) * d, minCenterDist);

            if (rand() < 0.72) {
                // Multi-storey residential tenement buildings
                const sx = 5.5 + rand() * 5.0;
                const sz = 5.5 + rand() * 5.0;
                const storeys = rand() < 0.4 ? 3 : rand() < 0.7 ? 2 : 1;
                const h = storeys * 3.0 + rand() * 1.0;
                const yaw = rand() * 90;
                const wallCol = pick(rand, PALETTE.walls);
                b.boxAt(x, h / 2, z, sx, h, sz, wallCol, yaw, 0.05);

                // Zinc roof
                b.pyramid(GeoBuilder.trs(x, h, z, 0, yaw, 0, sx + 0.6, 1.4, sz + 0.6), pick(rand, [PALETTE.roofRust, PALETTE.roofRust2, PALETTE.roofZinc]));

                // GeePee water tanks
                if (rand() < 0.45) {
                    b.cylinder(GeoBuilder.trs(x + (rand() - 0.5) * 2, h + 0.5, z + (rand() - 0.5) * 2, 0, 0, 0, 0.6, 1.2, 0.6), 6, PALETTE.tank, 0.9, 0.05);
                }
            } else {
                // Palm tree / tropical cluster
                this._addPalm(b, x, z, 1.1 + rand() * 0.5);
            }
        }

        // 2. High telecom masts & large roadside billboards in the neighborhood
        for (let j = 0; j < 6; j++) {
            const a = (j / 6) * Math.PI * 2 + rand() * 0.3;
            const d = minCenterDist + 18 + rand() * 50;
            const { x, z } = ensureClearance(Math.cos(a) * d, Math.sin(a) * d, minCenterDist + 15);

            if (j % 2 === 0) {
                // Telecom lattice mast (32m tall with red warning beacon)
                const mastH = 30 + rand() * 6;
                b.cylinder(GeoBuilder.trs(x, 0, z, 0, 0, 0, 0.45, mastH, 0.15), 4, [160, 160, 165], 0.3, 0);
                b.boxAt(x, mastH, z, 0.6, 0.6, 0.6, [240, 40, 40], 0, 0); // red light
            } else {
                // Giant roadside billboard
                const billW = 9.0;
                const billH = 4.5;
                const postH = 9.0;
                const billCol = pick(rand, [[246, 206, 52], [220, 50, 45], [40, 145, 75]]); // MTN yellow, Airtel red, Glo green
                b.cylinder(GeoBuilder.trs(x - 2.5, 0, z, 0, 0, 0, 0.25, postH, 0.25), 5, [70, 70, 75], 1, 0);
                b.cylinder(GeoBuilder.trs(x + 2.5, 0, z, 0, 0, 0, 0.25, postH, 0.25), 5, [70, 70, 75], 1, 0);
                b.boxAt(x, postH + billH / 2, z, billW, billH, 0.3, billCol, (a * 180) / Math.PI, 0);
            }
        }

        // 3. Distant skyline background (140m to 210m)
        for (let k = 0; k < 36; k++) {
            const a = (k / 36) * Math.PI * 2 + (rand() - 0.5) * 0.1;
            const d = 140 + rand() * 70;
            const { x, z } = ensureClearance(Math.cos(a) * d, Math.sin(a) * d, minCenterDist + 35);
            const sx = 8 + rand() * 6;
            const sz = 8 + rand() * 6;
            const h = 7 + rand() * 7;
            b.boxAt(x, h / 2, z, sx, h, sz, pick(rand, PALETTE.walls), rand() * 90, 0.05);
            b.pyramid(GeoBuilder.trs(x, h, z, 0, 0, 0, sx + 0.8, 1.8, sz + 0.8), PALETTE.roofRust);
        }

        return b.toEntity(this.app, 'Surroundings', { castShadows: false });
    }

    // ------------------------------------------------------------------ queries

    /** @returns {'road'|'mud'} */
    surfaceAt(x, z) {
        const { r, c } = worldToCell(x, z);
        return cellAt(r, c) === 'R' ? 'road' : 'mud';
    }

    /**
     * Checks if a point (x, z) is currently inside an open gutter section (not safely on a wooden plank bridge).
     * @param {number} x
     * @param {number} z
     * @param {number} radius
     * @returns {boolean}
     */
    isInOpenGutter(x, z, radius = 0.28) {
        const RI = DRAIN.RI; // 6.6m inner edge
        const RO = DRAIN.RO; // 9.0m outer edge (2.4m wide channel)
        const bridgeSafeHalfW = DRAIN.BRIDGE_HALF; // 0.8m bridge safe threshold (width 1.6m)

        // North gutter (z in [-RO, -RI])
        if (z >= -RO - radius && z <= -RI + radius && Math.abs(x) <= RI + 0.4) {
            if (Math.abs(x) > bridgeSafeHalfW) return true;
        }
        // South gutter (z in [RI, RO])
        if (z >= RI - radius && z <= RO + radius && Math.abs(x) <= RI + 0.4) {
            if (Math.abs(x) > bridgeSafeHalfW) return true;
        }
        // West gutter (x in [-RO, -RI])
        if (x >= -RO - radius && x <= -RI + radius && Math.abs(z) <= RI + 0.4) {
            if (Math.abs(z) > bridgeSafeHalfW) return true;
        }
        // East gutter (x in [RI, RO])
        if (x >= RI - radius && x <= RO + radius && Math.abs(z) <= RI + 0.4) {
            if (Math.abs(z) > bridgeSafeHalfW) return true;
        }

        return false;
    }

    /**
     * Push a circle out of all nearby solids. Mutates `pos` ({x, z}).
     * @returns {{hit: boolean, nx: number, nz: number}}
     */
    resolveCircle(pos, radius) {
        // Rigid perimeter guardrail clamping: never allow bicycle to leave the map bounds
        const GUARD_LIMIT = 56.4;
        let clamped = false;
        let cnx = 0;
        let cnz = 0;
        if (pos.x < -GUARD_LIMIT) { pos.x = -GUARD_LIMIT; clamped = true; cnx = 1; }
        else if (pos.x > GUARD_LIMIT) { pos.x = GUARD_LIMIT; clamped = true; cnx = -1; }
        if (pos.z < -GUARD_LIMIT) { pos.z = -GUARD_LIMIT; clamped = true; cnz = 1; }
        else if (pos.z > GUARD_LIMIT) { pos.z = GUARD_LIMIT; clamped = true; cnz = -1; }

        const result = { hit: clamped, nx: cnx, nz: cnz };
        for (let iter = 0; iter < 2; iter++) {
            const { r, c } = worldToCell(pos.x, pos.z);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const rr = r + dr;
                    const cc = c + dc;
                    let s;
                    if (rr < 0 || cc < 0 || rr >= GRID || cc >= GRID) {
                        const { x, z } = cellCenter(rr, cc);
                        s = { type: 'box', minX: x - HALF_CELL, maxX: x + HALF_CELL, minZ: z - HALF_CELL, maxZ: z + HALF_CELL };
                    } else {
                        s = this.solids[rr][cc];
                    }
                    if (!s) continue;
                    let nx = 0;
                    let nz = 0;
                    let pen = 0;
                    if (s.type === 'circle') {
                        const dx = pos.x - s.x;
                        const dz = pos.z - s.z;
                        const d = Math.hypot(dx, dz);
                        const min = radius + s.r;
                        if (d >= min || d < 1e-6) continue;
                        nx = dx / d;
                        nz = dz / d;
                        pen = min - d;
                    } else {
                        const qx = Math.max(s.minX, Math.min(pos.x, s.maxX));
                        const qz = Math.max(s.minZ, Math.min(pos.z, s.maxZ));
                        const dx = pos.x - qx;
                        const dz = pos.z - qz;
                        const d = Math.hypot(dx, dz);
                        if (d >= radius) continue;
                        if (d > 1e-6) {
                            nx = dx / d;
                            nz = dz / d;
                            pen = radius - d;
                        } else {
                            // centre inside the box: leave along the shallowest axis
                            const opts = [
                                [pos.x - s.minX, -1, 0],
                                [s.maxX - pos.x, 1, 0],
                                [pos.z - s.minZ, 0, -1],
                                [s.maxZ - pos.z, 0, 1]
                            ].sort((a, b2) => a[0] - b2[0]);
                            nx = opts[0][1];
                            nz = opts[0][2];
                            pen = opts[0][0] + radius;
                        }
                    }
                    pos.x += nx * pen;
                    pos.z += nz * pen;
                    result.hit = true;
                    result.nx += nx;
                    result.nz += nz;
                }
            }
        }
        const len = Math.hypot(result.nx, result.nz);
        if (len > 0) {
            result.nx /= len;
            result.nz /= len;
        }
        return result;
    }

    /** True if a camera at this point would be inside a building or fence. */
    blocksCamera(x, y, z) {
        const { r, c } = worldToCell(x, z);
        if (r < 0 || c < 0 || r >= GRID || c >= GRID) return y < 2.5;
        const s = this.solids[r][c];
        if (!s || s.type !== 'box') return false;
        const m = 0.4;
        return x > s.minX - m && x < s.maxX + m && z > s.minZ - m && z < s.maxZ + m && y < s.h + 0.6;
    }

    // ------------------------------------------------------------------ minimap

    /** Pre-render the static minimap into an offscreen canvas. */
    renderMinimapBase(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const px = size / GRID;
        const colors = { R: '#2a2c30', M: '#b0623a', '.': '#c07a4a', T: '#c07a4a', B: '#2a1d14', '#': '#38281d' };
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const ch = MAP[r][c];
                ctx.fillStyle = colors[ch] || '#000';
                ctx.fillRect(c * px, r * px, px + 0.5, px + 0.5);
                if (ch === 'B') {
                    ctx.fillStyle = '#4a3527';
                    ctx.fillRect(c * px + px * 0.12, r * px + px * 0.12, px * 0.76, px * 0.76);
                } else if (ch === '#') {
                    ctx.fillStyle = '#423023';
                    ctx.fillRect(c * px + px * 0.15, r * px + px * 0.15, px * 0.7, px * 0.7);
                    // Draw colorful market stall dot if bordering the road
                    const facesRoad = Object.values(SIDES).some(s => cellAt(r + s.dr, c + s.dc) === 'R');
                    if (facesRoad) {
                        ctx.fillStyle = (r + c) % 2 === 0 ? '#f6ce34' : '#e04030';
                        ctx.beginPath();
                        ctx.arc((c + 0.5) * px, (r + 0.5) * px, px * 0.22, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (ch === 'T') {
                    ctx.fillStyle = '#3f8a3a';
                    ctx.beginPath();
                    ctx.arc((c + 0.5) * px, (r + 0.5) * px, px * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.fillStyle = '#1b1b1d';
        for (const p of this.potholes) {
            const { mx, my } = this.toMinimap(p.x, p.z, size);
            ctx.beginPath();
            ctx.arc(mx, my, px * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }
        return canvas;
    }

    toMinimap(x, z, size) {
        const span = GRID * CELL;
        return { mx: (x / span + 0.5) * size, my: (z / span + 0.5) * size };
    }
}
