
import { Entity, GameState } from '../types';
import { Utils } from '../utils';
import { CONFIG } from '../constants';

export const Verlet = {
    // Basic Verlet Integration
    update: (e: Entity, timeScale: number) => {
        // e.x = e.x + (e.x - e.prevX) + fx * dt^2
        // For simplicity in this engine, we use Velocity-Verlet approximation
        // v += a * dt; x += v * dt;
        // This is handled by the main physics loop in systems.ts.
        // This module focuses on CONSTRAINTS.
    },

    // Distance Constraint (Standard - Bi-directional)
    resolveDistance: (e1: Entity, e2: Entity, targetDist: number, stiffness = 0.5) => {
        const dx = e1.x - e2.x;
        const dy = e1.y - e2.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist === 0) return;

        const diff = (dist - targetDist) / dist;
        const correction = diff * stiffness;

        const offsetX = dx * correction * 0.5;
        const offsetY = dy * correction * 0.5;

        e1.x -= offsetX;
        e1.y -= offsetY;
        e2.x += offsetX;
        e2.y += offsetY;
    },

    // Distance Constraint (One-Way - e1 is Anchor/Heavy)
    resolveDistanceOneWay: (anchor: Entity, child: Entity, targetDist: number, stiffness = 1.0) => {
        const dx = anchor.x - child.x;
        const dy = anchor.y - child.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist === 0) return;

        const diff = (dist - targetDist) / dist;
        const correction = diff * stiffness;

        // Move ONLY the child towards/away from anchor
        child.x += dx * correction;
        child.y += dy * correction;
    }
};
