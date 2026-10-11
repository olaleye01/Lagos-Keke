import {
    Application,
    Color,
    Entity,
    FILLMODE_FILL_WINDOW,
    RESOLUTION_AUTO,
    TONEMAP_ACES,
    Vec3,
    math
} from 'playcanvas';

import { LagosMap } from './game/map.js';
import { Player } from './game/player.js';
import { NPCManager } from './game/npcs.js';
import { VehicleManager } from './game/vehicles.js';
import { Input } from './game/input.js';
import { AudioFX } from './game/audio.js';
import { createCheckpointBeacon } from './graphics/models.js';
import { GAME, CHECKPOINTS, BIKE } from './game/constants.js';

// --- DOM References ---
const canvas = document.getElementById('game-canvas');
const hud = document.getElementById('hud');
const titleScreen = document.getElementById('title-screen');
const countdownScreen = document.getElementById('countdown');
const countdownVal = document.getElementById('countdown-value');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endRank = document.getElementById('end-rank');

const cpCountEl = document.getElementById('cp-count');
const cpNameEl = document.getElementById('cp-name');
const cpRouteBadgeEl = document.getElementById('cp-route-badge');
const timerValEl = document.getElementById('timer-value');
const timerContainer = document.getElementById('timer');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const navArrow = document.getElementById('nav-arrow');
const navDistEl = document.getElementById('nav-dist');
const surfaceChip = document.getElementById('surface-chip');
const toastEl = document.getElementById('toast');
const steerKnob = document.getElementById('steer-knob');

const speedNumEl = document.getElementById('speed-num');
const staminaBarEl = document.getElementById('stamina-bar');
const staminaValEl = document.getElementById('stamina-val');
const speedLinesCanvas = document.getElementById('speed-lines');
const speedLinesCtx = speedLinesCanvas ? speedLinesCanvas.getContext('2d') : null;

const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');
const btnBrake = document.getElementById('btn-brake');
const btnSprint = document.getElementById('btn-sprint');

// --- Anti-Zoom & Touch Gesture Shields for Mobile Gameplay ---
// 1. Prevent iOS Safari pinch/rotate gestures (triggers on multi-touch e.g. steer + pedal)
window.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
window.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
window.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

// 2. Prevent multi-touch pinch zoom
window.addEventListener('touchmove', e => {
    if (e.scale !== undefined && e.scale !== 1) {
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });

// 3. Prevent mobile double-tap zoom
let lastTouchEndTime = 0;
window.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEndTime <= 300) {
        if (e.cancelable) e.preventDefault();
    }
    lastTouchEndTime = now;
}, { passive: false });

// 4. Prevent touch callout / context menu on game elements
window.addEventListener('contextmenu', e => {
    if (e.pointerType === 'touch' || (e.target && e.target.closest && e.target.closest('#hud, #game-canvas, #app, #steer-meter, .ctrl-btn'))) {
        e.preventDefault();
    }
});

// --- PlayCanvas Application Bootstrap ---
const app = new Application(canvas, {
    graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    }
});

app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);

const resize = () => {
    app.resizeCanvas();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    app.graphicsDevice.maxPixelRatio = pixelRatio;
};
window.addEventListener('resize', resize);
resize();
app.start();

// --- Scene Environment & Lighting ---
app.scene.ambientLight = new Color(0.38, 0.34, 0.30);

// Warm Lagos sunlight
const sun = new Entity('Sun');
sun.addComponent('light', {
    type: 'directional',
    color: new Color(1.0, 0.94, 0.82),
    intensity: 1.45,
    castShadows: true,
    shadowDistance: 60,
    shadowResolution: 2048,
    shadowBias: 0.02,
    normalOffsetBias: 0.02
});
sun.setEulerAngles(48, 135, 0); // shining along -Y
app.root.addChild(sun);

// Subtle fill light
const fillLight = new Entity('FillLight');
fillLight.addComponent('light', {
    type: 'directional',
    color: new Color(0.4, 0.5, 0.65),
    intensity: 0.45,
    castShadows: false
});
fillLight.setEulerAngles(30, -45, 0);
app.root.addChild(fillLight);

