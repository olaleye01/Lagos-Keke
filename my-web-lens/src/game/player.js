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
        this.particles = createParticlePool(app, 64);
        this._particleIndex = 0;
        this.standFactor = 0;
        this.bitmojiEntity = null;
        this.reset();
    }

    /**
     * Attach a loaded 3D Bitmoji entity to the bicycle rider's head/body mount.
     * @param {Entity} bitmojiEntity
     */
    attachBitmoji(bitmojiEntity) {
        if (!this.model || !this.model.avatar || !bitmojiEntity) return;
        const { headMount, headPlaceholder } = this.model.avatar;
        if (headPlaceholder) {
            headPlaceholder.enabled = false;
        }
        if (headMount) {
            bitmojiEntity.setLocalPosition(0, 0, 0);
            bitmojiEntity.setLocalEulerAngles(0, 180, 0);
            headMount.addChild(bitmojiEntity);
            this.bitmojiEntity = bitmojiEntity;
        }
    }

    reset() {
        const s = this.map.start;
        this.x = s.x;
        this.y = 0;
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
        this.jumpState = null;
        this.rampBoostTimer = 0;
        this.isRampBoosting = false;
        if (this.model && this.model.lean) this.model.lean.enabled = true;
        if (this.model && this.model.root) this.model.root.enabled = true;

        // Animation Timers & States
        this.celebrateTimer = 0;
        this.idlePhase = 0;
        this.standFactor = 0;

        this.stats = { potholes: 0, npcHits: 0, vehicleHits: 0, gutterFalls: 0, mudTime: 0, roadTime: 0 };
        this.gutterCooldown = 0;
        if (this.map && this.map.ramps) {
            this.map.ramps.forEach(r => (r.cooldown = 0));
        }
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
        if (this.isRampBoosting) {
            return Math.max(14.2, BIKE.SPRINT_MAX_SPEED);
        }
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
        const events = { pothole: false, gutter: false, rampLaunch: null, rampLand: false };
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

        // Ramp boost cooldown and persistence timer (overrides mud speed limit)
        if (this.rampBoostTimer > 0) {
            this.rampBoostTimer = Math.max(0, this.rampBoostTimer - dt);
            this.isRampBoosting = this.rampBoostTimer > 0;
        }

        // Sprint & Stamina (Stop dash and boost effect once boost is less than 5%)
        const minBoostStamina = BIKE.MAX_STAMINA * ((BIKE.MIN_BOOST_STAMINA_PCT || 5) / 100);

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
                this.isSprinting = false;
                this._boostExhausted = true;
            }
        } else {
            this.isSprinting = false;
            this.stamina = Math.min(BIKE.MAX_STAMINA, this.stamina + BIKE.STAMINA_RECOVERY * dt);
        }

        // --- SPEED RAMP DETECTION & LAUNCH ---
        if (!this.jumpState && active && this.speed > 0.8 && this.map.ramps) {
            for (const ramp of this.map.ramps) {
                if (ramp.cooldown > 0) {
                    ramp.cooldown = Math.max(0, ramp.cooldown - dt);
                    continue;
                }
                const dx = this.x - ramp.x;
                const dz = this.z - ramp.z;
                const halfLen = 2.2;
                const halfWid = 1.85;
                const inBounds = ramp.axis === 'z'
                    ? (Math.abs(dx) <= halfWid && Math.abs(dz) <= halfLen)
                    : (Math.abs(dx) <= halfLen && Math.abs(dz) <= halfWid);

                if (inBounds) {
                    const headingDot = ramp.axis === 'z' ? this.forwardZ : this.forwardX;
                    if (Math.abs(headingDot) > 0.2) {
                        this._launchRamp(ramp);
                        events.rampLaunch = { stunt: ramp.stunt, name: ramp.name, label: ramp.label };
                        break;
                    }
                }
            }
        }

        let moved = 0;

        // --- FLIGHT MECHANICS OR GROUND RIDING ---
        if (this.jumpState) {
            const js = this.jumpState;
            js.progress += dt / js.duration;
            const p = js.progress;

            // Forward momentum in air (overrides normal mud drag)
            this.speed = js.speed;
            const prevX = this.x;
            const prevZ = this.z;
            this.x += js.dirX * this.speed * dt;
            this.z += js.dirZ * this.speed * dt;

            // Parabolic physics flight arc (peaks at p = 0.5, lands at p = 1.0)
            const arc = 4 * js.peakHeight * p * (1 - p);
            const rampApexFade = 0.52 * Math.max(0, 1 - p * 2.2);
            this.y = Math.max(0, arc + rampApexFade);

            // Obstacle safety check: keep rider inside street alley bounds
            const pos = { x: this.x, z: this.z };
            this.map.resolveCircle(pos, BIKE.RADIUS);
            this.x = pos.x;
            this.z = pos.z;
            moved = Math.hypot(this.x - prevX, this.z - prevZ);

            // Visual air boost trail particles
            if (Math.random() < 0.75) {
                this._emit(this.x - js.dirX * 0.7, this.y + 0.25, this.z - js.dirZ * 0.7, 3);
            }

            // Touchdown landing check
            if (p >= 1.0) {
                this.y = 0;
                this.jumpState = null;
                js.ramp.cooldown = 0.2; // reusable immediately
                if (this.audio) {
                    if (this.audio.rampLand) this.audio.rampLand();
                    if (this.audio.stuntCheer) this.audio.stuntCheer();
                }
                this.shake = 0.38;
                this._burst(this.x, this.z, 28, 4);
                events.rampLand = true;
            }
        } else {
            this.y = 0;

            // Ground acceleration and deceleration
            const max = this.maxSpeed * (this.wobble > 0 ? 0.72 : 1);
            if (!active || this.stun > 0) {
                this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * 0.6 * dt);
            } else if (input.brake) {
                this.speed = Math.max(0, this.speed - BIKE.BRAKE_DECEL * dt);
            } else if (this.isRampBoosting) {
                // Post-ramp boost override: coast down gradually without mud drag
                if (this.speed > max) {
                    this.speed = Math.max(max, this.speed - BIKE.COAST_DECEL * dt);
                }
            } else if (this.speed < max) {
                const accel = this.isSprinting ? BIKE.SPRINT_ACCEL : (this.surface === 'road' ? BIKE.ACCEL : BIKE.MUD_ACCEL);
                this.speed = Math.min(max, this.speed + accel * dt);
            } else {
                this.speed = Math.max(max, this.speed - BIKE.COAST_DECEL * 2 * dt);
            }

            const turnScale = math.clamp(this.speed / 4.2, 0.45, 1);
            let wobbleSteer = 0;
            if (this.wobble > 0) wobbleSteer = Math.sin(this.wobble * 28) * 0.5 * Math.min(1, this.wobble * 2);
            if (this.surface === 'mud' && !this.isRampBoosting) wobbleSteer += Math.sin(performance.now() * 0.005) * 0.05;
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
            moved = Math.hypot(this.x - prevX, this.z - prevZ);
        }

        // Pothole collision check (ignored while airborne)
        if (this.y < 0.3) {
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
        }

        // Open Gutter hazard check (ignored while airborne)
        this.gutterCooldown = Math.max(0, (this.gutterCooldown || 0) - dt);
        const inGutter = !this.jumpState && this.y < 0.3 && this.map.isInOpenGutter && this.map.isInOpenGutter(this.x, this.z, BIKE.RADIUS * 0.45);
        if (inGutter && this.gutterCooldown <= 0) {
            this.gutterCooldown = 1.6;
            this.audio.pothole();
            this._burst(this.x, this.z, 20, 2);
            events.gutter = true;
            this.stats.gutterFalls = (this.stats.gutterFalls || 0) + 1;

            // Reposition the rider safely on solid ground outside the gutter
            if (this.map && this.map.getGutterRepositionPose) {
                const pose = this.map.getGutterRepositionPose(this.x, this.z, this.forwardX, this.forwardZ);
                this.x = pose.x;
                this.y = 0;
                this.z = pose.z;
                this.yaw = pose.yaw;
                this.speed = 0;
                this.steer = 0;
                this.wobble = 0.85;
                this.shake = 0.65;
                this.stun = 0.45;
                this.invulnerable = 1.8;
                this.triggerFlicker(1.8);
                this._burst(this.x, this.z, 16, 2);
                this._sync(0);
            }
        }

        // Mud spray particles (only on the ground)
        if (this.y < 0.1 && this.surface === 'mud' && this.speed > 2.8) {
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

    _launchRamp(ramp) {
        const boostSpeed = Math.max(this.speed * 1.5, 14.2);
        this.speed = boostSpeed;
        this.rampBoostTimer = 2.4; // persists through flight + post-landing buffer
        this.isRampBoosting = true;
        ramp.cooldown = 0.5; // debounce on ramp
        if (this.audio && this.audio.rampBoost) {
            this.audio.rampBoost();
        }
        // Takeoff dust and mud blast
        this._burst(this.x, this.z, 24, 1);

        this.jumpState = {
            ramp,
            progress: 0,
            duration: 1.18, // ~1.18 seconds of flight time
            speed: boostSpeed,
            peakHeight: 2.25, // meters peak altitude
            dirX: this.forwardX,
            dirZ: this.forwardZ,
            stunt: ramp.stunt
        };
    }

    knock(fromX, fromZ) {
        this.stats.npcHits++;

        // Relative offset from rider to NPC
        const toNpcX = fromX - this.x;
        const toNpcZ = fromZ - this.z;

        // Rider forward and lateral (right) unit vectors
        const fwdX = this.forwardX;
        const fwdZ = this.forwardZ;
        const rightX = -fwdZ;
        const rightZ = fwdX;

        // Determine which side the NPC is on relative to the rider's travel direction
        // side >= 0: NPC is to the rider's right -> deflect left (-right)
        // side < 0: NPC is to the rider's left -> deflect right (+right)
        const side = toNpcX * rightX + toNpcZ * rightZ;
        const deflectSide = side >= 0 ? -1 : 1;

        // Move smoothly past the NPC: lateral deflection away from NPC + forward slide past them
        const lateralPush = deflectSide * 0.70;
        const forwardPush = 0.95;

        const newX = this.x + rightX * lateralPush + fwdX * forwardPush;
        const newZ = this.z + rightZ * lateralPush + fwdZ * forwardPush;

        const pos = { x: newX, z: newZ };
        if (this.map && this.map.resolveCircle) {
            this.map.resolveCircle(pos, BIKE.RADIUS);
        }
        this.x = pos.x;
        this.z = pos.z;

        // Maintain forward momentum while scrubbing speed slightly
        this.speed = Math.max(3.8, this.speed * 0.65);
        this.stun = 0.08;
        this.wobble = 0.55;
        this.shake = 0.35;

        // Trigger arcade flicker effect and invulnerability while moving past
        this.triggerFlicker(1.5);
        this._burst(this.x, this.z, 10, 2);
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

        if (kind === 3) {
            // Speed boost wind / spark trail in air
            p.entity.render.material = p.matBoost;
            p.life = 0.42;
            p.vx = -this.forwardX * 2.2 + (Math.random() - 0.5) * 0.8;
            p.vz = -this.forwardZ * 2.2 + (Math.random() - 0.5) * 0.8;
            p.vy = (Math.random() - 0.5) * 0.6;
            p.size = 0.15 + Math.random() * 0.08;
        } else if (kind === 1 || kind === 4) {
            // Takeoff blast or landing shockwave burst
            p.entity.render.material = p.matDust;
            const spread = kind === 4 ? 4.8 : 3.2;
            p.life = kind === 4 ? 0.75 : 0.6;
            p.vx = (Math.random() - 0.5) * spread - (kind === 1 ? this.forwardX * 2.2 : 0);
            p.vz = (Math.random() - 0.5) * spread - (kind === 1 ? this.forwardZ * 2.2 : 0);
            p.vy = (kind === 4 ? 1.5 : 2.6) + Math.random() * 1.8;
            p.size = (kind === 4 ? 0.22 : 0.18) + Math.random() * 0.1;
        } else {
            // 0: mud spray, 2: pothole splash
            p.entity.render.material = p.matMud;
            const spread = kind === 2 ? 3 : 1.2;
            p.life = kind === 2 ? 0.7 : 0.45;
            p.vx = (Math.random() - 0.5) * spread - this.forwardX * (kind === 2 ? 0 : 1.5);
            p.vz = (Math.random() - 0.5) * spread - this.forwardZ * (kind === 2 ? 0 : 1.5);
            p.vy = (kind === 2 ? 3 : 1.6) + Math.random() * 1.5;
            p.size = (kind === 2 ? 0.16 : 0.1) + Math.random() * 0.08;
        }

        p.entity.enabled = true;
        p.entity.setPosition(x, y, z);
        p.entity.setLocalScale(p.size, p.size, p.size);
    }

    _burst(x, z, n, kind) {
        const y = this.y || 0.15;
        for (let i = 0; i < n; i++) this._emit(x, y, z, kind);
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

        root.setPosition(this.x, this.y || 0, this.z);
        root.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);

        // Front fork & handlebars steering
        frontFork.setLocalEulerAngles(0, this.steer * 24, 0);

        // Wheels rotation (spins continuously from forward speed)
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

        // --- AUTOMATIC PROCEDURAL STUNT ROTATION COMPUTATION ---
        let stuntPitch = 0;
        let stuntRoll = 0;
        let stuntYaw = 0;

        if (this.jumpState) {
            const p = math.clamp(this.jumpState.progress, 0, 1);
            const stunt = this.jumpState.stunt;

            if (stunt === 'wheelie') {
                // Ramp 1: Front-wheel lift (smooth wheelie-style jump)
                // Lifts front wheel high (+42 deg), holds stylish wheelie pose, eases level before touchdown
                if (p < 0.28) {
                    const t = p / 0.28;
                    stuntPitch = 42 * (0.5 - 0.5 * Math.cos(t * Math.PI));
                } else if (p < 0.72) {
                    const wobble = Math.sin((p - 0.28) * 18) * 1.5;
                    stuntPitch = 42 + wobble;
                } else if (p < 0.94) {
                    const t = (p - 0.72) / 0.22;
                    stuntPitch = 42 * (0.5 + 0.5 * Math.cos(t * Math.PI));
                } else {
                    stuntPitch = 0;
                }
            } else if (stunt === 'frontflip') {
                // Ramp 2: Forward somersault (complete front flip in the air)
                // Full 360 degree forward flip, completes rotation cleanly at p = 0.92
                const t = math.clamp((p - 0.04) / 0.88, 0, 1);
                const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
                stuntPitch = -360 * ease;
            } else if (stunt === 'backflip') {
                // Ramp 3: Backward somersault (complete backflip in the air)
                // Full 360 degree backward flip, completes rotation cleanly at p = 0.92
                const t = math.clamp((p - 0.04) / 0.88, 0, 1);
                const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
                stuntPitch = 360 * ease;
            } else if (stunt === 'spin360') {
                // Ramp 4: Stylish sideways spin (rotating rider and bicycle 360° in the air)
                // Full 360 degree sideways roll + stylish BMX whip flare, completes cleanly at p = 0.92
                const t = math.clamp((p - 0.04) / 0.88, 0, 1);
                const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
                stuntRoll = 360 * ease;
                stuntYaw = Math.sin(t * Math.PI) * 16;
            }
        }

        const speed01 = math.clamp(this.speed / BIKE.ROAD_MAX_SPEED, 0, 1);
        let roll = -this.steer * speed01 * 22;
        if (this.wobble > 0) roll += Math.sin(this.wobble * 30) * 9 * Math.min(1, this.wobble * 2);
        roll += Math.sin(this.crankAngle) * 2.8 * speed01;

        // Synchronize rider and bicycle together in 100% lockstep
        lean.setLocalEulerAngles(stuntPitch, stuntYaw, roll + stuntRoll);

        // Seated on road, standing up on pedals in mud or during aerial stunt
        const targetStand = (this.surface === 'mud' || this.jumpState) ? 1.0 : 0.0;
        this.standFactor = math.lerp(this.standFactor, targetStand, 1 - Math.exp(-8 * dt));

        const mudPump = this.standFactor > 0.05 ? Math.abs(Math.sin(this.crankAngle)) * 0.045 * this.standFactor : 0.0;
        const pelvisY = math.lerp(0.975, 1.08, this.standFactor) + mudPump;
        const pelvisZ = math.lerp(0.25, 0.17, this.standFactor);
        const sideRock = Math.sin(this.crankAngle) * math.lerp(1.2, 5.5, this.standFactor);

        pelvis.setLocalPosition(0, pelvisY, pelvisZ);
        pelvis.setLocalEulerAngles(0, 0, sideRock);

        // Torso posture with stunt tuck/lean adaptations
        let torsoPitch = math.lerp(-22, -32, this.standFactor);
        if (this.jumpState) {
            if (this.jumpState.stunt === 'frontflip') torsoPitch -= 16; // tuck in for front somersault
            else if (this.jumpState.stunt === 'wheelie') torsoPitch += 12; // lean back with wheelie
            else if (this.jumpState.stunt === 'backflip') torsoPitch -= 10;
        } else if (this.isSprinting && this.speed > 5) {
            torsoPitch -= 14;
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

function createParticlePool(app, count = 64) {
    const pool = [];
    const matMud = new StandardMaterial();
    matMud.diffuse = new Color(0.48, 0.28, 0.16);
    matMud.update();

    const matBoost = new StandardMaterial();
    matBoost.diffuse = new Color(0.18, 0.95, 0.88);
    matBoost.emissive = new Color(0.1, 0.6, 0.55);
    matBoost.update();

    const matDust = new StandardMaterial();
    matDust.diffuse = new Color(0.72, 0.54, 0.36);
    matDust.update();

    for (let i = 0; i < count; i++) {
        const e = new Entity('Particle');
        e.addComponent('render', { type: 'box', material: matMud });
        e.enabled = false;
        app.root.addChild(e);
        pool.push({ entity: e, life: 0, vx: 0, vy: 0, vz: 0, size: 0.1, matMud, matBoost, matDust });
    }
    return pool;
}
