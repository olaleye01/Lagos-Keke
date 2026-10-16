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

import { HoodMap } from './game/map.js';
import { Player } from './game/player.js';
import { NPCManager } from './game/npcs.js';
import { VehicleManager } from './game/vehicles.js';
import { Input } from './game/input.js';
import { AudioFX } from './game/audio.js';
import { createCheckpointBeacon } from './graphics/models.js';
import { RacingLine } from './game/racingLine.js';
import { GAME, CHECKPOINTS, BIKE } from './game/constants.js';
import { snapLens } from './game/snapLens.js';

// --- DOM References ---
const canvas = document.getElementById('game-canvas');
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingStatus = document.getElementById('loading-status');
const loadingPct = document.getElementById('loading-pct');
const hud = document.getElementById('hud');
const titleScreen = document.getElementById('title-screen');
const countdownScreen = document.getElementById('countdown');
const countdownVal = document.getElementById('countdown-value');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endRank = document.getElementById('end-rank');

// Snapchat Leaderboard & Bitmoji Elements
const btnWelcomeLeaderboard = document.getElementById('btn-welcome-leaderboard');
const btnEndLeaderboard = document.getElementById('btn-end-leaderboard');
const welcomeRiderAvatar = document.getElementById('welcome-rider-avatar');
const welcomeRiderFallback = document.getElementById('welcome-rider-fallback');
const welcomeBestScore = document.getElementById('welcome-best-score');
const welcomeRiderStatus = document.getElementById('welcome-rider-status');
const endBitmojiWrap = document.getElementById('end-bitmoji-wrap');
const endBitmojiImg = document.getElementById('end-bitmoji-img');
const endRiderFallback = document.getElementById('end-rider-fallback');
const statScoreEl = document.getElementById('stat-score');
const statBestScoreEl = document.getElementById('stat-best-score');

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
const toastLeftEl = document.getElementById('toast-left');
const toastRightEl = document.getElementById('toast-right');
const toastEl = toastLeftEl;
const steerKnob = document.getElementById('steer-knob');

const staminaBarEl = document.getElementById('stamina-bar');
const staminaValEl = document.getElementById('stamina-val');
const speedLinesCanvas = document.getElementById('speed-lines');
const speedLinesCtx = speedLinesCanvas ? speedLinesCanvas.getContext('2d') : null;
const dashFx = document.getElementById('dash-fx');
const respawnFx = document.getElementById('respawn-fx');

function triggerRespawnScreenFlicker() {
    if (!respawnFx) return;
    respawnFx.classList.remove('flickering');
    void respawnFx.offsetWidth;
    respawnFx.classList.add('flickering');
}

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

// Warm Hood sunlight
const sun = new Entity('Sun');
sun.addComponent('light', {
    type: 'directional',
    color: new Color(1.0, 0.94, 0.82),
    intensity: 1.45,
    castShadows: true,
    shadowDistance: 60,
    shadowResolution: 2048,
    shadowBias: 0.12,
    normalOffsetBias: 0.05
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
    clearColor: new Color(0.96, 0.78, 0.62), // Hood golden haze / warm sky
    fov: 52,
    nearClip: 0.2,
    farClip: 280,
    toneMapping: TONEMAP_ACES
});
app.root.addChild(cameraEntity);

// --- Game Subsystems ---
const audio = new AudioFX();
const map = new HoodMap(app);
const player = new Player(app, map, audio);
const npcs = new NPCManager(app, map, audio);
const vehicles = new VehicleManager(app, map, audio);
const beacon = createCheckpointBeacon(app);
app.root.addChild(beacon.root);
const racingLine = new RacingLine(app, map);

// Expose runtime debug handle
window.gameDebug = { app, map, player, camera: cameraEntity };

// --- Lighting Mood State & Presets (Afternoon & Night) ---
const MOOD_PRESETS = {
    afternoon: {
        ambient: new Color(0.38, 0.34, 0.30),
        sunColor: new Color(1.0, 0.94, 0.82),
        sunIntensity: 1.45,
        sunAngles: new Vec3(48, 135, 0),
        fillColor: new Color(0.4, 0.5, 0.65),
        fillIntensity: 0.45,
        skyColor: new Color(0.96, 0.78, 0.62)
    },
    night: {
        ambient: new Color(0.11, 0.13, 0.20),
        sunColor: new Color(0.32, 0.42, 0.62), // cool moonlight
        sunIntensity: 0.22,
        sunAngles: new Vec3(62, 150, 0),
        fillColor: new Color(0.14, 0.20, 0.35),
        fillIntensity: 0.10,
        skyColor: new Color(0.04, 0.06, 0.12) // deep midnight Lagos sky
    }
};

let currentMood = 'afternoon';
const curLighting = {
    ambient: new Color(0.38, 0.34, 0.30),
    sunColor: new Color(1.0, 0.94, 0.82),
    sunIntensity: 1.45,
    fillColor: new Color(0.4, 0.5, 0.65),
    fillIntensity: 0.45,
    skyColor: new Color(0.96, 0.78, 0.62)
};

