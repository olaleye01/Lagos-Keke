import { Entity, StandardMaterial, Color, Vec3, math } from 'playcanvas';
import { createBicycleKid } from '../graphics/models.js';
import { BIKE, HAZARDS } from './constants.js';

const _tmp = new Vec3();
const _up = new Vec3();

export class Player {
    constructor(app, map, audio) {
        this.app = app;
        this.map = map;
        this.audio = audio;
        this.model = createBicycleKid(app);
        app.root.addChild(this.model.root);
        this.particles = createParticlePool(app, 32);
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
        this.wobble = 0;
        this.stun = 0;
        this.wheelAngle = 0;
        this.crankAngle = 0;
        this.spray = 0;
        this.shake = 0;
        this.stamina = BIKE.MAX_STAMINA;
        this.isSprinting = false;
        this.invulnerable = 0;

        // Animation Timers
        this.celebrateTimer = 0;
        this.idlePhase = 0;

        this.stats = { potholes: 0, npcHits: 0, vehicleHits: 0, mudTime: 0, roadTime: 0 };
        this.gutterCooldown = 0;
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

    get baseMaxSpeed() {
        return this.surface === 'road' ? BIKE.ROAD_MAX_SPEED : BIKE.MUD_MAX_SPEED;
    }

    get maxSpeed() {
        let max = this.baseMaxSpeed;
        if (this.isSprinting) {
            max = BIKE.SPRINT_MAX_SPEED * (this.surface === 'mud' ? 0.88 : 1.0);
        }
        return max;
    }

    triggerCelebrate() {
        this.celebrateTimer = 1.4;
    }

    /**
     * @param {number} dt
     * @param {{steer:number, brake:boolean, sprint:boolean}} input
     * @param {boolean} active
     * @returns {{pothole: boolean}}
     */
    update(dt, input, active) {
        const events = { pothole: false, gutter: false };
        this.idlePhase += dt * 3.5;
        this.surface = this.map.surfaceAt(this.x, this.z);

        // Active Gameplay Riding Logic
        if (active) {
            if (this.surface === 'mud') this.stats.mudTime += dt;
            else this.stats.roadTime += dt;
        }

        this.steer = math.lerp(this.steer, input.steer, 1 - Math.exp(-11 * dt));
        this.stun = Math.max(0, this.stun - dt);
        this.wobble = Math.max(0, this.wobble - dt);
        this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);

        // Sprint & Stamina
        if (active && input.sprint && this.stamina > 2 && !input.brake && this.speed > 1.5) {
            this.isSprinting = true;
            this.stamina = Math.max(0, this.stamina - BIKE.STAMINA_DRAIN * dt);
        } else {
            this.isSprinting = false;
            this.stamina = Math.min(BIKE.MAX_STAMINA, this.stamina + BIKE.STAMINA_RECOVERY * dt);
        }

        const max = this.maxSpeed * (this.wobble > 0 ? 0.72 : 1);
        if (!active || this.stun > 0) {
            this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * 0.6 * dt);
        } else if (input.brake) {
            this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * dt);
        } else if (this.speed < max) {
            const accel = this.isSprinting ? BIKE.SPRINT_ACCEL : (this.surface === 'road' ? BIKE.ACCEL : BIKE.MUD_ACCEL);
            this.speed = Math.min(max, this.speed + accel * dt);
        } else {
            this.speed = Math.max(max, this.speed - BIKE.COAST_DECEL * 2 * dt);
        }

        const turnScale = math.clamp(this.speed / 4.2, 0.45, 1);
        let wobbleSteer = 0;
        if (this.wobble > 0) wobbleSteer = Math.sin(this.wobble * 28) * 0.5 * Math.min(1, this.wobble * 2);
        if (this.surface === 'mud') wobbleSteer += Math.sin(performance.now() * 0.005) * 0.05;
        this.yaw -= (this.steer + wobbleSteer) * BIKE.TURN_RATE * turnScale * dt;

        const prevX = this.x;
        const prevZ = this.z;
        this.x += this.forwardX * this.speed * dt;
        this.z += this.forwardZ * this.speed * dt;

        // Collision with map obstacles
        const pos = { x: this.x, z: this.z };
        const hit = this.map.resolveCircle(pos, BIKE.RADIUS);
        this.x = pos.x;
        this.z = pos.z;
        if (hit.hit && this.speed > 0.5) {
            const impact = -(this.forwardX * hit.nx + this.forwardZ * hit.nz);
            if (impact > 0.15) {
                const before = this.speed;
                this.speed *= 1 - 0.85 * impact;
                if (before > 4 && impact > 0.55) {
                    this.audio.bump();
                    this.shake = Math.max(this.shake, 0.25 * impact);
                    this.wobble = Math.max(this.wobble, 0.35);
                }
            }
        }
        const moved = Math.hypot(this.x - prevX, this.z - prevZ);

        // Pothole collision check
        for (const p of this.map.potholes) {
            p.cooldown = Math.max(0, p.cooldown - dt);
            if (p.cooldown > 0) continue;
            const d = Math.hypot(this.x - p.x, this.z - p.z);
            if (d < p.r * 0.85 && this.speed > 2) {
                p.cooldown = 1.5;
                this.speed *= HAZARDS.POTHOLE_SPEED_KEEP;
                this.wobble = 0.95;
                this.shake = 0.55;
                this.stats.potholes++;
                this.audio.pothole();
                this._burst(p.x, p.z, 14, 2);
                events.pothole = true;
            }
        }

        // Open Gutter hazard check (entering the open trench instead of safely crossing on the wooden plank bridge)
        this.gutterCooldown = Math.max(0, (this.gutterCooldown || 0) - dt);
        if (this.gutterCooldown <= 0 && this.speed > 1.2 && this.map.isInOpenGutter && this.map.isInOpenGutter(this.x, this.z, BIKE.RADIUS * 0.45)) {
            this.gutterCooldown = 1.6;
            this.speed *= HAZARDS.POTHOLE_SPEED_KEEP; // Same speed drop effect as pothole
            this.wobble = 1.0;
            this.shake = 0.65;
            this.audio.pothole();
            this._burst(this.x, this.z, 16, 2);
            events.gutter = true;
        }

        // Mud spray particles
        if (this.surface === 'mud' && this.speed > 2.8) {
            this.spray += dt * this.speed * 1.6;
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

    knock(fromX, fromZ) {
        this.speed = 0;
        this.stun = 0.7;
        this.wobble = 0.85;
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

    respawnAt(pose) {
        this.x = pose.x;
        this.z = pose.z;
        if (pose.yaw !== undefined) {
            this.yaw = pose.yaw;
        }
        this.speed = 0;
        this.steer = 0;
        this.wobble = 0;
        this.stun = 0.25;
        this.shake = 0.55;
        this.invulnerable = 2.0; // protection against immediate vehicle re-collision
        this._burst(this.x, this.z, 20, 2);
        this._sync(0);
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

    /**
     * Animate both Bicycle and modular Bitmoji-Ready Rider Avatar.
     */
    _sync(dt) {
        const { root, lean, frontFork, frontWheel, rearWheel, crank, pedals, kickstand } = this.model;
        const { avatarRoot, pelvis, torso, headMount, armL, armR, legs } = this.model.avatar;

        root.setPosition(this.x, 0, this.z);
        root.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);

        // Front fork & handlebars steering
        frontFork.setLocalEulerAngles(0, this.steer * 24, 0);

        // Wheels rotation
        const wheelDeg = (-this.wheelAngle * 180) / Math.PI;
        frontWheel.setLocalEulerAngles(wheelDeg, 0, 0);
        rearWheel.setLocalEulerAngles(wheelDeg, 0, 0);

        // Pedals rotation around crank
        const crankR = 0.17;
        pedals.forEach((pedal, i) => {
            const a = this.crankAngle + i * Math.PI;
            pedal.setLocalPosition((i === 0 ? -1 : 1) * 0.13, Math.sin(a) * crankR, -Math.cos(a) * crankR);
        });

        // Retract kickstand and center avatar on bike
        kickstand.setLocalEulerAngles(0, 0, 65);
        avatarRoot.setLocalPosition(0, 0, 0);

        const speed01 = math.clamp(this.speed / BIKE.ROAD_MAX_SPEED, 0, 1);
        let roll = -this.steer * speed01 * 22;
        if (this.wobble > 0) roll += Math.sin(this.wobble * 30) * 9 * Math.min(1, this.wobble * 2);
        roll += Math.sin(this.crankAngle) * 2.8 * speed01;
        lean.setLocalEulerAngles(0, 0, roll);

        // Standing up on pedals when accelerating or in mud
        const isStruggling = (this.speed > 0.5 && this.speed < 4.0) || (this.surface === 'mud' && this.speed > 1.0);
        const standPump = isStruggling ? 0.11 : 0.0;
        const sideRock = Math.sin(this.crankAngle) * (isStruggling ? 5.5 : 2.5);

        pelvis.setLocalPosition(0, 1.05 + standPump, 0.2);
        pelvis.setLocalEulerAngles(0, 0, sideRock);

        // Aero Sprint Tuck when boosting/sprinting
        let torsoPitch = -26;
        if (this.isSprinting && this.speed > 5) {
            torsoPitch = -42; // aggressive low tuck!
        } else if (this.wobble > 0) {
            torsoPitch = -12; // flailing backward
        }
        torso.setLocalEulerAngles(torsoPitch, 0, -sideRock * 0.5);

        // Head tracking: looks into turns and tilts up when tucked
        const headYaw = -this.steer * 20;
        const headPitch = this.isSprinting ? 22 : 0;
        headMount.setLocalEulerAngles(headPitch, headYaw, 0);

        // Arm gestures
        if (this.celebrateTimer > 0) {
            // Victory fist pump!
            armR.setLocalEulerAngles(-110, 0, -18);
            armL.setLocalEulerAngles(40, 0, 0);
        } else if (this.wobble > 0) {
            // Flailing arms on pothole hit
            armL.setLocalEulerAngles(20 + Math.sin(this.wobble * 35) * 25, -20, 0);
            armR.setLocalEulerAngles(20 - Math.sin(this.wobble * 35) * 25, 20, 0);
        } else {
            // Normal hands on handlebars
            armL.setLocalEulerAngles(40, 0, 0);
            armR.setLocalEulerAngles(40, 0, 0);
        }

        // Legs tracking pedals
        _up.copy(root.forward);
        legs.forEach((leg, i) => {
            const target = pedals[i].getPosition();
            const hip = leg.entity.getPosition();
            const d = _tmp.sub2(target, hip).length();
            leg.entity.lookAt(target, _up);
            leg.entity.setLocalScale(1, 1, d);
        });
    }
}

function createParticlePool(app, count) {
    const pool = [];
    const mat = new StandardMaterial();
    mat.diffuse = new Color(0.48, 0.28, 0.16);
    mat.update();

    for (let i = 0; i < count; i++) {
        const e = new Entity('MudParticle');
        e.addComponent('render', { type: 'box', material: mat });
        e.enabled = false;
        app.root.addChild(e);
        pool.push({ entity: e, life: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    }
    return pool;
}
