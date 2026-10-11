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
 * Kid on a bicycle. Facing -Z, origin on the ground between the wheels.
 * Hierarchy: root (yaw/position) -> lean (roll/wobble) -> body, wheels, legs.
 */
export function createBicycleKid(app) {
    const root = new Entity('Player');
    const lean = new Entity('Lean');
    root.addChild(lean);

    const R = 0.34; // wheel radius
    const WB = 0.56; // half wheelbase

    // ---- frame + rider
    const b = new GeoBuilder();
    const bar = (x0, y0, z0, x1, y1, z1, t, col) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dy, dz);
        const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        // box long axis is local z; pitch up around x (negative tips +z end up)
        b.box(GeoBuilder.trs((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, -pitch, yaw, 0, t, t, len), col, 0);
    };
    const hub = R;
    // diamond frame
    bar(0, 0.42, 0.02, 0, 0.78, 0.22, 0.06, FRAME); // seat tube
    bar(0, 0.78, 0.22, 0, 0.82, -0.42, 0.06, FRAME); // top tube
    bar(0, 0.42, 0.02, 0, 0.8, -0.42, 0.065, FRAME); // down tube
    bar(0, 0.42, 0.02, 0, hub, WB, 0.04, FRAME); // chain stay
    bar(0, 0.78, 0.22, 0, hub, WB, 0.04, FRAME); // seat stay
    bar(0, 0.95, -0.46, 0, hub, -WB, 0.05, METAL); // fork
    bar(0, 0.95, -0.46, 0, 1.08, -0.4, 0.05, METAL); // stem
    bar(-0.3, 1.08, -0.38, 0.3, 1.08, -0.38, 0.04, METAL); // handlebar
    b.boxAt(-0.33, 1.08, -0.38, 0.1, 0.07, 0.07, TYRE, 0, 0);
    b.boxAt(0.33, 1.08, -0.38, 0.1, 0.07, 0.07, TYRE, 0, 0);
    b.boxAt(0, 0.86, 0.26, 0.16, 0.06, 0.28, TYRE, 0, 0); // saddle
    b.boxAt(0, 0.62, WB, 0.24, 0.04, 0.4, METAL, 0, 0); // rear carrier
    b.boxAt(0, 0.66, WB + 0.02, 0.32, 0.2, 0.28, [222, 160, 40], 0, 0.1); // delivery parcel
    b.boxAt(0, 0.98, -0.52, 0.12, 0.1, 0.08, [255, 236, 150], 0, 0); // lamp
    b.boxAt(0, R + 0.38, -WB, 0.1, 0.03, 0.5, METAL, 0, 0); // front mudguard
    b.boxAt(0, R + 0.38, WB - 0.1, 0.1, 0.03, 0.4, METAL, 0, 0); // rear mudguard

    // rider (sitting on the saddle, leaning forward)
    const skin = PALETTE.skin[0];
    b.box(GeoBuilder.trs(0, 1.05, 0.2, 0, 0, 0, 0.3, 0.2, 0.22), [30, 40, 80], 0); // shorts / hips
    b.box(GeoBuilder.trs(0, 1.3, 0.06, -28, 0, 0, 0.36, 0.48, 0.22), SUPER_EAGLES_GREEN, 0); // jersey
    b.boxAt(0, 1.34, 0.08, 0.37, 0.08, 0.23, WHITE, 0, 0); // jersey stripe
    b.boxAt(0, 1.6, -0.12, 0.1, 0.1, 0.1, skin, 0, 0); // neck
    b.boxAt(0, 1.76, -0.16, 0.26, 0.28, 0.26, skin, 0, 0.04); // head
    b.boxAt(0, 1.92, -0.16, 0.28, 0.08, 0.28, [222, 50, 44], 0, 0); // cap
    b.boxAt(0, 1.9, -0.36, 0.24, 0.03, 0.16, [222, 50, 44], 0, 0); // cap peak
    b.boxAt(-0.07, 1.78, -0.29, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0); // eyes
    b.boxAt(0.07, 1.78, -0.29, 0.04, 0.04, 0.02, [20, 20, 20], 0, 0);
    // arms reaching to the handlebar
    for (const sx of [-1, 1]) {
        bar(sx * 0.2, 1.48, -0.02, sx * 0.3, 1.1, -0.36, 0.08, skin);
        b.boxAt(sx * 0.21, 1.46, -0.02, 0.12, 0.12, 0.14, SUPER_EAGLES_GREEN, 0, 0);
    }
    const body = b.toEntity(app, 'BikeBody');
    lean.addChild(body);

    // ---- wheels (spin around local X)
    const makeWheel = name => {
        const w = new GeoBuilder();
        // cylinder spans local y 0..1 -> after the Z-rotation it spans -x; offset to centre it
        w.cylinder(GeoBuilder.trs(0.03, 0, 0, 0, 0, 90, R, 0.06, R), 12, TYRE, 1, 0.05, [60, 60, 64]);
        for (let i = 0; i < 4; i++) {
            w.box(GeoBuilder.trs(0, 0, 0, i * 45, 0, 0, 0.075, R * 1.9, 0.025), METAL, 0);
        }
        w.boxAt(0, 0, 0, 0.1, 0.08, 0.08, METAL, 0, 0);
        const e = w.toEntity(app, name);
        return e;
    };
    const frontWheel = makeWheel('FrontWheel');
    frontWheel.setLocalPosition(0, R, -WB);
    const rearWheel = makeWheel('RearWheel');
    rearWheel.setLocalPosition(0, R, WB);
    lean.addChild(frontWheel);
    lean.addChild(rearWheel);

    // ---- crank + legs (legs are stretched toward the pedals each frame)
    const crank = new Entity('Crank');
    crank.setLocalPosition(0, 0.42, 0.02);
    lean.addChild(crank);
    const pedals = [];
    const legs = [];
    for (const side of [-1, 1]) {
        const pedal = new Entity(side < 0 ? 'PedalL' : 'PedalR');
        crank.addChild(pedal);
        pedals.push(pedal);

        const lb = new GeoBuilder();
        // leg spans local z 0..-1 (unit length) so lookAt (-Z) aims it and scale.z stretches it to the pedal
        lb.box(GeoBuilder.trs(0, 0, -0.5, 0, 0, 0, 0.12, 0.12, 1), skin, 0);
        lb.box(GeoBuilder.trs(0, 0, -0.12, 0, 0, 0, 0.15, 0.15, 0.24), [30, 40, 80], 0);
        lb.box(GeoBuilder.trs(0, 0, -0.93, 0, 0, 0, 0.13, 0.13, 0.1), [245, 245, 245], 0); // sock
        const leg = lb.toEntity(app, side < 0 ? 'LegL' : 'LegR');
        leg.setLocalPosition(side * 0.11, 1.0, 0.18);
        lean.addChild(leg);
        legs.push({ entity: leg, side });

        const sh = new GeoBuilder();
        sh.boxAt(0, 0, -0.04, 0.12, 0.08, 0.24, [240, 240, 240], 0, 0); // canvas shoe
        const shoe = sh.toEntity(app, 'Shoe');
        pedal.addChild(shoe);
    }

    return { root, lean, body, frontWheel, rearWheel, crank, pedals, legs };
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