// Camera Setup
const cameraEntity = new Entity('MainCamera');
cameraEntity.addComponent('camera', {
    clearColor: new Color(0.96, 0.78, 0.62), // Lagos golden haze / warm sky
    fov: 52,
    nearClip: 0.2,
    farClip: 280,
    toneMapping: TONEMAP_ACES
});
app.root.addChild(cameraEntity);

// --- Game Subsystems ---
const audio = new AudioFX();
const map = new LagosMap(app);
const player = new Player(app, map, audio);
const npcs = new NPCManager(app, map, audio);
const vehicles = new VehicleManager(app, map, audio);
const beacon = createCheckpointBeacon(app);
app.root.addChild(beacon.root);

// Expose runtime debug handle
window.gameDebug = { app, map, player, camera: cameraEntity };

// Pre-rendered minimap background
const minimapBase = map.renderMinimapBase(minimapCanvas.width);

// Speed lines helper
const STREAK_COUNT = 24;
const streaks = Array.from({ length: STREAK_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 0.15 + Math.random() * 0.85,
    speed: 0.9 + Math.random() * 1.5,
    length: 30 + Math.random() * 70
}));

function resizeSpeedCanvas() {
    if (!speedLinesCanvas) return;
    speedLinesCanvas.width = window.innerWidth;
    speedLinesCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeSpeedCanvas);
resizeSpeedCanvas();

function renderSpeedLines(dt, playerSpeed, isSprinting) {
    if (!speedLinesCtx || !speedLinesCanvas) return;
    const w = speedLinesCanvas.width;
    const h = speedLinesCanvas.height;
    speedLinesCtx.clearRect(0, 0, w, h);

    const sprintRatio = playerSpeed / (BIKE.SPRINT_MAX_SPEED || 13.6);
    if (sprintRatio < 0.65 && !isSprinting) {
        speedLinesCanvas.classList.remove('active');
        return;
    }
    speedLinesCanvas.classList.add('active');

    const cx = w * 0.5;
    const cy = h * 0.46;
    const intensity = isSprinting ? 1.0 : (sprintRatio - 0.65) / 0.35;
    const maxR = Math.hypot(cx, cy);

    speedLinesCtx.lineWidth = isSprinting ? 2.5 : 1.8;
    for (const s of streaks) {
        s.radius += s.speed * dt * (isSprinting ? 2.2 : 1.3);
        if (s.radius > 1.25) {
            s.radius = 0.1 + Math.random() * 0.2;
            s.angle = Math.random() * Math.PI * 2;
        }
        const r1 = s.radius * maxR;
        const r2 = r1 + s.length * (isSprinting ? 1.5 : 1.0);
        const x1 = cx + Math.cos(s.angle) * r1;
        const y1 = cy + Math.sin(s.angle) * r1;
        const x2 = cx + Math.cos(s.angle) * r2;
        const y2 = cy + Math.sin(s.angle) * r2;

        const grad = speedLinesCtx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, 'rgba(255, 235, 120, 0)');
        grad.addColorStop(1, `rgba(255, 255, 255, ${(0.42 * intensity).toFixed(2)})`);
        speedLinesCtx.strokeStyle = grad;
        speedLinesCtx.beginPath();
        speedLinesCtx.moveTo(x1, y1);
        speedLinesCtx.lineTo(x2, y2);
        speedLinesCtx.stroke();
    }
}

// --- Game State Variables ---
const STATE = {
    TITLE: 'TITLE',
    COUNTDOWN: 'COUNTDOWN',
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER',
    VICTORY: 'VICTORY'
};

let gameState = STATE.TITLE;
let timeLeft = GAME.TIME_LIMIT;
let sessionElapsed = 0;
let currentCPIndex = 0;
let countdownTimer = 3;
let toastTimeout = null;
let lastTickSecond = -1;

