import {
    BLEND_ADDITIVE,
    Color,
    CULLFACE_NONE,
    ConeGeometry,
    CylinderGeometry,
    Entity,
    Mesh,
    MeshInstance,
    StandardMaterial,
    TorusGeometry
} from 'playcanvas';
import { GeoBuilder } from './builder.js';
import { PALETTE, pick } from './palette.js';

const SUPER_EAGLES_GREEN = [20, 150, 80];
const WHITE = [240, 240, 236];
const TYRE = [26, 26, 28];
const FRAME = [228, 40, 44];
const METAL = [170, 172, 178];

/**
 * Low-poly bicycle with steering front fork, rotating wheels, pedals, and kickstand.
 */
export function createBicycle(app) {
    const root = new Entity('BicycleRoot');
    const lean = new Entity('BikeLean');
    root.addChild(lean);

    const R = 0.34; // wheel radius
    const WB = 0.56; // half wheelbase

    // Bike Frame (Metal tubing, saddle, rack, parcel, mudguards)
    const b = new GeoBuilder();
    const bar = (x0, y0, z0, x1, y1, z1, t, col) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dy, dz);
        const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        b.box(GeoBuilder.trs((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, -pitch, yaw, 0, t, t, len), col, 0);
    };

    // Diamond frame
    bar(0, 0.42, 0.02, 0, 0.78, 0.22, 0.06, FRAME); // seat tube
    bar(0, 0.78, 0.22, 0, 0.82, -0.42, 0.06, FRAME); // top tube
    bar(0, 0.42, 0.02, 0, 0.8, -0.42, 0.065, FRAME); // down tube
    bar(0, 0.42, 0.02, 0, R, WB, 0.04, FRAME); // chain stay
    bar(0, 0.78, 0.22, 0, R, WB, 0.04, FRAME); // seat stay

    // Saddle, rack, parcel, headlamp, mudguards
    b.boxAt(0, 0.86, 0.26, 0.16, 0.06, 0.28, TYRE, 0, 0); // saddle
    b.boxAt(0, 0.62, WB, 0.24, 0.04, 0.4, METAL, 0, 0); // rear carrier
    b.boxAt(0, 0.66, WB + 0.02, 0.32, 0.2, 0.28, [222, 160, 40], 0, 0.1); // delivery parcel
    b.boxAt(0, 0.98, -0.52, 0.12, 0.1, 0.08, [255, 236, 150], 0, 0); // lamp
    b.boxAt(0, R + 0.38, -WB, 0.1, 0.03, 0.5, METAL, 0, 0); // front mudguard
    b.boxAt(0, R + 0.38, WB - 0.1, 0.1, 0.03, 0.4, METAL, 0, 0); // rear mudguard

    const frame = b.toEntity(app, 'Frame');
    lean.addChild(frame);

    // Fork & Handlebars (steering assembly rotates with handlebars)
    const forkRoot = new Entity('FrontFork');
    forkRoot.setLocalPosition(0, 0.95, -0.46);
    lean.addChild(forkRoot);

    const fb = new GeoBuilder();
    fb.box(GeoBuilder.trs(0, 0.06, 0.03, 0, 0, 0, 0.05, 0.14, 0.05), METAL, 0); // stem
    fb.box(GeoBuilder.trs(0, 0.13, 0.05, 0, 0, 0, 0.62, 0.04, 0.04), METAL, 0); // handlebar
    fb.boxAt(-0.33, 0.13, 0.05, 0.1, 0.07, 0.07, TYRE, 0, 0); // left grip
    fb.boxAt(0.33, 0.13, 0.05, 0.1, 0.07, 0.07, TYRE, 0, 0); // right grip
    fb.box(GeoBuilder.trs(-0.04, -(0.95 - R) / 2, -(0.46 - WB) / 2, 0, 0, 0, 0.035, 0.95 - R, 0.05), METAL, 0);
    fb.box(GeoBuilder.trs(0.04, -(0.95 - R) / 2, -(0.46 - WB) / 2, 0, 0, 0, 0.035, 0.95 - R, 0.05), METAL, 0);
    forkRoot.addChild(fb.toEntity(app, 'HandlebarsAndFork'));

    // Wheels
    const makeWheel = name => {
        const w = new GeoBuilder();
        w.cylinder(GeoBuilder.trs(0.03, 0, 0, 0, 0, 90, R, 0.06, R), 12, TYRE, 1, 0.05, [60, 60, 64]);
        for (let i = 0; i < 4; i++) {
            w.box(GeoBuilder.trs(0, 0, 0, i * 45, 0, 0, 0.075, R * 1.9, 0.025), METAL, 0);
        }
        w.boxAt(0, 0, 0, 0.1, 0.08, 0.08, METAL, 0, 0);
        return w.toEntity(app, name);
    };

    const frontWheel = makeWheel('FrontWheel');
    frontWheel.setLocalPosition(0, R, -WB);
    lean.addChild(frontWheel);

    const rearWheel = makeWheel('RearWheel');
    rearWheel.setLocalPosition(0, R, WB);
    lean.addChild(rearWheel);

    // Crank & Pedals
    const crank = new Entity('Crank');
    crank.setLocalPosition(0, 0.42, 0.02);
    lean.addChild(crank);

    const pedals = [];
    for (const side of [-1, 1]) {
        const pedal = new Entity(side < 0 ? 'PedalL' : 'PedalR');
        crank.addChild(pedal);
        pedals.push(pedal);

        const pb = new GeoBuilder();
        pb.boxAt(0, 0, 0, 0.12, 0.04, 0.1, [50, 50, 50], 0, 0);
        pedal.addChild(pb.toEntity(app, 'PedalBody'));
    }

    // Kickstand (folds up when mounted)
    const kickstand = new Entity('Kickstand');
    kickstand.setLocalPosition(-0.06, 0.38, 0.15);
    const kb = new GeoBuilder();
    kb.box(GeoBuilder.trs(0, -0.19, 0, 0, 0, 24, 0.03, 0.38, 0.03), METAL, 0);
    kickstand.addChild(kb.toEntity(app, 'KickstandLeg'));
    lean.addChild(kickstand);

    return { root, lean, forkRoot, frontWheel, rearWheel, crank, pedals, kickstand };
}

