import {
    BLEND_ADDITIVE,
    Color,
    CULLFACE_NONE,
    Entity,
    Mesh,
    MeshInstance,
    PRIMITIVE_TRIANGLES,
    StandardMaterial,
    Vec3,
    math
} from 'playcanvas';
import { CELL, GRID, HALF, cellCenter, worldToCell } from './constants.js';
import { GeoBuilder } from '../graphics/builder.js';

/** Major road corridor grid lines in cell coordinates */
const CORRIDOR_ROWS = [1, 6, 10, 14, 19];
const CORRIDOR_COLS = [1, 5, 10, 15, 19];

/** Number of cross-sectional slices along the continuous futuristic ribbon */
const SLICE_COUNT = 60;
const MAX_AHEAD_DIST = 27.5; // metres forward guide reach
const CORNER_RADIUS = 2.4;   // fillet radius inside 6m open intersections

/**
 * Creates unlit, additive glowing material for the futuristic ribbon.
 */
function createFuturisticRibbonMaterial() {
    const m = new StandardMaterial();
    m.useLighting = false;
    m.diffuse = new Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.blendType = BLEND_ADDITIVE;
    m.depthWrite = false;
    m.cull = CULLFACE_NONE;
    m.useFog = false;
    m.update();
    return m;
}

/**
 * Procedurally generates a circular holographic photon disc mesh.
 */