function showToast(text, type = 'normal', duration = 1800) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = text;
    toastEl.className = 'toast show ' + (type === 'bad' ? 'bad' : type === 'good' ? 'good' : '');
    toastTimeout = setTimeout(() => {
        toastEl.className = 'toast';
    }, duration);
}

// Input initialization
const input = new Input(canvas, {
    brakeButton: btnBrake,
    sprintButton: btnSprint,
    steerMeter: document.getElementById('steer-meter')
});

// Checkpoint setup
function updateBeaconPosition() {
    const cp = map.checkpoints[currentCPIndex];
    beacon.root.setPosition(cp.x, 0, cp.z);
    cpCountEl.textContent = `${currentCPIndex + 1}/${CHECKPOINTS.length}`;
    cpNameEl.textContent = cp.name;
    if (cpRouteBadgeEl) {
        const isMud = cp.type === 'mud';
        cpRouteBadgeEl.textContent = isMud ? 'MUD ALLEY' : 'MAIN ROAD';
        cpRouteBadgeEl.className = `cp-route-badge ${isMud ? 'mud' : 'road'}`;
    }
}

function getLastCheckpointPose() {
    if (currentCPIndex === 0) {
        return { x: map.start.x, z: map.start.z, yaw: map.start.yaw };
    }
    const lastCP = map.checkpoints[currentCPIndex - 1];
    const nextCP = map.checkpoints[currentCPIndex];
    let yaw = 0;
    if (nextCP) {
        const dx = nextCP.x - lastCP.x;
        const dz = nextCP.z - lastCP.z;
        yaw = Math.atan2(-dx, -dz);
    }
    return { x: lastCP.x, z: lastCP.z, yaw };
}

// --- Dynamic Camera Position Helpers & Presets ---
const camPos = new Vec3();
const camTarget = new Vec3();
let currentCamPos = new Vec3();
let currentCamLook = new Vec3();

// TOP_CAM: High overhead panoramic bird's-eye view showing a wide portion of the Lagos city map from above
const TOP_CAM = {
    dist: 14.5,
    height: 13.5,
    lookAhead: -1.2,
    lookY: 0.5
};

// NORMAL_CAM: Elevated top-down arcade racing camera giving expansive view of the map, turns, traffic, and hazards
const NORMAL_CAM = {
    dist: 6.2,
    height: 6.8,
    lookAhead: 3.5,
    lookY: 0.5
};

function respawnPlayerAtLastCheckpoint(reason = 'crash') {
    const pose = getLastCheckpointPose();
    player.respawnAt(pose);

    // Snap camera smoothly right behind respawned player with elevated top-down view
    const followDist = NORMAL_CAM.dist;
    const camHeight = NORMAL_CAM.height;
    currentCamPos.set(player.x - player.forwardX * followDist, camHeight, player.z - player.forwardZ * followDist);
    currentCamLook.set(player.x + player.forwardX * NORMAL_CAM.lookAhead, NORMAL_CAM.lookY, player.z + player.forwardZ * NORMAL_CAM.lookAhead);
    cameraEntity.setPosition(currentCamPos);
    cameraEntity.lookAt(currentCamLook);
}

