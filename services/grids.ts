
import { Entity } from '../types';
import { CONFIG } from '../constants';

export class SpatialGrid {
  cellSize: number;
  cellSizeInv: number;
  cells: Map<string, Entity[]>;
  results: Entity[];

  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.cellSizeInv = 1 / cellSize;
    this.cells = new Map();
    this.results = [];
  }
  
  clear() { this.cells.clear(); }
  
  insert(entity: Entity) {
    const key = `${Math.floor(entity.x * this.cellSizeInv)},${Math.floor(entity.y * this.cellSizeInv)}`;
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(entity);
  }
  
  queryRadius(x: number, y: number, radius: number) {
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
