
import { GameState, Enemy } from '../types';
import { Utils } from '../utils';
import { CONFIG } from '../constants';

// --- MATH & CURVES ---
export const Curves = {
    Linear: (x: number) => x,
    Inverse: (x: number) => 1 - x,
    Logistic: (x: number, k=10, m=0.5) => 1 / (1 + Math.exp(-k * (x - m))),
    Quadratic: (x: number) => x * x,
    Step: (x: number, thresh=0.5) => x > thresh ? 1 : 0,
};

// --- CONSIDERATION ---
// Evaluates a specific aspect of the world state and returns a normalized score (0-1)
export abstract class Consideration {
    abstract score(state: GameState, entity: Enemy): number;
}

export class DistanceToPlayer extends Consideration {
    constructor(public curve = Curves.Linear, public maxDist = 800) { super(); }
    score(state: GameState, entity: Enemy): number {
        const d = Utils.dist(entity.x, entity.y, state.player.x, state.player.y);
        return this.curve(Math.min(1, Math.max(0, d / this.maxDist)));
    }
}

export class HealthPercent extends Consideration {
    constructor(public curve = Curves.Linear) { super(); }
    score(state: GameState, entity: Enemy): number {
        return this.curve(entity.hp / entity.maxHp);
    }
}

export class IsElite extends Consideration {
    score(state: GameState, entity: Enemy): number { return entity.isElite ? 1 : 0; }
}

export class CooldownReady extends Consideration {
    constructor(public type: 'attack' | 'shoot') { super(); }
    score(state: GameState, entity: Enemy): number {
        const t = this.type === 'attack' ? entity.attackTimer : entity.shootTimer;
        return t <= 0 ? 1 : 0;
    }
}

// --- ACTION ---
// Performs an operation on the entity (sets forces, changes state)
export abstract class Action {
    constructor(public name: string, public weight: number = 1.0) {}
    considerations: Consideration[] = [];

    add(c: Consideration) { this.considerations.push(c); return this; }

    evaluate(state: GameState, entity: Enemy): number {
        if (this.considerations.length === 0) return this.weight;
        let score = 1.0;
        // Multiplicative scoring (fuzzy AND)
        for(const c of this.considerations) {
            score *= c.score(state, entity);
        }
        return score * this.weight;
    }

    abstract execute(state: GameState, entity: Enemy): { fx: number, fy: number };
}

// --- CONCRETE ACTIONS ---

export class IdleAction extends Action {
    execute(state: GameState, entity: Enemy) { return { fx: 0, fy: 0 }; }
}

export class ChaseAction extends Action {
    execute(state: GameState, entity: Enemy) {
        const p = state.player;
        const e = entity;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) return { fx: 0, fy: 0 };
        return { fx: (dx/d) * e.speed, fy: (dy/d) * e.speed };
    }
}

export class FleeAction extends Action {
    execute(state: GameState, entity: Enemy) {
        const p = state.player;
        const e = entity;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) return { fx: Math.random(), fy: Math.random() };
        return { fx: (dx/d) * e.speed * 1.5, fy: (dy/d) * e.speed * 1.5 };
    }
}

