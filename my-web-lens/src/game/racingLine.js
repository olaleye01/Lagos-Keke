import {
    BLEND_ADDITIVE,
    Color,
    CULLFACE_NONE,
    Entity,
    MeshInstance,
    StandardMaterial,
    Vec3,
    math
} from 'playcanvas';
import { CELL, GRID, HALF, cellCenter, worldToCell, cellAt } from './constants.js';
import { GeoBuilder } from '../graphics/builder.js';

/**
 * Creates an unlit, additive glowing material for the racing line chevrons.
 */
function createGlowMaterial(color, opacity = 0.88) {
    const m = new StandardMaterial();
    m.useLighting = false;
    m.diffuse = new Color(0, 0, 0);
    m.emissive = color;
    m.opacity = opacity;
    m.blendType = BLEND_ADDITIVE;
    m.depthWrite = false;
    m.cull = CULLFACE_NONE;
    m.useFog = false;
    m.update();
    return m;
}

/**
 * Procedurally generates a double-chevron arrow mesh pointing forward along -Z.
 */
function createChevronMesh(device) {
    const b = new GeoBuilder();

    // 1. Front Lead Chevron Arrow
    const tip1 = new Vec3(0, 0, -0.42);
    const notch1 = new Vec3(0, 0, -0.16);
    const left1 = new Vec3(-0.46, 0, 0.16);
    const leftIn1 = new Vec3(-0.25, 0, 0.16);
    const right1 = new Vec3(0.46, 0, 0.16);
    const rightIn1 = new Vec3(0.25, 0, 0.16);

    b.tri(tip1, left1, leftIn1, [255, 255, 255], Vec3.UP);
    b.tri(tip1, leftIn1, notch1, [255, 255, 255], Vec3.UP);
    b.tri(tip1, notch1, rightIn1, [255, 255, 255], Vec3.UP);
    b.tri(tip1, rightIn1, right1, [255, 255, 255], Vec3.UP);

    // 2. Trailing Follower Chevron Accent
    const tip2 = new Vec3(0, 0, -0.06);
    const notch2 = new Vec3(0, 0, 0.12);
    const left2 = new Vec3(-0.36, 0, 0.38);
    const leftIn2 = new Vec3(-0.19, 0, 0.38);
    const right2 = new Vec3(0.36, 0, 0.38);
    const rightIn2 = new Vec3(0.19, 0, 0.38);

    b.tri(tip2, left2, leftIn2, [255, 255, 255], Vec3.UP);
    b.tri(tip2, leftIn2, notch2, [255, 255, 255], Vec3.UP);
    b.tri(tip2, notch2, rightIn2, [255, 255, 255], Vec3.UP);
    b.tri(tip2, rightIn2, right2, [255, 255, 255], Vec3.UP);

    return b.toMeshes(device)[0];
}

const isWalkable = ch => ch === 'R' || ch === 'M' || ch === '.' || ch === 'T';
const isCourtyard = (r, c) => r >= 9 && r <= 11 && c >= 9 && c <= 11;

/**
 * Dynamic 3D Racing Line Guide:
 * Computes street-accurate pathfinding through roads and alleys,
 * and streams an animated trail of glowing Lagos taxi chevrons ahead of the rider.
 */
export class RacingLine {
    constructor(app, map) {
        this.app = app;
        this.map = map;

        // Visual materials: warm Lagos golden-yellow for straights, neon amber for sharp turn apexes
        this.matStraight = createGlowMaterial(new Color(1.0, 0.84, 0.18), 0.88);
        this.matTurn = createGlowMaterial(new Color(1.0, 0.44, 0.08), 0.92);

        this.mesh = createChevronMesh(app.graphicsDevice);
        this.root = new Entity('RacingLine');

        // Pool of 28 chevrons along the guide path
        this.chevronCount = 28;
        this.spacing = 1.15; // metres between chevrons
        this.chevrons = [];

        for (let i = 0; i < this.chevronCount; i++) {
            const e = new Entity(`RacingChevron_${i}`);
            const mi = new MeshInstance(this.mesh, this.matStraight);
            e.addComponent('render', {
                meshInstances: [mi],
                castShadows: false,
                receiveShadows: false
            });
            e.enabled = false;
            this.root.addChild(e);
            this.chevrons.push({ entity: e, meshInstance: mi });
        }

        app.root.addChild(this.root);

        this.smoothedPath = [];
        this.cumLengths = [];
        this.totalLength = 0;
        this.pathPoints = []; // public points for minimap
        this.repathTimer = 0;
        this.streamOffset = 0;
        this.lastCP = null;
    }

