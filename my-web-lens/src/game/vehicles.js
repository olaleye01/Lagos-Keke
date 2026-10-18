import { Vec3, math, Entity, Color } from 'playcanvas';
import {
    createCar,
    createDanfo,
    createKeke,
    createOkada
} from '../graphics/models.js';
import { GAME, VEHICLE_CONFIG, BIKE, GENERAL_COLLISION_SHOUTS } from './constants.js';
import { mulberry32, pick } from '../graphics/palette.js';

/**
 * Closed-form parametric track evaluator for the perimeter ring road.
 * Supports smooth rounded corner fillets.
 */
class LoopTrack {
    constructor(K, r, clockwise = true) {
        this.K = K;
        this.r = r;
        this.clockwise = clockwise;
        this.S = 2 * (K - r); // straight length on each side
        this.A = (Math.PI / 2) * r; // quarter circle fillet length
        this.quadLen = this.S + this.A;
        this.totalLen = 4 * this.quadLen;
    }

    /**
     * Given track distance `s`, returns { x, z }
     */
    _pos(s) {
        let sRel = ((s % this.totalLen) + this.totalLen) % this.totalLen;
        const quad = Math.floor(sRel / this.quadLen);
        const u = sRel - quad * this.quadLen;
        const K = this.K;
        const r = this.r;
        const S = this.S;
        const A = this.A;

        let x = 0;
        let z = 0;

        if (this.clockwise) {
            // Quadrant 0: North Road (heading East, +X)
            // Quadrant 1: East Road (heading South, +Z)
            // Quadrant 2: South Road (heading West, -X)
            // Quadrant 3: West Road (heading North, -Z)
            if (quad === 0) {
                if (u < S) {
                    x = -(K - r) + u;
                    z = -K;
                } else {
                    const t = (u - S) / A;
                    const ang = -Math.PI / 2 + t * (Math.PI / 2);
                    x = (K - r) + Math.cos(ang) * r;
                    z = -(K - r) + Math.sin(ang) * r;
                }
            } else if (quad === 1) {
                if (u < S) {
                    x = K;
                    z = -(K - r) + u;
                } else {
                    const t = (u - S) / A;
                    const ang = t * (Math.PI / 2);
                    x = (K - r) + Math.cos(ang) * r;
                    z = (K - r) + Math.sin(ang) * r;
                }
            } else if (quad === 2) {
                if (u < S) {
                    x = (K - r) - u;
                    z = K;
                } else {
                    const t = (u - S) / A;
                    const ang = Math.PI / 2 + t * (Math.PI / 2);
                    x = -(K - r) + Math.cos(ang) * r;
                    z = (K - r) + Math.sin(ang) * r;
                }
            } else {
                if (u < S) {
                    x = -K;
                    z = (K - r) - u;
                } else {
                    const t = (u - S) / A;
                    const ang = Math.PI + t * (Math.PI / 2);
                    x = -(K - r) + Math.cos(ang) * r;
                    z = -(K - r) + Math.sin(ang) * r;
                }
            }
        } else {
            // Counter-Clockwise:
            // Quad 0: North Road (heading West, -X)
            // Quad 1: West Road (heading South, +Z)
            // Quad 2: South Road (heading East, +X)
            // Quad 3: East Road (heading North, -Z)
            if (quad === 0) {
                if (u < S) {
                    x = (K - r) - u;
                    z = -K;
                } else {
                    const t = (u - S) / A;
                    const ang = -Math.PI / 2 - t * (Math.PI / 2);
                    x = -(K - r) + Math.cos(ang) * r;
                    z = -(K - r) + Math.sin(ang) * r;
                }
            } else if (quad === 1) {
                if (u < S) {
                    x = -K;
                    z = -(K - r) + u;
                } else {
                    const t = (u - S) / A;
                    const ang = Math.PI - t * (Math.PI / 2);
                    x = -(K - r) + Math.cos(ang) * r;
                    z = (K - r) + Math.sin(ang) * r;
                }
            } else if (quad === 2) {
                if (u < S) {
                    x = -(K - r) + u;
                    z = K;
                } else {
                    const t = (u - S) / A;
                    const ang = Math.PI / 2 - t * (Math.PI / 2);
                    x = (K - r) + Math.cos(ang) * r;
                    z = (K - r) + Math.sin(ang) * r;
                }
            } else {
                if (u < S) {
                    x = K;
                    z = (K - r) - u;
                } else {
                    const t = (u - S) / A;
                    const ang = -t * (Math.PI / 2);
                    x = (K - r) + Math.cos(ang) * r;
                    z = -(K - r) + Math.sin(ang) * r;
                }
            }
        }

        return { x, z };
    }