function updateMoodUI(mood) {
    const isNight = mood === 'night';
    const btn = document.getElementById('btn-mood-toggle');
    const dayOpt = document.getElementById('mood-opt-day');
    const nightOpt = document.getElementById('mood-opt-night');

    if (btn) {
        btn.classList.toggle('night-active', isNight);
        btn.setAttribute('aria-checked', isNight ? 'true' : 'false');
    }
    if (dayOpt) dayOpt.classList.toggle('active', !isNight);
    if (nightOpt) nightOpt.classList.toggle('active', isNight);
    document.body.classList.toggle('night-mode', isNight);
}

function setMood(mood, immediate = false) {
    currentMood = (mood === 'night') ? 'night' : 'afternoon';
    const isNight = currentMood === 'night';
    const target = MOOD_PRESETS[currentMood];

    if (immediate && target) {
        curLighting.ambient.copy(target.ambient);
        curLighting.sunColor.copy(target.sunColor);
        curLighting.sunIntensity = target.sunIntensity;
        curLighting.fillColor.copy(target.fillColor);
        curLighting.fillIntensity = target.fillIntensity;
        curLighting.skyColor.copy(target.skyColor);

        app.scene.ambientLight.copy(target.ambient);
        sun.light.color.copy(target.sunColor);
        sun.light.intensity = target.sunIntensity;
        sun.setEulerAngles(target.sunAngles.x, target.sunAngles.y, target.sunAngles.z);
        fillLight.light.color.copy(target.fillColor);
        fillLight.light.intensity = target.fillIntensity;
        cameraEntity.camera.clearColor.copy(target.skyColor);
    } else if (target) {
        sun.setEulerAngles(target.sunAngles.x, target.sunAngles.y, target.sunAngles.z);
    }

    if (map && map.setMood) map.setMood(currentMood);
    if (vehicles && vehicles.setMood) vehicles.setMood(currentMood);
    if (player && player.setMood) player.setMood(currentMood);

    updateMoodUI(currentMood);

    try {
        localStorage.setItem('lagos_keke_mood', currentMood);
    } catch (_) {}
}

window.gameMood = { get: () => currentMood, set: setMood };
window.gameDebug.setMood = setMood;

const btnMoodToggle = document.getElementById('btn-mood-toggle');
if (btnMoodToggle) {
    btnMoodToggle.addEventListener('click', () => {
        if (audio && audio.unlock) audio.unlock();
        const nextMood = currentMood === 'afternoon' ? 'night' : 'afternoon';
        setMood(nextMood);
        if (audio && audio.countdown) audio.countdown(false);
    });
}

// Initial mood setup from query param or localStorage
const urlMoodParam = new URLSearchParams(window.location.search).get('mood');
const initialMood = (urlMoodParam === 'night' || urlMoodParam === 'noon' || urlMoodParam === 'afternoon')
    ? (urlMoodParam === 'night' ? 'night' : 'afternoon')
    : (localStorage.getItem('lagos_keke_mood') || 'afternoon');
setMood(initialMood, true);

// Pre-rendered minimap background
const minimapBase = map.renderMinimapBase(minimapCanvas.width);

