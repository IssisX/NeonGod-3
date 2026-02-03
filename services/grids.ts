
import { Entity } from '../types';
import { CONFIG } from '../constants';

export class SpatialGrid {
  cellSize: number;
  cellSizeInv: number;
  cols: number;
  rows: number;
  cells: Entity[][]; // Flat array of buckets
  results: Entity[];

  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.cellSizeInv = 1 / cellSize;

    // Calculate grid dimensions based on World Size (plus padding for safety)
    this.cols = Math.ceil(CONFIG.WORLD.WIDTH * this.cellSizeInv) + 2;
    this.rows = Math.ceil(CONFIG.WORLD.HEIGHT * this.cellSizeInv) + 2;

    // Pre-allocate buckets
    const size = this.cols * this.rows;
    this.cells = new Array(size);
    for(let i = 0; i < size; i++) {
        this.cells[i] = [];
    }

    this.results = [];
  }
  
  clear() {
    // Fast clear without GC
    const len = this.cells.length;
    for(let i = 0; i < len; i++) {
        this.cells[i].length = 0;
    }
  }
  
  insert(entity: Entity) {
    // Fast integer hashing
    // Clamp to grid bounds to handle out-of-bounds entities
    let cx = Math.floor(entity.x * this.cellSizeInv);
    let cy = Math.floor(entity.y * this.cellSizeInv);

    // Bounds check
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;

    const idx = cy * this.cols + cx;
    this.cells[idx].push(entity);
  }
  
  queryRadius(x: number, y: number, radius: number) {
    this.results.length = 0;

    // Calculate bounds in grid coordinates
    let minCx = Math.floor((x - radius) * this.cellSizeInv);
    let maxCx = Math.floor((x + radius) * this.cellSizeInv);
    let minCy = Math.floor((y - radius) * this.cellSizeInv);
    let maxCy = Math.floor((y + radius) * this.cellSizeInv);

    // Clamp bounds
    if (minCx < 0) minCx = 0;
    if (maxCx >= this.cols) maxCx = this.cols - 1;
    if (minCy < 0) minCy = 0;
    if (maxCy >= this.rows) maxCy = this.rows - 1;

    for (let cy = minCy; cy <= maxCy; cy++) {
        // Optimization: Pre-calculate row offset
        const rowOffset = cy * this.cols;
        for (let cx = minCx; cx <= maxCx; cx++) {
            const cell = this.cells[rowOffset + cx];
            const len = cell.length;
            // Unroll loop slightly? V8 handles simple loops well.
            for (let i = 0; i < len; i++) {
                this.results.push(cell[i]);
            }
        }
    }
    return this.results;
  }
}

// Discretized Wave Equation Grid (Spectral-like propagation)
// u(t+1) = 2u(t) - u(t-1) + c^2 * dt^2 * Laplacian(u) - damping * dt * velocity
export class VisualGrid {
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellSize: number;
  
  // Double buffer for wave height
  uCurrent: Float32Array;
  uPrev: Float32Array;
  uNext: Float32Array; // computed
  
  // Damping field (viscosity)
  damping: Float32Array;

  constructor(width: number, height: number, cellSize = CONFIG.GRID.CELL_SIZE) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    
    const size = this.cols * this.rows;
    this.uCurrent = new Float32Array(size);
    this.uPrev = new Float32Array(size);
    this.uNext = new Float32Array(size);
    this.damping = new Float32Array(size).fill(CONFIG.GRID.DAMPING);
  }

  rebuild(width: number, height: number) {
    // For fixed large world, we don't necessarily rebuild on resize, 
    // but if we do, we preserve state if possible or reset.
    // Here we reset for simplicity as world size is constant in game.
    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.cellSize) + 2;
    this.rows = Math.ceil(height / this.cellSize) + 2;
    const size = this.cols * this.rows;
    this.uCurrent = new Float32Array(size);
    this.uPrev = new Float32Array(size);
    this.uNext = new Float32Array(size);
    this.damping.fill(CONFIG.GRID.DAMPING);
  }

  // Apply a force (Gaussian impulse) to the wave field
  applyForce(x: number, y: number, radius: number, strength: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const r = Math.ceil(radius / this.cellSize);

    for (let j = cy - r; j <= cy + r; j++) {
      for (let i = cx - r; i <= cx + r; i++) {
        if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) {
          const idx = j * this.cols + i;
          const dx = (i * this.cellSize) - x;
          const dy = (j * this.cellSize) - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < radius * radius) {
             const dist = Math.sqrt(distSq);
             const val = strength * (1 - dist / radius); // Linear falloff
             this.uCurrent[idx] -= val * 0.1; //Displace current
             this.uPrev[idx] += val * 0.1; // Create velocity
          }
        }
      }
    }
  }

  update(step = 1) {
    const c2 = CONFIG.GRID.WAVE_SPEED; // wave speed squared constant
    
    // Simple 5-point stencil for Laplacian
    for (let j = 1; j < this.rows - 1; j++) {
      for (let i = 1; i < this.cols - 1; i++) {
        const idx = j * this.cols + i;
        
        const u = this.uCurrent[idx];
        const u_up = this.uCurrent[idx - this.cols];
        const u_down = this.uCurrent[idx + this.cols];
        const u_left = this.uCurrent[idx - 1];
        const u_right = this.uCurrent[idx + 1];
        
        const laplacian = (u_up + u_down + u_left + u_right - 4 * u);
        
        // Verlet-like integration for wave eq
        // u_next = 2*u - u_prev + damping*(u - u_prev) + c2 * laplacian
        // Note: damping term approximates first derivative friction
        
        let val = 2 * u - this.uPrev[idx] + c2 * laplacian;
        val *= CONFIG.GRID.DAMPING; // Global energy loss
        
        this.uNext[idx] = val;
      }
    }

    // Swap buffers
    const temp = this.uPrev;
    this.uPrev = this.uCurrent;
    this.uCurrent = this.uNext;
    this.uNext = temp;
  }

  render(ctx: CanvasRenderingContext2D, step = 1) {
    // Only render visible points? For now render all, it's fast enough or culled by canvas clip
    // We visualize the grid points colored by their wave height (spectral energy)
    
    // NOTE: context transform is already applied for camera
    
    for (let j = 1; j < this.rows - 1; j+=step) {
      for (let i = 1; i < this.cols - 1; i+=step) {
        const idx = j * this.cols + i;
        const val = this.uCurrent[idx];
        
        if (Math.abs(val) > 0.1) {
          const x = i * this.cellSize;
          const y = j * this.cellSize;
          
          // Color shift based on amplitude (Doppler-like or Energy-like)
          const intensity = Math.min(1.0, Math.abs(val) / 50);
          const r = 0;
          const g = Math.floor(243 + val * 2);
          const b = 255;
          const alpha = intensity * 0.8;
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          const size = Math.min(6, 2 + intensity * 4);
          ctx.fillRect(x - size/2, y - size/2, size, size);
          
          // Draw connecting lines for strong waves? (Wireframe effect)
          if (intensity > 0.3 && step === 1) {
             ctx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
             ctx.beginPath();
             ctx.moveTo(x, y);
             ctx.lineTo(x + this.cellSize, y + (this.uCurrent[idx+1] - val) * 0.5);
             ctx.stroke();
          }
        } else {
            // Draw faint static grid
            if (i % 2 === 0 && j % 2 === 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(i * this.cellSize, j * this.cellSize, 2, 2);
            }
        }
      }
    }
  }
}