    /**
     * Given track distance `s`, returns { x, z, yawDeg, yawRad }
     * Yaw is derived strictly from the motion tangent vector so vehicles ALWAYS face forward.
     */
    evaluate(s) {
        const p = this._pos(s);
        const pAhead = this._pos(s + 0.1);
        const dx = pAhead.x - p.x;
        const dz = pAhead.z - p.z;
        // In PlayCanvas right-handed coordinates with forward along -Z:
        // forwardX = -sin(yawRad), forwardZ = -cos(yawRad) => yawRad = Math.atan2(-dx, -dz)
        const yawRad = Math.atan2(-dx, -dz);
        const yawDeg = (yawRad * 180) / Math.PI;
        return { x: p.x, z: p.z, yawDeg, yawRad };
    }
}

export class VehicleManager {
    constructor(app, map, audio) {
        this.app = app;
        this.map = map;
        this.audio = audio;
        this.rand = mulberry32(8881);

        // Lane trajectories for Right-Hand Traffic (RHT):
        // In RHT, vehicles always drive on the right side of the two-way road.
        // Outer lane (55.4m): travels Counter-Clockwise -> on the right side of the road
        this.outerTrack = new LoopTrack(55.4, 4.0, false);
        // Inner lane (52.6m): travels Clockwise -> on the right side of the road
        this.innerTrack = new LoopTrack(52.6, 4.0, true);

        this.vehicles = [];
        this._initFleet();
    }

    _initFleet() {
        const fleetConfig = VEHICLE_CONFIG.FLEET;
        for (let i = 0; i < fleetConfig.length; i++) {
            const conf = fleetConfig[i];
            const track = conf.lane === 'outer' ? this.outerTrack : this.innerTrack;
            const seedRand = mulberry32(7000 + i * 137);

            let modelData;
            let typeName = conf.type;
            let shouts = GENERAL_COLLISION_SHOUTS;

            if (conf.type === 'danfo') {
                modelData = createDanfo(this.app, seedRand);
            } else if (conf.type === 'keke') {
                modelData = createKeke(this.app, seedRand);
            } else if (conf.type === 'okada') {
                modelData = createOkada(this.app, seedRand);
            } else {
                modelData = createCar(this.app, seedRand);
            }

            this.app.root.addChild(modelData.root);

            const vehicle = {
                id: i,
                type: typeName,
                shouts,
                track,
                model: modelData.root,
                hitRadius: modelData.hitRadius,
                baseSpeed: conf.speed,
                speed: conf.speed,
                s: 0,
                x: 0,
                z: 0,
                yawDeg: 0,
                yawRad: 0,
                cooldown: 0,
                honkTimer: 0,
                yieldTimer: 0,
                stoppedDuration: 0
            };

            this._attachVehicleLights(vehicle);
            this.vehicles.push(vehicle);
        }

        // Place vehicles randomly across all 4 main roads right from initial load
        this._assignRandomPositions(true);
    }