/**
 * Modular Bitmoji-Ready Rider Avatar.
 * Structured with explicit nodes for easy replacement with user's Bitmoji:
 * - headMount (attach Bitmoji head / face)
 * - torso (forward lean, aero sprint, side pump)
 * - leftArm, rightArm (reach handlebars or perform gestures)
 * - pelvis, leftLeg, rightLeg (mount hop, pedalling)
 */
export function createRiderAvatar(app) {
    const avatarRoot = new Entity('RiderAvatar');
    const skin = PALETTE.skin[0];

    // Pelvis / Hips
    const pelvis = new Entity('Pelvis');
    pelvis.setLocalPosition(0, 1.05, 0.2);
    avatarRoot.addChild(pelvis);

    const hb = new GeoBuilder();
    hb.boxAt(0, 0, 0, 0.3, 0.18, 0.22, [30, 40, 80], 0, 0); // shorts
    pelvis.addChild(hb.toEntity(app, 'Hips'));

    // Torso / Chest (can lean forward, pump, aero tuck)
    const torso = new Entity('Torso');
    torso.setLocalPosition(0, 0.14, -0.04);
    pelvis.addChild(torso);

    const tb = new GeoBuilder();
    tb.box(GeoBuilder.trs(0, 0.16, 0, 0, 0, 0, 0.36, 0.44, 0.22), SUPER_EAGLES_GREEN, 0); // jersey
    tb.boxAt(0, 0.2, 0.01, 0.37, 0.08, 0.23, WHITE, 0, 0); // white stripe
    tb.boxAt(0, 0.39, -0.01, 0.11, 0.08, 0.11, skin, 0, 0); // neck
    torso.addChild(tb.toEntity(app, 'Jersey'));

    // HEAD MOUNT (Dedicated slot for Snapchat Bitmoji 3D Head / Avatar)
    const headMount = new Entity('BitmojiHeadMount');
    headMount.setLocalPosition(0, 0.44, -0.01);
    torso.addChild(headMount);

    // Default Stylized Placeholder Head & Cap (can be swapped in 1 line with Bitmoji)
    const headPlaceholder = new Entity('DefaultHeadPlaceholder');
    const headB = new GeoBuilder();
    headB.boxAt(0, 0.12, 0, 0.26, 0.28, 0.26, skin, 0, 0.04); // head
    headB.boxAt(0, 0.27, 0, 0.28, 0.08, 0.28, [222, 50, 44], 0, 0); // red cap
    headB.boxAt(0, 0.25, -0.19, 0.24, 0.03, 0.15, [222, 50, 44], 0, 0); // cap peak
    headB.boxAt(-0.07, 0.13, -0.135, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0); // eye L
    headB.boxAt(0.07, 0.13, -0.135, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0); // eye R
    headPlaceholder.addChild(headB.toEntity(app, 'HeadMesh'));
    headMount.addChild(headPlaceholder);

    // Arms
    const arms = [];
    for (const sx of [-1, 1]) {
        const armRoot = new Entity(sx < 0 ? 'LeftArm' : 'RightArm');
        armRoot.setLocalPosition(sx * 0.2, 0.34, -0.02);
        torso.addChild(armRoot);

        const ab = new GeoBuilder();
        ab.box(GeoBuilder.trs(0, -0.16, -0.14, 40, 0, 0, 0.1, 0.1, 0.42), skin, 0);
        ab.boxAt(0, 0, 0, 0.13, 0.13, 0.14, SUPER_EAGLES_GREEN, 0, 0); // sleeve
        ab.boxAt(0, -0.3, -0.28, 0.09, 0.08, 0.09, skin, 0, 0); // hand
        armRoot.addChild(ab.toEntity(app, 'ArmMesh'));
        arms.push(armRoot);
    }

    // Legs
    const legs = [];
    for (const side of [-1, 1]) {
        const legRoot = new Entity(side < 0 ? 'LegL' : 'LegR');
        legRoot.setLocalPosition(side * 0.11, -0.06, 0);
        pelvis.addChild(legRoot);

        const lb = new GeoBuilder();
        // Unit length along local -Z (0 to -1) so lookAt and scale.z stretch it perfectly to pedals
        lb.box(GeoBuilder.trs(0, 0, -0.5, 0, 0, 0, 0.12, 0.12, 1), skin, 0);
        lb.box(GeoBuilder.trs(0, 0, -0.12, 0, 0, 0, 0.15, 0.15, 0.24), [30, 40, 80], 0);
        lb.box(GeoBuilder.trs(0, 0, -0.93, 0, 0, 0, 0.13, 0.13, 0.1), [245, 245, 245], 0); // sock
        lb.box(GeoBuilder.trs(0, -0.04, -0.96, 0, 0, 0, 0.13, 0.08, 0.22), [240, 240, 240], 0); // shoe
        legRoot.addChild(lb.toEntity(app, 'LegMesh'));

        legs.push({ entity: legRoot, side });
    }

    return {
        avatarRoot,
        pelvis,
        torso,
        headMount,
        headPlaceholder,
        armL: arms[0],
        armR: arms[1],
        legs
    };
}