export class FlockingAction extends Action {
    execute(state: GameState, entity: Enemy) {
        const e = entity;
        const s = state;
        const p = s.player;

        // Use SpatialGrid for neighbors
        const radius = CONFIG.BOIDS.SEPARATION_RADIUS * 2;
        const neighbors = s.spatialGrid.queryRadius(e.x, e.y, radius);

        let sepX = 0, sepY = 0;
        let aliX = 0, aliY = 0;
        let cohX = 0, cohY = 0;
        let count = 0;

        for (const n of neighbors) {
            if (n === e || (n as any) === p) continue; // Ignore self and player
            const ne = n as Enemy;
            if (!ne.active || ne.dead) continue;

            const dx = e.x - ne.x;
            const dy = e.y - ne.y;
            const d = Math.hypot(dx, dy);

            if (d < 0.1) continue;

            // Separation
            if (d < CONFIG.BOIDS.SEPARATION_RADIUS) {
                const force = (CONFIG.BOIDS.SEPARATION_RADIUS - d) / d;
                sepX += dx * force;
                sepY += dy * force;
            }

            // Alignment
            if (d < CONFIG.BOIDS.ALIGNMENT_RADIUS) {
                aliX += ne.vx;
                aliY += ne.vy;
            }

            // Cohesion
            if (d < CONFIG.BOIDS.COHESION_RADIUS) {
                cohX += ne.x;
                cohY += ne.y;
            }

            count++;
        }

        let fx = 0, fy = 0;

        if (count > 0) {
            // Separation
            fx += sepX * CONFIG.BOIDS.SEPARATION_WEIGHT;
            fy += sepY * CONFIG.BOIDS.SEPARATION_WEIGHT;

            // Alignment
            aliX /= count; aliY /= count;
            const aliLen = Math.hypot(aliX, aliY);
            if (aliLen > 0) {
                 fx += (aliX / aliLen) * CONFIG.BOIDS.ALIGNMENT_WEIGHT;
                 fy += (aliY / aliLen) * CONFIG.BOIDS.ALIGNMENT_WEIGHT;
            }

            // Cohesion
            cohX /= count; cohY /= count;
            const cohDx = cohX - e.x; const cohDy = cohY - e.y;
            const cohLen = Math.hypot(cohDx, cohDy);
            if (cohLen > 0) {
                 fx += (cohDx / cohLen) * CONFIG.BOIDS.COHESION_WEIGHT;
                 fy += (cohDy / cohLen) * CONFIG.BOIDS.COHESION_WEIGHT;
            }
        }

        // Attraction to Player
        const pdx = p.x - e.x; const pdy = p.y - e.y;
        const pd = Math.hypot(pdx, pdy);
        if (pd > 0) {
            fx += (pdx / pd) * CONFIG.BOIDS.PLAYER_WEIGHT;
            fy += (pdy / pd) * CONFIG.BOIDS.PLAYER_WEIGHT;
        }

        return { fx, fy };
    }
}

export class ChargeAction extends Action {
    execute(state: GameState, entity: Enemy) {
        // Dash linearly towards player position at start of charge
        const e = entity;
        if (!e.targetX) {
             e.targetX = state.player.x;
             e.targetY = state.player.y;
        }

        const dx = (e.targetX || 0) - e.x;
        const dy = (e.targetY || 0) - e.y;
        const d = Math.hypot(dx, dy);

        if (d < 50) { // Reached target, clear
            e.targetX = undefined;
            return { fx: 0, fy: 0 };
        }

        return { fx: (dx/d) * e.speed * 3.0, fy: (dy/d) * e.speed * 3.0 };
    }
}

// --- BRAIN ---

export class Brain {
    actions: Action[] = [];

    constructor(actions: Action[] = []) {
        this.actions = actions;
    }

    think(state: GameState, entity: Enemy): { fx: number, fy: number, action: string } {
        let bestAction: Action | null = null;
        let bestScore = -Infinity;

        for (const a of this.actions) {
            const score = a.evaluate(state, entity);
            if (score > bestScore) {
                bestScore = score;
                bestAction = a;
            }
        }

        if (bestAction) {
             return { ...bestAction.execute(state, entity), action: bestAction.name };
        }

        return { fx: 0, fy: 0, action: 'idle' };
    }
}

// --- FACTORY ---

export class AIFactory {
    static createBrain(type: string): Brain {
        switch(type) {
            case 'chaser':
                return new Brain([
                    new FlockingAction("flock", 1.0)
                        .add(new DistanceToPlayer(Curves.Linear)), // Flock when far? No, always flock
                ]);
            case 'shooter':
                return new Brain([
                    new FleeAction("flee", 1.5)
                        .add(new DistanceToPlayer(Curves.Inverse, 400)), // Flee if close
                    new ChaseAction("seek", 1.0)
                        .add(new DistanceToPlayer(Curves.Linear, 800)), // Seek if far
                ]);
            case 'dasher':
                return new Brain([
                    new ChargeAction("charge", 2.0)
                        .add(new DistanceToPlayer(Curves.Inverse, 300)), // Charge when close
                    new ChaseAction("stalk", 1.0)
                        .add(new DistanceToPlayer(Curves.Linear)),
                ]);
            default:
                return new Brain([new ChaseAction("seek")]);
        }
    }
}