    /**
     * Randomly places vehicles around the 4 main roads while guaranteeing:
     * 1. Every main road (North, East, South, West) always receives vehicles.
     * 2. Consecutive vehicles in the same lane maintain safe separation (no overlaps).
     * 3. On South Road, vehicles avoid the starting rider position at x=0 with generous clearance.
     * 4. Vehicle ordering and exact positions across roads are dynamically randomized.
     */
    _assignRandomPositions(isWelcome = false) {
        const rand = this.rand;
        const lanes = [
            { track: this.outerTrack, name: 'outer' },
            { track: this.innerTrack, name: 'inner' }
        ];

        for (const lane of lanes) {
            const laneVehicles = this.vehicles.filter(v => v.track === lane.track);
            if (laneVehicles.length === 0) continue;

            if (isWelcome) {
                // For welcome screen: guarantee exactly ONE Danfo passes (on the front inner lane in clear view),
                // and replace the other lead vehicle on the rear outer lane with a car!
                const leadType = lane.name === 'inner' ? 'danfo' : 'car';
                const leadIdx = laneVehicles.findIndex(v => v.type === leadType);
                const leadVehicle = leadIdx > -1 ? laneVehicles.splice(leadIdx, 1)[0] : laneVehicles.pop();

                const secondType = lane.name === 'inner' ? 'okada' : 'keke';
                const secondIdx = laneVehicles.findIndex(v => v.type === secondType);
                const secondVehicle = secondIdx > -1 ? laneVehicles.splice(secondIdx, 1)[0] : laneVehicles.pop();

                // Shuffle the remaining 6 vehicles randomly across other quadrants
                for (let i = laneVehicles.length - 1; i > 0; i--) {
                    const j = Math.floor(rand() * (i + 1));
                    const temp = laneVehicles[i];
                    laneVehicles[i] = laneVehicles[j];
                    laneVehicles[j] = temp;
                }

                // Place lead vehicle at index 4 (quadrant 2, slot 1) and second vehicle at index 5 (quadrant 2, slot 2)
                laneVehicles.splice(4, 0, leadVehicle, secondVehicle);
            } else {
                // Gameplay: randomly shuffle all vehicles in this lane
                for (let i = laneVehicles.length - 1; i > 0; i--) {
                    const j = Math.floor(rand() * (i + 1));
                    const temp = laneVehicles[i];
                    laneVehicles[i] = laneVehicles[j];
                    laneVehicles[j] = temp;
                }
            }

            // Distribute 8 vehicles evenly across the 4 main road quadrants (2 vehicles per road)
            for (let q = 0; q < 4; q++) {
                let slot1Offset, slot2Offset;

                if (q === 2) {
                    // Quadrant 2 is South Road where the rider starts at (x=0, z≈54).
                    const isOuter = lane.track === this.outerTrack;
                    const quadLen = lane.track.quadLen;
                    const totalLen = lane.track.totalLen;
                    const uStart = 2 * quadLen;

                    if (isWelcome) {
                        // WELCOME SCREEN CHOREOGRAPHY:
                        // Place vehicles UPSTREAM heading TOWARDS x=0 so they pass directly across
                        // the welcome screen and camera view as soon as the welcome screen is up!
                        if (isOuter) {
                            // Outer track (CCW, heading East +X, z ≈ 55.4, rear lane):
                            // Rider at x=0 (u=51.4).
                            // Vehicle 1 (Car): starts at x ≈ -10.5m, cruises past rider at ~1.3s, exits right at ~2.7s!
                            // Vehicle 2 (Keke): upstream at x ≈ -34.0m, cruises past rider at ~4.5s!
                            const u1 = 51.4 - 10.5 - rand() * 1.5;
                            const u2 = 51.4 - 34.0 - rand() * 3.0;
                            slot1Offset = (uStart + u1) / totalLen;
                            slot2Offset = (uStart + u2) / totalLen;
                        } else {
                            // Inner track (CW, heading West -X, z ≈ 52.6, FRONT lane):
                            // Rider at x=0 (u=48.6).
                            // Vehicle 1 (Danfo - the only Danfo passing on welcome screen): starts at x ≈ +11.5m, cruises right in front of rider at ~1.5s!
                            // Vehicle 2 (Okada): upstream at x ≈ +34.0m, cruises right in front of rider at ~4.5s!
                            const u1 = 48.6 - 11.5 - rand() * 1.5;
                            const u2 = 48.6 - 34.0 - rand() * 3.0;
                            slot1Offset = (uStart + u1) / totalLen;
                            slot2Offset = (uStart + u2) / totalLen;
                        }
                    } else {
                        // GAMEPLAY START CHOREOGRAPHY:
                        // Place both vehicles downstream of x=0 heading away into the corners.
                        // This guarantees zero oncoming traffic heading towards the rider's start grid,
                        // with at least 18m+ to 42m+ clearance while still keeping moving traffic in both lanes.
                        if (isOuter) {
                            // Outer track (CCW, heading East): x = -51.4 + u. Rider at x=0 (u=51.4).
                            // Downstream (heading East away from rider into East corner):
                            const u1 = 51.4 + 18.0 + rand() * 6.0; // x ≈ +18 to +24 (heading East away)
                            const u2 = 51.4 + 36.0 + rand() * 6.0; // x ≈ +36 to +42 (heading East away)
                            slot1Offset = (uStart + u1) / totalLen;
                            slot2Offset = (uStart + u2) / totalLen;
                        } else {
                            // Inner track (CW, heading West): x = 48.6 - u. Rider at x=0 (u=48.6).
                            // Downstream (heading West away from rider into West corner):
                            const u1 = 48.6 + 18.0 + rand() * 6.0; // x ≈ -18 to -24 (heading West away)
                            const u2 = 48.6 + 36.0 + rand() * 6.0; // x ≈ -36 to -42 (heading West away)
                            slot1Offset = (uStart + u1) / totalLen;
                            slot2Offset = (uStart + u2) / totalLen;
                        }
                    }
                } else {
                    // Quadrant q covers [q * 0.25, (q + 1) * 0.25]
                    // Slot 1: in the first half of the road quadrant
                    // Slot 2: in the second half of the road quadrant
                    slot1Offset = q * 0.25 + 0.04 + rand() * 0.06;
                    slot2Offset = q * 0.25 + 0.15 + rand() * 0.06;
                }

                const v1 = laneVehicles[q * 2];
                const v2 = laneVehicles[q * 2 + 1];

                if (v1) this._placeVehicleAtOffset(v1, slot1Offset);
                if (v2) this._placeVehicleAtOffset(v2, slot2Offset);
            }
        }

        // Safety Net: Guarantee no vehicle on South Road (z ≈ 52-56) is within 14m of rider start x=0 during active gameplay
        if (!isWelcome) {
            for (const v of this.vehicles) {
                if (Math.abs(v.z - 54.0) < 6.0 && Math.abs(v.x) < 14.0) {
                    const shiftDist = (16.0 - Math.abs(v.x)) + 6.0;
                    v.s = (v.s + shiftDist) % v.track.totalLen;
                    const pose = v.track.evaluate(v.s);
                    v.x = pose.x;
                    v.z = pose.z;
                    v.yawDeg = pose.yawDeg;
                    v.yawRad = pose.yawRad;
                    v.model.setPosition(v.x, 0, v.z);
                    v.model.setEulerAngles(0, v.yawDeg, 0);
                }
            }
        }
    }

