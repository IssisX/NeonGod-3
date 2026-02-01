
export const Factories = {
  bullet: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, color: '', dmg: 0, pierce: 0, homing: 0, size: 3, trail: [], isBeam: false, beamPoints: [], elemental: { fire: 0, ice: 0, volt: 0 }, active: false }),
  resetBullet: (b: any) => { b.id = ''; b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.life = 0; b.color = ''; b.dmg = 0; b.pierce = 0; b.homing = 0; b.size = 3; b.trail = []; b.isBeam = false; b.beamPoints = []; b.elemental = { fire: 0, ice: 0, volt: 0 }; b.active = false; },
  
  enemy: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, type: 'chaser', speed: 0, size: 0, color: '', isElite: false, xp: 0, score: 0, shootTimer: 0, attackTimer: 0, phase: 0, dead: false, active: false, life: 0, hitFlash: 0, rotation: 0, sides: 0, status: [], history: [], trail: [] }),
  resetEnemy: (e: any) => { e.id = ''; e.x = 0; e.y = 0; e.vx = 0; e.vy = 0; e.hp = 0; e.maxHp = 0; e.type = 'chaser'; e.speed = 0; e.size = 0; e.color = ''; e.isElite = false; e.xp = 0; e.score = 0; e.shootTimer = 0; e.attackTimer = 0; e.phase = 0; e.dead = false; e.active = false; e.life = 0; e.hitFlash = 0; e.rotation = 0; e.sides = 0; e.status = []; e.history = []; e.trail = []; e.invulnerable = false; e.parentId = undefined; },
  
  particle: () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, friction: 0.92, type: 'spark', active: false, rotation: 0, rv: 0, sides: 3 }),
  resetParticle: (p: any) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; p.maxLife = 0; p.color = ''; p.size = 0; p.friction = 0.92; p.type = 'spark'; p.active = false; p.rotation = 0; p.rv = 0; p.sides = 3; p.targetX = undefined; p.targetY = undefined; },
  
  gem: () => ({ x: 0, y: 0, vx: 0, vy: 0, val: 0, life: 0, active: false }),
  resetGem: (g: any) => { g.x = 0; g.y = 0; g.vx = 0; g.vy = 0; g.val = 0; g.life = 0; g.active = false; },
  
  pickup: () => ({ x: 0, y: 0, vx: 0, vy: 0, type: 'heal', life: 0, active: false }),
  resetPickup: (p: any) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.type = 'heal'; p.life = 0; p.active = false; },

  debris: () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, size: 0, color: '#555', rotation: 0, vRot: 0, sides: 0, health: 0, active: false }),
  resetDebris: (d: any) => { d.id = ''; d.x = 0; d.y = 0; d.vx = 0; d.vy = 0; d.size = 0; d.color = '#555'; d.rotation = 0; d.vRot = 0; d.sides = 0; d.health = 0; d.active = false; }
};

export class ObjectPool<T> {
    factory: () => T;
    reset: (obj: T) => void;
    max: number;
    available: T[];
    active: Set<T>;

    constructor(factory: () => T, reset: (obj: T) => void, initial = 50, max = 200) {
        this.factory = factory; this.reset = reset; this.max = max;
        this.available = []; this.active = new Set();
        for (let i = 0; i < initial; i++) this.available.push(factory());
    }
    acquire(): T | null {
        let obj;
        if (this.available.length > 0) obj = this.available.pop();
        else if (this.active.size < this.max) obj = this.factory();
        else return null;
        if (obj) this.active.add(obj);
        return obj || null;
    }
    release(obj: T) {
        if (!this.active.has(obj)) return;
        this.active.delete(obj);
        this.reset(obj);
        this.available.push(obj);
    }
}
