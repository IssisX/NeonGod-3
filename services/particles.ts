
import { CONFIG } from '../constants';

export class ParticleSystem {
    count: number = 0;
    capacity: number;

    // Structure of Arrays (SoA)
    // Using Float32Array for physics, Uint32 for colors/life
    x: Float32Array;
    y: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    life: Float32Array;
    maxLife: Float32Array;
    size: Float32Array;

    // Metadata packed into TypedArrays
    // Color stored as RGBA integer (0xAABBGGRR) or simply map index?
    // For canvas rendering, strings are slow. We might stick to string pool or pre-parse.
    // Let's use an integer index into a color palette, or just keep string array for now if needed.
    // Actually, Canvas fillStyle needs string.
    // Optimization: Store color as integer 0xRRGGBB, convert only on render?
    // Or just parallel array of strings. Strings are references, so array of strings is just array of pointers.
    // Given the constraints, let's use parallel array of strings for compatibility with existing renderer.
    color: string[];
    type: Uint8Array; // 0: spark, 1: smoke, 2: glitch, etc.

    constructor(capacity = 2000) {
        this.capacity = capacity;

        this.x = new Float32Array(capacity);
        this.y = new Float32Array(capacity);
        this.vx = new Float32Array(capacity);
        this.vy = new Float32Array(capacity);
        this.life = new Float32Array(capacity);
        this.maxLife = new Float32Array(capacity);
        this.size = new Float32Array(capacity);
        this.type = new Uint8Array(capacity);
        this.color = new Array(capacity).fill('#fff');
    }

    spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, typeStr: string = 'spark') {
        if (this.count >= this.capacity) return;

        const i = this.count;
        this.x[i] = x;
        this.y[i] = y;
        this.vx[i] = vx;
        this.vy[i] = vy;
        this.life[i] = life;
        this.maxLife[i] = life;
        this.size[i] = size;
        this.color[i] = color;

        // Map types to int
        if (typeStr === 'spark') this.type[i] = 0;
        else if (typeStr === 'smoke') this.type[i] = 1;
        else if (typeStr === 'glitch') this.type[i] = 2;
        else this.type[i] = 0;

        this.count++;
    }

    update(dt: number) {
        // Tight Loop - Monomorphic, simple math, no allocations
        for (let i = 0; i < this.count; i++) {
            this.life[i] -= dt;

            if (this.life[i] <= 0) {
                // Swap Remove (Fast O(1) removal)
                // Move last element to current slot
                const last = this.count - 1;
                if (i < last) {
                    this.x[i] = this.x[last];
                    this.y[i] = this.y[last];
                    this.vx[i] = this.vx[last];
                    this.vy[i] = this.vy[last];
                    this.life[i] = this.life[last];
                    this.maxLife[i] = this.maxLife[last];
                    this.size[i] = this.size[last];
                    this.color[i] = this.color[last];
                    this.type[i] = this.type[last];

                    // Decrement i so we process the swapped element
                    i--;
                }
                this.count--;
                continue;
            }

            // Physics Integration (Euler is fine here for particles, or use simple friction)
            this.x[i] += this.vx[i] * dt;
            this.y[i] += this.vy[i] * dt;

            // Friction
            this.vx[i] *= 0.95;
            this.vy[i] *= 0.95;
        }
    }
}