    _placeVehicleAtOffset(v, offset01) {
        v.s = (((offset01 % 1.0) + 1.0) % 1.0) * v.track.totalLen;
        v.speed = v.baseSpeed;
        v.cooldown = 0;
        v.honkTimer = 0;
        v.yieldTimer = 0;
        v.stoppedDuration = 0;
        const pose = v.track.evaluate(v.s);
        v.x = pose.x;
        v.z = pose.z;
        v.yawDeg = pose.yawDeg;
        v.yawRad = pose.yawRad;
        v.model.setPosition(v.x, 0, v.z);
        v.model.setEulerAngles(0, v.yawDeg, 0);
    }

    _attachVehicleLights(v) {
        let headPos, tailPos;
        if (v.type === 'danfo') {
            headPos = { x: 0, y: 0.58, z: -2.15 };
            tailPos = { x: 0, y: 0.65, z: 2.15 };
        } else if (v.type === 'car') {
            headPos = { x: 0, y: 0.52, z: -2.0 };
            tailPos = { x: 0, y: 0.56, z: 1.95 };
        } else if (v.type === 'keke') {
            headPos = { x: 0, y: 0.54, z: -1.25 };
            tailPos = { x: 0, y: 0.52, z: 1.28 };
        } else {
            // okada
            headPos = { x: 0, y: 0.75, z: -0.65 };
            tailPos = { x: 0, y: 0.68, z: 0.65 };
        }

        const isNight = this.mood === 'night';

        // 1. Forward-shining Headlight Spot beam
        const headSpot = new Entity(`${v.type}_HeadSpot_${v.id}`);
        headSpot.setLocalPosition(headPos.x, headPos.y, headPos.z);
        headSpot.setLocalEulerAngles(75, 0, 0); // Aimed forward (-Z) and down onto the road
        headSpot.addComponent('light', {
            type: 'spot',
            range: 24.0,
            innerConeAngle: 28,
            outerConeAngle: 50,
            color: new Color(1.0, 0.96, 0.84),
            intensity: isNight ? 2.6 : 0,
            castShadows: false
        });
        v.model.addChild(headSpot);

        // 2. Headlight Fill omni
        const headFill = new Entity(`${v.type}_HeadFill_${v.id}`);
        headFill.setLocalPosition(headPos.x, headPos.y, headPos.z - 0.5);
        headFill.addComponent('light', {
            type: 'omni',
            range: 6.5,
            color: new Color(1.0, 0.95, 0.8),
            intensity: isNight ? 1.6 : 0,
            castShadows: false
        });
        v.model.addChild(headFill);

        // 3. Taillight Red Glow omni
        const tailGlow = new Entity(`${v.type}_TailGlow_${v.id}`);
        tailGlow.setLocalPosition(tailPos.x, tailPos.y, tailPos.z + 0.25);
        tailGlow.addComponent('light', {
            type: 'omni',
            range: 3.6,
            color: new Color(1.0, 0.15, 0.15),
            intensity: isNight ? 1.2 : 0,
            castShadows: false
        });
        v.model.addChild(tailGlow);

        v.lights = { headSpot, headFill, tailGlow };
    }