function startCountdown() {
    gameState = STATE.COUNTDOWN;
    countdownTimer = 3;
    timeLeft = GAME.TIME_LIMIT;
    sessionElapsed = 0;
    currentCPIndex = 0;
    lastTickSecond = -1;

    // Reset player, NPCs, and vehicles on every race start to guarantee zero early collisions
    player.reset();
    npcs.reset();
    vehicles.reset();
    updateBeaconPosition();

    titleScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    countdownScreen.classList.remove('hidden');

    countdownVal.textContent = '3';
    countdownVal.classList.remove('tick');
    void countdownVal.offsetWidth;
    countdownVal.classList.add('tick');
    audio.countdown(false);

    // Smooth camera pan begins from TOP_CAM down into NORMAL_CAM
    currentCamPos.set(
        player.x - player.forwardX * TOP_CAM.dist,
        TOP_CAM.height,
        player.z - player.forwardZ * TOP_CAM.dist
    );
    currentCamLook.set(
        player.x + player.forwardX * TOP_CAM.lookAhead,
        TOP_CAM.lookY,
        player.z + player.forwardZ * TOP_CAM.lookAhead
    );

    if (new URLSearchParams(window.location.search).get('gutter') === '1') {
        player.x = 0;
        player.z = 12.0;
        player.yaw = 0; // facing North directly towards South plank bridge at z=7.8
        currentCamPos.set(0, 6.5, 12.0 + 6.0);
        currentCamLook.set(0, 0.5, 12.0 - 3.0);
    }

    cameraEntity.setPosition(currentCamPos);
    cameraEntity.lookAt(currentCamLook);
}

function startGame() {
    gameState = STATE.PLAYING;
    countdownScreen.classList.add('hidden');
    input.enabled = true;
    player.invulnerable = 2.0; // 2.0s protection against early collisions at race start
    showToast('OYA GO! Beat the clock!', 'good', 2000);
}

function endGame(won) {
    gameState = won ? STATE.VICTORY : STATE.GAMEOVER;
    input.enabled = false;
    audio.setRolling(0, 'road');

    if (won) {
        audio.win();
        endTitle.textContent = 'ALL 9 STOPS DELIVERED!';
        endTitle.classList.remove('lose');
        const mudRatio = player.stats.mudTime / (player.stats.mudTime + player.stats.roadTime || 1);
        if (mudRatio > 0.40) {
            endRank.textContent = 'Mud Alley Legend';
        } else if (player.stats.potholes === 0) {
            endRank.textContent = 'Smooth Sailor';
        } else {
            endRank.textContent = 'Master Dispatch Rider';
        }
    } else {
        audio.lose();
        endTitle.textContent = "E DON CAST!";
        endTitle.classList.add('lose');
        endRank.textContent = `Reached ${currentCPIndex}/${CHECKPOINTS.length} Stops – Don't Give Up!`;
    }

    document.getElementById('stat-cps').textContent = `${won ? CHECKPOINTS.length : currentCPIndex}/${CHECKPOINTS.length}`;
    document.getElementById('stat-potholes').textContent = player.stats.potholes;
    document.getElementById('stat-npcs').textContent = player.stats.npcHits;
    const statVehiclesEl = document.getElementById('stat-vehicles');
    if (statVehiclesEl) statVehiclesEl.textContent = player.stats.vehicleHits || 0;

    endScreen.classList.remove('hidden');
}

// Button Events
btnStart.addEventListener('click', () => {
    audio.unlock();
    startCountdown();
});

btnRetry.addEventListener('click', () => {
    startCountdown();
});

// Sound toggle button on welcome screen
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');
if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', () => {
        audio.unlock();
        audio.muted = !audio.muted;
        if (audio.master) {
            audio.master.gain.value = audio.muted ? 0 : 0.7;
        }
        if (soundIconOn && soundIconOff) {
            soundIconOn.classList.toggle('hidden', audio.muted);
            soundIconOff.classList.toggle('hidden', !audio.muted);
        }
    });
}

let titleSwayTime = 0;

// Camera initial position at player start (high overhead view showing bustling street traffic)
currentCamPos.set(
    player.x - player.forwardX * TOP_CAM.dist,
    TOP_CAM.height,
    player.z - player.forwardZ * TOP_CAM.dist
);
currentCamLook.set(
    player.x + player.forwardX * TOP_CAM.lookAhead,
    TOP_CAM.lookY,
    player.z + player.forwardZ * TOP_CAM.lookAhead
);
cameraEntity.setPosition(currentCamPos);
cameraEntity.lookAt(currentCamLook);

