
import { Entity } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

export interface PhysicalEntity extends Entity {
    mass?: number;
    friction?: number;
}

export const Physics = {
    integrate: (e: PhysicalEntity, dt: number) => {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
    },

    applyFriction: (e: PhysicalEntity, amount: number) => {
        e.vx *= amount;
        e.vy *= amount;
    },

    applyForce: (e: PhysicalEntity, fx: number, fy: number, dt: number = 1.0) => {
        const mass = e.mass || 1.0;
        e.vx += (fx / mass) * dt;
        e.vy += (fy / mass) * dt;
    },

    applyImpulse: (e: PhysicalEntity, ix: number, iy: number) => {
        const mass = e.mass || 1.0;
        e.vx += ix / mass;
        e.vy += iy / mass;
    },

    checkCircleCollision: (e1: Entity, r1: number, e2: Entity, r2: number): boolean => {
        const dx = e1.x - e2.x;
        const dy = e1.y - e2.y;
        const distSq = dx * dx + dy * dy;
        const radSum = r1 + r2;
        return distSq < radSum * radSum;
    },

    resolveElasticCollision: (e1: PhysicalEntity, r1: number, e2: PhysicalEntity, r2: number, elasticity: number = CONFIG.PHYSICS.COLLISION_ELASTICITY) => {
        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const distSq = dx * dx + dy * dy;

        if (distSq === 0) return; // Prevent divide by zero

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        // Relative velocity
        const rvx = e2.vx - e1.vx;
        const rvy = e2.vy - e1.vy;

        // Velocity along normal
        const velAlongNormal = rvx * nx + rvy * ny;

        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) return;

        const m1 = e1.mass || 1.0;
        const m2 = e2.mass || 1.0;

        // Impulse scalar
        let j = -(1 + elasticity) * velAlongNormal;
        j /= (1 / m1 + 1 / m2);

        // Apply impulse
        const ix = j * nx;
        const iy = j * ny;

        e1.vx -= ix / m1;
        e1.vy -= iy / m1;
        e2.vx += ix / m2;
        e2.vy += iy / m2;

        // Positional Correction (to prevent sinking)
        const penetration = (r1 + r2) - dist;
        if (penetration > 0) {
            const percent = 0.2; // Penetration percentage to correct
            const slop = 0.01; // Penetration allowance
            const correction = Math.max(penetration - slop, 0) / (1/m1 + 1/m2) * percent;

            const cx = nx * correction;
            const cy = ny * correction;

            e1.x -= cx * (1/m1);
            e1.y -= cy * (1/m1);
            e2.x += cx * (1/m2);
            e2.y += cy * (1/m2);
        }
    },

    // Helper to get overlap vector
    getOverlap: (e1: Entity, r1: number, e2: Entity, r2: number): { dx: number, dy: number, len: number } | null => {
        const dx = e1.x - e2.x;
        const dy = e1.y - e2.y;
        const distSq = dx * dx + dy * dy;
        const radSum = r1 + r2;
        if (distSq < radSum * radSum) {
            return { dx, dy, len: Math.sqrt(distSq) };
        }
        return null;
    }
};