function createPhotonDiscMesh(device) {
    const b = new GeoBuilder();
    const R = 0.18;
    const segs = 12;
    const center = new Vec3(0, 0, 0);
    const ring = [];
    for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        ring.push(new Vec3(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    for (let i = 0; i < segs; i++) {
        b.tri(center, ring[i], ring[(i + 1) % segs], [255, 255, 255], Vec3.UP);
    }
    return b.toMeshes(device)[0];
}

/**
 * Builds the static roadmap adjacency graph for the Hood corridor network.
 */
function buildCorridorGraph() {
    const nodes = new Map();
    const adj = new Map();
    const nodeKey = (r, c) => `${r},${c}`;

    for (const r of CORRIDOR_ROWS) {
        for (const c of CORRIDOR_COLS) {
            const { x, z } = cellCenter(r, c);
            const k = nodeKey(r, c);
            nodes.set(k, { r, c, x, z, key: k });
            adj.set(k, []);
        }
    }

    // Horizontal street segments
    for (const r of CORRIDOR_ROWS) {
        for (let i = 0; i < CORRIDOR_COLS.length - 1; i++) {
            const c1 = CORRIDOR_COLS[i];
            const c2 = CORRIDOR_COLS[i + 1];
            const k1 = nodeKey(r, c1);
            const k2 = nodeKey(r, c2);
            const d = Math.abs(nodes.get(k1).x - nodes.get(k2).x);
            adj.get(k1).push({ node: nodes.get(k2), dist: d });
            adj.get(k2).push({ node: nodes.get(k1), dist: d });
        }
    }

    // Vertical street segments
    for (const c of CORRIDOR_COLS) {
        for (let i = 0; i < CORRIDOR_ROWS.length - 1; i++) {
            const r1 = CORRIDOR_ROWS[i];
            const r2 = CORRIDOR_ROWS[i + 1];
            const k1 = nodeKey(r1, c);
            const k2 = nodeKey(r2, c);
            const d = Math.abs(nodes.get(k1).z - nodes.get(k2).z);
            adj.get(k1).push({ node: nodes.get(k2), dist: d });
            adj.get(k2).push({ node: nodes.get(k1), dist: d });
        }
    }

    return { nodes, adj, nodeKey };
}

/**
 * Smooth, Dynamic Futuristic Racing Line:
 * Route-aware street corridor navigation with zero jitter, zero clipping,
 * smooth rounded fillet curves, accurate road/bridge surface alignment,
 * and seamless checkpoint transitions.
 */
export class RacingLine {
    constructor(app, map) {
        this.app = app;
        this.map = map;
        this.device = app.graphicsDevice;

        this.graph = buildCorridorGraph();

        this.root = new Entity('FuturisticRacingLine');

        // 1. Holographic Energy Ribbon Mesh (60 slices x 3 vertices)
        this.sliceCount = SLICE_COUNT;
        this.vertexCount = this.sliceCount * 3;

        this.positions = new Float32Array(this.vertexCount * 3);
        this.normals = new Float32Array(this.vertexCount * 3);
        for (let i = 0; i < this.vertexCount; i++) {
            this.normals[i * 3 + 1] = 1.0;
        }
        this.colors = new Uint8Array(this.vertexCount * 4);

        const quadCount = (this.sliceCount - 1) * 2;
        this.indices = new Uint16Array(quadCount * 2 * 3);
        let idx = 0;
        for (let i = 0; i < this.sliceCount - 1; i++) {
            const r0 = i * 3;
            const r1 = (i + 1) * 3;

            // Left quad: (L0, C0, C1) and (L0, C1, L1)
            this.indices[idx++] = r0;
            this.indices[idx++] = r0 + 1;
            this.indices[idx++] = r1 + 1;

            this.indices[idx++] = r0;
            this.indices[idx++] = r1 + 1;
            this.indices[idx++] = r1;

            // Right quad: (C0, R0, R1) and (C0, R1, C1)
            this.indices[idx++] = r0 + 1;
            this.indices[idx++] = r0 + 2;
            this.indices[idx++] = r1 + 2;

            this.indices[idx++] = r0 + 1;
            this.indices[idx++] = r1 + 2;
            this.indices[idx++] = r1 + 1;
        }

        this.ribbonMesh = new Mesh(this.device);
        this.ribbonMesh.setPositions(this.positions);
        this.ribbonMesh.setNormals(this.normals);
        this.ribbonMesh.setColors32(this.colors);
        this.ribbonMesh.setIndices(this.indices);
        this.ribbonMesh.update(PRIMITIVE_TRIANGLES, false);

        this.ribbonMaterial = createFuturisticRibbonMaterial();
        this.ribbonInstance = new MeshInstance(this.ribbonMesh, this.ribbonMaterial);

        this.ribbonEntity = new Entity('HolographicRibbon');
        this.ribbonEntity.addComponent('render', {
            meshInstances: [this.ribbonInstance],
            castShadows: false,
            receiveShadows: false
        });
        this.root.addChild(this.ribbonEntity);

        // 2. Floating Holographic Photon Orbs
        this.photonMesh = createPhotonDiscMesh(this.device);
        this.photonMaterial = new StandardMaterial();
        this.photonMaterial.useLighting = false;
        this.photonMaterial.diffuse = new Color(0, 0, 0);
        this.photonMaterial.emissive = new Color(1.0, 0.96, 0.60);
        this.photonMaterial.opacity = 0.90;
        this.photonMaterial.blendType = BLEND_ADDITIVE;
        this.photonMaterial.depthWrite = false;
        this.photonMaterial.cull = CULLFACE_NONE;
        this.photonMaterial.useFog = false;
        this.photonMaterial.update();

        this.photonCount = 6;
        this.photons = [];
        for (let i = 0; i < this.photonCount; i++) {
            const pe = new Entity(`PhotonOrb_${i}`);
            pe.addComponent('render', {
                meshInstances: [new MeshInstance(this.photonMesh, this.photonMaterial)],
                castShadows: false,
                receiveShadows: false
            });
            pe.enabled = false;
            this.root.addChild(pe);
            this.photons.push(pe);
        }

        app.root.addChild(this.root);

        // State & Path storage
        this.routePolyline = [];    // stable route with rounded fillets
        this.routeCumLengths = [];
        this.routeTotalLen = 0;
        this.pathPoints = [];       // public points for minimap
        this.activeTargetCP = null;
        this.time = 0;

        // Transition pulse when checkpoint changes
        this.transitionPulse = 0;
    }

    reset() {
        this.routePolyline = [];
        this.routeCumLengths = [];
        this.routeTotalLen = 0;
        this.pathPoints = [];
        this.activeTargetCP = null;
        this.time = 0;
        this.transitionPulse = 0;
        this.root.enabled = false;
        for (const p of this.photons) p.enabled = false;
    }

    /**
     * Finds the nearest corridor intersection node to a world point (x, z).
     */
    _getNearestNode(x, z) {
        let best = null;
        let minDist = Infinity;
        for (const node of this.graph.nodes.values()) {
            const d = Math.hypot(x - node.x, z - node.z);
            if (d < minDist) {
                minDist = d;
                best = node;
            }
        }
        return best;
    }

    /**
     * Dijkstra shortest corridor path between two nodes.
     */
    _findShortestPath(startNode, endNode) {
        if (startNode.key === endNode.key) return [startNode];

        const dist = new Map();
        const prev = new Map();
        const pq = [[0, startNode.key]];
        dist.set(startNode.key, 0);

        while (pq.length > 0) {
            pq.sort((a, b) => a[0] - b[0]);
            const [d, uKey] = pq.shift();
            if (uKey === endNode.key) break;
            if (d > dist.get(uKey)) continue;

            const neighbors = this.graph.adj.get(uKey) || [];
            for (const { node: vNode, dist: edgeLen } of neighbors) {
                const alt = d + edgeLen;
                if (!dist.has(vNode.key) || alt < dist.get(vNode.key)) {
                    dist.set(vNode.key, alt);
                    prev.set(vNode.key, uKey);
                    pq.push([alt, vNode.key]);
                }
            }
        }

        if (!prev.has(endNode.key)) return [startNode, endNode];

        const path = [];
        let currKey = endNode.key;
        while (currKey) {
            path.unshift(this.graph.nodes.get(currKey));
            currKey = prev.get(currKey);
        }
        return path;
    }

    /**
     * Compiles a sequence of corridor nodes into a continuous, obstacle-safe polyline
     * with rounded quarter-circle fillet arcs inside street intersections.
     */
    _compileRouteWithFillets(nodePath) {
        if (nodePath.length < 2) return nodePath.map(n => ({ x: n.x, z: n.z }));

        const polyline = [];
        polyline.push({ x: nodePath[0].x, z: nodePath[0].z });

        for (let i = 1; i < nodePath.length - 1; i++) {
            const prev = nodePath[i - 1];
            const curr = nodePath[i];
            const next = nodePath[i + 1];

            const d0x = curr.x - prev.x;
            const d0z = curr.z - prev.z;
            const d1x = next.x - curr.x;
            const d1z = next.z - curr.z;

            const l0 = Math.hypot(d0x, d0z);
            const l1 = Math.hypot(d1x, d1z);

            if (l0 < 1e-3 || l1 < 1e-3) continue;

            const u0x = d0x / l0;
            const u0z = d0z / l0;
            const u1x = d1x / l1;
            const u1z = d1z / l1;

            // Check if turn is collinear (straight road through intersection)
            const dot = u0x * u1x + u0z * u1z;
            if (dot > 0.95) {
                // Straight through: single intersection centerpoint
                polyline.push({ x: curr.x, z: curr.z });
                continue;
            }

            // Perpendicular 90-degree corner: construct smooth Bézier fillet arc inside intersection
            const r = Math.min(CORNER_RADIUS, l0 * 0.45, l1 * 0.45);
            const startX = curr.x - u0x * r;
            const startZ = curr.z - u0z * r;
            const endX = curr.x + u1x * r;
            const endZ = curr.z + u1z * r;

            polyline.push({ x: startX, z: startZ });

            const numArcSteps = 6;
            for (let s = 1; s < numArcSteps; s++) {
                const t = s / numArcSteps;
                const it = 1 - t;
                polyline.push({
                    x: it * it * startX + 2 * it * t * curr.x + t * t * endX,
                    z: it * it * startZ + 2 * it * t * curr.z + t * t * endZ
                });
            }

            polyline.push({ x: endX, z: endZ });
        }

        const last = nodePath[nodePath.length - 1];
        polyline.push({ x: last.x, z: last.z });

        return polyline;
    }

    /**
     * Recomputes the global corridor route to the active target checkpoint.
     */
    _recomputeGlobalRoute(player, targetCP) {
        const startNode = this._getNearestNode(player.x, player.z);
        const endNode = this._getNearestNode(targetCP.x, targetCP.z);

        const nodePath = this._findShortestPath(startNode, endNode);
        const polyline = this._compileRouteWithFillets(nodePath);

        this.routePolyline = polyline;
        this.pathPoints = polyline;

        // Compute cumulative arc-lengths for fast constant-speed sampling
        this.routeCumLengths = [0];
        let tot = 0;
        for (let i = 1; i < polyline.length; i++) {
            const d = Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].z - polyline[i - 1].z);
            tot += d;
            this.routeCumLengths.push(tot);
        }
        this.routeTotalLen = tot;
    }

    /**
     * Evaluates position and tangent along the route polyline at distance `s`.
     */
    _sampleRoute(s) {
        if (this.routePolyline.length === 0) return null;
        s = math.clamp(s, 0, this.routeTotalLen);

        let low = 0;
        let high = this.routeCumLengths.length - 1;
        while (low < high - 1) {
            const mid = (low + high) >> 1;
            if (this.routeCumLengths[mid] <= s) low = mid;
            else high = mid;
        }

        const p0 = this.routePolyline[low];
        const p1 = this.routePolyline[high];
        const segLen = this.routeCumLengths[high] - this.routeCumLengths[low];
        const t = segLen > 1e-4 ? (s - this.routeCumLengths[low]) / segLen : 0;

        const x = p0.x + (p1.x - p0.x) * t;
        const z = p0.z + (p1.z - p0.z) * t;

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

        // Lookahead tangent to detect approaching corner curvature
        const lookS = Math.min(this.routeTotalLen, s + 3.4);
        let lookLow = low;
        while (lookLow < this.routeCumLengths.length - 2 && this.routeCumLengths[lookLow + 1] < lookS) {
            lookLow++;
        }
        const lp0 = this.routePolyline[lookLow];
        const lp1 = this.routePolyline[lookLow + 1];
        let ldx = lp1.x - lp0.x;
        let ldz = lp1.z - lp0.z;
        const lLen = Math.hypot(ldx, ldz);
        if (lLen > 1e-4) {
            ldx /= lLen;
            ldz /= lLen;
        }

        const curvature = Math.abs(dx * ldz - dz * ldx);
        return { x, z, dx, dz, rx: -dz, rz: dx, curvature };
    }

    /**
     * Projects the rider's current world position onto the corridor polyline
     * to find their current distance `s` along the route.
     */
    _projectPlayer(px, pz) {
        if (this.routePolyline.length < 2) return 0;

        let bestDistSq = Infinity;
        let bestS = 0;

        for (let i = 0; i < this.routePolyline.length - 1; i++) {
            const a = this.routePolyline[i];
            const b = this.routePolyline[i + 1];
            const segDx = b.x - a.x;
            const segDz = b.z - a.z;
            const segLenSq = segDx * segDx + segDz * segDz;
            if (segLenSq < 1e-4) continue;

            const segLen = Math.sqrt(segLenSq);
            const u = math.clamp(((px - a.x) * segDx + (pz - a.z) * segDz) / segLenSq, 0, 1);
            const projX = a.x + segDx * u;
            const projZ = a.z + segDz * u;

            const dSq = (px - projX) * (px - projX) + (pz - projZ) * (pz - projZ);
            if (dSq < bestDistSq) {
                bestDistSq = dSq;
                bestS = this.routeCumLengths[i] + u * segLen;
            }
        }

        return bestS;
    }

    /**
     * Returns exact, elevation-accurate ground height for road, mud, and wooden bridge decks.
     */
    getSurfaceY(x, z) {
        const d = Math.hypot(x, z);
        // Wooden plank bridges across the central drainage trench (radius 6.6m to 9.0m)
        if (d >= 6.4 && d <= 9.2) {
            if (Math.abs(x) < 1.4 || Math.abs(z) < 1.4) {
                // Smooth elevation ramp across bridge entrance/exit
                if (d > 8.8) {
                    const u = (9.2 - d) / 0.4;
                    return math.lerp(0.045, 0.118, u);
                } else if (d < 6.8) {
                    const u = (d - 6.4) / 0.4;
                    return math.lerp(0.045, 0.118, u);
                }
                return 0.118; // elevated on plank deck
            }
        }
        return 0.042; // slightly above tarmac / mud ground plane
    }

    update(dt, player, targetCP, isActive) {
        if (!isActive || !targetCP) {
            if (this.root.enabled) this.root.enabled = false;
            return;
        }

        if (!this.root.enabled) this.root.enabled = true;

        this.time += dt;
        if (this.transitionPulse > 0) {
            this.transitionPulse = Math.max(0, this.transitionPulse - dt * 2.0);
        }

        // Detect checkpoint transition: trigger seamless quantum pulse and update global route
        if (this.activeTargetCP !== targetCP) {
            this.activeTargetCP = targetCP;
            this.transitionPulse = 1.0;
            this._recomputeGlobalRoute(player, targetCP);
        }

        if (this.routePolyline.length < 2 || this.routeTotalLen < 1.0) {
            this.ribbonEntity.enabled = false;
            for (const p of this.photons) p.enabled = false;
            return;
        }

        this.ribbonEntity.enabled = true;

        // Project player onto the stable road route
        const playerS = this._projectPlayer(player.x, player.z);

        // Calculate Hermite lead-in anchor point 1.2m directly in front of the bicycle
        const bikeHeadX = player.x - player.forwardX * 1.2;
        const bikeHeadZ = player.z - player.forwardZ * 1.2;
        const bikeTanX = -player.forwardX;
        const bikeTanZ = -player.forwardZ;

        // Merge distance where Hermite curve smoothly meets the road centerline (4.2m ahead)
        const mergeS = playerS + 4.2;
        const roadSample = this._sampleRoute(mergeS) || this._sampleRoute(playerS);
        const mergeTargetX = roadSample.x;
        const mergeTargetZ = roadSample.z;
        const mergeTanX = roadSample.dx;
        const mergeTanZ = roadSample.dz;

        const hermiteSpan = Math.hypot(mergeTargetX - bikeHeadX, mergeTargetZ - bikeHeadZ) || 4.2;

        const maxAhead = Math.min(MAX_AHEAD_DIST, this.routeTotalLen - playerS);
        const t = this.time;

        // =====================================================================
        // 1. UPDATE FUTURISTIC HOLOGRAPHIC ENERGY RIBBON MESH
        // =====================================================================
        let posIdx = 0;
        let colIdx = 0;

        for (let i = 0; i < this.sliceCount; i++) {
            const relDist = (i / (this.sliceCount - 1)) * maxAhead;
            let cx = 0;
            let cz = 0;
            let dx = 0;
            let dz = 0;
            let rx = 0;
            let rz = 0;
            let curvature = 0;

            if (relDist <= 4.2) {
                // Cubic Hermite smooth lead-in from bicycle heading into road centerline
                const u = math.clamp(relDist / 4.2, 0, 1);
                const u2 = u * u;
                const u3 = u2 * u;

                const h00 = 2 * u3 - 3 * u2 + 1;
                const h10 = u3 - 2 * u2 + u;
                const h01 = -2 * u3 + 3 * u2;
                const h11 = u3 - u2;

                cx = h00 * bikeHeadX + h10 * (hermiteSpan * bikeTanX) + h01 * mergeTargetX + h11 * (hermiteSpan * mergeTanX);
                cz = h00 * bikeHeadZ + h10 * (hermiteSpan * bikeTanZ) + h01 * mergeTargetZ + h11 * (hermiteSpan * mergeTanZ);

                // Derivative for tangent
                const dh00 = 6 * u2 - 6 * u;
                const dh10 = 3 * u2 - 4 * u + 1;
                const dh01 = -6 * u2 + 6 * u;
                const dh11 = 3 * u2 - 2 * u;

                dx = dh00 * bikeHeadX + dh10 * (hermiteSpan * bikeTanX) + dh01 * mergeTargetX + dh11 * (hermiteSpan * mergeTanX);
                dz = dh00 * bikeHeadZ + dh10 * (hermiteSpan * bikeTanZ) + dh01 * mergeTargetZ + dh11 * (hermiteSpan * mergeTanZ);

                const tLen = Math.hypot(dx, dz);
                if (tLen > 1e-4) {
                    dx /= tLen;
                    dz /= tLen;
                } else {
                    dx = bikeTanX;
                    dz = bikeTanZ;
                }
                rx = -dz;
                rz = dx;
                curvature = 0;
            } else {
                // Follow the exact, stable road corridor route with rounded fillets
                const sample = this._sampleRoute(playerS + relDist);
                if (sample) {
                    cx = sample.x;
                    cz = sample.z;
                    dx = sample.dx;
                    dz = sample.dz;
                    rx = sample.rx;
                    rz = sample.rz;
                    curvature = sample.curvature;
                }
            }

            // Height and elevation matching
            const cy = this.getSurfaceY(cx, cz) + 0.052; // slightly elevated convex spine

            // Width tapering: opens smoothly in front of handlebars, tapers at horizon
            const tIn = math.clamp(relDist / 2.6, 0, 1);
            const tOut = math.clamp((maxAhead - relDist) / 6.0, 0, 1);
            const baseHalfWidth = 0.32;
            const halfWidth = baseHalfWidth * tIn * tOut;

            const lx = cx - rx * halfWidth;
            const lz = cz - rz * halfWidth;
            const ly = this.getSurfaceY(lx, lz) + 0.038;

            const rxPos = cx + rx * halfWidth;
            const rzPos = cz + rz * halfWidth;
            const ry = this.getSurfaceY(rxPos, rzPos) + 0.038;

            // Kinetic photon stream waves travelling forward
            const streamWave = 0.76 + 0.24 * Math.sin(relDist * 1.5 - t * 6.2);

            // Checkpoint transition quantum pulse wave
            let sweepBoost = 0;
            if (this.transitionPulse > 0) {
                const waveFront = (1.0 - this.transitionPulse) * maxAhead;
                const distToFront = Math.abs(relDist - waveFront);
                if (distToFront < 3.5) {
                    sweepBoost = (1.0 - distToFront / 3.5) * 0.45;
                }
            }

            const alphaFactor = tIn * tOut * (streamWave + sweepBoost);

            // Dynamic Braking / Turning Curvature Shift:
            // Straight: Solar Cyber-Yellow (#fde047), Corner/Brake: Electric Neon Orange (#fb923c)
            const turnFactor = math.clamp((curvature - 0.12) / 0.22, 0, 1);

            const spineR = Math.round(math.lerp(254, 251, turnFactor));
            const spineG = Math.round(math.lerp(224, 146, turnFactor));
            const spineB = Math.round(math.lerp(71, 60, turnFactor));

            const edgeR = Math.round(math.lerp(245, 234, turnFactor));
            const edgeG = Math.round(math.lerp(158, 88, turnFactor));
            const edgeB = Math.round(math.lerp(11, 12, turnFactor));

            // 1. Left Edge Vertex (soft feathered glow halo)
            this.positions[posIdx++] = lx;
            this.positions[posIdx++] = ly;
            this.positions[posIdx++] = lz;

            const edgeAlpha = Math.floor(255 * math.clamp(alphaFactor * 0.16, 0, 1));
            this.colors[colIdx++] = edgeR;
            this.colors[colIdx++] = edgeG;
            this.colors[colIdx++] = edgeB;
            this.colors[colIdx++] = edgeAlpha;

            // 2. Center Spine Vertex (hot photon beam core)
            this.positions[posIdx++] = cx;
            this.positions[posIdx++] = cy;
            this.positions[posIdx++] = cz;

            const spineAlpha = Math.floor(255 * math.clamp(alphaFactor * 0.95, 0, 1));
            this.colors[colIdx++] = spineR;
            this.colors[colIdx++] = spineG;
            this.colors[colIdx++] = spineB;
            this.colors[colIdx++] = spineAlpha;

            // 3. Right Edge Vertex (soft feathered glow halo)
            this.positions[posIdx++] = rxPos;
            this.positions[posIdx++] = ry;
            this.positions[posIdx++] = rzPos;

            this.colors[colIdx++] = edgeR;
            this.colors[colIdx++] = edgeG;
            this.colors[colIdx++] = edgeB;
            this.colors[colIdx++] = edgeAlpha;
        }

        // Upload updated geometry to GPU with auto bounding-box computation
        this.ribbonMesh.setPositions(this.positions);
        this.ribbonMesh.setColors32(this.colors);
        this.ribbonMesh.update(PRIMITIVE_TRIANGLES, true);

        // =====================================================================
        // 2. UPDATE FLOATING HOLOGRAPHIC PHOTON ORBS
        // =====================================================================
        const orbSpeed = 5.8 + Math.max(0, player.speed) * 0.45;
        const orbSpan = Math.max(2.0, maxAhead - 2.5);

        for (let k = 0; k < this.photonCount; k++) {
            const pe = this.photons[k];
            if (orbSpan <= 3.0) {
                pe.enabled = false;
                continue;
            }

            const orbRelDist = 2.0 + ((k * (orbSpan / this.photonCount) + t * orbSpeed) % orbSpan);

            let ox = 0;
            let oz = 0;

            if (orbRelDist <= 4.2) {
                const u = orbRelDist / 4.2;
                const u2 = u * u;
                const u3 = u2 * u;
                const h00 = 2 * u3 - 3 * u2 + 1;
                const h10 = u3 - 2 * u2 + u;
                const h01 = -2 * u3 + 3 * u2;
                const h11 = u3 - u2;
                ox = h00 * bikeHeadX + h10 * (hermiteSpan * bikeTanX) + h01 * mergeTargetX + h11 * (hermiteSpan * mergeTanX);
                oz = h00 * bikeHeadZ + h10 * (hermiteSpan * bikeTanZ) + h01 * mergeTargetZ + h11 * (hermiteSpan * mergeTanZ);
            } else {
                const sample = this._sampleRoute(playerS + orbRelDist);
                if (sample) {
                    ox = sample.x;
                    oz = sample.z;
                }
            }

            const oy = this.getSurfaceY(ox, oz) + 0.065; // hovering slightly above ribbon
            pe.setPosition(ox, oy, oz);

            const tIn = math.clamp((orbRelDist - 1.0) / 2.5, 0, 1);
            const tOut = math.clamp((maxAhead - orbRelDist) / 5.0, 0, 1);
            const orbPulse = (0.92 + 0.18 * Math.sin(t * 3.2 + k * 1.3)) * tIn * tOut;

            pe.setLocalScale(orbPulse, 1, orbPulse);
            pe.enabled = true;
        }
    }
}