/**
 * Composite helper combining the Bicycle and Rider Avatar.
 */
export function createBicycleKid(app) {
    const bike = createBicycle(app);
    const avatar = createRiderAvatar(app);
    bike.lean.addChild(avatar.avatarRoot);

    return {
        root: bike.root,
        lean: bike.lean,
        bike,
        avatar,
        frontFork: bike.forkRoot,
        frontWheel: bike.frontWheel,
        rearWheel: bike.rearWheel,
        crank: bike.crank,
        pedals: bike.pedals,
        kickstand: bike.kickstand,
        legs: avatar.legs
    };
}

/**
 * Lagos pedestrian with a few random outfits (gele headwrap, hawker tray, cap).
 * Origin on the ground, facing -Z. Legs swing from the hip.
 */
export function createPedestrian(app, rand) {
    const root = new Entity('Pedestrian');
    const skin = pick(rand, PALETTE.skin);
    const top = pick(rand, PALETTE.cloth);
    const bottom = pick(rand, PALETTE.cloth);
    const variant = rand();

    const b = new GeoBuilder(rand);
    const long = variant < 0.4; // wrapper / long dress
    if (long) {
        b.cylinder(GeoBuilder.trs(0, 0.25, 0, 0, 0, 0, 0.26, 0.75, 0.22), 6, bottom, 0.85, 0.08);
    } else {
        b.boxAt(0, 0.9, 0, 0.36, 0.22, 0.22, bottom, 0, 0.04);
    }
    b.boxAt(0, 1.22, 0, 0.42, 0.5, 0.24, top, 0, 0.06);
    b.boxAt(0, 1.22, 0.001, 0.44, 0.08, 0.25, pick(rand, PALETTE.cloth), 0, 0); // ankara band
    for (const s of [-1, 1]) {
        b.box(GeoBuilder.trs(s * 0.27, 1.18, 0, 0, 0, s * 8, 0.11, 0.5, 0.12), skin, 0.04);
        b.boxAt(s * 0.27, 1.4, 0, 0.14, 0.16, 0.15, top, 0, 0);
    }
    b.boxAt(0, 1.52, 0, 0.12, 0.08, 0.12, skin, 0, 0);
    b.boxAt(0, 1.67, 0, 0.26, 0.26, 0.26, skin, 0, 0.04);
    b.boxAt(-0.06, 1.69, -0.135, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0);
    b.boxAt(0.06, 1.69, -0.135, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0);
    if (variant < 0.3) {
        // gele headwrap
        b.box(GeoBuilder.trs(0, 1.86, 0.02, -12, 0, 0, 0.36, 0.2, 0.34), pick(rand, PALETTE.cloth), 0.06);
        b.box(GeoBuilder.trs(0, 1.96, 0.04, -20, 0, 8, 0.3, 0.12, 0.26), pick(rand, PALETTE.cloth), 0.06);
    } else if (variant < 0.6) {
        // hawker with a tray of oranges on the head
        b.cylinder(GeoBuilder.trs(0, 1.81, 0, 0, 0, 0, 0.42, 0.06, 0.42), 8, [180, 180, 186], 1, 0.04);
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = i === 0 ? 0 : 0.22;
            b.boxAt(Math.cos(a) * rr, 1.92, Math.sin(a) * rr, 0.13, 0.12, 0.13, [246, 140, 30], rand() * 90, 0.1);
        }
    } else if (variant < 0.8) {
        b.boxAt(0, 1.83, 0, 0.28, 0.08, 0.28, pick(rand, PALETTE.cloth), 0, 0);
        b.boxAt(0, 1.81, -0.18, 0.24, 0.03, 0.14, pick(rand, PALETTE.cloth), 0, 0);
    } else {
        b.boxAt(0, 1.82, 0, 0.27, 0.06, 0.27, [24, 20, 18], 0, 0); // short hair
    }
    root.addChild(b.toEntity(app, 'PedBody'));

    const legs = [];
    for (const s of [-1, 1]) {
        const lb = new GeoBuilder(rand);
        lb.boxAt(0, -0.4, 0, 0.13, 0.8, 0.14, long ? skin : bottom, 0, 0.04);
        lb.boxAt(0, -0.82, -0.04, 0.14, 0.08, 0.22, [40, 32, 28], 0, 0);
        const leg = lb.toEntity(app, 'PedLeg');
        leg.setLocalPosition(s * 0.1, 0.86, 0);
        root.addChild(leg);
        legs.push(leg);
    }
    return { root, legs };
}

