import { Vec3, math } from 'playcanvas';
import { createBicycleKid, createParticlePool } from '../graphics/models.js';
import { BIKE, HAZARDS } from './constants.js';

const _tmp = new Vec3();
const _up = new Vec3();

/**
 * Arcade bicycle. State is plain numbers (x, z, yaw, speed) – the entity only mirrors it.
 */
export class Player {
    constructor(app, map, audio) {
        this.app = app;
        this.map = map;
        this.audio = audio;
        this.model = createBicycleKid(app);
        app.root.addChild(this.model.root);
        this.particles = createParticlePool(app, 28);
        this._particleIndex = 0;
        this.reset();
    }

    reset() {
        const s = this.map.start;
        this.x = s.x;
        this.z = s.z;
        this.yaw = s.yaw;
        this.speed = 0;
        this.steer = 0;
        this.surface = 'road';
        this.wobble = 0; // seconds of wobble left
        this.stun = 0; // seconds unable to pedal
        this.wheelAngle = 0;
        this.crankAngle = 0;
        this.spray = 0;
        this.shake = 0; // camera shake amplitude, read by the camera
        this.stats = { potholes: 0, npcHits: 0, mudTime: 0, roadTime: 0 };
        this.map.potholes.forEach(p => (p.cooldown = 0));
        this.particles.forEach(p => {
            p.life = 0;
            p.entity.enabled = false;
        });
        this._sync(0);
    }

    get forwardX() {
        return -Math.sin(this.yaw);
    }

    get forwardZ() {
        return -Math.cos(this.yaw);
    }

    get maxSpeed() {
        return this.surface === 'road' ? BIKE.ROAD_MAX_SPEED : BIKE.MUD_MAX_SPEED;
    }

