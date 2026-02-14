
// benchmarks/collision_benchmark.js

// Mock SpatialGrid
class SpatialGrid {
  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.cellSizeInv = 1 / cellSize;
    this.cells = new Map();
    this.results = [];
  }

  clear() { this.cells.clear(); }

  insert(entity) {
    const key = `${Math.floor(entity.x * this.cellSizeInv)},${Math.floor(entity.y * this.cellSizeInv)}`;
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(entity);
  }

  queryRadius(x, y, radius) {
    this.results.length = 0;
    const minCx = Math.floor((x - radius) * this.cellSizeInv);
    const maxCx = Math.floor((x + radius) * this.cellSizeInv);
    const minCy = Math.floor((y - radius) * this.cellSizeInv);
    const maxCy = Math.floor((y + radius) * this.cellSizeInv);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) for (let i = 0; i < cell.length; i++) this.results.push(cell[i]);
      }
    }
    return this.results;
  }
}

class FastSpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cellSizeInv = 1 / cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.cells = new Array(this.cols * this.rows).fill(null).map(() => []);
        this.results = [];
    }

    clear() {
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].length = 0;
        }
    }

    insert(entity) {
        const cx = Math.floor(entity.x * this.cellSizeInv);
        const cy = Math.floor(entity.y * this.cellSizeInv);
        if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
            this.cells[cy * this.cols + cx].push(entity);
        }
    }

    queryRadius(x, y, radius) {
        this.results.length = 0;
        const minCx = Math.max(0, Math.floor((x - radius) * this.cellSizeInv));
        const maxCx = Math.min(this.cols - 1, Math.floor((x + radius) * this.cellSizeInv));
        const minCy = Math.max(0, Math.floor((y - radius) * this.cellSizeInv));
        const maxCy = Math.min(this.rows - 1, Math.floor((y + radius) * this.cellSizeInv));

        for (let cy = minCy; cy <= maxCy; cy++) {
            const rowOffset = cy * this.cols;
            for (let cx = minCx; cx <= maxCx; cx++) {
                const cell = this.cells[rowOffset + cx];
                const len = cell.length;
                for (let i = 0; i < len; i++) {
                    this.results.push(cell[i]);
                }
            }
        }
        return this.results;
    }
}

// Mock Utils
const Utils = {
    dist: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
};

// Setup
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;
const DEBRIS_COUNT = 150;
const ENEMY_COUNT = 50;
const BULLET_COUNT = 600;

const spatialGrid = new SpatialGrid(128);
const debrisList = [];
const enemyList = [];
const bulletList = [];

// Populate Debris
for (let i = 0; i < DEBRIS_COUNT; i++) {
    debrisList.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        size: 20 + Math.random() * 40,
        active: true,
        health: 100,
        vRot: 0.1, // Debris identifier
        type: 'asteroid'
    });
}

// Populate Enemies
for (let i = 0; i < ENEMY_COUNT; i++) {
    enemyList.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        size: 30,
        active: true,
        health: 50,
        type: 'chaser'
    });
}

// Populate Bullets
for (let i = 0; i < BULLET_COUNT; i++) {
    bulletList.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        size: 5,
        active: true,
        dmg: 10
    });
}

// Baseline: O(N*M) + Grid Query for Enemies
function runBaseline() {
    // Grid Setup (Enemies only)
    spatialGrid.clear();
    for (const e of enemyList) spatialGrid.insert(e);

    let hits = 0;
    const start = performance.now();

    for (const b of bulletList) {
        if (!b.active) continue;

        // 1. Grid Query for Enemies
        const candidates = spatialGrid.queryRadius(b.x, b.y, 100);

        // 2. Debris Loop (Naive)
        for (let i = debrisList.length - 1; i >= 0; i--) {
            const d = debrisList[i];
            if (!d.active) continue;

            const dist = Utils.dist(b.x, b.y, d.x, d.y);
            const minDist = d.size + b.size;

            if (dist < minDist) hits++;
        }

        // 3. Enemy Loop (Grid Candidates)
        for (const e of candidates) {
            const dist = Utils.dist(b.x, b.y, e.x, e.y);
            if (dist < e.size + b.size) hits++;
        }
    }

    const end = performance.now();
    return { time: end - start, hits };
}