    setMood(mood) {
        this.mood = mood;
        const isNight = mood === 'night';
        for (const v of this.vehicles) {
            if (v.lights) {
                if (v.lights.headSpot && v.lights.headSpot.light) {
                    v.lights.headSpot.light.intensity = isNight ? 2.4 : 0;
                }
                if (v.lights.headFill && v.lights.headFill.light) {
                    v.lights.headFill.light.intensity = isNight ? 1.0 : 0;
                }
                if (v.lights.tailGlow && v.lights.tailGlow.light) {
                    v.lights.tailGlow.light.intensity = isNight ? 1.2 : 0;
                }
            }
        }
    }

    reset() {
        this._assignRandomPositions(false);
    }

    resetToWelcome() {
        this._assignRandomPositions(true);
    }

    /**
     * Checks whether a vehicle is currently approaching a given road coordinate.
     * Used by pedestrians before crossing to yield to oncoming traffic.
     */
    isVehicleApproaching(crossX, crossZ, lookaheadDist = 7.5) {
        for (const v of this.vehicles) {
            const dx = crossX - v.x;
            const dz = crossZ - v.z;
            const dist = Math.hypot(dx, dz);
            if (dist > lookaheadDist) continue;

            // Check if vehicle is moving towards the crossing point
            const forwardX = -Math.sin(v.yawRad);
            const forwardZ = -Math.cos(v.yawRad);
            const dot = dx * forwardX + dz * forwardZ;
            if (dot > 0.5) {
                return true;
            }
        }
        return false;
    }

    update(dt, player, active, npcManager, checkPlayerCollision = false) {
        let collisionToast = null;

        // Active Road Occupancy Monitor:
        // Main road straight corridor bounds:
        // North Road: z <= -44
        // South Road: z >= 44
        // West Road:  x <= -44
        // East Road:  x >= 44
        const roadCounts = { north: 0, east: 0, south: 0, west: 0 };
        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            if (v.z <= -44 && Math.abs(v.x) <= 56) roadCounts.north++;
            if (v.z >= 44 && Math.abs(v.x) <= 56) roadCounts.south++;
            if (v.x <= -44 && Math.abs(v.z) <= 56) roadCounts.west++;
            if (v.x >= 44 && Math.abs(v.z) <= 56) roadCounts.east++;
        }

        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            v.cooldown = Math.max(0, v.cooldown - dt);
            v.honkTimer = Math.max(0, v.honkTimer - dt);
            v.yieldTimer = Math.max(0, v.yieldTimer - dt);

            if (!active) {
                continue;
            }

            // 1. Intelligent Negative-Feedback Spacing Regulation
            // Find closest leading vehicle in the same lane ahead
            let targetSpeed = v.baseSpeed;
            const trackLen = v.track.totalLen;
            let minGap = Infinity;
            let leadVehicle = null;

            for (let j = 0; j < this.vehicles.length; j++) {
                if (i === j) continue;
                const other = this.vehicles[j];
                if (other.track !== v.track) continue;

                const gap = ((other.s - v.s) % trackLen + trackLen) % trackLen;
                if (gap < minGap) {
                    minGap = gap;
                    leadVehicle = other;
                }
            }

            if (leadVehicle) {
                if (minGap < 7.5) {
                    // Critical anti-collision braking
                    targetSpeed = Math.min(0, leadVehicle.speed * 0.5);
                } else if (minGap < 18.0) {
                    // Safe following distance: match leader's speed smoothly
                    targetSpeed = Math.min(v.baseSpeed, leadVehicle.speed * 0.95);
                } else if (minGap < 34.0) {
                    // Mild bunching: ease off slightly to open up gap
                    targetSpeed = Math.min(v.baseSpeed * 0.92, leadVehicle.speed);
                } else if (minGap > 58.0) {
                    // Leading vehicle is pulling away: accelerate gently to close gap and maintain road coverage
                    targetSpeed = v.baseSpeed * 1.15;
                }
            }

