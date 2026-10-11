import { Vec3 } from 'playcanvas';
import { createPedestrian } from '../graphics/models.js';
import { HAZARDS } from './constants.js';
import { mulberry32, pick } from '../graphics/palette.js';

const LAGOS_SHOUTS = [
    'Watch road o!',
    'You wan jam pesin?!',
    'Oga look front!',
    'Wetin be this?!',
    'Commot for road!',
    'Ah ah, rider!',
    'No be so o!'
];

export class NPCManager {
    constructor(app, map, audio) {
        this.app = app;
        this.map = map;
        this.audio = audio;
        this.rand = mulberry32(4242);
        this.npcs = [];
        this._initNPCs();
    }

    _initNPCs() {
        const crossings = this.map.crossings;
        const count = Math.min(HAZARDS.NPC_COUNT, crossings.length);
        
        for (let i = 0; i < count; i++) {
            const cross = crossings[i % crossings.length];
            const model = createPedestrian(this.app, this.rand);
            this.app.root.addChild(model.root);

            // Crossing line between cross.a and cross.b
            const fromA = this.rand() > 0.5;
            const startPt = fromA ? cross.a : cross.b;
            const endPt = fromA ? cross.b : cross.a;

            const speed = 1.6 + this.rand() * 1.6;
            const delay = this.rand() * 4; // delay before starting to cross

            const npc = {
                model,
                cross,
                x: startPt.x,
                z: startPt.z,
                fromA,
                startPt,
                endPt,
                progress: 0,
                speed,
                crossing: false,
                delayTimer: delay,
                walkPhase: this.rand() * Math.PI * 2,
                cooldown: 0,
                scared: 0
            };

            model.root.setPosition(npc.x, 0, npc.z);
            this.npcs.push(npc);
        }
    }

    reset() {
        for (const npc of this.npcs) {
            npc.progress = 0;
            npc.crossing = false;
            npc.delayTimer = this.rand() * 3;
            npc.cooldown = 0;
            npc.scared = 0;
            npc.x = npc.startPt.x;
            npc.z = npc.startPt.z;
            npc.model.root.setPosition(npc.x, 0, npc.z);
            npc.model.legs.forEach(leg => leg.setLocalEulerAngles(0, 0, 0));
        }
    }

    update(dt, player, active, vehicleManager = null, checkPlayerCollision = false) {
        let bumpedToast = null;

        for (const npc of this.npcs) {
            npc.cooldown = Math.max(0, npc.cooldown - dt);
            npc.scared = Math.max(0, npc.scared - dt);

            if (!active) {
                // idle leg swing
                continue;
            }

            if (!npc.crossing) {
                npc.delayTimer -= dt;
                if (npc.delayTimer <= 0) {
                    // Look both ways: wait at curb if vehicle is approaching
                    if (vehicleManager && npc.cross && npc.cross.isMainRoad && vehicleManager.isVehicleApproaching(npc.x, npc.z, 8.0)) {
                        npc.delayTimer = 1.0;
                    } else {
                        npc.crossing = true;
                        npc.progress = 0;
                    }
                }
            } else {
                // If not scared, advance across the road
                if (npc.scared <= 0) {
                    const totalDist = Math.hypot(npc.endPt.x - npc.startPt.x, npc.endPt.z - npc.startPt.z);
                    // Hustle if vehicle is approaching near crossing
                    const hustle = (vehicleManager && npc.cross && npc.cross.isMainRoad && vehicleManager.isVehicleApproaching(npc.x, npc.z, 5.5)) ? 1.45 : 1.0;
                    const moveSpeed = npc.speed * hustle;
                    npc.progress += (moveSpeed * dt) / (totalDist || 1);
                    npc.walkPhase += dt * moveSpeed * 6;

                    // Animate leg swing
                    const swing = Math.sin(npc.walkPhase) * 28;
                    npc.model.legs[0].setLocalEulerAngles(swing, 0, 0);
                    npc.model.legs[1].setLocalEulerAngles(-swing, 0, 0);

                    // Interpolate position
                    npc.x = npc.startPt.x + (npc.endPt.x - npc.startPt.x) * npc.progress;
                    npc.z = npc.startPt.z + (npc.endPt.z - npc.startPt.z) * npc.progress;

                    // Set yaw towards direction of motion
                    const dx = npc.endPt.x - npc.startPt.x;
                    const dz = npc.endPt.z - npc.startPt.z;
                    const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI + 180;
                    npc.model.root.setEulerAngles(0, yawDeg, 0);

                    if (npc.progress >= 1) {
                        // Finished crossing! Swap directions and wait
                        npc.crossing = false;
                        npc.delayTimer = 2.5 + this.rand() * 4;
                        const temp = npc.startPt;
                        npc.startPt = npc.endPt;
                        npc.endPt = temp;
                        npc.model.legs[0].setLocalEulerAngles(0, 0, 0);
                        npc.model.legs[1].setLocalEulerAngles(0, 0, 0);
                    }
                } else {
                    // Scared/alert hop
                    npc.model.legs[0].setLocalEulerAngles(-10, 0, 0);
                    npc.model.legs[1].setLocalEulerAngles(10, 0, 0);
                }
            }

            npc.model.root.setPosition(npc.x, 0, npc.z);

            // Collision check with player (only when actively riding)
            if (checkPlayerCollision && active && npc.cooldown <= 0) {
                const dist = Math.hypot(player.x - npc.x, player.z - npc.z);
                if (dist < HAZARDS.NPC_RADIUS + 0.55) {
                    npc.cooldown = 2.0;
                    npc.scared = 2.0;
                    player.knock(npc.x, npc.z);
                    this.audio.oops();
                    bumpedToast = pick(this.rand, LAGOS_SHOUTS);
                }
            }
        }

        return bumpedToast;
    }
}
