
interface BossModule {
    xOffset: number;
    yOffset: number;
    rotation: number;
    shape: number[];
}

interface Enemy {
    x: number;
    y: number;
}

// 1. Current implementation (Allocation)
function pointInPolygon(px: number, py: number, polygon: number[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        const xi = polygon[i], yi = polygon[i + 1];
        const xj = polygon[j], yj = polygon[j + 1];
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getTransformedPolygon_Current(e: Enemy, mod: BossModule, rot: number): number[] {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const modX = e.x + (mod.xOffset * cos - mod.yOffset * sin);
    const modY = e.y + (mod.xOffset * sin + mod.yOffset * cos);
    const totalRot = rot + mod.rotation;
    const mCos = Math.cos(totalRot);
    const mSin = Math.sin(totalRot);
    const poly: number[] = [];
    for (let i = 0; i < mod.shape.length; i += 2) {
        const lx = mod.shape[i];
        const ly = mod.shape[i + 1];
        poly.push(modX + (lx * mCos - ly * mSin));
        poly.push(modY + (lx * mSin + ly * mCos));
    }
    return poly;
}

// 5. Fused Implementation
function pointInTransformedPolygon_Fused(px: number, py: number, e: Enemy, mod: BossModule, rot: number): boolean {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const modX = e.x + (mod.xOffset * cos - mod.yOffset * sin);
    const modY = e.y + (mod.xOffset * sin + mod.yOffset * cos);
    const totalRot = rot + mod.rotation;
    const mCos = Math.cos(totalRot);
    const mSin = Math.sin(totalRot);

    let inside = false;
    const shape = mod.shape;
    const len = shape.length;

    // We need j to be the last point initially.
    // The original loop: j starts at len-2.

    let j = len - 2;
    // Calculate j point once
    let ljx = shape[j];
    let ljy = shape[j+1];
    let xj = modX + (ljx * mCos - ljy * mSin);
    let yj = modY + (ljx * mSin + ljy * mCos);

    for (let i = 0; i < len; i += 2) {
        const lix = shape[i];
        const liy = shape[i+1];
        const xi = modX + (lix * mCos - liy * mSin);
        const yi = modY + (lix * mSin + liy * mCos);

        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;

        // Move current to previous
        xj = xi;
        yj = yi;
    }
    return inside;
}


// Benchmark
const ITERATIONS = 1_000_000;

const mockEnemy: Enemy = { x: 100, y: 100 };
const mockModule: BossModule = {
    xOffset: 10,
    yOffset: 10,
    rotation: 0.5,
    shape: [0, 0, 10, 0, 10, 10, 0, 10, 5, 15, -5, 5] // 12 points
};
const px = 105, py = 105;

console.log(`Running ${ITERATIONS} iterations...`);

function bench(name: string, fn: () => any) {
    const start = performance.now();
    let dummy = 0;
    for (let i = 0; i < ITERATIONS; i++) {
        const res = fn();
        if (res) dummy++;
    }
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
}

bench("Current (Split)", () => {
    const poly = getTransformedPolygon_Current(mockEnemy, mockModule, 0.1);
    return pointInPolygon(px, py, poly);
});

bench("Fused", () => {
    return pointInTransformedPolygon_Fused(px, py, mockEnemy, mockModule, 0.1);
});