// Speed lines helper
const STREAK_COUNT = 54;
const streaks = Array.from({ length: STREAK_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 0.12 + Math.random() * 0.88,
    speed: 1.1 + Math.random() * 1.8,
    length: 35 + Math.random() * 80
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

    speedLinesCtx.lineWidth = isSprinting ? 2.8 : 1.6;
    speedLinesCtx.strokeStyle = isSprinting ? 'rgba(255, 230, 80, 0.75)' : `rgba(255, 255, 255, ${(0.38 * intensity).toFixed(2)})`;
    speedLinesCtx.beginPath();
    for (const s of streaks) {
        s.radius += s.speed * dt * (isSprinting ? 2.6 : 1.3);
        if (s.radius > 1.25) {
            s.radius = 0.08 + Math.random() * 0.22;
            s.angle = Math.random() * Math.PI * 2;
        }
        const r1 = s.radius * maxR;
        const r2 = r1 + s.length * (isSprinting ? 1.8 : 1.0);
        const x1 = cx + Math.cos(s.angle) * r1;
        const y1 = cy + Math.sin(s.angle) * r1;
        const x2 = cx + Math.cos(s.angle) * r2;
        const y2 = cy + Math.sin(s.angle) * r2;

        speedLinesCtx.moveTo(x1, y1);
        speedLinesCtx.lineTo(x2, y2);
    }
    speedLinesCtx.stroke();
}

// --- Game State Variables ---
const STATE = {
    TITLE: 'TITLE',
    COUNTDOWN: 'COUNTDOWN',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
    VICTORY: 'VICTORY'
};

let gameState = STATE.TITLE;
let previousStateBeforePause = null;
let timeLeft = GAME.TIME_LIMIT;
let sessionElapsed = 0;
let currentCPIndex = 0;
let countdownTimer = 3;
let toastTimeout = null;
let lastTickSecond = -1;

const toastActive = {
    left: false,
    right: false
};
let toastLastSide = 'right'; // Starts with 'left' when neither is active
const toastTimeouts = {
    left: null,
    right: null
};

function pickToastSide() {
    // If left is active and right is free: alternate to right
    if (toastActive.left && !toastActive.right) {
        return 'right';
    }
    // If right is active and left is free: alternate to left
    if (toastActive.right && !toastActive.left) {
        return 'left';
    }
    // If both are active: alternate away from last triggered side
    if (toastActive.left && toastActive.right) {
        return toastLastSide === 'left' ? 'right' : 'left';
    }
    // Default to left when idle
    return 'left';
}

function showToast(text, type = 'normal', duration = 2500) {
    const side = pickToastSide();
    const targetEl = side === 'right' ? toastRightEl : toastLeftEl;
    if (!targetEl) return;

    if (toastTimeouts[side]) {
        clearTimeout(toastTimeouts[side]);
        toastTimeouts[side] = null;
    }

    const toastIcon = targetEl.querySelector('.toast-icon-wrap');
    const toastMsg = targetEl.querySelector('.toast-msg');
    const toastDelta = targetEl.querySelector('.toast-delta');

    // Parse countdown/time bonus or penalty (e.g. "+8s", "-2s", "-5s")
    const deltaMatch = text.match(/\s*([+-]\d+s)\s*$/i);
    let mainText = text;
    let deltaText = '';

    if (deltaMatch) {
        deltaText = deltaMatch[1];
        mainText = text.replace(deltaMatch[0], '').trim();
    }

    if (toastMsg) {
        toastMsg.textContent = mainText;
    }

    if (toastDelta) {
        if (deltaText) {
            toastDelta.textContent = deltaText;
            toastDelta.classList.remove('hidden');
        } else {
            toastDelta.textContent = '';
            toastDelta.classList.add('hidden');
        }
    }

    // Contextual SVG icons
    if (toastIcon) {
        if (type === 'good') {
            toastIcon.innerHTML = `<svg viewBox="0 0 20 20" fill="none" class="toast-ico" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#166534" stroke="#fde047" stroke-width="1.5"/><path d="M6 10.2L8.6 12.8L14 7.2" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        } else if (type === 'bad') {
            toastIcon.innerHTML = `<svg viewBox="0 0 20 20" fill="none" class="toast-ico" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#991b1b" stroke="#fde047" stroke-width="1.5"/><path d="M10 5.8V11.2M10 13.8V14.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>`;
        } else {
            toastIcon.innerHTML = `<svg viewBox="0 0 20 20" fill="none" class="toast-ico" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#92400e" stroke="#fde047" stroke-width="1.5"/><polygon points="10,4.8 11.6,8.2 15.2,8.6 12.5,11.0 13.3,14.6 10,12.7 6.7,14.6 7.5,11.0 4.8,8.6 8.4,8.2" fill="#fde047"/></svg>`;
        }
    }

    // Re-trigger animation cleanly if already showing on this side
    if (targetEl.classList.contains('show')) {
        targetEl.classList.remove('show');
        void targetEl.offsetWidth;
    }

    const effectiveDuration = Math.max(duration || 2500, 2400);
    targetEl.style.animationDuration = effectiveDuration + 'ms';
    targetEl.className = `toast toast-${side} show ${type === 'bad' ? 'bad' : type === 'good' ? 'good' : ''}`;

    toastActive[side] = true;
    toastLastSide = side;

    toastTimeouts[side] = setTimeout(() => {
        targetEl.className = `toast toast-${side}`;
        targetEl.style.animationDuration = '';
        toastActive[side] = false;
        toastTimeouts[side] = null;
    }, effectiveDuration);
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
let cameraObstructionY = 0;

// TOP_CAM: High overhead panoramic bird's-eye view showing a wide portion of the Hood map from above
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

    // Trigger visual screen flicker overlay and arcade respawn chime
    if (audio && audio.respawn) audio.respawn();
    triggerRespawnScreenFlicker();
}

function startCountdown() {
    gameState = STATE.COUNTDOWN;
    previousStateBeforePause = null;
    countdownTimer = 3;
    timeLeft = GAME.TIME_LIMIT;
    sessionElapsed = 0;
    currentCPIndex = 0;
    lastTickSecond = -1;

    // Reset player, NPCs, vehicles, and racing line on every race start to guarantee zero early collisions
    player.reset();
    npcs.reset();
    vehicles.reset();
    racingLine.reset();
    updateBeaconPosition();

    if (dashFx) dashFx.classList.remove('active');
    if (btnSprint) btnSprint.classList.remove('dashing');
    if (respawnFx) respawnFx.classList.remove('flickering');

    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.add('hidden');
    document.querySelectorAll('.pause-icon').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.play-icon').forEach(el => el.classList.add('hidden'));

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

    const rampParam = new URLSearchParams(window.location.search).get('ramp');
    if (rampParam === '1') {
        player.x = -30.0;
        player.z = 8.0;
        player.yaw = 0; // facing North towards z=0 (Ramp 1)
        currentCamPos.set(-30.0, 6.5, 8.0 + 6.0);
        currentCamLook.set(-30.0, 0.5, 8.0 - 3.0);
    } else if (rampParam === '2') {
        player.x = -22.0;
        player.z = -24.0;
        player.yaw = -Math.PI / 2; // facing East towards x=-14 (Ramp 2)
        currentCamPos.set(-28.0, 6.5, -24.0);
        currentCamLook.set(-19.0, 0.5, -24.0);
    } else if (rampParam === '3') {
        player.x = 30.0;
        player.z = 8.0;
        player.yaw = 0; // facing North towards z=0 (Ramp 3)
        currentCamPos.set(30.0, 6.5, 8.0 + 6.0);
        currentCamLook.set(30.0, 0.5, 8.0 - 3.0);
    } else if (rampParam === '4') {
        player.x = 6.0;
        player.z = 24.0;
        player.yaw = -Math.PI / 2; // facing East towards x=14 (Ramp 4)
        currentCamPos.set(0.0, 6.5, 24.0);
        currentCamLook.set(9.0, 0.5, 24.0);
    }

    if (rampParam || new URLSearchParams(window.location.search).get('gutter') === '1') {
        player._sync(0);
    }

    cameraEntity.setPosition(currentCamPos);
    cameraEntity.lookAt(currentCamLook);
}

function startGame() {
    gameState = STATE.PLAYING;
    countdownScreen.classList.add('hidden');
    input.enabled = true;
    player.invulnerable = 2.0; // 2.0s protection against early collisions at race start
    showToast('OYA GO! Beat the clock!', 'good', 2600);
}

function endGame(won) {
    gameState = won ? STATE.VICTORY : STATE.GAMEOVER;
    previousStateBeforePause = null;
    input.enabled = false;
    audio.setRolling(0, 'road');
    racingLine.reset();
    if (dashFx) dashFx.classList.remove('active');
    if (btnSprint) btnSprint.classList.remove('dashing');
    if (respawnFx) respawnFx.classList.remove('flickering');

    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.add('hidden');
    document.querySelectorAll('.pause-icon').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.play-icon').forEach(el => el.classList.add('hidden'));

    const potholes = player.stats.potholes || 0;
    const vehicleHits = player.stats.vehicleHits || 0;
    const npcHits = player.stats.npcHits || 0;
    const gutterFalls = player.stats.gutterFalls || 0;

    const endRankDesc = document.getElementById('end-rank-desc');

    let starCount = 1;

    if (won) {
        audio.win();
        endTitle.textContent = 'ALL CHECKPOINTS CLEARED!';
        endTitle.classList.remove('lose');

        // Star Ratings & Hierarchical Mastery Tiers
        if (gutterFalls === 0 && vehicleHits === 0 && npcHits === 0 && potholes <= 1) {
            starCount = 5;
            endRank.textContent = 'Agba Rider';
            if (endRankDesc) endRankDesc.textContent = 'Flawless run! Zero crashes, zero gutter falls, pure street mastery.';
        } else if (gutterFalls === 0 && vehicleHits === 0 && (npcHits + potholes) <= 3) {
            starCount = 4;
            endRank.textContent = 'Boss Rider';
            if (endRankDesc) endRankDesc.textContent = 'Street Boss! Kept clear of Danfos and stayed out of the gutter.';
        } else if (gutterFalls <= 1 && vehicleHits <= 2) {
            starCount = 3;
            endRank.textContent = 'Pro Rider';
            if (endRankDesc) endRankDesc.textContent = 'Street Veteran! Took a few Lagos knocks, but powered through.';
        } else {
            starCount = 2;
            endRank.textContent = 'Rough Rider';
            if (endRankDesc) endRankDesc.textContent = 'Rough & Tough! Battered and gutter-soaked, but made it across!';
        }
    } else {
        audio.lose();
        starCount = 1;
        endTitle.textContent = 'TRY AGAIN!';
        endTitle.classList.add('lose');
        endRank.textContent = `Reached ${currentCPIndex}/${CHECKPOINTS.length} Checkpoints`;
        if (endRankDesc) endRankDesc.textContent = "Time ran out before clearing the streets. Don't give up!";
    }

    // Update 5-Star UI
    const starWraps = document.querySelectorAll('.end-star-wrap');
    starWraps.forEach((starWrap, i) => {
        const isFilled = i < starCount;
        starWrap.classList.toggle('filled', isFilled);
        starWrap.classList.toggle('empty', !isFilled);
    });

    const endStarsEl = document.getElementById('end-stars');
    if (endStarsEl) {
        endStarsEl.setAttribute('aria-label', `Rating: ${starCount} of 5 Stars`);
    }

    const statCpsEl = document.getElementById('stat-cps');
    if (statCpsEl) statCpsEl.textContent = `${won ? CHECKPOINTS.length : currentCPIndex}/${CHECKPOINTS.length}`;

    const statGuttersEl = document.getElementById('stat-gutters');
    if (statGuttersEl) statGuttersEl.textContent = gutterFalls;

    const statVehiclesEl = document.getElementById('stat-vehicles');
    if (statVehiclesEl) statVehiclesEl.textContent = vehicleHits;

    const statNpcsEl = document.getElementById('stat-npcs');
    if (statNpcsEl) statNpcsEl.textContent = npcHits;

    const statPotholesEl = document.getElementById('stat-potholes');
    if (statPotholesEl) statPotholesEl.textContent = potholes;

    // Calculate Arcade Score (Option B: checkpoints + speed bonus + star rating - hazard penalties)
    const currentScore = snapLens.calculateArcadeScore({
        won,
        checkpointsReached: won ? CHECKPOINTS.length : currentCPIndex,
        timeLeft,
        starCount,
        stats: player.stats
    });

    const prevBest = snapLens.saveData.bestScore || 0;
    const newBest = Math.max(prevBest, currentScore);

    if (statScoreEl) statScoreEl.textContent = currentScore.toLocaleString();
    if (statBestScoreEl) statBestScoreEl.textContent = newBest.toLocaleString();

    // Submit to native Snapchat Leaderboard
    if (snapLens.leaderboardsSupported) {
        snapLens.submitScore(currentScore).then(serverBest => {
            if (serverBest !== null && statBestScoreEl) {
                statBestScoreEl.textContent = serverBest.toLocaleString();
            }
        });
    }

    // Persist best score & stats to Snapchat Account Storage
    snapLens.queueSave({
        bestScore: newBest,
        bestStars: Math.max(snapLens.saveData.bestStars || 0, starCount),
        runsPlayed: (snapLens.saveData.runsPlayed || 0) + 1
    });

    if (welcomeBestScore) {
        welcomeBestScore.textContent = `${newBest.toLocaleString()} PTS`;
    }

    endScreen.classList.remove('hidden');
}

if (typeof window !== 'undefined') {
    window.__endGame = endGame;
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#end-screen') {
            endGame(true);
        }
    });
}