// --- Main Engine Update Loop ---
app.on('update', dt => {
    // Clamp delta time to maintain stability
    dt = Math.min(dt, 0.08);

    input.update();

    // 1. Game State Logic
    if (gameState === STATE.COUNTDOWN) {
        countdownTimer -= dt;
        const currentSec = Math.ceil(countdownTimer);
        if (currentSec !== lastTickSecond && currentSec > 0) {
            lastTickSecond = currentSec;
            countdownVal.textContent = currentSec.toString();
            countdownVal.classList.remove('tick');
            void countdownVal.offsetWidth;
            countdownVal.classList.add('tick');
            audio.countdown(false);
        } else if (countdownTimer <= 0 && countdownTimer > -0.6) {
            if (countdownVal.textContent !== 'GO!') {
                countdownVal.textContent = 'GO!';
                countdownVal.classList.remove('tick');
                void countdownVal.offsetWidth;
                countdownVal.classList.add('tick');
                audio.countdown(true);
            }
        } else if (countdownTimer <= -0.6) {
            startGame();
        }

        // Camera Pan: smoothly swoops from high overhead top angle down to the normal behind-the-rider angle
        // t goes from 0.0 (at countdown 3s) to 1.0 (at countdown 0s / start)
        const t = math.clamp(1.0 - (countdownTimer / 3.0), 0.0, 1.0);
        // Smooth cubic ease-in-out curve for natural, cinematic swoop
        const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const curDist = math.lerp(TOP_CAM.dist, NORMAL_CAM.dist, easeT);
        const curHeight = math.lerp(TOP_CAM.height, NORMAL_CAM.height, easeT);

        const targetCamX = player.x - player.forwardX * curDist;
        const targetCamY = curHeight;
        const targetCamZ = player.z - player.forwardZ * curDist;

        const curLookDist = math.lerp(TOP_CAM.lookAhead, NORMAL_CAM.lookAhead, easeT);
        const curLookY = math.lerp(TOP_CAM.lookY, NORMAL_CAM.lookY, easeT);
        const targetLookX = player.x + player.forwardX * curLookDist;
        const targetLookY = curLookY;
        const targetLookZ = player.z + player.forwardZ * curLookDist;

        currentCamPos.set(targetCamX, targetCamY, targetCamZ);
        currentCamLook.set(targetLookX, targetLookY, targetLookZ);

        cameraEntity.setPosition(currentCamPos);
        cameraEntity.lookAt(currentCamLook);
    } else if (gameState === STATE.TITLE) {
        // Elevated camera showing moving vehicles and crossing pedestrians
        titleSwayTime += dt;
        const swayX = Math.sin(titleSwayTime * 0.3) * 0.35;

        const curCamX = player.x - player.forwardX * TOP_CAM.dist + swayX;
        const curCamY = TOP_CAM.height;
        const curCamZ = player.z - player.forwardZ * TOP_CAM.dist;

        const curLookX = player.x + player.forwardX * TOP_CAM.lookAhead;
        const curLookY = TOP_CAM.lookY;
        const curLookZ = player.z + player.forwardZ * TOP_CAM.lookAhead;

        currentCamPos.set(curCamX, curCamY, curCamZ);
        currentCamLook.set(curLookX, curLookY, curLookZ);
        cameraEntity.setPosition(currentCamPos);
        cameraEntity.lookAt(currentCamLook);
        player._sync(dt);
    } else if (gameState === STATE.PLAYING) {
        sessionElapsed += dt;
        timeLeft -= dt;

        // Checkpoint proximity check
        const activeCP = map.checkpoints[currentCPIndex];
        const distToCP = Math.hypot(player.x - activeCP.x, player.z - activeCP.z);

        if (distToCP < GAME.CHECKPOINT_RADIUS) {
            audio.checkpoint();
            player.triggerCelebrate();
            // Bonus time capped at Snapchat 2-minute (120s) limit
            timeLeft = Math.min(GAME.MAX_SESSION_TIME, timeLeft + GAME.CHECKPOINT_BONUS);
            timerContainer.classList.remove('bonus');
            void timerContainer.offsetWidth;
            timerContainer.classList.add('bonus');

            showToast(`${activeCP.name}! +${GAME.CHECKPOINT_BONUS}s`, 'good', 1600);
            currentCPIndex++;

            if (currentCPIndex >= CHECKPOINTS.length) {
                endGame(true);
            } else {
                updateBeaconPosition();
            }
        }

        // Timer expiration or session limit reached
        if (timeLeft <= 0 || sessionElapsed >= GAME.MAX_SESSION_TIME) {
            timeLeft = 0;
            endGame(false);
        }

        // Ticking audio when low on time
        if (timeLeft <= 10 && timeLeft > 0) {
            const sec = Math.floor(timeLeft);
            if (sec !== lastTickSecond) {
                lastTickSecond = sec;
                audio.tick(timeLeft <= 5);
            }
        }
    }

    // 2. Player, Vehicles, and NPCs Simulation
    const isWorldActive = gameState === STATE.TITLE || gameState === STATE.COUNTDOWN || gameState === STATE.PLAYING;
    const isRiding = gameState === STATE.PLAYING;
    const playerEvents = player.update(dt, input, isRiding);
    if (isRiding && playerEvents.pothole) {
        showToast('Wahala! Pothole!', 'bad', 1400);
    }
    if (isRiding && playerEvents.gutter) {
        showToast('Wahala! you don enter gutter!', 'bad', 1600);
    }

    const npcToast = npcs.update(dt, player, isWorldActive, vehicles, isRiding);
    if (isRiding && npcToast) {
        timeLeft = Math.max(0, timeLeft - GAME.NPC_HIT_PENALTY);
        showToast(`${npcToast} -${GAME.NPC_HIT_PENALTY}s`, 'bad', 1600);
    }

    const vehicleToast = vehicles.update(dt, player, isWorldActive, npcs, isRiding);
    if (isRiding && vehicleToast) {
        timeLeft = Math.max(0, timeLeft - GAME.VEHICLE_HIT_PENALTY);
        showToast(`${vehicleToast} -${GAME.VEHICLE_HIT_PENALTY}s`, 'bad', 2000);
        respawnPlayerAtLastCheckpoint('vehicle');
    }

    // Audio rolling sound modulation
    if (isRiding && player.speed > 0.2) {
        const speedRatio = player.speed / player.maxSpeed;
        audio.setRolling(speedRatio, player.surface);
    } else {
        audio.setRolling(0, 'road');
    }

    // 3. Elevated Top-Down Dynamic Arcade Camera during Active Gameplay
    if (gameState === STATE.PLAYING) {
        const forwardX = player.forwardX;
        const forwardZ = player.forwardZ;
        const speedRatio = player.speed / (player.maxSpeed || 1);

        // Elevated top-down view showing a good portion of the map from above
        const followDist = NORMAL_CAM.dist + speedRatio * 0.8;
        const camHeight = NORMAL_CAM.height + speedRatio * 0.6;
        const desiredX = player.x - forwardX * followDist;
        const desiredZ = player.z - forwardZ * followDist;
        let desiredY = camHeight;

        // Camera collision check: if camera would clip inside a high building, raise it above roof
        if (map.blocksCamera(desiredX, desiredY, desiredZ)) {
            desiredY += 2.2;
        }

        // Camera shake from potholes or bumps
        let shakeX = 0;
        let shakeY = 0;
        if (player.shake > 0.01) {
            const shakeMag = player.shake * 0.35;
            shakeX = (Math.random() - 0.5) * shakeMag;
            shakeY = (Math.random() - 0.5) * shakeMag;
        }

        // Smooth camera follow lerp
        const camLerpSpeed = 8.5;
        currentCamPos.x = math.lerp(currentCamPos.x, desiredX + shakeX, 1 - Math.exp(-camLerpSpeed * dt));
        currentCamPos.y = math.lerp(currentCamPos.y, desiredY + shakeY, 1 - Math.exp(-camLerpSpeed * dt));
        currentCamPos.z = math.lerp(currentCamPos.z, desiredZ, 1 - Math.exp(-camLerpSpeed * dt));

        // Look ahead along the road
        const lookDistAhead = NORMAL_CAM.lookAhead + speedRatio * 0.6;
        const targetLookX = player.x + forwardX * lookDistAhead;
        const targetLookY = NORMAL_CAM.lookY;
        const targetLookZ = player.z + forwardZ * lookDistAhead;

        currentCamLook.x = math.lerp(currentCamLook.x, targetLookX, 1 - Math.exp(-12 * dt));
        currentCamLook.y = math.lerp(currentCamLook.y, targetLookY, 1 - Math.exp(-12 * dt));
        currentCamLook.z = math.lerp(currentCamLook.z, targetLookZ, 1 - Math.exp(-12 * dt));

        cameraEntity.setPosition(currentCamPos);
        cameraEntity.lookAt(currentCamLook);

        // Dynamic Camera FOV for speed rush sensation
        const targetFov = 54 + speedRatio * (player.isSprinting ? 8 : 4);
        cameraEntity.camera.fov = math.lerp(cameraEntity.camera.fov, targetFov, 1 - Math.exp(-6 * dt));
    }

    // 4. Speed lines rendering
    renderSpeedLines(dt, player.speed, player.isSprinting);

    // 5. Animate Checkpoint Beacon
    const now = performance.now() * 0.001;
    beacon.ring.rotate(0, 75 * dt, 0);
    beacon.arrow.rotate(0, 90 * dt, 0);
    const arrowBob = Math.sin(now * 3.5) * 0.35;
    beacon.arrow.setLocalPosition(0, 4.2 + arrowBob, 0);

    // 6. Update HUD Displays
    if (gameState === STATE.PLAYING || gameState === STATE.COUNTDOWN) {
        // Timer display
        timerValEl.textContent = Math.max(0, timeLeft).toFixed(1);
        if (timeLeft <= 15) {
            timerContainer.className = 'sticker-bubble timer-panel danger';
        } else if (timeLeft <= 30) {
            timerContainer.className = 'sticker-bubble timer-panel warn';
        } else {
            timerContainer.className = 'sticker-bubble timer-panel';
        }

        // Speedometer display (km/h)
        if (speedNumEl) {
            const kmh = Math.round(player.speed * 3.6);
            speedNumEl.textContent = kmh.toString();
        }

        // Stamina gauge display
        if (staminaBarEl && staminaValEl) {
            const stamPct = Math.round((player.stamina / BIKE.MAX_STAMINA) * 100);
            staminaBarEl.style.height = `${stamPct}%`;
            staminaValEl.textContent = `${stamPct}%`;
            if (stamPct < 15) {
                staminaBarEl.classList.add('exhausted');
            } else {
                staminaBarEl.classList.remove('exhausted');
            }
            const staminaContainer = document.getElementById('stamina-container');
            if (staminaContainer) {
                staminaContainer.classList.toggle('boosting', player.isSprinting && player.stamina > 0);
            }
        }

        // Surface indicator chip
        if (player.surface === 'mud') {
            surfaceChip.className = 'chip mud';
            surfaceChip.textContent = 'MUD ALLEY';
        } else {
            surfaceChip.className = 'chip road';
            surfaceChip.textContent = 'MAIN ROAD';
        }

        // Handlebar Steer Gear Knob along curved arc
        const s = input.steer;
        const xPct = 50 + s * 34; // travels between 16% and 84% along the handlebars
        const yPct = 62 - (s * s) * 16; // arches upward toward grips
        const rotDeg = s * 70; // gear cog rolls as you steer
        steerKnob.style.left = `${xPct}%`;
        steerKnob.style.top = `${yPct}%`;
        steerKnob.style.transform = `translate(-50%, -50%) rotate(${rotDeg}deg)`;

        // Glowing L/R indicator highlight
        const leftInd = document.getElementById('steer-ind-left');
        const rightInd = document.getElementById('steer-ind-right');
        if (leftInd) leftInd.classList.toggle('active', s < -0.15);
        if (rightInd) rightInd.classList.toggle('active', s > 0.15);

        // Compass / Direction Arrow & Distance to Checkpoint
        const activeCP = map.checkpoints[currentCPIndex];
        const dx = activeCP.x - player.x;
        const dz = activeCP.z - player.z;
        const dist = Math.hypot(dx, dz);
        navDistEl.textContent = `${Math.round(dist)}m`;

        // Angle from player forward vector to target in player local space
        const fX = player.forwardX;
        const fZ = player.forwardZ;
        const rX = -fZ;
        const rZ = fX;
        const forwardDist = dx * fX + dz * fZ;
        const rightDist = dx * rX + dz * rZ;
        const relativeAngle = Math.atan2(rightDist, forwardDist);
        const angleDeg = (relativeAngle * 180) / Math.PI;
        navArrow.style.transform = `rotate(${angleDeg}deg)`;

        // Minimap Render
        renderMinimap(activeCP);
    }
});

