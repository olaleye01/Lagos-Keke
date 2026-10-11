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
import { Input } from './game/input.js';
import { AudioFX } from './game/audio.js';
import { createCheckpointBeacon } from './graphics/models.js';
import { GAME, CHECKPOINTS } from './game/constants.js';

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
const timerValEl = document.getElementById('timer-value');
const timerContainer = document.getElementById('timer');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const navArrow = document.getElementById('nav-arrow');
const navDistEl = document.getElementById('nav-dist');
const surfaceChip = document.getElementById('surface-chip');
const toastEl = document.getElementById('toast');
const steerKnob = document.getElementById('steer-knob');

const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');
const btnBrake = document.getElementById('btn-brake');
const btnBell = document.getElementById('btn-bell');

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
    shadowBias: 0.15,
    normalOffsetBias: 0.08
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
const beacon = createCheckpointBeacon(app);
app.root.addChild(beacon.root);

// Pre-rendered minimap background
const minimapBase = map.renderMinimapBase(minimapCanvas.width);

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
    bellButton: btnBell,
    onBell: () => {
        audio.bell();
        const reacted = npcs.onBell(player.x, player.z);
        if (reacted) {
            showToast('🔔 "Commot for road!"', 'normal', 1200);
        }
    }
});

// Checkpoint setup
function updateBeaconPosition() {
    const cp = map.checkpoints[currentCPIndex];
    beacon.root.setPosition(cp.x, 0, cp.z);
    cpCountEl.textContent = `${currentCPIndex + 1}/${CHECKPOINTS.length}`;
    cpNameEl.textContent = cp.name;
}

function startCountdown() {
    gameState = STATE.COUNTDOWN;
    countdownTimer = 3;
    timeLeft = GAME.TIME_LIMIT;
    currentCPIndex = 0;
    lastTickSecond = -1;

    player.reset();
    npcs.reset();
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
}

function startGame() {
    gameState = STATE.PLAYING;
    countdownScreen.classList.add('hidden');
    input.enabled = true;
    showToast('OYA GO! Beat the 90s clock!', 'good', 2000);
}