/** Additive glowing beam + floating arrow marking the active stop. */
export function createCheckpointBeacon(app) {
    const root = new Entity('Checkpoint');
    const device = app.graphicsDevice;

    const glow = (color, opacity) => {
        const m = new StandardMaterial();
        m.useLighting = false;
        m.diffuse = new Color(0, 0, 0);
        m.emissive = color;
        m.opacity = opacity;
        m.blendType = BLEND_ADDITIVE;
        m.depthWrite = false;
        m.cull = CULLFACE_NONE;
        m.useFog = false;
        m.update();
        return m;
    };

    const beamMat = glow(new Color(1, 0.78, 0.15), 0.28);
    const beam = new Entity('Beam');
    beam.addComponent('render', {
        meshInstances: [new MeshInstance(Mesh.fromGeometry(device, new CylinderGeometry({ radius: 2.6, height: 40, heightSegments: 1, capSegments: 18 })), beamMat)],
        castShadows: false,
        receiveShadows: false
    });
    beam.setLocalPosition(0, 20, 0);
    root.addChild(beam);

    const ringMat = glow(new Color(1, 0.9, 0.3), 0.85);
    const ring = new Entity('Ring');
    ring.addComponent('render', {
        meshInstances: [new MeshInstance(Mesh.fromGeometry(device, new TorusGeometry({ tubeRadius: 0.12, ringRadius: 2.9, segments: 32, sides: 6 })), ringMat)],
        castShadows: false,
        receiveShadows: false
    });
    ring.setLocalPosition(0, 0.15, 0);
    root.addChild(ring);

    const arrowMat = new StandardMaterial();
    arrowMat.diffuse = new Color(1, 0.8, 0.1);
    arrowMat.emissive = new Color(0.6, 0.4, 0.0);
    arrowMat.update();
    const arrow = new Entity('Arrow');
    arrow.addComponent('render', {
        meshInstances: [new MeshInstance(Mesh.fromGeometry(device, new ConeGeometry({ baseRadius: 0.9, peakRadius: 0, height: 1.6, heightSegments: 1, capSegments: 4 })), arrowMat)],
        castShadows: true
    });
    arrow.setLocalEulerAngles(180, 45, 0);
    arrow.setLocalPosition(0, 5, 0);
    root.addChild(arrow);

    return { root, ring, arrow, beam };
}

