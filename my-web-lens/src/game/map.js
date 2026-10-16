import { Entity, Vec3, Color } from 'playcanvas';
import { GeoBuilder } from '../graphics/builder.js';
import { PALETTE, mulberry32, pick } from '../graphics/palette.js';
import { CELL, GRID, MAP, CHECKPOINTS, START, HAZARDS, SPEED_RAMPS, cellAt, cellCenter, worldToCell } from './constants.js';

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
    BRIDGE_HALF: 0.42,  // plank bridge half-width (0.84m total width: challenging to safely pass!)
    PLANK_SPAN: 3.0,    // plank boards span across the 2.4m gap and rest 0.3m on each bank
    RAMP: 0.45          // approach transition ramp length
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
        this.ramps = SPEED_RAMPS.map(r => ({ ...r, cooldown: 0 }));

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
        this._buildSpeedRamps();
        this.drainSolids = [];
        this._buildCenterGutterAndPlanks();
        this.streetLights = [];
        this.alleyBulbs = [];
        this.mood = 'afternoon';
        this._buildStreetLights();
        this._buildMudAlleyBulbs();

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
                this._buildMudAlley(b, r, c, x, z);
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

    _buildMudAlley(b, r, c, x, z) {
        const rand = this.rand;
        const x0 = x - HALF_CELL;
        const z0 = z - HALF_CELL;

        const hasNorth = isWalkable(cellAt(r - 1, c));
        const hasSouth = isWalkable(cellAt(r + 1, c));
        const hasWest = isWalkable(cellAt(r, c - 1));
        const hasEast = isWalkable(cellAt(r, c + 1));
        const vertical = hasNorth || hasSouth;
        const horizontal = hasWest || hasEast;

        // Subdivided low-poly mesh grid (5x5 quads = 6x6 vertices = 50 faceted triangles)
        const N = 5;
        const verts = [];

        for (let j = 0; j <= N; j++) {
            const row = [];
            const vz = z0 + (j / N) * CELL;
            for (let i = 0; i <= N; i++) {
                const vx = x0 + (i / N) * CELL;

                // Base height calculation based on ruts, berms, and alley walls
                let vy = 0.005;

                // Vertical traffic: primary ruts at x - 0.85 and x + 0.85
                if (vertical) {
                    const distRutL = Math.abs(vx - (x - 0.85));
                    const distRutR = Math.abs(vx - (x + 0.85));
                    const distRut = Math.min(distRutL, distRutR);
                    if (distRut < 0.55) {
                        vy -= (0.55 - distRut) * 0.045;
                    } else if (Math.abs(vx - x) < 0.4) {
                        vy += 0.024;
                    }
                }

                // Horizontal traffic: primary ruts at z - 0.85 and z + 0.85
                if (horizontal) {
                    const distRutU = Math.abs(vz - (z - 0.85));
                    const distRutD = Math.abs(vz - (z + 0.85));
                    const distRut = Math.min(distRutU, distRutD);
                    if (distRut < 0.55) {
                        vy -= (0.55 - distRut) * 0.045;
                    } else if (Math.abs(vz - z) < 0.4) {
                        vy += 0.024;
                    }
                }

                // Raised dirt mounds banked against solid borders (buildings/fences)
                if (i === 0 && cellAt(r, c - 1) !== 'M' && cellAt(r, c - 1) !== 'R') vy += 0.038;
                if (i === N && cellAt(r, c + 1) !== 'M' && cellAt(r, c + 1) !== 'R') vy += 0.038;
                if (j === 0 && cellAt(r - 1, c) !== 'M' && cellAt(r - 1, c) !== 'R') vy += 0.038;
                if (j === N && cellAt(r + 1, c) !== 'M' && cellAt(r + 1, c) !== 'R') vy += 0.038;

                // Smoothly taper to 0 on boundaries touching tarmac Road ('R')
                if (i === 0 && cellAt(r, c - 1) === 'R') vy = 0;
                else if (i === N && cellAt(r, c + 1) === 'R') vy = 0;
                if (j === 0 && cellAt(r - 1, c) === 'R') vy = 0;
                else if (j === N && cellAt(r + 1, c) === 'R') vy = 0;

                // Add deterministic low-poly terrain roughness noise (only if not on a road seam)
                const isRoadSeam = (i === 0 && cellAt(r, c - 1) === 'R') ||
                                   (i === N && cellAt(r, c + 1) === 'R') ||
                                   (j === 0 && cellAt(r - 1, c) === 'R') ||
                                   (j === N && cellAt(r + 1, c) === 'R');
                if (!isRoadSeam) {
                    const noise = (Math.sin(vx * 2.2 + vz * 1.7) * 0.012 +
                                   Math.cos(vx * 3.4 - vz * 2.1) * 0.009 +
                                   (rand() - 0.5) * 0.014);
                    vy += noise;
                }

                row.push(new Vec3(vx, Math.max(-0.032, vy), vz));
            }
            verts.push(row);
        }

        // Emit low-poly faceted triangles for the 5x5 quad grid
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const p00 = verts[j][i];
                const p10 = verts[j][i + 1];
                const p11 = verts[j + 1][i + 1];
                const p01 = verts[j + 1][i];

                const flip = (i + j) % 2 === 0;

                const t1 = flip ? [p00, p10, p11] : [p00, p10, p01];
                const avgY1 = (t1[0].y + t1[1].y + t1[2].y) / 3;
                let col1 = PALETTE.mud;
                if (avgY1 < -0.006) col1 = rand() < 0.5 ? PALETTE.mudDark : PALETTE.mudDeep;
                else if (avgY1 > 0.016) col1 = rand() < 0.5 ? PALETTE.mudBaked : PALETTE.mudLight;
                b.tri(t1[0], t1[1], t1[2], col1, Vec3.UP, 0.10);

                const t2 = flip ? [p00, p11, p01] : [p10, p11, p01];
                const avgY2 = (t2[0].y + t2[1].y + t2[2].y) / 3;
                let col2 = PALETTE.mud;
                if (avgY2 < -0.006) col2 = rand() < 0.5 ? PALETTE.mudDark : PALETTE.mudDeep;
                else if (avgY2 > 0.016) col2 = rand() < 0.5 ? PALETTE.mudBaked : PALETTE.mudLight;
                b.tri(t2[0], t2[1], t2[2], col2, Vec3.UP, 0.10);
            }
        }

        // Tire track grooves with pressed tread ridges
        if (vertical) {
            for (const rx of [x - 0.85, x + 0.85]) {
                for (let k = -2; k <= 2; k++) {
                    const rz = z + k * 1.1 + (rand() - 0.5) * 0.2;
                    b.flat(rx - 0.22, rz - 0.35, rx + 0.22, rz + 0.35, 0.006, PALETTE.mudDark, 0.08);
                    b.flat(rx - 0.18, rz - 0.06, rx + 0.18, rz + 0.06, 0.009, PALETTE.mudDeep, 0.06);
                }
            }
        }
        if (horizontal) {
            for (const rz of [z - 0.85, z + 0.85]) {
                for (let k = -2; k <= 2; k++) {
                    const rx = x + k * 1.1 + (rand() - 0.5) * 0.2;
                    b.flat(rx - 0.35, rz - 0.22, rx + 0.35, rz + 0.22, 0.006, PALETTE.mudDark, 0.08);
                    b.flat(rx - 0.06, rz - 0.18, rx + 0.06, rz + 0.18, 0.009, PALETTE.mudDeep, 0.06);
                }
            }
        }

        // 4-7 low-poly mud clods / laterite stones along alley edges and rut borders
        const clodCount = 4 + Math.floor(rand() * 4);
        for (let i = 0; i < clodCount; i++) {
            const side = (rand() - 0.5) * 4.6;
            const along = (rand() - 0.5) * 4.8;
            const cx = vertical ? x + side : x + along;
            const cz = vertical ? z + along : z + side;
            const clodW = 0.18 + rand() * 0.22;
            const clodH = 0.04 + rand() * 0.05;
            const clodL = 0.18 + rand() * 0.24;
            const col = pick(rand, [PALETTE.mudDark, PALETTE.mudBaked, PALETTE.mudDeep, PALETTE.mud]);
            b.boxAt(cx, clodH * 0.5, cz, clodW, clodH, clodL, col, rand() * 180, 0.08);
        }

        // Organic wet mud slicks / shallow puddle pools
        if (rand() < 0.55) {
            const px = x + (rand() - 0.5) * 3.2;
            const pz = z + (rand() - 0.5) * 3.2;
            const pr = 0.65 + rand() * 0.65;
            b.blob(px, 0.012, pz, pr, 8, PALETTE.mudWet, rand, 0.35);
            if (rand() < 0.6) {
                b.blob(px, 0.017, pz, pr * 0.65, 7, PALETTE.mudPuddleWater, rand, 0.28);
            }
        }
    }

    _buildCourtyardMudPlaza(b, RI) {
        const rand = this.rand;
        const M = 11;
        const totalSpan = 2 * RI;
        const verts = [];

        for (let j = 0; j <= M; j++) {
            const row = [];
            const vz = -RI + (j / M) * totalSpan;
            for (let i = 0; i <= M; i++) {
                const vx = -RI + (i / M) * totalSpan;

                let vy = 0.005;

                // Bridge approach tracks: North-South (x ≈ -0.4, x ≈ +0.4)
                const distNS = Math.min(Math.abs(vx - 0.4), Math.abs(vx + 0.4));
                if (distNS < 0.45) {
                    vy -= 0.016;
                } else if (Math.abs(vx) < 0.2) {
                    vy += 0.018;
                }

                // Bridge approach tracks: East-West (z ≈ -0.4, z ≈ +0.4)
                const distEW = Math.min(Math.abs(vz - 0.4), Math.abs(vz + 0.4));
                if (distEW < 0.45) {
                    vy -= 0.016;
                } else if (Math.abs(vz) < 0.2) {
                    vy += 0.018;
                }

                // Raised earthen mounds in the quadrants (away from crossing lanes)
                const inQuadX = Math.abs(vx) > 1.8 && Math.abs(vx) < 5.2;
                const inQuadZ = Math.abs(vz) > 1.8 && Math.abs(vz) < 5.2;
                if (inQuadX && inQuadZ) {
                    vy += 0.026;
                }

                // Outer perimeter edge flush with drain lip
                const onEdge = (i === 0 || i === M || j === 0 || j === M);
                if (onEdge) {
                    vy = 0.005;
                } else {
                    const noise = Math.sin(vx * 1.7 + vz * 2.1) * 0.011 +
                                  Math.cos(vx * 2.8 - vz * 1.8) * 0.008 +
                                  (rand() - 0.5) * 0.012;
                    vy += noise;
                }

                row.push(new Vec3(vx, Math.max(-0.025, vy), vz));
            }
            verts.push(row);
        }

        for (let j = 0; j < M; j++) {
            for (let i = 0; i < M; i++) {
                const p00 = verts[j][i];
                const p10 = verts[j][i + 1];
                const p11 = verts[j + 1][i + 1];
                const p01 = verts[j + 1][i];

                const flip = (i + j) % 2 === 0;

                const t1 = flip ? [p00, p10, p11] : [p00, p10, p01];
                const avgY1 = (t1[0].y + t1[1].y + t1[2].y) / 3;
                let col1 = PALETTE.mud;
                if (avgY1 < -0.004) col1 = rand() < 0.5 ? PALETTE.mudDark : PALETTE.mudDeep;
                else if (avgY1 > 0.018) col1 = rand() < 0.5 ? PALETTE.mudBaked : PALETTE.mudLight;
                b.tri(t1[0], t1[1], t1[2], col1, Vec3.UP, 0.09);

                const t2 = flip ? [p00, p11, p01] : [p10, p11, p01];
                const avgY2 = (t2[0].y + t2[1].y + t2[2].y) / 3;
                let col2 = PALETTE.mud;
                if (avgY2 < -0.004) col2 = rand() < 0.5 ? PALETTE.mudDark : PALETTE.mudDeep;
                else if (avgY2 > 0.018) col2 = rand() < 0.5 ? PALETTE.mudBaked : PALETTE.mudLight;
                b.tri(t2[0], t2[1], t2[2], col2, Vec3.UP, 0.09);
            }
        }

        // Scatter 8 low-poly mud clods / stones in the courtyard open areas
        for (let i = 0; i < 8; i++) {
            const qx = (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 2.8);
            const qz = (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 2.8);
            const cw = 0.22 + rand() * 0.28;
            const ch = 0.05 + rand() * 0.06;
            const cl = 0.22 + rand() * 0.3;
            const col = pick(rand, [PALETTE.mudDark, PALETTE.mudBaked, PALETTE.mudDeep]);
            b.boxAt(qx, ch * 0.5, qz, cw, ch, cl, col, rand() * 180, 0.08);
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
            this.potholes.push({ x: px, z: pz, r: radius, cooldown: 0, isMud: false });
            const b = this._chunk(cand.r, cand.c);
            b.blob(px, 0.016, pz, radius, 9, PALETTE.potholeRim, rand, 0.35);
            b.blob(px, 0.024, pz, radius * 0.7, 8, PALETTE.potholeWater, rand, 0.3);
            // broken tarmac chunks around the rim
            for (let i = 0; i < 3; i++) {
                const a = rand() * Math.PI * 2;
                b.boxAt(px + Math.cos(a) * radius * 1.05, 0.04, pz + Math.sin(a) * radius * 1.05, 0.25, 0.08, 0.2, PALETTE.tarmacDark, rand() * 90, 0.1);
            }
        }

        // ------------------------------------------------ Mud Alley Potholes
        // Add very few (e.g. 5) treacherous mud potholes in the muddy alleys
        const mudCandidates = [];
        const isNearRamp = (x, z) => {
            return this.ramps.some(ramp => Math.hypot(ramp.x - x, ramp.z - z) < 8.0);
        };
        const isNearGutterBridge = (x, z) => {
            return Math.abs(x) < 9.5 && Math.abs(z) < 9.5;
        };

        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (MAP[r][c] !== 'M') continue;
                if (reserved.has(`${r},${c}`)) continue;
                const { x, z } = cellCenter(r, c);
                if (isNearRamp(x, z) || isNearGutterBridge(x, z)) continue;

                const vertical = isWalkable(cellAt(r - 1, c)) || isWalkable(cellAt(r + 1, c));
                const horizontal = isWalkable(cellAt(r, c - 1)) || isWalkable(cellAt(r, c + 1));
                mudCandidates.push({ r, c, vertical, horizontal, x, z });
            }
        }

        for (let i = mudCandidates.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [mudCandidates[i], mudCandidates[j]] = [mudCandidates[j], mudCandidates[i]];
        }

        const mudPotholeCount = HAZARDS.MUD_POTHOLE_COUNT || 5;
        for (const cand of mudCandidates.slice(0, mudPotholeCount)) {
            const side = rand() < 0.5 ? -1 : 1;
            const lateralOffset = side * (0.7 + rand() * 0.7);
            const alongOffset = (rand() - 0.5) * 1.8;

            let px = cand.x;
            let pz = cand.z;
            if (cand.vertical && !cand.horizontal) {
                px += lateralOffset;
                pz += alongOffset;
            } else if (cand.horizontal && !cand.vertical) {
                px += alongOffset;
                pz += lateralOffset;
            } else {
                px += (rand() - 0.5) * 2.2;
                pz += (rand() - 0.5) * 2.2;
            }

            const radius = 0.75 + rand() * 0.35;
            this.potholes.push({ x: px, z: pz, r: radius, cooldown: 0, isMud: true });

            const b = this._chunk(cand.r, cand.c);
            // 1. Sunken dark churned mud depression ring
            b.blob(px, 0.016, pz, radius * 1.25, 9, PALETTE.mudDark, rand, 0.4);
            // 2. Wet mud crater inner rim
            b.blob(px, 0.024, pz, radius * 0.95, 8, PALETTE.mudWet, rand, 0.35);
            // 3. Deep murky muddy puddle water
            b.blob(px, 0.032, pz, radius * 0.7, 8, PALETTE.mudPuddleWater, rand, 0.25);
            // 4. Broken laterite clods and mud chunks thrown up around the crater
            for (let i = 0; i < 4; i++) {
                const a = rand() * Math.PI * 2;
                const dist = radius * (1.0 + rand() * 0.3);
                const clodX = px + Math.cos(a) * dist;
                const clodZ = pz + Math.sin(a) * dist;
                const sz = 0.22 + rand() * 0.2;
                b.boxAt(clodX, 0.045, clodZ, sz, 0.08, sz * (0.8 + rand() * 0.4), PALETTE.mudDark, rand() * 90, 0.1);
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

    _buildSpeedRamps() {
        // 4 Low-Poly Mud Alley Speed Ramps with stepped wood kicker deck, caution hazard flanks,
        // neon speed chevrons, steel coping lips, and illuminated corner beacons.
        const b = new GeoBuilder(this.rand);
        const H = 0.52; // height of the ramp apex (52 cm kicker lip)
        const W = 3.4;  // width of ramp (spans the alley path comfortably)
        const L = 4.2;  // total ramp length (2.1m slope on each side)
        const flatLen = 0.9; // central flat plateau length

        for (const ramp of this.ramps) {
            const { x, z, axis } = ramp;
            const isZ = axis === 'z';

            // 1. Mud foundation berm (darker compact laterite mud slightly larger than ramp)
            const bermL = L + 0.6;
            const bermW = W + 0.5;
            if (isZ) {
                b.boxAt(x, 0.02, z, bermW, 0.04, bermL, PALETTE.mudDark, 0, 0);
            } else {
                b.boxAt(x, 0.02, z, bermL, 0.04, bermW, PALETTE.mudDark, 0, 0);
            }

            // 2. Central tabletop flat section
            if (isZ) {
                b.boxAt(x, H / 2, z, W, H, flatLen, PALETTE.plankWoodDark, 0, 0);
                b.flat(x - W / 2, z - flatLen / 2, x + W / 2, z + flatLen / 2, H + 0.01, PALETTE.plankWoodLight);
                // Steel coping lip bars at the two launch edges
                b.boxAt(x, H + 0.02, z - flatLen / 2, W + 0.04, 0.04, 0.08, [205, 208, 215], 0, 0);
                b.boxAt(x, H + 0.02, z + flatLen / 2, W + 0.04, 0.04, 0.08, [205, 208, 215], 0, 0);
                // Tabletop yellow launch caution markings
                b.flat(x - W / 2 + 0.1, z - 0.04, x + W / 2 - 0.1, z + 0.04, H + 0.015, PALETTE.roadLine);
            } else {
                b.boxAt(x, H / 2, z, flatLen, H, W, PALETTE.plankWoodDark, 0, 0);
                b.flat(x - flatLen / 2, z - W / 2, x + flatLen / 2, z + W / 2, H + 0.01, PALETTE.plankWoodLight);
                // Steel coping lip bars
                b.boxAt(x - flatLen / 2, H + 0.02, z, 0.08, 0.04, W + 0.04, [205, 208, 215], 0, 0);
                b.boxAt(x + flatLen / 2, H + 0.02, z, 0.08, 0.04, W + 0.04, [205, 208, 215], 0, 0);
                // Tabletop yellow launch caution markings
                b.flat(x - 0.04, z - W / 2 + 0.1, x + 0.04, z + W / 2 - 0.1, H + 0.015, PALETTE.roadLine);
            }

            // 3. Approach Slopes (stepped timber planks rising from ground to H)
            const slopeLen = (L - flatLen) / 2; // 1.6m
            const numPlanks = 6;
            const plankLen = slopeLen / numPlanks; // approx 0.27m

            for (let side = -1; side <= 1; side += 2) {
                // side -1 is North/West slope, side +1 is South/East slope
                for (let step = 0; step < numPlanks; step++) {
                    const frac0 = step / numPlanks;
                    const frac1 = (step + 1) / numPlanks;
                    const y0 = 0.03 + (1 - frac0) * (H - 0.03);
                    const y1 = 0.03 + (1 - frac1) * (H - 0.03);
                    const yMid = (y0 + y1) / 2;
                    const plankH = Math.max(0.06, yMid);

                    const distFromCenter = flatLen / 2 + (step + 0.5) * plankLen;
                    const pPos = side * distFromCenter;
                    const plankColor = (step % 2 === 0) ? PALETTE.plankWood : PALETTE.plankWoodLight;

                    if (isZ) {
                        b.boxAt(x, plankH / 2, z + pPos, W, plankH, plankLen * 0.96, plankColor, 0, 0.02);
                    } else {
                        b.boxAt(x + pPos, plankH / 2, z, plankLen * 0.96, plankH, W, plankColor, 0, 0.02);
                    }
                }

                // Directional Neon Speed Boost Chevron Arrows on the slope
                // 2 chevrons per slope pointing towards center launch lip
                for (let ch = 0; ch < 2; ch++) {
                    const arrowDist = flatLen / 2 + (ch * 0.65 + 0.45);
                    const arrowPos = side * arrowDist;
                    const arrowFrac = (arrowDist - flatLen / 2) / slopeLen;
                    const arrowY = 0.05 + (1 - arrowFrac) * (H - 0.03) + 0.02;
                    const neonCyan = [35, 235, 185];

                    if (isZ) {
                        const tipZ = z + arrowPos - side * 0.18;
                        const baseZ = z + arrowPos + side * 0.14;
                        b.boxAt(x - 0.35, arrowY, (tipZ + baseZ) / 2, 0.2, 0.02, 0.28, neonCyan, 0, 0);
                        b.boxAt(x + 0.35, arrowY, (tipZ + baseZ) / 2, 0.2, 0.02, 0.28, neonCyan, 0, 0);
                        b.boxAt(x, arrowY, tipZ, 0.22, 0.02, 0.22, neonCyan, 0, 0);
                    } else {
                        const tipX = x + arrowPos - side * 0.18;
                        const baseX = x + arrowPos + side * 0.14;
                        b.boxAt((tipX + baseX) / 2, arrowY, z - 0.35, 0.28, 0.02, 0.2, neonCyan, 0, 0);
                        b.boxAt((tipX + baseX) / 2, arrowY, z + 0.35, 0.28, 0.02, 0.2, neonCyan, 0, 0);
                        b.boxAt(tipX, arrowY, z, 0.22, 0.02, 0.22, neonCyan, 0, 0);
                    }
                }
            }

            // 4. Side Flanks with diagonal black and yellow hazard caution stripes
            const numStripes = 8;
            const stripeW = L / numStripes;
            for (let i = 0; i < numStripes; i++) {
                const stripePos = -L / 2 + (i + 0.5) * stripeW;
                const distFromC = Math.abs(stripePos);
                const slopeFrac = Math.max(0, 1 - Math.max(0, distFromC - flatLen / 2) / ((L - flatLen) / 2));
                const flankH = Math.max(0.08, slopeFrac * H);
                const stripeCol = i % 2 === 0 ? PALETTE.curbYellow : PALETTE.curbBlack;

                if (isZ) {
                    b.boxAt(x - W / 2 - 0.04, flankH / 2, z + stripePos, 0.08, flankH, stripeW * 0.94, stripeCol, 0, 0);
                    b.boxAt(x + W / 2 + 0.04, flankH / 2, z + stripePos, 0.08, flankH, stripeW * 0.94, stripeCol, 0, 0);
                } else {
                    b.boxAt(x + stripePos, flankH / 2, z - W / 2 - 0.04, stripeW * 0.94, flankH, 0.08, stripeCol, 0, 0);
                    b.boxAt(x + stripePos, flankH / 2, z + W / 2 + 0.04, stripeW * 0.94, flankH, 0.08, stripeCol, 0, 0);
                }
            }

            // 5. Four Corner Beacon Posts with bright marker caps
            const cornerOffL = L / 2 + 0.05;
            const cornerOffW = W / 2 + 0.05;
            const postH = 0.68;
            for (const dx of [-1, 1]) {
                for (const dz of [-1, 1]) {
                    const px = isZ ? x + dx * cornerOffW : x + dx * cornerOffL;
                    const pz = isZ ? z + dz * cornerOffL : z + dz * cornerOffW;
                    b.boxAt(px, postH / 2, pz, 0.1, postH, 0.1, PALETTE.pole, 0, 0);
                    b.boxAt(px, postH + 0.06, pz, 0.14, 0.12, 0.14, [255, 215, 30], 0, 0);
                    b.boxAt(px, postH + 0.13, pz, 0.08, 0.04, 0.08, [35, 235, 185], 0, 0);
                }
            }
        }

        this.root.addChild(b.toEntity(this.app, 'SpeedRamps'));
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

        // 1. CENTRAL COURTYARD MUD PLAZA (Faceted low-poly bumpy terrain within [-RI, RI])
        this._buildCourtyardMudPlaza(b, RI);

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
            // Wing A: from -RI (-6.6m) to -bridgeHalfW (-0.42m) -> length 6.18m
            // Wing B: from +bridgeHalfW (+0.42m) to +RI (+6.6m) -> length 6.18m
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

                // Murky stagnant water plane (16cm dirty water depth)
                flatLocal(w0 + 0.04, RI + 0.08, w1 - 0.04, RO - 0.08, -D + 0.16, PALETTE.gutterWater);

                // Floating green algae patches & slime slicks
                flatLocal(w0 + 0.25, RI + 0.35, w1 - 0.25, RO - 0.35, -D + 0.165, PALETTE.gutterSlime, 0.06);

                // Authentic low-poly debris on the drain bed: discarded water sachet & concrete chunk
                const sachetPos = w0 + wingLen * 0.45;
                boxLocal(sachetPos, -D + 0.17, RI + 0.7, 0.22, 0.02, 0.15, PALETTE.sachetWhite, 22, 0);
                boxLocal(sachetPos, -D + 0.18, RI + 0.7, 0.12, 0.01, 0.08, PALETTE.sachetBlue, 22, 0);
                boxLocal(w0 + wingLen * 0.75, -D + 0.20, RO - 0.6, 0.28, 0.18, 0.20, [135, 130, 122], 15, 0.04);

                // --- B. CONCRETE WALLS (Descending 1.6m down into trench) ---
                // Outer wall (RO)
                boxLocal(midLat, -0.25, RO, wingLen, 0.50, 0.18, PALETTE.drainWallTop, 0, 0.02);
                boxLocal(midLat, -0.75, RO, wingLen, 0.50, 0.18, PALETTE.drainWallMid, 0, 0.02);
                boxLocal(midLat, -1.25, RO, wingLen, 0.50, 0.18, PALETTE.drainWallLow, 0, 0.02);
                boxLocal(midLat, -D + 0.20, RO - 0.02, wingLen, 0.14, 0.14, PALETTE.drainAlgae, 0, 0.02);

                // Inner wall (RI)
                boxLocal(midLat, -0.25, RI, wingLen, 0.50, 0.18, PALETTE.drainWallTop, 0, 0.02);
                boxLocal(midLat, -0.75, RI, wingLen, 0.50, 0.18, PALETTE.drainWallMid, 0, 0.02);
                boxLocal(midLat, -1.25, RI, wingLen, 0.50, 0.18, PALETTE.drainWallLow, 0, 0.02);
                boxLocal(midLat, -D + 0.20, RI + 0.02, wingLen, 0.14, 0.14, PALETTE.drainAlgae, 0, 0.02);

                // --- C. PLAIN WEATHERED CONCRETE CURB CAPPING SLABS ---
                // Precast concrete capping slabs along the outer (RO) and inner (RI) gutter edges
                const concreteSlabCount = Math.max(6, Math.round(wingLen / 0.85));
                const slabLen = wingLen / concreteSlabCount;
                const concreteShades = [
                    PALETTE.drainCap,            // [186, 180, 168] light weathered concrete
                    PALETTE.gutterConcrete,      // [182, 178, 170] neutral concrete
                    [176, 172, 164],             // aged concrete
                    [190, 184, 174]              // cured concrete
                ];

                for (let k = 0; k < concreteSlabCount; k++) {
                    const cLat = w0 + (k + 0.5) * slabLen;
                    const slabCol = concreteShades[k % concreteShades.length];

                    // Outer concrete curb slab (elevated y=0.05, height 0.10m, width 0.28m overhanging into the trench)
                    boxLocal(cLat, 0.05, RO + 0.08, slabLen - 0.025, 0.10, 0.28, slabCol, 0, 0.01);
                    // Inner concrete curb slab
                    boxLocal(cLat, 0.05, RI - 0.08, slabLen - 0.025, 0.10, 0.28, slabCol, 0, 0.01);
                }

                // Dark shadow strips beneath the overhanging concrete curbs
                boxLocal(midLat, -0.03, RO - 0.02, wingLen, 0.06, 0.08, [42, 40, 36], 0, 0);
                boxLocal(midLat, -0.03, RI + 0.02, wingLen, 0.06, 0.08, [42, 40, 36], 0, 0);

                // --- D. END WALL (Sealing channel at corner platform boundary) ---
                const endLat = (w0 === -RI) ? -RI : RI;
                boxLocal(endLat, -D / 2, midOut, 0.18, D, trenchWidth, PALETTE.drainWallMid, 0, 0.03);
            }

            // --- E. NARROW WOODEN PLANK BRIDGE (Reduced to 0.84m total width for an authentic steering challenge!) ---
            const boxBridge = (lat, y, out, sLat, sY, sOut, color, yaw = 0, jitter = 0.03) => {
                if (isNS) {
                    const worldZ = (sideKey === 'N') ? -out : out;
                    b.boxAt(lat, y, worldZ, sLat, sY, sOut, color, yaw, jitter);
                } else {
                    const worldX = (sideKey === 'W') ? -out : out;
                    b.boxAt(worldX, y, lat, sOut, sY, sLat, color, yaw, jitter);
                }
            };

            // 1. Two underlying heavy timber stringer runner beams spanning across the trench
            for (const sLat of [-0.25, 0.25]) {
                boxBridge(sLat, 0.015, midOut, 0.14, 0.14, plankLen, PALETTE.plankWoodDark, 0, 0.01);
            }

            // 2. Central vertical timber support prop descending down into the deep trench
            for (const sLat of [-0.25, 0.25]) {
                boxBridge(sLat, -D / 2 + 0.02, midOut, 0.12, D, 0.12, PALETTE.plankWoodDark, 0, 0.01);
            }
            boxBridge(0, -0.06, midOut, 0.72, 0.08, 0.12, PALETTE.plankWoodDark, 0, 0.01);

            // 3. Three individual rough-hewn timber boards laid side by side across the 0.84m width
            // with visible 0.025m gaps showing through to the deep drain below
            const plankCount = 3;
            const plankW = (bridgeHalfW * 2 - 0.08) / plankCount; // ~0.253m each

            for (let i = 0; i < plankCount; i++) {
                const off = -bridgeHalfW + 0.04 + (i + 0.5) * plankW;
                const woodCol = (i === 1) ? PALETTE.plankWoodLight : (i === 0 ? PALETTE.plankWood : PALETTE.plankWoodDark);
                const lenJitter = plankLen + (rand() - 0.5) * 0.12;
                const yOff = 0.055 + (rand() - 0.5) * 0.004;

                // Plank board with visible gap
                boxBridge(off, yOff, midOut, plankW - 0.025, 0.05, lenJitter, woodCol, (rand() - 0.5) * 1.2, 0.04);

                // Hand-driven iron nails over the 2 runner stringers
                boxBridge(off, yOff + 0.028, midOut - 1.1, 0.035, 0.01, 0.035, PALETTE.plankNail, 0, 0);
                boxBridge(off, yOff + 0.028, midOut + 1.1, 0.035, 0.01, 0.035, PALETTE.plankNail, 0, 0);
            }

            // 4. Longitudinal side guide kerb logs along bridge edges
            for (const gLat of [-bridgeHalfW + 0.02, bridgeHalfW - 0.02]) {
                boxBridge(gLat, 0.095, midOut, 0.05, 0.05, plankLen - 0.06, PALETTE.plankWoodDark, 0, 0.01);
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

            // 6. Rustic timber guide posts flanking the narrow bridge landings
            for (const bLat of [-bridgeHalfW - 0.10, bridgeHalfW + 0.10]) {
                for (const bOut of [RO + 0.35, RI - 0.35]) {
                    boxBridge(bLat, 0.32, bOut, 0.12, 0.64, 0.12, PALETTE.trunk, 0, 0.02);
                    boxBridge(bLat, 0.62, bOut, 0.13, 0.08, 0.13, PALETTE.plankWoodDark, 0, 0);
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
    isInOpenGutter(x, z, radius = 0.20) {
        const RI = DRAIN.RI; // 6.6m inner edge
        const RO = DRAIN.RO; // 9.0m outer edge (2.4m wide channel)
        const bridgeSafeHalfW = DRAIN.BRIDGE_HALF; // 0.42m narrow bridge safe threshold (width 0.84m)

        // North gutter (z in [-RO, -RI])
        if (z >= -RO - radius && z <= -RI + radius && Math.abs(x) <= RI + 0.3) {
            if (Math.abs(x) > bridgeSafeHalfW) return true;
        }
        // South gutter (z in [RI, RO])
        if (z >= RI - radius && z <= RO + radius && Math.abs(x) <= RI + 0.3) {
            if (Math.abs(x) > bridgeSafeHalfW) return true;
        }
        // West gutter (x in [-RO, -RI])
        if (x >= -RO - radius && x <= -RI + radius && Math.abs(z) <= RI + 0.3) {
            if (Math.abs(z) > bridgeSafeHalfW) return true;
        }
        // East gutter (x in [RI, RO])
        if (x >= RI - radius && x <= RO + radius && Math.abs(z) <= RI + 0.3) {
            if (Math.abs(z) > bridgeSafeHalfW) return true;
        }

        return false;
    }

    /**
     * Finds the nearest wooden plank bridge crossing point to (x, z).
     * @param {number} x
     * @param {number} z
     * @returns {{x: number, z: number, name: string}}
     */
    getNearestPlankBridge(x, z) {
        const mid = DRAIN.MID; // 7.8m
        const bridges = [
            { x: 0, z: -mid, name: 'North Plank' },
            { x: 0, z: mid, name: 'South Plank' },
            { x: -mid, z: 0, name: 'West Plank' },
            { x: mid, z: 0, name: 'East Plank' }
        ];
        let best = bridges[0];
        let minDist = Infinity;
        for (const b of bridges) {
            const d = Math.hypot(x - b.x, z - b.z);
            if (d < minDist) {
                minDist = d;
                best = b;
            }
        }
        return best;
    }

    /**
     * Calculates a safe reposition pose when the player hits the gutter.
     * Always respawns the rider on the OUTSIDE of the center courtyard near the nearest plank bridge,
     * aligned with the street/bridge centerline on solid ground.
     * Direction-Aware (Option 1):
     *  - If the rider was moving outward (away from center courtyard), faces outward down the street.
     *  - If the rider was moving inward (toward center courtyard), faces inward straight across the plank bridge.
     * @param {number} x
     * @param {number} z
     * @param {number} forwardX
     * @param {number} forwardZ
     * @returns {{x: number, z: number, yaw: number}}
     */
    getGutterRepositionPose(x, z, forwardX, forwardZ) {
        const nearest = this.getNearestPlankBridge(x, z);

        // Outward unit vector from map center (0, 0) through this bridge
        const outX = Math.sign(nearest.x);
        const outZ = Math.sign(nearest.z);

        // Outside approach distance: 1.6m beyond outer trench bank (RO = 9.0m) on wide open street
        const outerSpawnDist = 10.6;
        let repoX = outX !== 0 ? outX * outerSpawnDist : 0;
        let repoZ = outZ !== 0 ? outZ * outerSpawnDist : 0;

        // Check if incoming motion was moving outward (away from center)
        const dotOutward = forwardX * outX + forwardZ * outZ;
        const isMovingOutward = dotOutward > 0.05;

        // Compute yaw: outward down the street or inward across the plank
        const faceX = isMovingOutward ? outX : -outX;
        const faceZ = isMovingOutward ? outZ : -outZ;
        const yaw = Math.atan2(-faceX, -faceZ);

        // Ensure collision safety against any nearby roadside props
        const pos = { x: repoX, z: repoZ };
        this.resolveCircle(pos, 0.6);
        repoX = pos.x;
        repoZ = pos.z;

        return { x: repoX, z: repoZ, yaw };
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
        for (const p of this.potholes) {
            ctx.fillStyle = p.isMud ? '#451a03' : '#1b1b1d';
            const { mx, my } = this.toMinimap(p.x, p.z, size);
            ctx.beginPath();
            ctx.arc(mx, my, px * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Speed Ramps on Minimap Base with glowing boost chevron diamond icons
        for (const ramp of this.ramps) {
            const { mx, my } = this.toMinimap(ramp.x, ramp.z, size);
            ctx.save();
            ctx.translate(mx, my);
            if (ramp.axis === 'x') ctx.rotate(Math.PI / 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(-px * 0.28, -px * 0.44, px * 0.56, px * 0.88);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(-px * 0.22, -px * 0.38, px * 0.44, px * 0.76);
            ctx.fillStyle = '#22d3ee';
            // North chevron
            ctx.beginPath();
            ctx.moveTo(0, -px * 0.28);
            ctx.lineTo(px * 0.16, -px * 0.08);
            ctx.lineTo(-px * 0.16, -px * 0.08);
            ctx.closePath();
            ctx.fill();
            // South chevron
            ctx.beginPath();
            ctx.moveTo(0, px * 0.28);
            ctx.lineTo(px * 0.16, px * 0.08);
            ctx.lineTo(-px * 0.16, px * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Draw Central Gutter Trench and 4 Wooden Plank Bridges on Minimap
        const pO0 = this.toMinimap(-DRAIN.RO, -DRAIN.RO, size);
        const pO1 = this.toMinimap(DRAIN.RO, DRAIN.RO, size);
        const pI0 = this.toMinimap(-DRAIN.RI, -DRAIN.RI, size);
        const pI1 = this.toMinimap(DRAIN.RI, DRAIN.RI, size);

        // Dark gutter trench ring
        ctx.fillStyle = '#181a1e';
        ctx.fillRect(pO0.mx, pO0.my, pO1.mx - pO0.mx, pO1.my - pO0.my);
        // Central courtyard mud plaza inside gutter ring
        ctx.fillStyle = '#b0623a';
        ctx.fillRect(pI0.mx, pI0.my, pI1.mx - pI0.mx, pI1.my - pI0.my);

        // Plain concrete curb demarcation outlines
        ctx.strokeStyle = '#b6b0a4';
        ctx.lineWidth = 1.0;
        ctx.strokeRect(pO0.mx, pO0.my, pO1.mx - pO0.mx, pO1.my - pO0.my);
        ctx.strokeRect(pI0.mx, pI0.my, pI1.mx - pI0.mx, pI1.my - pI0.my);

        // 4 Narrow Wooden Plank Bridges across the gutter
        const mid = DRAIN.MID;
        const bW = (DRAIN.BRIDGE_HALF * 2 / (GRID * CELL)) * size * 1.5;
        const bL = ((DRAIN.RO - DRAIN.RI + 0.6) / (GRID * CELL)) * size;
        ctx.fillStyle = '#946642';
        // North & South planks
        const pN = this.toMinimap(0, -mid, size);
        const pS = this.toMinimap(0, mid, size);
        ctx.fillRect(pN.mx - bW / 2, pN.my - bL / 2, bW, bL);
        ctx.fillRect(pS.mx - bW / 2, pS.my - bL / 2, bW, bL);
        // West & East planks
        const pW = this.toMinimap(-mid, 0, size);
        const pE = this.toMinimap(mid, 0, size);
        ctx.fillRect(pW.mx - bL / 2, pW.my - bW / 2, bL, bW);
        ctx.fillRect(pE.mx - bL / 2, pE.my - bW / 2, bL, bW);

        return canvas;
    }

    toMinimap(x, z, size) {
        const span = GRID * CELL;
        return { mx: (x / span + 0.5) * size, my: (z / span + 0.5) * size };
    }

    _buildStreetLights() {
        const b = new GeoBuilder(this.rand);
        this.streetLights = [];
        const mastH = 5.6;
        const armReach = 2.2;
        const lampH = 5.4;

        // 4 Sides of the perimeter main road (approx 56.4m from center)
        const sides = [
            { axis: 's', z: 56.4, dirZ: -1, dirX: 0 },
            { axis: 'n', z: -56.4, dirZ: 1, dirX: 0 },
            { axis: 'w', x: -56.4, dirX: 1, dirZ: 0 },
            { axis: 'e', x: 56.4, dirX: -1, dirZ: 0 }
        ];

        // Steps along each side of the road (including roadside curb positions at +/- 6.5m)
        const steps = [-44, -30, -18, -6.5, 6.5, 18, 30, 44];

        sides.forEach((side, sideIdx) => {
            steps.forEach((t, stepIdx) => {
                let px, pz, lx, lz;
                if (side.axis === 's' || side.axis === 'n') {
                    px = t;
                    pz = side.z;
                    lx = t;
                    lz = side.z + side.dirZ * armReach;
                } else {
                    px = side.x;
                    pz = t;
                    lx = side.x + side.dirX * armReach;
                    lz = t;
                }

                // Concrete Pedestal base
                b.boxAt(px, 0.25, pz, 0.46, 0.5, 0.46, PALETTE.streetPedestal || [125, 128, 134], 0, 0.02);
                // Vertical Steel Mast
                b.cylinder(GeoBuilder.trs(px, 0.45, pz, 0, 0, 0, 0.1, mastH - 0.45, 0.1), 6, PALETTE.streetPole || [72, 76, 84], 0.9, 0.04);

                // Cantilever Arm extending toward the road lane
                const midX = (px + lx) / 2;
                const midZ = (pz + lz) / 2;
                const armY = mastH + 0.18;
                if (side.axis === 's' || side.axis === 'n') {
                    b.boxAt(midX, armY, midZ, 0.08, 0.08, armReach, [64, 68, 75], 0, 0);
                    b.box(GeoBuilder.trs(px, armY - 0.35, pz + side.dirZ * 0.45, -side.dirZ * 35, 0, 0, 0.06, 0.06, 0.9), [60, 64, 70], 0);
                    b.boxAt(lx, lampH + 0.14, lz, 0.34, 0.16, 0.74, PALETTE.streetLuminaire || [46, 49, 54], 0, 0);
                    b.flat(lx - 0.14, lz - 0.34, lx + 0.14, lz + 0.34, lampH + 0.05, PALETTE.streetLensGlow || [255, 242, 190]);
                } else {
                    b.boxAt(midX, armY, midZ, armReach, 0.08, 0.08, [64, 68, 75], 0, 0);
                    b.box(GeoBuilder.trs(px + side.dirX * 0.45, armY - 0.35, pz, 0, 0, side.dirX * 35, 0.9, 0.06, 0.06), [60, 64, 70], 0);
                    b.boxAt(lx, lampH + 0.14, lz, 0.74, 0.16, 0.34, PALETTE.streetLuminaire || [46, 49, 54], 0, 0);
                    b.flat(lx - 0.34, lz - 0.14, lx + 0.34, lz + 0.14, lampH + 0.05, PALETTE.streetLensGlow || [255, 242, 190]);
                }

                // Stable PlayCanvas Omni Light Entity attached at the luminaire
                const lightEnt = new Entity(`StreetLight_${side.axis}_${stepIdx}`);
                lightEnt.setPosition(lx, lampH - 0.12, lz);
                lightEnt.addComponent('light', {
                    type: 'omni',
                    range: 17.0,
                    color: new Color(1.0, 0.88, 0.65), // warm sodium vapor street lamp
                    intensity: this.mood === 'night' ? 1.85 : 0,
                    castShadows: false
                });
                this.root.addChild(lightEnt);
                this.streetLights.push({ entity: lightEnt, pos: { x: lx, y: lampH, z: lz } });
            });
        });

        this.root.addChild(b.toEntity(this.app, 'StreetLightMeshes'));
    }

    _buildMudAlleyBulbs() {
        const b = new GeoBuilder(this.rand);
        this.alleyBulbs = [];
        const candidates = [];

        // Collect building cells that face mud alleys
        for (let r = 2; r < GRID - 2; r++) {
            for (let c = 2; c < GRID - 2; c++) {
                if (MAP[r][c] !== 'B') continue;
                for (const [sideName, s] of Object.entries(SIDES)) {
                    const nr = r + s.dr;
                    const nc = c + s.dc;
                    if (cellAt(nr, nc) === 'M') {
                        candidates.push({ r, c, nr, nc, s, sideName });
                    }
                }
            }
        }

        // Shuffle candidates deterministically
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // Always guarantee the entrance alley right in front of player start:
        // (r=17, c=9 facing East) and (r=17, c=11 facing West)
        const guaranteed = [
            { r: 17, c: 9, s: SIDES.e, sideName: 'e', lateralOff: 2.35 },
            { r: 17, c: 11, s: SIDES.w, sideName: 'w', lateralOff: 2.35 }
        ];

        const selected = [...guaranteed];
        const seenCells = new Set(guaranteed.map(g => `${g.r},${g.c}`));

        for (const cand of candidates) {
            const key = `${cand.r},${cand.c}`;
            if (seenCells.has(key)) continue;
            seenCells.add(key);
            selected.push(cand);
            if (selected.length >= 24) break;
        }

        const BULB_COLORS = [
            new Color(1.0, 0.74, 0.32), // classic warm tungsten amber
            new Color(1.0, 0.66, 0.24), // deep rich golden sodium glow
            new Color(1.0, 0.82, 0.44), // bright warm incandescent yellow
            new Color(1.0, 0.71, 0.28)  // warm evening orange-yellow
        ];

        selected.forEach((item, i) => {
            const { r, c, s } = item;
            const { x, z } = cellCenter(r, c);
            const half = CELL * 0.44; // approx 2.64m
            const wallX = x + s.nx * (half + 0.05);
            const wallZ = z + s.nz * (half + 0.05);
            const lateralOff = item.lateralOff !== undefined ? item.lateralOff : (this.rand() - 0.5) * 1.8;

            const attachX = s.nz ? wallX + lateralOff : wallX;
            const attachZ = s.nx ? wallZ + lateralOff : wallZ;
            const posX = s.nx ? wallX + s.nx * 0.45 : attachX;
            const posZ = s.nz ? wallZ + s.nz * 0.45 : attachZ;
            const bulbY = 2.45 + (this.rand() * 0.35);

            // 1. Wooden wall mount block
            b.boxAt(attachX, bulbY + 0.12, attachZ, s.nx ? 0.08 : 0.28, 0.26, s.nz ? 0.08 : 0.28, PALETTE.alleyBracket || [96, 78, 58], 0, 0);
            // 2. Angled bracket arm reaching out into alley
            b.boxAt((attachX + posX) / 2, bulbY + 0.15, (attachZ + posZ) / 2, s.nx ? 0.45 : 0.05, 0.05, s.nz ? 0.45 : 0.05, PALETTE.alleyBracket || [96, 78, 58], 0, 0);
            // 3. Hanging black wire
            b.cylinder(GeoBuilder.trs(posX, bulbY + 0.06, posZ, 0, 0, 0, 0.015, 0.16, 0.015), 4, [25, 25, 25]);
            // 4. Conical rusty tin-can shade
            b.pyramid(GeoBuilder.trs(posX, bulbY + 0.02, posZ, 180, 0, 0, 0.38, 0.13, 0.38), PALETTE.alleyTinShade || [142, 78, 48]);
            // 5. Amber glowing tungsten bulb
            b.cylinder(GeoBuilder.trs(posX, bulbY - 0.06, posZ, 0, 0, 0, 0.09, 0.14, 0.09), 6, PALETTE.alleyBulbWarm || [255, 210, 95]);

            const lightColor = BULB_COLORS[i % BULB_COLORS.length];

            // 6. PlayCanvas Omni Light Entity
            const lightEnt = new Entity(`AlleyBulb_${i}`);
            lightEnt.setPosition(posX, bulbY - 0.12, posZ);
            lightEnt.addComponent('light', {
                type: 'omni',
                range: 10.5,
                color: lightColor,
                intensity: this.mood === 'night' ? 1.55 : 0,
                castShadows: false
            });
            this.root.addChild(lightEnt);

            this.alleyBulbs.push({
                entity: lightEnt,
                baseIntensity: 1.5 + (this.rand() - 0.5) * 0.35,
                flickerSpeed: 4.5 + this.rand() * 9.0,
                phase: this.rand() * Math.PI * 2,
                spikeTimer: 0.6 + this.rand() * 2.8,
                spikeDuration: 0,
                dipLevel: 0.15,
                isDoubleSpike: false
            });
        });

        this.root.addChild(b.toEntity(this.app, 'AlleyBulbMeshes'));
    }

    setMood(mood) {
        this.mood = mood;
        const isNight = mood === 'night';
        for (const sl of this.streetLights) {
            if (sl.entity && sl.entity.light) {
                sl.entity.light.intensity = isNight ? 1.85 : 0;
            }
        }
        for (const ab of this.alleyBulbs) {
            if (ab.entity && ab.entity.light) {
                ab.entity.light.intensity = isNight ? ab.baseIntensity : 0;
            }
        }
    }

    update(dt) {
        if (this.mood !== 'night') return;
        const now = performance.now() * 0.001;

        for (let i = 0; i < this.alleyBulbs.length; i++) {
            const b = this.alleyBulbs[i];
            b.spikeTimer -= dt;

            if (b.spikeTimer <= 0) {
                // Trigger erratic voltage dip (Lagos generator / grid flicker)
                b.spikeDuration = 0.06 + Math.random() * 0.14;
                b.dipLevel = Math.random() < 0.35 ? 0.04 : (0.18 + Math.random() * 0.22);
                b.isDoubleSpike = Math.random() < 0.32;
                b.spikeTimer = 1.0 + Math.random() * 3.5;
            }

            let curIntensity = b.baseIntensity;
            if (b.spikeDuration > 0) {
                b.spikeDuration -= dt;
                curIntensity = b.baseIntensity * b.dipLevel;
            } else if (b.isDoubleSpike) {
                b.isDoubleSpike = false;
                b.spikeDuration = 0.05;
                b.dipLevel = 0.08;
                curIntensity = b.baseIntensity * b.dipLevel;
            } else {
                // Subtle organic generator hum
                const hum = Math.sin(now * b.flickerSpeed + b.phase) * 0.08
                          + Math.sin(now * (b.flickerSpeed * 2.4) + b.phase * 1.3) * 0.04;
                curIntensity = b.baseIntensity * (1.0 + hum);
            }

            b.entity.light.intensity = curIntensity;
        }
    }
}