function renderMinimap(activeCP) {
    const size = minimapCanvas.width;
    minimapCtx.clearRect(0, 0, size, size);

    // 1. Draw cached map background
    minimapCtx.drawImage(minimapBase, 0, 0);

    // 2. Draw all checkpoints
    map.checkpoints.forEach((cp, idx) => {
        const { mx, my } = map.toMinimap(cp.x, cp.z, size);
        minimapCtx.beginPath();
        if (idx === currentCPIndex) {
            const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.22;
            minimapCtx.arc(mx, my, 6.5 * pulse, 0, Math.PI * 2);
            minimapCtx.fillStyle = '#f6ce34';
            minimapCtx.fill();
            minimapCtx.lineWidth = 2;
            minimapCtx.strokeStyle = '#ffffff';
            minimapCtx.stroke();
        } else if (idx < currentCPIndex) {
            minimapCtx.arc(mx, my, 3.5, 0, Math.PI * 2);
            minimapCtx.fillStyle = 'rgba(34, 197, 94, 0.7)';
            minimapCtx.fill();
            minimapCtx.lineWidth = 1;
            minimapCtx.strokeStyle = '#0e3816';
            minimapCtx.stroke();
        } else {
            minimapCtx.arc(mx, my, 4, 0, Math.PI * 2);
            minimapCtx.fillStyle = cp.type === 'mud' ? '#c26338' : '#eab308';
            minimapCtx.fill();
            minimapCtx.lineWidth = 1.2;
            minimapCtx.strokeStyle = '#1b1206';
            minimapCtx.stroke();
        }
    });

    // 3. Draw Vehicle Blips on the Minimap
    vehicles.vehicles.forEach(v => {
        const { mx: vx, my: vy } = map.toMinimap(v.x, v.z, size);
        minimapCtx.beginPath();
        minimapCtx.arc(vx, vy, v.type === 'danfo' ? 3.5 : 2.5, 0, Math.PI * 2);
        minimapCtx.fillStyle = (v.type === 'danfo' || v.type === 'keke') ? '#f6ce34' : '#38bdf8';
        minimapCtx.fill();
        minimapCtx.lineWidth = 0.8;
        minimapCtx.strokeStyle = '#000';
        minimapCtx.stroke();
    });

    // 4. Draw Player Position & Heading (-player.yaw rotates clockwise in 2D canvas)
    const { mx: px, my: py } = map.toMinimap(player.x, player.z, size);
    minimapCtx.save();
    minimapCtx.translate(px, py);
    minimapCtx.rotate(-player.yaw);

    // Heading triangle
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, -7);
    minimapCtx.lineTo(4.5, 5);
    minimapCtx.lineTo(0, 3);
    minimapCtx.lineTo(-4.5, 5);
    minimapCtx.closePath();
    minimapCtx.fillStyle = '#22c55e'; // Green indicator
    minimapCtx.fill();
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 1.2;
    minimapCtx.stroke();

    minimapCtx.restore();
}