/** Small pool of mud / splash chunks. */
export function createParticlePool(app, count) {
    const pool = [];
    const colors = [PALETTE.mud, PALETTE.mudDark, PALETTE.potholeWater];
    for (let i = 0; i < count; i++) {
        const b = new GeoBuilder();
        b.boxAt(0, 0, 0, 1, 1, 1, colors[i % colors.length], 0, 0);
        const e = b.toEntity(app, 'Particle', { castShadows: false, receiveShadows: false });
        e.enabled = false;
        app.root.addChild(e);
        pool.push({ entity: e, life: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    }
    return pool;
}

/**
 * Iconic Lagos Danfo (Yellow commercial minibus with twin black horizontal stripes).
 * Facing -Z, origin on ground.
 */
export function createDanfo(app, rand) {
    const root = new Entity('Danfo');
    const b = new GeoBuilder(rand);

    const bodyCol = PALETTE.danfoYellow;
    const stripeCol = PALETTE.danfoStripe;
    const glassCol = PALETTE.vehicleGlass;
    const bumperCol = [32, 32, 35];
    const tyreCol = [25, 25, 28];
    const rimCol = [170, 172, 178];

    // Main yellow bus body tub
    b.boxAt(0, 0.72, 0, 1.82, 0.78, 4.0, bodyCol, 0, 0.02);

    // Twin black Lagos stripes on both sides
    for (const side of [-0.92, 0.92]) {
        b.boxAt(side, 0.74, 0, 0.02, 0.1, 3.8, stripeCol, 0, 0);
        b.boxAt(side, 0.54, 0, 0.02, 0.1, 3.8, stripeCol, 0, 0);
    }

    // Greenhouse cabin / windows
    b.boxAt(0, 1.42, 0.08, 1.76, 0.65, 3.65, glassCol, 0, 0.02);
    // Slanted front windshield
    b.box(GeoBuilder.trs(0, 1.42, -1.82, -16, 0, 0, 1.68, 0.62, 0.08), glassCol, 0);
    // Pillars
    b.boxAt(-0.86, 1.42, -0.6, 0.06, 0.65, 0.12, bodyCol, 0, 0);
    b.boxAt(0.86, 1.42, -0.6, 0.06, 0.65, 0.12, bodyCol, 0, 0);
    b.boxAt(-0.86, 1.42, 0.7, 0.06, 0.65, 0.12, bodyCol, 0, 0);
    b.boxAt(0.86, 1.42, 0.7, 0.06, 0.65, 0.12, bodyCol, 0, 0);

    // White roof
    b.boxAt(0, 1.78, 0.05, 1.82, 0.12, 3.95, [245, 245, 240], 0, 0.02);

    // Roof luggage rack with tied luggage
    b.boxAt(0, 1.88, 0.1, 1.4, 0.08, 2.2, [140, 140, 145], 0, 0);
    b.boxAt(-0.25, 2.05, 0.0, 0.65, 0.28, 0.8, [180, 120, 60], rand() * 10, 0.05); // carton / bundle
    b.boxAt(0.25, 2.02, 0.3, 0.55, 0.24, 0.7, [220, 50, 45], rand() * 10, 0.05); // red bag

    // Bumpers
    b.boxAt(0, 0.32, -2.05, 1.86, 0.22, 0.18, bumperCol, 0, 0);
    b.boxAt(0, 0.32, 2.05, 1.86, 0.22, 0.18, bumperCol, 0, 0);

    // Lights
    b.boxAt(-0.62, 0.56, -2.02, 0.28, 0.18, 0.06, PALETTE.headlight, 0, 0);
    b.boxAt(0.62, 0.56, -2.02, 0.28, 0.18, 0.06, PALETTE.headlight, 0, 0);
    b.boxAt(-0.65, 0.62, 2.02, 0.26, 0.16, 0.06, PALETTE.taillight, 0, 0);
    b.boxAt(0.65, 0.62, 2.02, 0.26, 0.16, 0.06, PALETTE.taillight, 0, 0);

    // 4 Wheels with silver rims
    for (const wx of [-0.9, 0.9]) {
        for (const wz of [-1.25, 1.25]) {
            b.boxAt(wx, 0.32, wz, 0.24, 0.64, 0.64, tyreCol, 0, 0);
            b.boxAt(wx + (wx > 0 ? 0.03 : -0.03), 0.32, wz, 0.04, 0.28, 0.28, rimCol, 0, 0);
        }
    }

    root.addChild(b.toEntity(app, 'DanfoBody'));
    return { root, length: 4.1, width: 1.85, hitRadius: 1.35 };
}

/**
 * Lagos Keke Marwa / NAPEP (Yellow commercial passenger tricycle).
 * Facing -Z, origin on ground.
 */
export function createKeke(app, rand) {
    const root = new Entity('Keke');
    const b = new GeoBuilder(rand);

    const yellow = PALETTE.kekeYellow;
    const roofCol = PALETTE.kekeRoof;
    const glassCol = PALETTE.vehicleGlass;
    const tyreCol = [25, 25, 28];
    const metalCol = [150, 150, 155];

    // Main yellow tub chassis
    b.boxAt(0, 0.44, 0.18, 1.3, 0.46, 2.1, yellow, 0, 0.02);
    // Tapered front nose
    b.box(GeoBuilder.trs(0, 0.46, -0.96, 14, 0, 0, 0.92, 0.44, 0.48), yellow, 0);

    // Canvas roof canopy
    b.boxAt(0, 1.62, 0.08, 1.3, 0.08, 2.2, roofCol, 0, 0.02);

    // Front windshield
    b.boxAt(0, 1.16, -0.76, 1.18, 0.56, 0.05, glassCol, 0, 0);
    // Canopy roll bar struts
    for (const sx of [-0.62, 0.62]) {
        b.boxAt(sx, 1.05, -0.76, 0.05, 0.95, 0.05, roofCol, 0, 0);
        b.boxAt(sx, 1.05, 0.95, 0.05, 0.95, 0.05, roofCol, 0, 0);
    }

    // Driver inside keke
    const skin = pick(rand, PALETTE.skin);
    b.boxAt(0, 0.8, -0.25, 0.34, 0.38, 0.24, pick(rand, PALETTE.cloth), 0, 0); // shirt
    b.boxAt(0, 1.1, -0.25, 0.18, 0.18, 0.18, skin, 0, 0); // head
    b.boxAt(0, 1.2, -0.27, 0.22, 0.06, 0.24, pick(rand, PALETTE.cloth), 0, 0); // cap
    b.boxAt(0, 0.72, -0.58, 0.52, 0.04, 0.04, metalCol, 0, 0); // handlebars

    // Front single headlight
    b.boxAt(0, 0.54, -1.2, 0.22, 0.16, 0.06, PALETTE.headlight, 0, 0);
    // Rear dual red taillights
    b.boxAt(-0.52, 0.52, 1.24, 0.18, 0.12, 0.05, PALETTE.taillight, 0, 0);
    b.boxAt(0.52, 0.52, 1.24, 0.18, 0.12, 0.05, PALETTE.taillight, 0, 0);

    // 3 Wheels
    // Front single wheel
    b.boxAt(0, 0.24, -1.14, 0.15, 0.48, 0.48, tyreCol, 0, 0);
    // Rear 2 wheels
    b.boxAt(-0.64, 0.24, 0.72, 0.18, 0.48, 0.48, tyreCol, 0, 0);
    b.boxAt(0.64, 0.24, 0.72, 0.18, 0.48, 0.48, tyreCol, 0, 0);

    root.addChild(b.toEntity(app, 'KekeBody'));
    return { root, length: 2.5, width: 1.35, hitRadius: 1.05 };
}

/**
 * Lagos Okada (Commercial motorcycle with seated driver).
 * Facing -Z, origin on ground.
 */
export function createOkada(app, rand) {
    const root = new Entity('Okada');
    const b = new GeoBuilder(rand);

    const tankCol = pick(rand, PALETTE.okadaColors);
    const metalCol = [160, 160, 165];
    const tyreCol = [25, 25, 28];
    const skin = pick(rand, PALETTE.skin);
    const shirtCol = pick(rand, PALETTE.cloth);

    // Frame & fuel tank
    b.boxAt(0, 0.68, -0.16, 0.28, 0.22, 0.44, tankCol, 0, 0.02);
    // Engine block
    b.boxAt(0, 0.4, -0.1, 0.26, 0.3, 0.32, [85, 85, 90], 0, 0);
    // Chrome exhaust pipe on right side
    b.boxAt(0.18, 0.26, 0.34, 0.07, 0.07, 0.72, metalCol, 0, 0);
    // Black seat
    b.boxAt(0, 0.72, 0.28, 0.24, 0.1, 0.56, [24, 24, 26], 0, 0);
    // Handlebars & front fork
    b.boxAt(0, 0.94, -0.5, 0.62, 0.04, 0.04, metalCol, 0, 0);
    b.boxAt(0, 0.75, -0.55, 0.18, 0.16, 0.06, PALETTE.headlight, 0, 0);
    b.boxAt(0, 0.68, 0.6, 0.14, 0.1, 0.05, PALETTE.taillight, 0, 0);

    // Rider seated
    b.boxAt(0, 0.98, 0.16, 0.32, 0.44, 0.26, shirtCol, 0, 0.04); // torso
    b.boxAt(0, 1.28, 0.06, 0.22, 0.22, 0.22, skin, 0, 0); // head
    b.boxAt(0, 1.34, 0.06, 0.26, 0.18, 0.26, [245, 195, 35], 0, 0); // yellow helmet
    // Arms holding handlebars
    for (const sx of [-0.17, 0.17]) {
        b.boxAt(sx, 0.96, -0.18, 0.08, 0.08, 0.4, skin, 0, 0);
    }

    // 2 Wheels
    b.boxAt(0, 0.28, -0.78, 0.1, 0.56, 0.56, tyreCol, 0, 0); // front
    b.boxAt(0, 0.28, 0.78, 0.12, 0.56, 0.56, tyreCol, 0, 0); // rear

    root.addChild(b.toEntity(app, 'OkadaBody'));
    return { root, length: 1.9, width: 0.7, hitRadius: 0.75 };
}

/**
 * Lagos Sedan / Private Car (e.g. Toyota Corolla).
 * Facing -Z, origin on ground.
 */
export function createCar(app, rand) {
    const root = new Entity('Car');
    const b = new GeoBuilder(rand);

    const carCol = pick(rand, PALETTE.carColors);
    const glassCol = PALETTE.vehicleGlass;
    const bumperCol = [35, 35, 38];
    const tyreCol = [25, 25, 28];
    const rimCol = [170, 172, 178];

    // Main lower chassis
    b.boxAt(0, 0.42, 0, 1.66, 0.38, 3.7, carCol, 0, 0.02);
    // Hood
    b.boxAt(0, 0.54, -1.18, 1.6, 0.2, 1.24, carCol, 0, 0.02);
    // Trunk
    b.boxAt(0, 0.55, 1.22, 1.6, 0.2, 1.15, carCol, 0, 0.02);

    // Greenhouse cabin & glass
    b.boxAt(0, 0.96, 0.05, 1.42, 0.48, 1.7, carCol, 0, 0.02);
    // Front slanted windshield
    b.box(GeoBuilder.trs(0, 0.88, -0.68, -28, 0, 0, 1.38, 0.46, 0.08), glassCol, 0);
    // Rear slanted window
    b.box(GeoBuilder.trs(0, 0.88, 0.78, 28, 0, 0, 1.38, 0.46, 0.08), glassCol, 0);
    // Side windows
    b.boxAt(-0.72, 0.96, 0.05, 0.02, 0.38, 1.55, glassCol, 0, 0);
    b.boxAt(0.72, 0.96, 0.05, 0.02, 0.38, 1.55, glassCol, 0, 0);

    // Bumpers
    b.boxAt(0, 0.28, -1.88, 1.68, 0.18, 0.15, bumperCol, 0, 0);
    b.boxAt(0, 0.28, 1.88, 1.68, 0.18, 0.15, bumperCol, 0, 0);

    // Lights
    b.boxAt(-0.58, 0.48, -1.86, 0.26, 0.14, 0.05, PALETTE.headlight, 0, 0);
    b.boxAt(0.58, 0.48, -1.86, 0.26, 0.14, 0.05, PALETTE.headlight, 0, 0);
    b.boxAt(-0.6, 0.54, 1.86, 0.24, 0.14, 0.05, PALETTE.taillight, 0, 0);
    b.boxAt(0.6, 0.54, 1.86, 0.24, 0.14, 0.05, PALETTE.taillight, 0, 0);

    // 4 Wheels
    for (const wx of [-0.82, 0.82]) {
        for (const wz of [-1.15, 1.15]) {
            b.boxAt(wx, 0.28, wz, 0.22, 0.56, 0.56, tyreCol, 0, 0);
            b.boxAt(wx + (wx > 0 ? 0.02 : -0.02), 0.28, wz, 0.04, 0.26, 0.26, rimCol, 0, 0);
        }
    }

    root.addChild(b.toEntity(app, 'CarBody'));
    return { root, length: 3.8, width: 1.7, hitRadius: 1.25 };
}
