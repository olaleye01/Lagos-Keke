import { Entity, StandardMaterial, Color, Vec3, math } from 'playcanvas';
import { createBicycleKid } from '../graphics/models.js';
import { BIKE, HAZARDS } from './constants.js';

const _tmp = new Vec3();
const _up = new Vec3();
const _armUp = new Vec3();
const _armRight = new Vec3();
const _armForward = new Vec3();
const _targetR = new Vec3();
const _targetCeleb = new Vec3();
const _tmpMid = new Vec3();
const _elbow = new Vec3();

export class Player {
    constructor(app, map, audio) {
        this.app = app;
        this.map = map;
        this.audio = audio;
        this.model = createBicycleKid(app);
        app.root.addChild(this.model.root);
        this.particles = createParticlePool(app, 32);
        this._particleIndex = 0;
        this.standFactor = 0;
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
        this._boostExhausted = false;
        this.invulnerable = 0;
        this.flickerTimer = 0;
        if (this.model && this.model.lean) this.model.lean.enabled = true;
        if (this.model && this.model.root) this.model.root.enabled = true;

        // Animation Timers & States
        this.celebrateTimer = 0;
        this.idlePhase = 0;
        this.standFactor = 0;

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
        this.celebrateTimer = 1.8;
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
        this.flickerTimer = Math.max(0, (this.flickerTimer || 0) - dt);

        // Sprint & Stamina (Stop dash and boost effect once boost is less than 5%)
        const minBoostStamina = BIKE.MAX_STAMINA * ((BIKE.MIN_BOOST_STAMINA_PCT || 5) / 100);

        // Reset exhaustion lock if user releases sprint button/key or stamina recovers comfortably
        if (!input.sprint || this.stamina >= minBoostStamina + 5) {
            this._boostExhausted = false;
        }

        const canSprint = active &&
            input.sprint &&
            !this._boostExhausted &&
            this.stamina >= minBoostStamina &&
            !input.brake &&
            this.speed > 1.5;

        if (canSprint) {
            this.isSprinting = true;
            this.stamina = Math.max(0, this.stamina - BIKE.STAMINA_DRAIN * dt);
            if (this.stamina < minBoostStamina) {
                // Instantly cut off sprint boost when stamina drops below 5%
                this.isSprinting = false;
                this._boostExhausted = true;
            }
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

        // Pothole collision check (fast bounding box rejection + kinetic shock recovery)
        for (const p of this.map.potholes) {
            p.cooldown = Math.max(0, p.cooldown - dt);
            if (p.cooldown > 0) continue;
            if (Math.abs(this.x - p.x) > 2.8 || Math.abs(this.z - p.z) > 2.8) continue;
            const d = Math.hypot(this.x - p.x, this.z - p.z);
            if (d < p.r * 0.85 && this.speed > 1.8) {
                p.cooldown = 1.4;
                this.speed = Math.max(2.4, this.speed * 0.55);
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
        if (this.gutterCooldown <= 0 && this.speed > 0.8 && this.map.isInOpenGutter && this.map.isInOpenGutter(this.x, this.z, BIKE.RADIUS * 0.45)) {
            this.gutterCooldown = 1.6;
            this.audio.pothole();
            this._burst(this.x, this.z, 20, 2);
            events.gutter = true;

            // Reposition the rider a few meters back facing directly towards the nearest wooden plank bridge
            if (this.map.getGutterRepositionPose) {
                const pose = this.map.getGutterRepositionPose(this.x, this.z, this.forwardX, this.forwardZ);
                this.x = pose.x;
                this.z = pose.z;
                this.yaw = pose.yaw;
                this.speed = 0;
                this.steer = 0;
                this.wobble = 0.85;
                this.shake = 0.65;
                this.stun = 0.45;
                this.invulnerable = 1.2;
                this._burst(this.x, this.z, 16, 2);
                this._sync(0);
            }
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
        this.flickerTimer = 2.0; // arcade respawn flicker effect
        this._burst(this.x, this.z, 24, 2);
        this._sync(0);
    }

    triggerFlicker(duration = 2.0) {
        this.flickerTimer = duration;
        this.invulnerable = Math.max(this.invulnerable, duration);
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
        const { root, lean, frontFork, frontWheel, rearWheel, crank, pedals, kickstand, gripL, gripR } = this.model;
        const { avatarRoot, pelvis, torso, headMount, arms, legs } = this.model.avatar;

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

        // Seated on road, standing up on pedals ONLY when in the muddy area
        const targetStand = (this.surface === 'mud') ? 1.0 : 0.0;
        this.standFactor = math.lerp(this.standFactor, targetStand, 1 - Math.exp(-8 * dt));

        // When seated on road: pelvis sits directly down on the saddle (Y=0.975, Z=0.25) with zero gap
        // When in mud: pelvis lifts out of saddle to Y=1.08 and shifts forward to Z=0.17
        const mudPump = this.standFactor > 0.05 ? Math.abs(Math.sin(this.crankAngle)) * 0.045 * this.standFactor : 0.0;
        const pelvisY = math.lerp(0.975, 1.08, this.standFactor) + mudPump;
        const pelvisZ = math.lerp(0.25, 0.17, this.standFactor);
        const sideRock = Math.sin(this.crankAngle) * math.lerp(1.2, 5.5, this.standFactor);

        pelvis.setLocalPosition(0, pelvisY, pelvisZ);
        pelvis.setLocalEulerAngles(0, 0, sideRock);

        // Torso posture: comfortable road cycling lean, aggressive forward crouch when standing in mud or sprinting
        let torsoPitch = math.lerp(-22, -32, this.standFactor);
        if (this.isSprinting && this.speed > 5) {
            torsoPitch -= 14; // aggressive aero tuck
        } else if (this.wobble > 0) {
            torsoPitch += 8;
        }
        torso.setLocalEulerAngles(torsoPitch, 0, -sideRock * 0.4);

        // Two-segment arms: UpperArm from shoulder to elbow, Forearm from elbow to grip
        _armUp.copy(lean.up);
        _armRight.copy(lean.right);
        _armForward.copy(lean.forward);

        // Calculate celebration blend (ramps up quickly, holds, lowers back down smoothly)
        let celebrateBlend = 0;
        if (this.celebrateTimer > 0) {
            if (this.celebrateTimer > 1.5) {
                celebrateBlend = (1.8 - this.celebrateTimer) / 0.3; // rise up
            } else if (this.celebrateTimer < 0.35) {
                celebrateBlend = this.celebrateTimer / 0.35; // lower back down
            } else {
                celebrateBlend = 1.0; // held high
            }
            celebrateBlend = math.clamp(celebrateBlend, 0, 1);
        }

        arms.forEach(arm => {
            const isRight = arm.sx > 0;
            const sPos = arm.shoulder.getPosition();
            const gPos = isRight ? gripR.getPosition() : gripL.getPosition();

            let target = gPos;
            const isCeleb = isRight && celebrateBlend > 0.001;

            if (isCeleb) {
                const pump = Math.sin(this.celebrateTimer * 14) * 0.08;
                _targetCeleb.copy(sPos)
                    .addScaled(_armUp, 0.50 + pump)
                    .addScaled(_armRight, 0.14)
                    .addScaled(_armForward, 0.06);
                _targetR.lerp(gPos, _targetCeleb, celebrateBlend);
                target = _targetR;
            }

            // Elbow position with outward flare matching reference posture
            const mid = _tmpMid.lerp(sPos, target, 0.48);
            if (isCeleb) {
                _elbow.copy(mid)
                    .addScaled(_armRight, 0.12)
                    .addScaled(_armForward, 0.06)
                    .addScaled(_armUp, 0.04);
            } else {
                _elbow.copy(mid)
                    .addScaled(_armRight, arm.sx * 0.15)
                    .addScaled(_armUp, 0.03);
            }

            // Upper arm: Shoulder -> Elbow
            const dUpper = _tmp.sub2(_elbow, sPos).length();
            arm.upperArm.setPosition(sPos);
            arm.upperArm.lookAt(_elbow, _armUp);
            arm.upperArm.setLocalScale(1, 1, Math.max(0.15, dUpper));

            // Forearm: Elbow -> Hand on Handlebar Grip / Celebration Fist
            const dFore = _tmp.sub2(target, _elbow).length();
            arm.forearm.setPosition(_elbow);
            arm.forearm.lookAt(target, isCeleb ? _armForward : _armUp);
            arm.forearm.setLocalScale(1, 1, Math.max(0.15, dFore));
        });

        // Head tracking: looks into turns and tilts up when tucked or celebrating
        const headYaw = -this.steer * 20;
        let headPitch = this.isSprinting ? 20 : 0;
        if (celebrateBlend > 0.001) headPitch -= celebrateBlend * 18;
        headMount.setLocalEulerAngles(headPitch, headYaw, 0);

        // Legs tracking pedals
        _up.copy(root.forward);
        legs.forEach((leg, i) => {
            const target = pedals[i].getPosition();
            const hip = leg.entity.getPosition();
            const d = _tmp.sub2(target, hip).length();
            leg.entity.lookAt(target, _up);
            leg.entity.setLocalScale(1, 1, d);
        });

        // Arcade respawn flicker: alternate visibility rapidly (12 Hz) when flickerTimer > 0
        if (this.flickerTimer > 0) {
            const blinkCycle = Math.floor(this.flickerTimer * 12) % 2 === 0;
            lean.enabled = blinkCycle;
        } else {
            lean.enabled = true;
        }
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
