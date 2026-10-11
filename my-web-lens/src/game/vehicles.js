import { Vec3, math } from 'playcanvas';
import {
    createCar,
    createDanfo,
    createKeke,
    createOkada
} from '../graphics/models.js';
import { GAME, VEHICLE_CONFIG, BIKE } from './constants.js';
import { mulberry32, pick } from '../graphics/palette.js';

const DANFO_SHOUTS = [
    'Your brake fail?! Watch front!',
    'Commot! Danfo driver no get joy today!',
    'Ah ah! You wan buy my bumper?!'
];

const KEKE_SHOUTS = [
    'Keke Marwa no be toy o!',
    'Brother see front! No wound yourself?!',
    'Ah ah bicycle, mind your steering!',
    'Look road my friend! Keke no be trailer!'
];

const OKADA_SHOUTS = [
    'Oga shift!',
    'Commot for road, jor!',
    'Brother watch your lane!',
    'Wetin dey do this bicycle boy?!'
];

const CAR_SHOUTS = [
    'Peep peep! My bumper! Mind yourself!',
    'Hey! Do you have eyes on your head?!',
    'Ah ah! Watch where you dey go!',
    'Look front oga! You wan scratch my motor?!'
];

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
            let shouts = CAR_SHOUTS;

            if (conf.type === 'danfo') {
                modelData = createDanfo(this.app, seedRand);
                shouts = DANFO_SHOUTS;
            } else if (conf.type === 'keke') {
                modelData = createKeke(this.app, seedRand);
                shouts = KEKE_SHOUTS;
            } else if (conf.type === 'okada') {
                modelData = createOkada(this.app, seedRand);
                shouts = OKADA_SHOUTS;
            } else {
                modelData = createCar(this.app, seedRand);
                shouts = CAR_SHOUTS;
            }

            this.app.root.addChild(modelData.root);

            const sStart = conf.offset01 * track.totalLen;
            const pose = track.evaluate(sStart);

            const vehicle = {
                id: i,
                type: typeName,
                shouts,
                track,
                model: modelData.root,
                hitRadius: modelData.hitRadius,
                baseSpeed: conf.speed,
                speed: conf.speed,
                s: sStart,
                x: pose.x,
                z: pose.y ? pose.y : pose.z,
                yawDeg: pose.yawDeg,
                yawRad: pose.yawRad,
                cooldown: 0,
                honkTimer: 0,
                yieldTimer: 0
            };

            vehicle.model.setPosition(vehicle.x, 0, vehicle.z);
            vehicle.model.setEulerAngles(0, vehicle.yawDeg, 0);
            this.vehicles.push(vehicle);
        }
    }

    reset() {
        const fleetConfig = VEHICLE_CONFIG.FLEET;
        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            const conf = fleetConfig[i];
            v.s = conf.offset01 * v.track.totalLen;
            v.speed = v.baseSpeed;
            v.cooldown = 0;
            v.honkTimer = 0;
            v.yieldTimer = 0;
            const pose = v.track.evaluate(v.s);
            v.x = pose.x;
            v.z = pose.z;
            v.yawDeg = pose.yawDeg;
            v.yawRad = pose.yawRad;
            v.model.setPosition(v.x, 0, v.z);
            v.model.setEulerAngles(0, v.yawDeg, 0);
        }
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

        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            v.cooldown = Math.max(0, v.cooldown - dt);
            v.honkTimer = Math.max(0, v.honkTimer - dt);
            v.yieldTimer = Math.max(0, v.yieldTimer - dt);

            if (!active) {
                continue;
            }

            // 1. Vehicle-following distance deconfliction (never hit the vehicle ahead in same lane)
            let targetSpeed = v.baseSpeed;
            const trackLen = v.track.totalLen;

            for (let j = 0; j < this.vehicles.length; j++) {
                if (i === j) continue;
                const other = this.vehicles[j];
                if (other.track !== v.track) continue;

                const gap = ((other.s - v.s) % trackLen + trackLen) % trackLen;
                if (gap < 14.0) {
                    if (gap < 7.5) {
                        targetSpeed = Math.min(targetSpeed, 0);
                    } else {
                        targetSpeed = Math.min(targetSpeed, other.speed * 0.85);
                    }
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

                    // If pedestrian is in front within lane width
                    if (distAhead > 0.5 && distAhead < 7.0 && distLat < 1.9) {
                        targetSpeed = 0;
                        v.yieldTimer = 1.0;
                        break;
                    }
                }
            }

            // If recently yielded or collided, smoothly respect speed
            if (v.yieldTimer > 0) {
                targetSpeed = 0;
            }

            // Smooth acceleration / deceleration
            const rate = targetSpeed > v.speed ? 3.5 : 8.0;
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

            // 3. Collision check with the Player's bicycle (only when actively riding)
            if (checkPlayerCollision && active && v.cooldown <= 0 && (!player.invulnerable || player.invulnerable <= 0)) {
                const dx = player.x - v.x;
                const dz = player.z - v.z;
                const dist = Math.hypot(dx, dz);
                const hitThreshold = v.hitRadius + BIKE.RADIUS;

                if (dist < hitThreshold) {
                    v.cooldown = 2.4;
                    v.yieldTimer = 1.6;
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