// Button Events
btnStart.addEventListener('click', () => {
    audio.unlock();
    startCountdown();
});

btnRetry.addEventListener('click', () => {
    audio.unlock();
    startCountdown();
});

if (btnWelcomeLeaderboard) {
    btnWelcomeLeaderboard.addEventListener('click', () => {
        audio.unlock();
        snapLens.showLeaderboard();
    });
}

if (btnEndLeaderboard) {
    btnEndLeaderboard.addEventListener('click', () => {
        audio.unlock();
        snapLens.showLeaderboard();
    });
}

// --- Unified Sound Controls ---
function toggleSound() {
    audio.unlock();
    audio.muted = !audio.muted;
    if (audio.master) {
        audio.master.gain.value = audio.muted ? 0 : 0.7;
    }
    updateSoundIcons();
}

function updateSoundIcons() {
    const isMuted = audio.muted;
    document.querySelectorAll('.sound-icon-on').forEach(el => el.classList.toggle('hidden', isMuted));
    document.querySelectorAll('.sound-icon-off').forEach(el => el.classList.toggle('hidden', !isMuted));
    const soundText = document.getElementById('pause-sound-text');
    if (soundText) soundText.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
}

// --- Pause Controls ---
const pauseScreen = document.getElementById('pause-screen');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnSoundHud = document.getElementById('btn-sound-hud');
const btnPauseSound = document.getElementById('btn-pause-sound');
const btnSoundToggle = document.getElementById('btn-sound-toggle');