            // 2. Pedestrian Yielding deconfliction (never hit a crossing NPC)
            if (npcManager && npcManager.npcs) {
                const forwardX = -Math.sin(v.yawRad);
                const forwardZ = -Math.cos(v.yawRad);

                for (const npc of npcManager.npcs) {
                    if (!npc.crossing) continue;

                    const dx = npc.x - v.x;
                    const dz = npc.z - v.z;
                    const distAhead = dx * forwardX + dz * forwardZ;
                    const distLat = Math.abs(dx * (-forwardZ) + dz * forwardX);

                    // If pedestrian is crossing in front within lane width
                    if (distAhead > 0.5 && distAhead < 6.5 && distLat < 1.8) {
                        targetSpeed = 0;
                        v.yieldTimer = 0.5; // Brief yield so pedestrians pass without locking traffic
                        break;
                    }
                }
            }

            if (v.yieldTimer > 0) {
                targetSpeed = 0;
            }

            // Stagnation prevention: if stationary for > 1.8s, clear yield and resume rolling
            if (v.speed < 0.3 && targetSpeed === 0 && (!v.cooldown || v.cooldown <= 0)) {
                v.stoppedDuration = (v.stoppedDuration || 0) + dt;
                if (v.stoppedDuration > 1.8) {
                    v.yieldTimer = 0;
                    targetSpeed = Math.max(4.0, v.baseSpeed * 0.7);
                    v.stoppedDuration = 0;
                }
            } else {
                v.stoppedDuration = 0;
            }

            // 3. Active Road Occupancy Guard:
            // Pre-emptively accelerate approaching traffic if any main road has < 2 vehicles
            const curQuad = Math.floor((((v.s % trackLen) + trackLen) % trackLen) / v.track.quadLen);
            const isInner = v.track === this.innerTrack;
            // Preceding quadrant mapping:
            // North: inner quad 3, outer quad 3
            // East:  inner quad 0, outer quad 2
            // South: inner quad 1, outer quad 1
            // West:  inner quad 2, outer quad 0
            let isApproachingLowRoad = false;
            if (roadCounts.north < 2 && curQuad === 3) isApproachingLowRoad = true;
            else if (roadCounts.east < 2 && (isInner ? curQuad === 0 : curQuad === 2)) isApproachingLowRoad = true;
            else if (roadCounts.south < 2 && curQuad === 1) isApproachingLowRoad = true;
            else if (roadCounts.west < 2 && (isInner ? curQuad === 2 : curQuad === 0)) isApproachingLowRoad = true;

            if (isApproachingLowRoad) {
                targetSpeed = Math.max(targetSpeed, v.baseSpeed * 1.25);
                v.yieldTimer = 0;
            }

            // Smooth acceleration / deceleration
            const rate = targetSpeed > v.speed ? 4.0 : 8.0;
            v.speed = math.lerp(v.speed, targetSpeed, 1 - Math.exp(-rate * dt));

            // Advance distance along track
            v.s += v.speed * dt;
            const pose = v.track.evaluate(v.s);
            v.x = pose.x;
            v.z = pose.z;
            v.yawDeg = pose.yawDeg;
            v.yawRad = pose.yawRad;

            v.model.setPosition(v.x, 0, v.z);
            v.model.setEulerAngles(0, v.yawDeg, 0);

            // 4. Collision check with the Player's bicycle (only when actively riding)
            if (checkPlayerCollision && active && v.cooldown <= 0 && (!player.invulnerable || player.invulnerable <= 0)) {
                const dx = player.x - v.x;
                const dz = player.z - v.z;
                const dist = Math.hypot(dx, dz);
                const hitThreshold = v.hitRadius + BIKE.RADIUS;

                if (dist < hitThreshold) {
                    v.cooldown = 2.4;
                    v.yieldTimer = 0.8;
                    v.speed = 0;

                    // Physical knockback impulse
                    const nx = dist > 1e-4 ? dx / dist : -Math.sin(v.yawRad);
                    const nz = dist > 1e-4 ? dz / dist : -Math.cos(v.yawRad);

                    player.x += nx * 2.5;
                    player.z += nz * 2.5;
                    player.speed = Math.max(0, player.speed * 0.12 - 3.5);
                    player.stun = 0.9;
                    player.wobble = 1.4;
                    player.shake = 0.65;
                    if (player.stats) {
                        player.stats.vehicleHits = (player.stats.vehicleHits || 0) + 1;
                    }

                    // Audio effects: metal crash + horn blast
                    this.audio.vehicleCrash();

                    // Spray spark particles
                    player.spray = 1.2;

                    const shout = pick(this.rand, v.shouts);
                    collisionToast = shout;
                }
            }
        }

        return collisionToast;
    }
}
