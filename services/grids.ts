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

interface GridPoint { x: number; y: number; ox: number; oy: number; vx: number; vy: number; }

export class VisualGrid {
  cellSize: number;
  points: GridPoint[];

  constructor(width: number, height: number, cellSize = 40) {
    this.cellSize = cellSize;
    this.points = [];
    this.rebuild(width, height);
  }

  rebuild(width: number, height: number) {
    this.points = [];
    const padding = this.cellSize;
    for (let x = -padding; x <= width + padding; x += this.cellSize) {
      for (let y = -padding; y <= height + padding; y += this.cellSize) {
        this.points.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
      }
    }
  }

  applyForce(x: number, y: number, radius: number, strength: number) {
    const radiusSq = radius * radius;
    for (const p of this.points) {
      const dx = p.x - x, dy = p.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < radiusSq && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const factor = (1 - dist / radius) * strength;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * factor;
        p.vy += Math.sin(angle) * factor;
      }
    }
  }

  update(step = 1) {
    for (let i = 0; i < this.points.length; i += step) {
      const p = this.points[i];
      const dx = p.x - p.ox, dy = p.y - p.oy;
      const distSq = dx * dx + dy * dy;
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const force = dist * CONFIG.GRID.SPRING_CONSTANT;
        const angle = Math.atan2(dy, dx);
        p.vx -= Math.cos(angle) * force;
        p.vy -= Math.sin(angle) * force;
      }
      p.vx *= CONFIG.GRID.FORCE_DECAY;
      p.vy *= CONFIG.GRID.FORCE_DECAY;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  render(ctx: CanvasRenderingContext2D, step = 2) {
    for (let i = 0; i < this.points.length; i += step) {
      const p = this.points[i];
      const displacement = Math.sqrt((p.x - p.ox) ** 2 + (p.y - p.oy) ** 2);
      if (displacement > 0.5) {
        const alpha = Math.min(0.8, displacement / 15);
        ctx.fillStyle = `rgba(0, 243, 255, ${alpha})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
  }
}