// Optimized: Spatial Grid for Both
function runOptimized() {
    const gridStart = performance.now();

    // Grid Setup (Enemies + Debris)
    spatialGrid.clear();
    for (const e of enemyList) spatialGrid.insert(e);
    for (const d of debrisList) spatialGrid.insert(d); // Cost of inserting debris

    const queryStart = performance.now();
    let hits = 0;

    for (const b of bulletList) {
        if (!b.active) continue;

        // 1. Grid Query (Enemies + Debris)
        const candidates = spatialGrid.queryRadius(b.x, b.y, 100);

        // 2. Combined Loop (or Separated by Type check)
        for (const entity of candidates) {
            // Check Debris
            if (entity.vRot !== undefined) {
                const d = entity;
                const dist = Utils.dist(b.x, b.y, d.x, d.y);
                if (dist < d.size + b.size) hits++;
            }
            // Check Enemy
            else {
                const e = entity;
                const dist = Utils.dist(b.x, b.y, e.x, e.y);
                if (dist < e.size + b.size) hits++;
            }
        }
    }

    const end = performance.now();
    return {
        totalTime: end - gridStart,
        gridTime: queryStart - gridStart,
        queryTime: end - queryStart,
        hits
    };
}

const fastSpatialGrid = new FastSpatialGrid(WORLD_WIDTH, WORLD_HEIGHT, 128);

// Super Optimized: Fast Spatial Grid for Both
function runSuperOptimized() {
    const gridStart = performance.now();

    // Grid Setup (Enemies + Debris)
    fastSpatialGrid.clear();
    for (const e of enemyList) fastSpatialGrid.insert(e);
    for (const d of debrisList) fastSpatialGrid.insert(d);

    const queryStart = performance.now();
    let hits = 0;

    for (const b of bulletList) {
        if (!b.active) continue;

        // 1. Grid Query (Enemies + Debris)
        const candidates = fastSpatialGrid.queryRadius(b.x, b.y, 100);

        // 2. Combined Loop
        for (const entity of candidates) {
             // Check Debris
            if (entity.vRot !== undefined) {
                const d = entity;
                const dist = Utils.dist(b.x, b.y, d.x, d.y);
                if (dist < d.size + b.size) hits++;
            }
            // Check Enemy
            else {
                const e = entity;
                const dist = Utils.dist(b.x, b.y, e.x, e.y);
                if (dist < e.size + b.size) hits++;
            }
        }
    }

    const end = performance.now();
    return {
        totalTime: end - gridStart,
        gridTime: queryStart - gridStart,
        queryTime: end - queryStart,
        hits
    };
}

console.log(`Setup: ${DEBRIS_COUNT} debris, ${BULLET_COUNT} bullets.`);

// Warmup
runBaseline();
runOptimized();

console.log("Running Baseline...");
const baseline = runBaseline();
console.log(`Baseline: ${baseline.time.toFixed(2)}ms, Hits: ${baseline.hits}`);

console.log("Running Optimized...");
const optimized = runOptimized();
console.log(`Optimized: ${optimized.totalTime.toFixed(2)}ms (Grid: ${optimized.gridTime.toFixed(2)}ms, Query: ${optimized.queryTime.toFixed(2)}ms), Hits: ${optimized.hits}`);

console.log("Running Super Optimized...");
const superOptimized = runSuperOptimized();
console.log(`Super Optimized: ${superOptimized.totalTime.toFixed(2)}ms (Grid: ${superOptimized.gridTime.toFixed(2)}ms, Query: ${superOptimized.queryTime.toFixed(2)}ms), Hits: ${superOptimized.hits}`);

const improvement = baseline.time / optimized.totalTime;
console.log(`Improvement (Standard Grid): ${improvement.toFixed(2)}x faster`);
const superImprovement = baseline.time / superOptimized.totalTime;
console.log(`Improvement (Fast Grid): ${superImprovement.toFixed(2)}x faster`);