    reset() {
        this.smoothedPath = [];
        this.cumLengths = [];
        this.totalLength = 0;
        this.pathPoints = [];
        this.repathTimer = 0;
        this.streamOffset = 0;
        this.lastCP = null;
        this.root.enabled = false;
        for (const c of this.chevrons) {
            c.entity.enabled = false;
        }
    }

    _getNeighbors(r, c) {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const res = [];
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            const ch = cellAt(nr, nc);
            if (!isWalkable(ch)) continue;

            // Gutter safety: crossing between courtyard and outer blocks MUST go via the 4 plank bridges
            const fromCourt = isCourtyard(r, c);
            const toCourt = isCourtyard(nr, nc);
            if (fromCourt !== toCourt) {
                const isPlank =
                    (r === 8 && c === 10 && nr === 9 && nc === 10) || (r === 9 && c === 10 && nr === 8 && nc === 10) ||
                    (r === 12 && c === 10 && nr === 11 && nc === 10) || (r === 11 && c === 10 && nr === 12 && nc === 10) ||
                    (r === 10 && c === 8 && nr === 10 && nc === 9) || (r === 10 && c === 9 && nr === 10 && nc === 8) ||
                    (r === 10 && c === 12 && nr === 10 && nc === 11) || (r === 10 && c === 11 && nr === 10 && nc === 12);
                if (!isPlank) continue;
            }
            res.push([nr, nc]);
        }
        return res;
    }

    _findCellPath(sr, sc, er, ec) {
        if (sr === er && sc === ec) return [[sr, sc]];
        const queue = [[sr, sc]];
        const prev = new Map();
        const visited = new Set([`${sr},${sc}`]);

        while (queue.length > 0) {
            const [cr, cc] = queue.shift();
            if (cr === er && cc === ec) break;

            for (const [nr, nc] of this._getNeighbors(cr, cc)) {
                const key = `${nr},${nc}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    prev.set(key, [cr, cc]);
                    queue.push([nr, nc]);
                }
            }
        }

        if (!prev.has(`${er},${ec}`)) return [];

        const path = [];
        let curr = [er, ec];
        while (curr) {
            path.unshift(curr);
            curr = prev.get(`${curr[0]},${curr[1]}`);
        }
        return path;
    }

    _snapToWalkable(r, c) {
        r = math.clamp(r, 0, GRID - 1);
        c = math.clamp(c, 0, GRID - 1);
        if (isWalkable(cellAt(r, c))) return { r, c };

        // Search 8-neighborhood for closest walkable road or alley
        for (let rad = 1; rad <= 2; rad++) {
            for (let dr = -rad; dr <= rad; dr++) {
                for (let dc = -rad; dc <= rad; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && isWalkable(cellAt(nr, nc))) {
                        return { r: nr, c: nc };
                    }
                }
            }
        }
        return { r, c };
    }

    _computePath(player, targetCP) {
        const startCell = this._snapToWalkable(
            Math.round(player.z / CELL + HALF),
            Math.round(player.x / CELL + HALF)
        );
        const endCell = this._snapToWalkable(targetCP.r, targetCP.c);

        const rawCells = this._findCellPath(startCell.r, startCell.c, endCell.r, endCell.c);
        const rawPoints = [];

        // Prepend current rider position
        rawPoints.push({ x: player.x, z: player.z });

        for (const [r, c] of rawCells) {
            const pt = cellCenter(r, c);
            rawPoints.push(pt);
        }

        // Append precise checkpoint coordinate
        rawPoints.push({ x: targetCP.x, z: targetCP.z });

        // Prune redundant intermediate points that are already behind player or too close
        while (rawPoints.length > 2) {
            const p1 = rawPoints[1];
            const p2 = rawPoints[2];
            const dx = p1.x - player.x;
            const dz = p1.z - player.z;
            const dist = Math.hypot(dx, dz);

            // Duplicate waypoint check
            const p1p2Dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
            if (p1p2Dist < 0.2) {
                rawPoints.splice(1, 1);
                continue;
            }

            // Check if player has already reached or passed p1 along the segment towards p2:
            const segX = p2.x - p1.x;
            const segZ = p2.z - p1.z;
            const segLenSq = segX * segX + segZ * segZ;
            const toPlayerX = player.x - p1.x;
            const toPlayerZ = player.z - p1.z;
            const proj = segLenSq > 1e-4 ? (toPlayerX * segX + toPlayerZ * segZ) / segLenSq : 0;

            // Check dot product with player's forward vector
            const fDot = dx * player.forwardX + dz * player.forwardZ;

            // Prune if player has passed p1 towards p2, or p1 is too close to bike, or p1 is behind player along segment
            if (dist < 1.0 || proj > 0 || (fDot < -0.1 && proj > -0.2)) {
                rawPoints.splice(1, 1);
            } else {
                break;
            }
        }

        // Corner smoothing: rounds sharp 90-degree block turns into aerodynamic apex curves
        const smoothed = [];
        if (rawPoints.length <= 2) {
            smoothed.push(...rawPoints);
        } else {
            smoothed.push(rawPoints[0]);
            for (let i = 1; i < rawPoints.length - 1; i++) {
                const p0 = rawPoints[i - 1];
                const p1 = rawPoints[i];
                const p2 = rawPoints[i + 1];

                const d0x = p1.x - p0.x;
                const d0z = p1.z - p0.z;
                const d1x = p2.x - p1.x;
                const d1z = p2.z - p1.z;
                const l0 = Math.hypot(d0x, d0z);
                const l1 = Math.hypot(d1x, d1z);

                if (l0 < 1e-3 || l1 < 1e-3) {
                    smoothed.push(p1);
                    continue;
                }

                const cornerR = Math.min(2.4, l0 * 0.45, l1 * 0.45);
                const a = { x: p1.x - (d0x / l0) * cornerR, z: p1.z - (d0z / l0) * cornerR };
                const b = { x: p1.x + (d1x / l1) * cornerR, z: p1.z + (d1z / l1) * cornerR };

                smoothed.push(a);
                // 3 intermediate Bezier points along the apex curve
                for (let t = 0.25; t <= 0.75; t += 0.25) {
                    const it = 1 - t;
                    smoothed.push({
                        x: it * it * a.x + 2 * it * t * p1.x + t * t * b.x,
                        z: it * it * a.z + 2 * it * t * p1.z + t * t * b.z
                    });
                }
                smoothed.push(b);
            }
            smoothed.push(rawPoints[rawPoints.length - 1]);
        }

        this.smoothedPath = smoothed;
        this.pathPoints = rawPoints;

        // Compute cumulative arc-lengths for fast constant-speed sampling
        this.cumLengths = [0];
        let tot = 0;
        for (let i = 1; i < smoothed.length; i++) {
            const d = Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].z - smoothed[i - 1].z);
            tot += d;
            this.cumLengths.push(tot);
        }
        this.totalLength = tot;
    }

    _samplePath(dist) {
        if (this.smoothedPath.length === 0) return null;
        dist = math.clamp(dist, 0, this.totalLength);

        // Binary search along cumulative lengths
        let low = 0;
        let high = this.cumLengths.length - 1;
        while (low < high - 1) {
            const mid = (low + high) >> 1;
            if (this.cumLengths[mid] <= dist) low = mid;
            else high = mid;
        }

        const p0 = this.smoothedPath[low];
        const p1 = this.smoothedPath[high];
        const segLen = this.cumLengths[high] - this.cumLengths[low];
        const t = segLen > 1e-4 ? (dist - this.cumLengths[low]) / segLen : 0;

        const x = p0.x + (p1.x - p0.x) * t;
        const z = p0.z + (p1.z - p0.z) * t;

        // Tangent calculation
        let dx = p1.x - p0.x;
        let dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz);
        if (len > 1e-4) {
            dx /= len;
            dz /= len;
        } else {
            dx = 0;
            dz = -1;
        }

        // Lookahead tangent to detect upcoming corner curvature
        const lookDist = Math.min(this.totalLength, dist + 3.2);
        let lookLow = low;
        while (lookLow < this.cumLengths.length - 2 && this.cumLengths[lookLow + 1] < lookDist) {
            lookLow++;
        }
        const lp0 = this.smoothedPath[lookLow];
        const lp1 = this.smoothedPath[lookLow + 1];
        let ldx = lp1.x - lp0.x;
        let ldz = lp1.z - lp0.z;
        const lLen = Math.hypot(ldx, ldz);
        if (lLen > 1e-4) {
            ldx /= lLen;
            ldz /= lLen;
        }

        // Angular curvature between current and lookahead tangent
        const curvature = Math.abs(dx * ldz - dz * ldx);
        const isTurn = curvature > 0.28;

        return { x, z, dx, dz, isTurn };
    }

    getSurfaceY(x, z) {
        const d = Math.hypot(x, z);
        // Wooden plank bridges across the central drainage trench (radius ~7.8m)
        if (d >= 6.4 && d <= 9.2) {
            if (Math.abs(x) < 1.4 || Math.abs(z) < 1.4) {
                return 0.12; // on top of plank deck boards
            }
        }
        return 0.045; // slightly above tarmac / mud ground plane
    }

    update(dt, player, targetCP, isActive) {
        if (!isActive || !targetCP) {
            if (this.root.enabled) this.root.enabled = false;
            return;
        }

        if (!this.root.enabled) this.root.enabled = true;

        // Check if target checkpoint changed or periodic repath timer elapsed (~7 times/sec)
        this.repathTimer -= dt;
        if (this.lastCP !== targetCP || this.repathTimer <= 0 || this.smoothedPath.length === 0) {
            this.lastCP = targetCP;
            this.repathTimer = 0.14;
            this._computePath(player, targetCP);
        }

        // Kinetic streaming animation: lines flow FORWARD away from the rider down the track toward the checkpoint
        const streamSpeed = 7.5 + Math.max(0, player.speed) * 0.75;
        this.streamOffset = (this.streamOffset + dt * streamSpeed) % this.spacing;

        const baseDist = 1.0;
        const maxGuideDist = 30.0; // 30m forward sightline

        for (let i = 0; i < this.chevronCount; i++) {
            const ch = this.chevrons[i];
            // Moving away from the rider: + this.streamOffset causes distance to increase over time
            const dist = baseDist + i * this.spacing + this.streamOffset;

            if (dist < baseDist || dist > this.totalLength || dist > maxGuideDist) {
                if (ch.entity.enabled) ch.entity.enabled = false;
                continue;
            }

            const sample = this._samplePath(dist);
            if (!sample) {
                if (ch.entity.enabled) ch.entity.enabled = false;
                continue;
            }

            const y = this.getSurfaceY(sample.x, sample.z);
            const yaw = Math.atan2(-sample.dx, -sample.dz);

            ch.entity.setPosition(sample.x, y, sample.z);
            ch.entity.setEulerAngles(0, (yaw * 180) / Math.PI, 0);

            // Dynamic scale tapering: smooth emergence in front of bicycle, tapered fade-out at horizon & checkpoint
            let scale = 1.0;
            if (dist < 3.4) {
                scale = math.clamp((dist - baseDist) / 2.0, 0.0, 1.0);
            } else if (dist > 22.0) {
                scale = math.clamp((maxGuideDist - dist) / 8.0, 0.0, 1.0);
            }

            // Taper into checkpoint target if approaching the goal
            const distToCP = this.totalLength - dist;
            if (distToCP < 3.0) {
                scale = Math.min(scale, math.clamp(distToCP / 3.0, 0.0, 1.0));
            }

            if (scale <= 0.02) {
                if (ch.entity.enabled) ch.entity.enabled = false;
                continue;
            }

            ch.entity.setLocalScale(scale, 1, scale);

            // Dynamic color: golden-yellow for straights, energetic neon amber for sharp turn apexes
            ch.meshInstance.material = sample.isTurn ? this.matTurn : this.matStraight;

            if (!ch.entity.enabled) ch.entity.enabled = true;
        }
    }
}