function pauseGame() {
    if (gameState !== STATE.PLAYING && gameState !== STATE.COUNTDOWN) return;
    previousStateBeforePause = gameState;
    gameState = STATE.PAUSED;

    // Silence active tyre rolling audio while paused
    audio.setRolling(0, 'road');

    // Update pause card metrics
    const pauseCpName = document.getElementById('pause-cp-name');
    const pauseTimeVal = document.getElementById('pause-time-val');
    if (pauseCpName) {
        const cp = map.checkpoints[currentCPIndex];
        pauseCpName.textContent = `${currentCPIndex + 1}/${CHECKPOINTS.length} (${cp ? cp.name : ''})`;
    }
    if (pauseTimeVal) {
        pauseTimeVal.textContent = `${Math.max(0, timeLeft).toFixed(1)}s`;
    }

    // Toggle HUD pause button icon to play
    document.querySelectorAll('.pause-icon').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.play-icon').forEach(el => el.classList.remove('hidden'));

    if (pauseScreen) pauseScreen.classList.remove('hidden');
}

function resumeGame() {
    if (gameState !== STATE.PAUSED) return;
    gameState = previousStateBeforePause || STATE.PLAYING;
    previousStateBeforePause = null;

    // Toggle HUD pause button icon back to pause
    document.querySelectorAll('.pause-icon').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.play-icon').forEach(el => el.classList.add('hidden'));

    if (pauseScreen) pauseScreen.classList.add('hidden');
}

function togglePause() {
    if (gameState === STATE.PAUSED) {
        resumeGame();
    } else if (gameState === STATE.PLAYING || gameState === STATE.COUNTDOWN) {
        pauseGame();
    }
}

