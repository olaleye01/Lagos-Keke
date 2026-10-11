// Low-poly Lagos palette (sRGB 0-255). Vertex colours are converted to linear in the shader
// (`vertexColorGamma`), so these can be authored as they look on screen.

export const PALETTE = {
    tarmac: [72, 74, 80],
    tarmacDark: [58, 60, 66],
    roadLine: [246, 206, 52],
    curbYellow: [244, 196, 40],
    curbBlack: [34, 34, 36],
    mud: [158, 84, 46],
    mudDark: [122, 62, 34],
    mudWet: [96, 54, 34],
    yard: [176, 104, 62],
    lot: [140, 92, 60],
    grass: [104, 150, 64],
    grassDark: [78, 122, 50],
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
    potholeRim: [44, 44, 46],
    potholeWater: [86, 70, 56],
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
    ]
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