function endGame(won) {
    gameState = won ? STATE.VICTORY : STATE.GAMEOVER;
    input.enabled = false;
    audio.setRolling(0, 'road');

    if (won) {
        audio.win();
        endTitle.textContent = 'DELIVERED!';
        endTitle.classList.remove('lose');
        const mudRatio = player.stats.mudTime / (player.stats.mudTime + player.stats.roadTime || 1);
        if (mudRatio > 0.45) {
            endRank.textContent = 'Lagos Shortcut Master ⚡';
        } else if (player.stats.potholes === 0) {
            endRank.textContent = 'Smooth Sailor 👑';
        } else {
            endRank.textContent = 'Oga Express Rider 🚲';
        }
    } else {
        audio.lose();
        endTitle.textContent = "E DON CAST! 🛑";
        endTitle.classList.add('lose');
        endRank.textContent = "Time Elapsed – Don't Give Up!";
    }

    document.getElementById('stat-time').textContent = `${Math.max(0, timeLeft).toFixed(1)}s`;
    document.getElementById('stat-cps').textContent = `${won ? CHECKPOINTS.length : currentCPIndex}/${CHECKPOINTS.length}`;
    const totalTime = player.stats.mudTime + player.stats.roadTime || 1;
    const mudPct = Math.round((player.stats.mudTime / totalTime) * 100);
    document.getElementById('stat-mud').textContent = `${mudPct}%`;
    document.getElementById('stat-potholes').textContent = player.stats.potholes;
    document.getElementById('stat-npcs').textContent = player.stats.npcHits;

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

// --- Dynamic Camera Position Helpers ---
const camPos = new Vec3();
const camTarget = new Vec3();
let currentCamPos = new Vec3();
let currentCamLook = new Vec3();

// Camera initial position at player start
currentCamPos.set(player.x, 2.8, player.z + 5.5);
currentCamLook.set(player.x, 1.2, player.z);

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
    } else if (gameState === STATE.PLAYING) {
        timeLeft -= dt;

        // Checkpoint proximity check
        const activeCP = map.checkpoints[currentCPIndex];
        const distToCP = Math.hypot(player.x - activeCP.x, player.z - activeCP.z);

        if (distToCP < GAME.CHECKPOINT_RADIUS) {
            audio.checkpoint();
            timeLeft += GAME.CHECKPOINT_BONUS;
            timerContainer.classList.remove('bonus');
            void timerContainer.offsetWidth;
            timerContainer.classList.add('bonus');

            showToast(`⭐ ${activeCP.name}! +${GAME.CHECKPOINT_BONUS}s`, 'good', 1600);
            currentCPIndex++;

            if (currentCPIndex >= CHECKPOINTS.length) {
                endGame(true);
            } else {
                updateBeaconPosition();
            }
        }

        // Timer expiration
        if (timeLeft <= 0) {
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

    // 2. Player and NPCs Simulation
    const isRiding = gameState === STATE.PLAYING;
    const playerEvents = player.update(dt, input, isRiding);
    if (playerEvents.pothole) {
        showToast('⚠️ Wahala! Pothole!', 'bad', 1400);
    }

    const npcToast = npcs.update(dt, player, isRiding);
    if (npcToast) {
        timeLeft = Math.max(0, timeLeft - GAME.NPC_HIT_PENALTY);
        showToast(`💥 ${npcToast} -${GAME.NPC_HIT_PENALTY}s`, 'bad', 1600);
    }

    // Audio rolling sound modulation
    if (isRiding && player.speed > 0.2) {
        const speedRatio = player.speed / player.maxSpeed;
        audio.setRolling(speedRatio, player.surface);
    } else {
        audio.setRolling(0, 'road');
    }

    // 3. Dynamic Third-Person Camera with Collision Avoidance
    const forwardX = player.forwardX;
    const forwardZ = player.forwardZ;

    // Desired camera position behind the rider
    const followDist = 4.2 + (player.speed / player.maxSpeed) * 0.8;
    const camHeight = 2.1 + (player.speed / player.maxSpeed) * 0.2;
    const desiredX = player.x - forwardX * followDist;
    const desiredZ = player.z - forwardZ * followDist;
    let desiredY = camHeight;

    // Camera collision check: if camera is inside a wall/fence, raise it or pull closer
    if (map.blocksCamera(desiredX, desiredY, desiredZ)) {
        desiredY += 1.8;
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

    // Look slightly ahead of the bicycle
    const lookDistAhead = 2.0;
    const targetLookX = player.x + forwardX * lookDistAhead;
    const targetLookY = 1.35;
    const targetLookZ = player.z + forwardZ * lookDistAhead;

    currentCamLook.x = math.lerp(currentCamLook.x, targetLookX, 1 - Math.exp(-12 * dt));
    currentCamLook.y = math.lerp(currentCamLook.y, targetLookY, 1 - Math.exp(-12 * dt));
    currentCamLook.z = math.lerp(currentCamLook.z, targetLookZ, 1 - Math.exp(-12 * dt));

    cameraEntity.setPosition(currentCamPos);
    cameraEntity.lookAt(currentCamLook);

    // 4. Animate Checkpoint Beacon
    const now = performance.now() * 0.001;
    beacon.ring.rotate(0, 75 * dt, 0);
    beacon.arrow.rotate(0, 90 * dt, 0);
    const arrowBob = Math.sin(now * 3.5) * 0.35;
    beacon.arrow.setLocalPosition(0, 4.2 + arrowBob, 0);

    // 5. Update HUD Displays
    if (gameState === STATE.PLAYING || gameState === STATE.COUNTDOWN) {
        // Timer display
        timerValEl.textContent = Math.max(0, timeLeft).toFixed(1);
        if (timeLeft <= 15) {
            timerContainer.className = 'glass timer danger';
        } else if (timeLeft <= 30) {
            timerContainer.className = 'glass timer warn';
        } else {
            timerContainer.className = 'glass timer';
        }

        // Surface indicator chip
        if (player.surface === 'mud') {
            surfaceChip.className = 'chip mud';
            surfaceChip.textContent = 'MUD SHORTCUT';
        } else {
            surfaceChip.className = 'chip road';
            surfaceChip.textContent = 'TARMAC ROAD';
        }

        // Steer Knob indicator
        const steerPercent = (input.steer * 0.5 + 0.5) * 100;
        steerKnob.style.left = `${steerPercent}%`;

        // Compass / Direction Arrow & Distance to Checkpoint
        const activeCP = map.checkpoints[currentCPIndex];
        const dx = activeCP.x - player.x;
        const dz = activeCP.z - player.z;
        const dist = Math.hypot(dx, dz);
        navDistEl.textContent = `${Math.round(dist)}m`;

        // Angle from player forward vector to target
        const targetAngle = Math.atan2(dx, -dz);
        const playerYaw = player.yaw;
        const relativeAngle = targetAngle - playerYaw;
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
        minimapCtx.arc(mx, my, idx === currentCPIndex ? 7 : 4, 0, Math.PI * 2);
        minimapCtx.fillStyle = idx === currentCPIndex ? '#f6ce34' : '#888';
        minimapCtx.fill();
        minimapCtx.lineWidth = 1.5;
        minimapCtx.strokeStyle = '#1b1206';
        minimapCtx.stroke();
    });

    // 3. Draw Player Position & Heading
    const { mx: px, my: py } = map.toMinimap(player.x, player.z, size);
    minimapCtx.save();
    minimapCtx.translate(px, py);
    minimapCtx.rotate(player.yaw);

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