// Event Listeners for Pause and Sound
if (btnPause) btnPause.addEventListener('click', togglePause);
if (btnResume) btnResume.addEventListener('click', resumeGame);
if (btnRestart) btnRestart.addEventListener('click', () => {
    resumeGame();
    startCountdown();
});

if (btnSoundHud) btnSoundHud.addEventListener('click', toggleSound);
if (btnPauseSound) btnPauseSound.addEventListener('click', toggleSound);
if (btnSoundToggle) btnSoundToggle.addEventListener('click', toggleSound);

// Mobile Web Audio unlocker: pre-warms audio engine on first interaction
function unlockAudio() {
    audio.unlock();
}

['touchstart', 'touchend', 'click', 'pointerdown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true, once: true });
    document.addEventListener(evt, unlockAudio, { passive: true, once: true });
});

// Keyboard shortcuts: P or ESC to pause/resume, M to toggle sound
window.addEventListener('keydown', e => {
    audio.unlock();
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (gameState === STATE.PAUSED || gameState === STATE.PLAYING || gameState === STATE.COUNTDOWN) {
            e.preventDefault();
            togglePause();
        }
    } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleSound();
    }
});

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

    // Smooth Lighting Transitions for Afternoon <-> Night mood
    const targetPreset = MOOD_PRESETS[currentMood];
    if (targetPreset) {
        const tLerp = 1 - Math.exp(-6 * dt);
        curLighting.ambient.lerp(curLighting.ambient, targetPreset.ambient, tLerp);
        curLighting.sunColor.lerp(curLighting.sunColor, targetPreset.sunColor, tLerp);
        curLighting.sunIntensity = math.lerp(curLighting.sunIntensity, targetPreset.sunIntensity, tLerp);
        curLighting.fillColor.lerp(curLighting.fillColor, targetPreset.fillColor, tLerp);
        curLighting.fillIntensity = math.lerp(curLighting.fillIntensity, targetPreset.fillIntensity, tLerp);
        curLighting.skyColor.lerp(curLighting.skyColor, targetPreset.skyColor, tLerp);

        app.scene.ambientLight.copy(curLighting.ambient);
        sun.light.color.copy(curLighting.sunColor);
        sun.light.intensity = curLighting.sunIntensity;
        fillLight.light.color.copy(curLighting.fillColor);
        fillLight.light.intensity = curLighting.fillIntensity;
        cameraEntity.camera.clearColor.copy(curLighting.skyColor);
    }

    // Dynamic map elements (flickering bulbs on mud alley buildings)
    if (map && map.update) {
        map.update(dt);
    }

    if (gameState === STATE.PAUSED) {
        // Complete simulation freeze while game is paused
        return;
    }

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

            showToast(`${activeCP.name}! +${GAME.CHECKPOINT_BONUS}s`, 'good', 2600);
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
        showToast('Wahala! Pothole!', 'bad', 2400);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([60, 40, 80]); } catch (_) {}
        }
    }
    if (isRiding && playerEvents.gutter) {
        showToast('Wahala! Gutter O!', 'bad', 2600);
        // Snap camera smoothly right behind respawned player with elevated top-down view
        const followDist = NORMAL_CAM.dist;
        const camHeight = NORMAL_CAM.height;
        currentCamPos.set(player.x - player.forwardX * followDist, camHeight, player.z - player.forwardZ * followDist);
        currentCamLook.set(player.x + player.forwardX * NORMAL_CAM.lookAhead, NORMAL_CAM.lookY, player.z + player.forwardZ * NORMAL_CAM.lookAhead);
        cameraEntity.setPosition(currentCamPos);
        cameraEntity.lookAt(currentCamLook);

        if (audio && audio.respawn) audio.respawn();
        triggerRespawnScreenFlicker();
    }

    const npcToast = npcs.update(dt, player, isWorldActive, vehicles, isRiding);
    if (isRiding && npcToast) {
        timeLeft = Math.max(0, timeLeft - GAME.NPC_HIT_PENALTY);
        showToast(`${npcToast} -${GAME.NPC_HIT_PENALTY}s`, 'bad', 2500);
    }

    const vehicleToast = vehicles.update(dt, player, isWorldActive, npcs, isRiding);
    if (isRiding && vehicleToast) {
        timeLeft = Math.max(0, timeLeft - GAME.VEHICLE_HIT_PENALTY);
        showToast(`${vehicleToast} -${GAME.VEHICLE_HIT_PENALTY}s`, 'bad', 2600);
        respawnPlayerAtLastCheckpoint('vehicle');
    }

    // Audio rolling sound modulation
    if (isRiding && player.speed > 0.2) {
        const speedRatio = player.speed / player.maxSpeed;
        audio.setRolling(speedRatio, player.surface);
    } else {
        audio.setRolling(0, 'road');
    }

    // Dynamic 3D Racing Line Guide towards active checkpoint
    const activeCP = map.checkpoints[currentCPIndex];
    racingLine.update(dt, player, activeCP, isRiding);

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
        let desiredY = camHeight + (player.y || 0) * 0.55;

        // Camera collision check: smoothly elevate camera above roofs rather than snapping
        const targetObstructionY = map.blocksCamera(desiredX, desiredY, desiredZ) ? 2.2 : 0;
        cameraObstructionY = math.lerp(cameraObstructionY, targetObstructionY, 1 - Math.exp(-6 * dt));
        desiredY += cameraObstructionY;

        // Camera shake from potholes or bumps
        let shakeX = 0;
        let shakeY = 0;
        if (player.shake > 0.01) {
            const shakeMag = player.shake * 0.35;
            shakeX = (Math.random() - 0.5) * shakeMag;
            shakeY = (Math.random() - 0.5) * shakeMag;
        }

        // Tactile vibration / rumble when riding on rough muddy alleys
        if (player.surface === 'mud' && !player.jumpState && player.speed > 0.8) {
            const speedRatio = math.clamp(player.speed / BIKE.ROAD_MAX_SPEED, 0, 1.2);
            const mudRumbleMag = speedRatio * 0.055;
            const t = performance.now() * 0.06;
            shakeX += (Math.sin(t * 1.8) * 0.5 + (Math.random() - 0.5) * 0.6) * mudRumbleMag;
            shakeY += (Math.cos(t * 2.4) * 0.4 + (Math.random() - 0.5) * 0.6) * mudRumbleMag * 0.8;

            // Subtle mobile device haptic vibration (throttled)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                const now = performance.now();
                if (now - (window._lastMudHaptic || 0) > 110) {
                    window._lastMudHaptic = now;
                    try { navigator.vibrate(12); } catch (_) {}
                }
            }
        }

        // Smooth camera follow lerp
        const camLerpSpeed = 8.5;
        currentCamPos.x = math.lerp(currentCamPos.x, desiredX + shakeX, 1 - Math.exp(-camLerpSpeed * dt));
        currentCamPos.y = math.lerp(currentCamPos.y, desiredY + shakeY, 1 - Math.exp(-camLerpSpeed * dt));
        currentCamPos.z = math.lerp(currentCamPos.z, desiredZ, 1 - Math.exp(-camLerpSpeed * dt));

        // Look ahead along the road
        const lookDistAhead = NORMAL_CAM.lookAhead + speedRatio * 0.6;
        const targetLookX = player.x + forwardX * lookDistAhead;
        const targetLookY = NORMAL_CAM.lookY + (player.y || 0) * 0.45;
        const targetLookZ = player.z + forwardZ * lookDistAhead;

        currentCamLook.x = math.lerp(currentCamLook.x, targetLookX, 1 - Math.exp(-12 * dt));
        currentCamLook.y = math.lerp(currentCamLook.y, targetLookY, 1 - Math.exp(-12 * dt));
        currentCamLook.z = math.lerp(currentCamLook.z, targetLookZ, 1 - Math.exp(-12 * dt));

        cameraEntity.setPosition(currentCamPos);
        cameraEntity.lookAt(currentCamLook);

        // Dynamic Camera FOV for speed rush sensation (stops boost punch when boost < 5%)
        const minBoostPct = BIKE.MIN_BOOST_STAMINA_PCT || 5;
        const hasBoost = (player.stamina / BIKE.MAX_STAMINA) * 100 >= minBoostPct;
        const isBoostActive = (player.isSprinting && hasBoost) || player.isRampBoosting;

        const targetFov = 54 + speedRatio * (isBoostActive ? 9 : 4);
        cameraEntity.camera.fov = math.lerp(cameraEntity.camera.fov, targetFov, 1 - Math.exp(-6 * dt));
    }

    // 4. Speed lines rendering (stops boost speed lines when boost < 5%)
    const minBoostPct = BIKE.MIN_BOOST_STAMINA_PCT || 5;
    const hasBoost = (player.stamina / BIKE.MAX_STAMINA) * 100 >= minBoostPct;
    const isBoostActive = (player.isSprinting && hasBoost) || player.isRampBoosting;
    renderSpeedLines(dt, player.speed, isBoostActive);

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
            // Stop dash and boost effect once boost is less than 5%
            const isDashing = isRiding && isBoostActive;
            if (staminaContainer) {
                staminaContainer.classList.toggle('boosting', isDashing);
            }
            if (dashFx) {
                dashFx.classList.toggle('active', isDashing);
            }
            if (btnSprint) {
                btnSprint.classList.toggle('dashing', isDashing);
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

    // 2b. Draw Dynamic Racing Line Guide on Minimap
    if (gameState === STATE.PLAYING && racingLine.pathPoints && racingLine.pathPoints.length > 1) {
        minimapCtx.save();
        minimapCtx.beginPath();
        minimapCtx.setLineDash([3, 3]);
        minimapCtx.lineWidth = 1.8;
        minimapCtx.strokeStyle = 'rgba(246, 206, 52, 0.9)';
        const p0 = map.toMinimap(player.x, player.z, size);
        minimapCtx.moveTo(p0.mx, p0.my);
        for (let i = 1; i < racingLine.pathPoints.length; i++) {
            const pt = racingLine.pathPoints[i];
            const mpt = map.toMinimap(pt.x, pt.z, size);
            minimapCtx.lineTo(mpt.mx, mpt.my);
        }
        minimapCtx.stroke();
        minimapCtx.restore();
    }

    // 2c. Draw Speed Ramps on Minimap with subtle pulse glow
    if (map.ramps) {
        const pulse = 1.0 + Math.sin(performance.now() * 0.006) * 0.15;
        map.ramps.forEach(ramp => {
            const { mx, my } = map.toMinimap(ramp.x, ramp.z, size);
            minimapCtx.save();
            minimapCtx.translate(mx, my);
            minimapCtx.beginPath();
            minimapCtx.arc(0, 0, 4.2 * pulse, 0, Math.PI * 2);
            minimapCtx.fillStyle = 'rgba(34, 211, 238, 0.45)';
            minimapCtx.fill();
            minimapCtx.beginPath();
            minimapCtx.arc(0, 0, 2.2, 0, Math.PI * 2);
            minimapCtx.fillStyle = '#f59e0b';
            minimapCtx.fill();
            minimapCtx.restore();
        });
    }

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

// --- Snapchat Lens Features Bootstrap ---
async function setupLensFeatures() {
    // 1. Leaderboard Buttons Resilience
    if (snapLens.leaderboardsSupported) {
        if (btnWelcomeLeaderboard) btnWelcomeLeaderboard.classList.remove('hidden');
        if (btnEndLeaderboard) btnEndLeaderboard.classList.remove('hidden');
    }

    // 2. Personal Best Display from Persistent Storage
    const bestScore = snapLens.saveData.bestScore || 0;
    if (welcomeBestScore) {
        welcomeBestScore.textContent = `${bestScore.toLocaleString()} PTS`;
    }

    // 3. Bitmoji Avatar (2D Portrait)
    if (snapLens.bitmojiSupported) {
        const avatarUrl = await snapLens.get2DAvatar();
        if (avatarUrl) {
            if (welcomeRiderAvatar) {
                welcomeRiderAvatar.src = avatarUrl;
                welcomeRiderAvatar.classList.remove('hidden');
            }
            if (welcomeRiderFallback) {
                welcomeRiderFallback.classList.add('hidden');
            }
            if (welcomeRiderStatus) {
                welcomeRiderStatus.textContent = 'READY TO RIDE';
            }
            if (endBitmojiImg) {
                endBitmojiImg.src = avatarUrl;
                endBitmojiImg.classList.remove('hidden');
            }
            if (endRiderFallback) {
                endRiderFallback.classList.add('hidden');
            }
            if (endBitmojiWrap) {
                endBitmojiWrap.classList.remove('hidden');
            }
        } else {
            if (welcomeRiderAvatar) welcomeRiderAvatar.classList.add('hidden');
            if (welcomeRiderFallback) welcomeRiderFallback.classList.remove('hidden');
            if (endBitmojiImg) endBitmojiImg.classList.add('hidden');
            if (endRiderFallback) endRiderFallback.classList.remove('hidden');
            if (endBitmojiWrap) endBitmojiWrap.classList.remove('hidden');
        }

        // 4. Bitmoji 3D Avatar (mount to bike rider on native device)
        snapLens.load3DAvatar(app).then(res => {
            if (res && res.entity) {
                player.attachBitmoji(res.entity);
            }
        });
    }
}

// --- Preloader: "Gearing Up" Sequence ---
// Only reveals the welcome screen once fonts, map, 3D assets, and GPU shaders are fully loaded & rendered
function updateLoadingProgress(percent, statusText) {
    if (loadingBarFill) loadingBarFill.style.width = `${percent}%`;
    if (loadingPct) loadingPct.textContent = `${Math.round(percent)}%`;
    if (loadingStatus && statusText) loadingStatus.textContent = statusText;
}

async function initLoadingSequence() {
    updateLoadingProgress(10, 'Connecting Snapchat Web Lens');

    // 1. Initialize Snapchat Web Lens API (Leaderboards, Bitmoji, Storage)
    try {
        await snapLens.init();
        await setupLensFeatures();
    } catch (e) {
        console.warn('[SnapLens] setup error:', e);
    }

    updateLoadingProgress(35, 'Preparing gears');

    // 2. Wait for Google Web Fonts (Fredoka, Outfit, Sniglet) to be fully ready
    try {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
    } catch {
        // Fallback gracefully
    }
    updateLoadingProgress(55, 'Loading typography & UI');

    // 2. Yield briefly for procedural terrain, shops & props creation
    await new Promise(resolve => setTimeout(resolve, 100));
    updateLoadingProgress(75, 'Assembling Hood streets & traffic');

    // 3. Wait for WebGL GPU pipeline & PlayCanvas initial render passes
    await new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
    updateLoadingProgress(100, 'Ready to ride');

    // 4. Smooth dwell so player sees 100% completion before scene reveal
    await new Promise(resolve => setTimeout(resolve, 360));

    // 5. Unhide welcome screen and smoothly fade out loading screen
    if (titleScreen) titleScreen.classList.remove('hidden');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 460);
    }
}

// Start loading sequence immediately
initLoadingSequence();

