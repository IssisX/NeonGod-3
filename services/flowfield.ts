
import { GameState } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// FLOW FIELD NAVIGATION
// Grid-based vector field that guides enemies towards the player while avoiding obstacles.
// Resolution is lower than spatial grid for performance (e.g., 50px cells).

export class FlowField {
    width: number;
    height: number;
    cellSize: number;
    cols: number;
    rows: number;

    // Arrays
    costMap: Uint8Array; // 0-255 cost (255 = Impassable)
    integrationField: Uint16Array; // Distance to target (Dijkstra)
    vectorFieldX: Float32Array; // Flow Vector X
    vectorFieldY: Float32Array; // Flow Vector Y

    constructor(worldWidth: number, worldHeight: number, cellSize: number = 50) {
        this.width = worldWidth;
        this.height = worldHeight;
        this.cellSize = cellSize;
        this.cols = Math.ceil(worldWidth / cellSize);
        this.rows = Math.ceil(worldHeight / cellSize);

        const size = this.cols * this.rows;
        this.costMap = new Uint8Array(size);
        this.integrationField = new Uint16Array(size);
        this.vectorFieldX = new Float32Array(size);
        this.vectorFieldY = new Float32Array(size);
    }

    update(s: GameState) {
        this.reset();
        this.generateCostMap(s);
        this.generateIntegrationField(s.player.x, s.player.y);
        this.generateVectorField();
    }

    reset() {
        this.costMap.fill(1); // Base cost of movement is 1
        this.integrationField.fill(65535); // Max distance
        this.vectorFieldX.fill(0);
        this.vectorFieldY.fill(0);
    }

    generateCostMap(s: GameState) {
        // 1. Black Holes (Impassable / High Cost)
        for(const bh of s.blackHoles) {
            if (!bh.active) continue;
            this.markRadius(bh.x, bh.y, bh.pullRange, 255);
        }

        // 2. Arena Walls (if active)
        if (s.arena.active) {
            // This is inverted; outside is impassable.
            // Rasterizing a large circle is expensive.
            // We can just check bounds during lookup or integration.
            // For now, let's mark the "Safe Zone" center as cheap, and edges as expensive?
            // Actually, cost map is for pathfinding AROUND obstacles.
            // If the arena is a hard constraint, entities just bounce.
            // Let's focus on repulsors and attractors.
        }

        // 3. Bosses (Avoid them)
        if (s.bossActive) {
            for(const e of s.enemies) {
                if (e.type.startsWith('boss')) {
                    this.markRadius(e.x, e.y, 200, 50); // Soft avoid boss body
                }
            }
        }
    }

    markRadius(worldX: number, worldY: number, radius: number, cost: number) {
        const cx = Math.floor(worldX / this.cellSize);
        const cy = Math.floor(worldY / this.cellSize);
        const r = Math.ceil(radius / this.cellSize);

        const startX = Math.max(0, cx - r);
        const endX = Math.min(this.cols - 1, cx + r);
        const startY = Math.max(0, cy - r);
        const endY = Math.min(this.rows - 1, cy + r);

        const rSq = (radius / this.cellSize) ** 2;

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx*dx + dy*dy <= rSq) {
                    const idx = y * this.cols + x;
                    const current = this.costMap[idx];
                    this.costMap[idx] = Math.max(current, cost);
                }
            }
        }
    }

    generateIntegrationField(targetX: number, targetY: number) {
        // Dijkstra's Algorithm (Breadth-First Search)

        const tx = Math.floor(Utils.clamp(targetX, 0, this.width) / this.cellSize);
        const ty = Math.floor(Utils.clamp(targetY, 0, this.height) / this.cellSize);
        const targetIdx = ty * this.cols + tx;

        if (targetIdx < 0 || targetIdx >= this.integrationField.length) return;

        this.integrationField[targetIdx] = 0;

        const queue: number[] = [targetIdx];

        let head = 0;
        while (head < queue.length) {
            const idx = queue[head++];
            const cx = idx % this.cols;
            const cy = Math.floor(idx / this.cols);
            const dist = this.integrationField[idx];

            // Check neighbors (4-way)
            const neighbors = [];
            if (cx > 0) neighbors.push(idx - 1);
            if (cx < this.cols - 1) neighbors.push(idx + 1);
            if (cy > 0) neighbors.push(idx - this.cols);
            if (cy < this.rows - 1) neighbors.push(idx + this.cols);

            for (const nIdx of neighbors) {
                const cost = this.costMap[nIdx];
                if (cost === 255) continue; // Impassable

                const newDist = dist + cost;
                if (newDist < this.integrationField[nIdx]) {
                    this.integrationField[nIdx] = newDist;
                    queue.push(nIdx);
                }
            }
        }
    }

    generateVectorField() {
        // Calculate gradient of integration field
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const idx = y * this.cols + x;

                const cost = this.costMap[idx];
                if (cost === 255) {
                    this.vectorFieldX[idx] = 0;
                    this.vectorFieldY[idx] = 0;
                    continue;
                }

                // Sample neighbors
                const left = x > 0 ? this.integrationField[idx - 1] : 65535;
                const right = x < this.cols - 1 ? this.integrationField[idx + 1] : 65535;
                const up = y > 0 ? this.integrationField[idx - this.cols] : 65535;
                const down = y < this.rows - 1 ? this.integrationField[idx + this.cols] : 65535;

                // Gradient descent
                const dx = left - right;
                const dy = up - down;

                // Normalize
                const len = Math.hypot(dx, dy);
                if (len > 0.001) {
                    this.vectorFieldX[idx] = dx / len;
                    this.vectorFieldY[idx] = dy / len;
                } else {
                    this.vectorFieldX[idx] = 0;
                    this.vectorFieldY[idx] = 0;
                }
            }
        }
    }

    sample(x: number, y: number) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);

        if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
            const idx = cy * this.cols + cx;
            return { x: this.vectorFieldX[idx], y: this.vectorFieldY[idx] };
        }
        return { x: 0, y: 0 };
    }
}
