// Low-poly Hood palette (sRGB 0-255). Vertex colours are converted to linear in the shader
// (`vertexColorGamma`), so these can be authored as they look on screen.

export const PALETTE = {
    tarmac: [42, 44, 48],
    tarmacDark: [42, 44, 48],
    roadLine: [246, 206, 52],
    curbYellow: [244, 196, 40],
    curbBlack: [34, 34, 36],
    mud: [158, 84, 46],
    mudDark: [122, 62, 34],
    mudWet: [96, 54, 34],
    mudBaked: [178, 96, 52],
    mudLight: [168, 92, 50],
    mudDeep: [108, 54, 30],
    mudPuddleWater: [78, 56, 40],
    yard: [176, 104, 62],
    lot: [140, 92, 60],
    grass: [118, 92, 76],
    grassDark: [98, 76, 62],
    bush: [62, 120, 52],
    fence: [214, 204, 180],
    fenceTop: [150, 146, 136],
    roofRust: [150, 74, 44],
    roofRust2: [176, 98, 58],
    roofZinc: [150, 150, 146],
    door: [92, 56, 34],
    windowBlue: [52, 108, 150],
    windowGreen: [58, 128, 88],
    windowDark: [36, 40, 46],
    tank: [28, 28, 30],
    trunk: [124, 92, 62],
    palm: [58, 140, 60],
    palmDark: [40, 110, 48],
    pole: [96, 76, 56],
    potholeRim: [30, 30, 34],
    potholeWater: [86, 70, 56],
    gutterConcrete: [182, 178, 170],
    gutterConcreteDark: [60, 58, 54],
    gutterWater: [62, 68, 46],
    gutterSlime: [74, 94, 50],
    // Deep open drain: lighter weathered concrete at the lip, darker and wetter towards the floor
    drainCap: [186, 180, 168],
    drainWallTop: [160, 154, 142],
    drainWallMid: [124, 118, 108],
    drainWallLow: [90, 88, 78],
    drainStain: [96, 90, 80],
    drainAlgae: [78, 98, 56],
    drainFloor: [86, 78, 64],
    drainSilt: [106, 92, 72],
    sachetWhite: [232, 236, 240],
    sachetBlue: [70, 124, 204],
    plankWood: [144, 104, 68],
    plankWoodLight: [168, 126, 82],
    plankWoodDark: [112, 78, 48],
    plankNail: [68, 66, 64],
    walls: [
        [236, 226, 196], // cream
        [168, 206, 222], // faded blue
        [240, 186, 150], // peach
        [176, 214, 166], // mint
        [228, 196, 110], // ochre
        [230, 162, 168], // pink
        [212, 212, 206] // grey render
    ],
    signs: [
        [246, 206, 52],
        [222, 60, 52],
        [40, 140, 80],
        [40, 100, 190],
        [240, 120, 30]
    ],
    skin: [
        [120, 72, 46],
        [92, 56, 36],
        [142, 92, 60],
        [70, 44, 30]
    ],
    cloth: [
        [222, 60, 52],
        [246, 180, 32],
        [40, 140, 80],
        [40, 100, 190],
        [150, 60, 160],
        [240, 120, 30],
        [30, 160, 170],
        [240, 240, 236]
    ],
    sidewalk: [178, 174, 168],
    marketUmbrellas: [
        [246, 206, 52],
        [222, 60, 52],
        [40, 140, 80],
        [40, 100, 190],
        [240, 120, 30],
        [240, 240, 236]
    ],
    crates: [
        [220, 45, 45],
        [40, 145, 65],
        [35, 95, 190],
        [240, 185, 40]
    ],
    fruitOrange: [248, 135, 30],
    fruitGreen: [85, 165, 55],
    fruitRed: [220, 50, 50],
    woodTable: [145, 100, 68],
    kioskMetal: [
        [50, 140, 190],
        [246, 206, 52],
        [220, 65, 55],
        [45, 145, 85]
    ],
    danfoYellow: [246, 206, 52],
    danfoStripe: [26, 26, 28],
    kekeYellow: [250, 212, 45],
    kekeRoof: [30, 30, 32],
    carColors: [
        [210, 215, 222], // silver metallic
        [42, 92, 168],   // hood blue
        [240, 240, 240], // white
        [175, 40, 40],   // wine red
        [45, 45, 50]     // graphite
    ],
    okadaColors: [
        [220, 45, 45],
        [40, 95, 200],
        [26, 26, 28]
    ],
    headlight: [255, 245, 170],
    taillight: [230, 30, 30],
    vehicleGlass: [135, 180, 210],
    streetPole: [72, 76, 84],
    streetPedestal: [125, 128, 134],
    streetLuminaire: [46, 49, 54],
    streetLensGlow: [255, 242, 190],
    alleyBracket: [96, 78, 58],
    alleyTinShade: [142, 78, 48],
    alleyBulbWarm: [255, 210, 95]
};

/** Small deterministic PRNG so the neighbourhood looks the same every run. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
