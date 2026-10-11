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
                b.flat(x0, z0, x1, z1, 0, PALETTE.grassDark, 0.12);
                this._buildBoundary(b, r, c, x, z);
                this.solids[r][c] = { type: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z1, h: 2 };
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
        if (axis === 'x') {
            b.flat(x - 1.6, z - 0.08, x - 0.2, z + 0.08, 0.02, PALETTE.roadLine);
            b.flat(x + 1.4, z - 0.08, x + 2.8, z + 0.08, 0.02, PALETTE.roadLine);
        } else if (axis === 'z') {
            b.flat(x - 0.08, z - 1.6, x + 0.08, z - 0.2, 0.02, PALETTE.roadLine);
            b.flat(x - 0.08, z + 1.4, x + 0.08, z + 2.8, 0.02, PALETTE.roadLine);
        }
        // black-and-yellow Lagos kerbs wherever the road meets a house or fence
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
                    // shop sign + zinc awning
                    facade(s, 0, h - 0.45, sx * 0.7, 0.6, pick(rand, PALETTE.signs), 0.2);
                    const half = s.nx ? sx / 2 : sz / 2;
                    const ax = x + s.nx * (half + 0.5);
                    const az = z + s.nz * (half + 0.5);
                    const tilt = s.nz ? s.nz * 14 : 0;
                    const roll = s.nx ? -s.nx * 14 : 0;
                    b.box(GeoBuilder.trs(ax, 2.35, az, tilt, 0, roll, s.nz ? 2.6 : 1.1, 0.06, s.nz ? 1.1 : 2.6), PALETTE.roofZinc);
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

    _buildBoundary(b, r, c, x, z) {
        const rand = this.rand;
        let edged = false;
        for (const s of Object.values(SIDES)) {
            const n = cellAt(r + s.dr, c + s.dc);
            const inside = r + s.dr >= 0 && r + s.dr < GRID && c + s.dc >= 0 && c + s.dc < GRID;
            if (!inside || n === '#') continue;
            edged = true;
            const wx = x + s.nx * (HALF_CELL - 0.15);
            const wz = z + s.nz * (HALF_CELL - 0.15);
            const len = CELL + 0.3;
            if (s.nz) {
                b.boxAt(wx, 0.9, wz, len, 1.8, 0.3, PALETTE.fence, 0, 0.04);
                b.boxAt(wx, 1.85, wz, len, 0.12, 0.4, PALETTE.fenceTop, 0, 0);
                b.boxAt(wx - HALF_CELL, 1.0, wz, 0.45, 2.0, 0.45, PALETTE.fenceTop, 0, 0);
            } else {
                b.boxAt(wx, 0.9, wz, 0.3, 1.8, len, PALETTE.fence, 0, 0.04);
                b.boxAt(wx, 1.85, wz, 0.4, 0.12, len, PALETTE.fenceTop, 0, 0);
                b.boxAt(wx, 1.0, wz - HALF_CELL, 0.45, 2.0, 0.45, PALETTE.fenceTop, 0, 0);
            }
        }
        // bushes behind the fence
        const count = edged ? 2 : 3;
        for (let i = 0; i < count; i++) {
            const bx = x + (rand() - 0.5) * 4;
            const bz = z + (rand() - 0.5) * 4;
            const s = 0.8 + rand() * 0.9;
            b.pyramid(GeoBuilder.trs(bx, 0, bz, 0, rand() * 90, 0, s * 1.6, s * 1.4, s * 1.6), PALETTE.bush, 0.2);
        }
        if (rand() < 0.22) this._addPalm(b, x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2, 0.9 + rand() * 0.3);
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
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (MAP[r][c] !== 'R') continue;
                const axis = this._roadAxis(r, c);
                if (axis === 'corner') continue;
                if (r === START.r && Math.abs(c - START.c) <= 1) continue;
                const { x, z } = cellCenter(r, c);
                const off = HALF_CELL - 0.45;
                // a crossing runs perpendicular to the road direction
                const a = axis === 'x' ? { x, z: z - off } : { x: x - off, z };
                const b = axis === 'x' ? { x, z: z + off } : { x: x + off, z };
                this.crossings.push({ r, c, a, b });
            }
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

    // ----------------------------------------------------------- surroundings

    _buildSurroundings() {
        const rand = mulberry32(99);
        const b = new GeoBuilder(rand);
        const E = 260;
        b.flat(-E, -E, E, E, -0.03, PALETTE.grassDark, 0);
        const inner = (GRID / 2) * CELL + 4;
        // a distant ring of houses and palms gives the feeling of a dense city
        for (let i = 0; i < 140; i++) {
            const a = rand() * Math.PI * 2;
            const d = inner + 8 + rand() * 90;
            const x = Math.cos(a) * d;
            const z = Math.sin(a) * d;
            if (rand() < 0.62) {
                const sx = 5 + rand() * 4;
                const sz = 5 + rand() * 4;
                const h = rand() < 0.3 ? 6 + rand() * 4 : 3 + rand();
                const yaw = rand() * 90;
                b.boxAt(x, h / 2, z, sx, h, sz, pick(rand, PALETTE.walls), yaw, 0.05);
                b.pyramid(GeoBuilder.trs(x, h, z, 0, yaw, 0, sx + 0.6, 1.2, sz + 0.6), pick(rand, [PALETTE.roofRust, PALETTE.roofRust2, PALETTE.roofZinc]));
            } else {
                const saved = this.rand;
                this.rand = rand;
                this._addPalm(b, x, z, 1 + rand() * 0.4);
                this.rand = saved;
            }
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
        const result = { hit: false, nx: 0, nz: 0 };
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
        const colors = { R: '#5a5c63', M: '#b0623a', '.': '#c07a4a', T: '#c07a4a', B: '#2a1d14', '#': '#335a2a' };
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const ch = MAP[r][c];
                ctx.fillStyle = colors[ch] || '#000';
                ctx.fillRect(c * px, r * px, px + 0.5, px + 0.5);
                if (ch === 'B') {
                    ctx.fillStyle = '#4a3527';
                    ctx.fillRect(c * px + px * 0.12, r * px + px * 0.12, px * 0.76, px * 0.76);
                }
                if (ch === 'T') {
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
