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

export const ZEBRA_CROSSINGS = new Set([
    '1,5', '1,10', '1,15',
    '19,5', '19,15',
    '6,1', '14,1',
    '6,19', '14,19'
]);

/**
 * Owns the static neighbourhood: render geometry, collision, surface lookup, hazards and the minimap.
 */
export class LagosMap {
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
            case '.':
                b.flat(x0, z0, x1, z1, 0, PALETTE.yard, 0.1);
                if (rand() < 0.5) b.blob(x + (rand() - 0.5) * 3, 0.012, z + (rand() - 0.5) * 3, 0.8 + rand() * 0.6, 7, PALETTE.mudWet);
                break;
            case 'T':
                b.flat(x0, z0, x1, z1, 0, PALETTE.grass, 0.12);
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
        // paved tarmac in 1.5 m tiles with slight variation
        const tile = CELL / 4;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                b.flat(x0 + i * tile, z0 + j * tile, x0 + (i + 1) * tile, z0 + (j + 1) * tile, 0, (i + j) % 2 ? PALETTE.tarmac : PALETTE.tarmacDark, 0.05);
            }
        }
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
        // black-and-yellow Lagos kerbs wherever the road meets a house or fence (never across roads or mud alleys)
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
        // tufts of grass along the edges
        for (let i = 0; i < 3; i++) {
            const gx = x + (rand() < 0.5 ? -1 : 1) * (2.4 + rand() * 0.4);
            const gz = z + (rand() - 0.5) * 5;
            b.pyramid(GeoBuilder.trs(gx, 0, gz, 0, rand() * 90, 0, 0.35, 0.3 + rand() * 0.3, 0.35), PALETTE.grass);
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

    _buildPerimeterMarket(b, r, c, x, z) {
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

            // 1. Street-facing Lagos building at the rear of the cell (away from road)
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

    // ----------------------------------------------------------- surroundings

    _buildSurroundings() {
        const rand = mulberry32(101);
        const b = new GeoBuilder(rand);
        const E = 320;
        // Warm urban laterite ground stretching to the horizon
        b.flat(-E, -E, E, E, -0.04, PALETTE.lot, 0.08);

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

        // 1. Dense middle-ground neighborhood (76m to 150m)
        for (let i = 0; i < 180; i++) {
            const a = (i / 180) * Math.PI * 2 + (rand() - 0.5) * 0.15;
            const d = minCenterDist + 4 + rand() * 75;
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
                if (rand() < 0.55) {
                    b.cylinder(GeoBuilder.trs(x + (rand() - 0.5) * 2, h + 0.5, z + (rand() - 0.5) * 2, 0, 0, 0, 0.6, 1.2, 0.6), 8, PALETTE.tank, 0.9, 0.05);
                }
            } else {
                // Palm tree / tropical cluster
                this._addPalm(b, x, z, 1.1 + rand() * 0.5);
            }
        }

        // 2. High telecom masts & large roadside billboards in the neighborhood
        for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2 + rand() * 0.3;
            const d = minCenterDist + 18 + rand() * 55;
            const { x, z } = ensureClearance(Math.cos(a) * d, Math.sin(a) * d, minCenterDist + 15);

            if (j % 2 === 0) {
                // Telecom lattice mast (32m tall with red warning beacon)
                const mastH = 32 + rand() * 8;
                b.cylinder(GeoBuilder.trs(x, 0, z, 0, 0, 0, 0.45, mastH, 0.15), 4, [160, 160, 165], 0.3, 0);
                b.boxAt(x, mastH, z, 0.6, 0.6, 0.6, [240, 40, 40], 0, 0); // red light
            } else {
                // Giant roadside billboard
                const billW = 9.0;
                const billH = 4.5;
                const postH = 10.0;
                const billCol = pick(rand, [[246, 206, 52], [220, 50, 45], [40, 145, 75]]); // MTN yellow, Airtel red, Glo green
                b.cylinder(GeoBuilder.trs(x - 2.5, 0, z, 0, 0, 0, 0.25, postH, 0.25), 6, [70, 70, 75], 1, 0);
                b.cylinder(GeoBuilder.trs(x + 2.5, 0, z, 0, 0, 0, 0.25, postH, 0.25), 6, [70, 70, 75], 1, 0);
                b.boxAt(x, postH + billH / 2, z, billW, billH, 0.3, billCol, (a * 180) / Math.PI, 0);
            }
        }

        // 3. Distant skyline background (150m to 260m)
        for (let k = 0; k < 120; k++) {
            const a = rand() * Math.PI * 2;
            const d = 150 + rand() * 110;
            const { x, z } = ensureClearance(Math.cos(a) * d, Math.sin(a) * d, minCenterDist + 45);
            const sx = 8 + rand() * 6;
            const sz = 8 + rand() * 6;
            const h = 8 + rand() * 8;
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
        const colors = { R: '#5a5c63', M: '#b0623a', '.': '#c07a4a', T: '#c07a4a', B: '#2a1d14', '#': '#38281d' };
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