    /**
     * @param {number} dt
     * @param {{steer:number, brake:boolean}} input
     * @param {boolean} active pedalling allowed (false during countdown / menus)
     * @returns {{pothole: boolean}}
     */
    update(dt, input, active) {
        const events = { pothole: false };
        this.surface = this.map.surfaceAt(this.x, this.z);
        if (active) {
            if (this.surface === 'mud') this.stats.mudTime += dt;
            else this.stats.roadTime += dt;
        }

        // steering is smoothed so touch drags feel like handlebars, not a switch
        this.steer = math.lerp(this.steer, input.steer, 1 - Math.exp(-10 * dt));

        this.stun = Math.max(0, this.stun - dt);
        this.wobble = Math.max(0, this.wobble - dt);

        const max = this.maxSpeed * (this.wobble > 0 ? 0.75 : 1);
        if (!active || this.stun > 0) {
            this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * 0.6 * dt);
        } else if (input.brake) {
            this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * dt);
        } else if (this.speed < max) {
            const accel = this.surface === 'road' ? BIKE.ACCEL : BIKE.MUD_ACCEL;
            this.speed = Math.min(max, this.speed + accel * dt);
        } else {
            this.speed = Math.max(max, this.speed - BIKE.COAST_DECEL * 2 * dt);
        }

        // turn rate scales down at low speed, but never to zero so you can always get unstuck
        const turnScale = math.clamp(this.speed / 4, 0.45, 1);
        let wobbleSteer = 0;
        if (this.wobble > 0) wobbleSteer = Math.sin(this.wobble * 28) * 0.5 * Math.min(1, this.wobble * 2);
        if (this.surface === 'mud') wobbleSteer += Math.sin(performance.now() * 0.004) * 0.04;
        this.yaw -= (this.steer + wobbleSteer) * BIKE.TURN_RATE * turnScale * dt;

        const prevX = this.x;
        const prevZ = this.z;
        this.x += this.forwardX * this.speed * dt;
        this.z += this.forwardZ * this.speed * dt;

        // collide with houses, fences and palms
        const pos = { x: this.x, z: this.z };
        const hit = this.map.resolveCircle(pos, BIKE.RADIUS);
        this.x = pos.x;
        this.z = pos.z;
        if (hit.hit && this.speed > 0.5) {
            const impact = -(this.forwardX * hit.nx + this.forwardZ * hit.nz); // 1 = head-on
            if (impact > 0.15) {
                const before = this.speed;
                this.speed *= 1 - 0.85 * impact;
                if (before > 4 && impact > 0.55) {
                    this.audio.bump();
                    this.shake = Math.max(this.shake, 0.25 * impact);
                    this.wobble = Math.max(this.wobble, 0.3);
                }
            }
        }
        // if pushed back, measure real displacement for wheel spin
        const moved = Math.hypot(this.x - prevX, this.z - prevZ);

        // potholes
        for (const p of this.map.potholes) {
            p.cooldown = Math.max(0, p.cooldown - dt);
            if (p.cooldown > 0) continue;
            const d = Math.hypot(this.x - p.x, this.z - p.z);
            if (d < p.r * 0.85 && this.speed > 2) {
                p.cooldown = 1.5;
                this.speed *= HAZARDS.POTHOLE_SPEED_KEEP;
                this.wobble = 0.9;
                this.shake = 0.5;
                this.stats.potholes++;
                this.audio.pothole();
                this._burst(p.x, p.z, 12, 2);
                events.pothole = true;
            }
        }

        // mud spray from the rear wheel
        if (this.surface === 'mud' && this.speed > 3) {
            this.spray += dt * this.speed * 1.4;
            while (this.spray > 1) {
                this.spray -= 1;
                this._emit(this.x - this.forwardX * 0.6, 0.15, this.z - this.forwardZ * 0.6, 0);
            }
        }

        this.wheelAngle += moved / BIKE.WHEEL_RADIUS;
        this.crankAngle += (moved / BIKE.WHEEL_RADIUS) * 0.55;
        this.shake = Math.max(0, this.shake - dt * 1.5);
        this._updateParticles(dt);
        this._sync(dt);
        return events;
    }

    /** Called when a pedestrian is bumped. */
    knock(fromX, fromZ) {
        this.speed = 0;
        this.stun = 0.7;
        this.wobble = 0.8;
        this.shake = 0.45;
        this.stats.npcHits++;
        const dx = this.x - fromX;
        const dz = this.z - fromZ;
        const d = Math.hypot(dx, dz) || 1;
        const pos = { x: this.x + (dx / d) * 0.4, z: this.z + (dz / d) * 0.4 };
        this.map.resolveCircle(pos, BIKE.RADIUS);
        this.x = pos.x;
        this.z = pos.z;
    }

    _emit(x, y, z, kind) {
        const p = this.particles[this._particleIndex];
        this._particleIndex = (this._particleIndex + 1) % this.particles.length;
        const spread = kind === 2 ? 3 : 1.2;
        p.life = kind === 2 ? 0.7 : 0.45;
        p.vx = (Math.random() - 0.5) * spread - this.forwardX * (kind === 2 ? 0 : 1.5);
        p.vz = (Math.random() - 0.5) * spread - this.forwardZ * (kind === 2 ? 0 : 1.5);
        p.vy = (kind === 2 ? 3 : 1.6) + Math.random() * 1.5;
        p.size = (kind === 2 ? 0.16 : 0.1) + Math.random() * 0.08;
        p.entity.enabled = true;
        p.entity.setPosition(x, y, z);
        p.entity.setLocalScale(p.size, p.size, p.size);
    }

    _burst(x, z, n, kind) {
        for (let i = 0; i < n; i++) this._emit(x, 0.15, z, kind);
    }

    _updateParticles(dt) {
        for (const p of this.particles) {
            if (p.life <= 0) continue;
            p.life -= dt;
            if (p.life <= 0) {
                p.entity.enabled = false;
                continue;
            }
            p.vy -= 12 * dt;
            const pos = p.entity.getPosition();
            const y = Math.max(0.03, pos.y + p.vy * dt);
            p.entity.setPosition(pos.x + p.vx * dt, y, pos.z + p.vz * dt);
            const s = p.size * Math.min(1, p.life * 3);
            p.entity.setLocalScale(s, s, s);
        }
    }

    /** Mirror state onto the entity hierarchy. */
    _sync(dt) {
        const { root, lean, frontWheel, rearWheel, crank, pedals, legs } = this.model;
        root.setPosition(this.x, 0, this.z);
        root.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);

        const speed01 = math.clamp(this.speed / BIKE.ROAD_MAX_SPEED, 0, 1);
        let roll = -this.steer * speed01 * 20;
        if (this.wobble > 0) roll += Math.sin(this.wobble * 30) * 9 * Math.min(1, this.wobble * 2);
        // a gentle side-to-side rock while pedalling
        roll += Math.sin(this.crankAngle) * 2.5 * speed01;
        lean.setLocalEulerAngles(0, 0, roll);

        const wheelDeg = (-this.wheelAngle * 180) / Math.PI;
        frontWheel.setLocalEulerAngles(wheelDeg, (this.steer * 18), 0);
        rearWheel.setLocalEulerAngles(wheelDeg, 0, 0);

        // pedals on opposite sides of the crank
        const crankR = 0.17;
        pedals.forEach((pedal, i) => {
            const a = this.crankAngle + i * Math.PI;
            pedal.setLocalPosition((i === 0 ? -1 : 1) * 0.13, Math.sin(a) * crankR, -Math.cos(a) * crankR);
        });

        // stretch each leg from the hip to its pedal
        _up.copy(root.forward);
        legs.forEach((leg, i) => {
            const target = pedals[i].getPosition();
            const hip = leg.entity.getPosition();
            const d = _tmp.sub2(target, hip).length();
            leg.entity.lookAt(target, _up);
            leg.entity.setLocalScale(1, 1, d);
        });
        void dt;
    }
}
