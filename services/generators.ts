
import { GameState, BossModule, Enemy, GameCallbacks } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// --- GEOMETRY CONSTANTS ---

const SHAPES = {
    CORE: [
        [-20, -20, 20, -20, 20, 20, -20, 20], // Box
        [-20, -30, 20, -30, 30, 0, 20, 30, -20, 30, -30, 0], // Hex
        [0, -30, 25, 20, 0, 40, -25, 20] // Diamond
    ],
    WING: [
        [0, 0, 40, -20, 50, 10, 20, 30], // Swept
        [0, -10, 30, -30, 30, 30, 0, 10], // Broad
        [0, 0, 60, -10, 40, 20] // Needle
    ],
    TURRET: [
        [-8, -8, 8, -8, 8, 8, -8, 8], // Box Turret
        [0, -15, 10, 10, -10, 10], // Triangle Turret
        [-5, -10, 5, -10, 5, 10, -5, 10] // Railgun mount
    ],
    SHIELD: [
        [-10, -30, 10, -30, 20, 0, 10, 30, -10, 30], // Plate
        [0, -40, 15, -20, 15, 20, 0, 40] // Curved
    ]
};

function getShape(type: keyof typeof SHAPES, variant: number): number[] {
    const list = SHAPES[type];
    return list[Math.abs(Math.floor(variant)) % list.length];
}

// --- BOSS ARCHITECT ENGINE ---

type Archetype = 'BULWARK' | 'VECTOR' | 'HIVE';

interface Blueprint {
    name: string;
    coreShape: number;
    color: string;
    modules: BossModule[];
    stats: { hpMult: number; speedMult: number; massMult: number };
}

// Deterministic RNG for consistent boss generation per seed
class SeededRNG {
    seed: number;
    constructor(seed: number) { this.seed = seed; }
    next() {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }
    range(min: number, max: number) { return min + this.next() * (max - min); }
    int(min: number, max: number) { return Math.floor(this.range(min, max)); }
    pick<T>(arr: T[]): T { return arr[this.int(0, arr.length)]; }
}

function constructBulwark(rng: SeededRNG, wave: number): Blueprint {
    // TANKY, SLOW, SHIELDED
    const modules: BossModule[] = [];
    const coreSize = 60 + wave * 2;
    
    // Core
    modules.push({
        xOffset: 0, yOffset: 0, type: 'CORE', size: coreSize, color: '#ffffff',
        rotation: 0, health: 1, maxHealth: 1, shape: getShape('CORE', 0)
    });

    // Heavy Plating (Symmetrical)
    const plates = rng.int(2, 5);
    for(let i=0; i<plates; i++) {
        const angle = (Math.PI * 2 / plates) * i;
        const dist = coreSize * 0.9;
        modules.push({
            xOffset: Math.cos(angle) * dist, yOffset: Math.sin(angle) * dist,
            type: 'SHIELD', size: 1, color: '#ff8800', rotation: angle + Math.PI/2,
            health: 200 * wave, maxHealth: 200 * wave, shape: getShape('SHIELD', 0)
        });
    }

    // Heavy Turrets
    const turrets = rng.int(2, 4);
    for(let i=0; i<turrets; i++) {
        const angle = (Math.PI * 2 / turrets) * i + (Math.PI / plates); // Offset from plates
        const dist = coreSize * 0.7;
        modules.push({
            xOffset: Math.cos(angle) * dist, yOffset: Math.sin(angle) * dist,
            type: 'TURRET', size: 1, color: '#ff0000', rotation: angle,
            health: 150 * wave, maxHealth: 150 * wave, shape: getShape('TURRET', 0)
        });
    }

    return {
        name: 'OMEGA-BULWARK',
        coreShape: 0,
        color: '#ff4400',
        modules,
        stats: { hpMult: 2.0, speedMult: 0.5, massMult: 3.0 }
    };
}

function constructVector(rng: SeededRNG, wave: number): Blueprint {
    // FAST, WINGED, AGGRESSIVE
    const modules: BossModule[] = [];
    const coreSize = 40 + wave;

    // Core
    modules.push({
        xOffset: 0, yOffset: 0, type: 'CORE', size: coreSize, color: '#ffffff',
        rotation: 0, health: 1, maxHealth: 1, shape: getShape('CORE', 2)
    });

    // Swept Wings
    const wingSets = rng.int(1, 3);
    for(let i=0; i<wingSets; i++) {
        const yOff = 30 + i * 40;
        const xOff = 40 + i * 20;
        
        // Left
        modules.push({
            xOffset: -xOff, yOffset: yOff, type: 'WING', size: 1, color: '#00ffff',
            rotation: Math.PI, health: 100 * wave, maxHealth: 100 * wave, shape: getShape('WING', 0)
        });
        // Right
        modules.push({
            xOffset: xOff, yOffset: yOff, type: 'WING', size: 1, color: '#00ffff',
            rotation: 0, health: 100 * wave, maxHealth: 100 * wave, shape: getShape('WING', 0)
        });
    }

    // Engine Pods
    modules.push({ xOffset: -20, yOffset: -30, type: 'ENGINE', size: 1, color: '#00ffff', rotation: Math.PI*1.5, health: 50*wave, maxHealth: 50*wave, shape: getShape('TURRET', 1) });
    modules.push({ xOffset: 20, yOffset: -30, type: 'ENGINE', size: 1, color: '#00ffff', rotation: Math.PI*1.5, health: 50*wave, maxHealth: 50*wave, shape: getShape('TURRET', 1) });

    return {
        name: 'STORM-VECTOR',
        coreShape: 2,
        color: '#00ccff',
        modules,
        stats: { hpMult: 0.8, speedMult: 1.5, massMult: 0.8 }
    };
}

function constructHive(rng: SeededRNG, wave: number): Blueprint {
    // SPRAWLING, MANY SMALL TURRETS
    const modules: BossModule[] = [];
    const coreSize = 70 + wave;

    // Core
    modules.push({
        xOffset: 0, yOffset: 0, type: 'CORE', size: coreSize, color: '#ffffff',
        rotation: 0, health: 1, maxHealth: 1, shape: getShape('CORE', 1)
    });

    // Radial Arms
    const arms = 6;
    for(let i=0; i<arms; i++) {
        const angle = (Math.PI * 2 / arms) * i;
        const armLen = 60 + rng.range(0, 40);
        
        // Arm Segment
        modules.push({
            xOffset: Math.cos(angle) * armLen * 0.6, 
            yOffset: Math.sin(angle) * armLen * 0.6,
            type: 'WING', size: 1, color: '#aa00ff', rotation: angle,
            health: 80 * wave, maxHealth: 80 * wave, shape: getShape('TURRET', 0)
        });

        // Tip Turret
        modules.push({
            xOffset: Math.cos(angle) * armLen, 
            yOffset: Math.sin(angle) * armLen,
            type: 'TURRET', size: 1, color: '#ff00ff', rotation: angle,
            health: 60 * wave, maxHealth: 60 * wave, shape: getShape('TURRET', 2)
        });
    }

    return {
        name: 'VOID-HIVE',
        coreShape: 1,
        color: '#9900ff',
        modules,
        stats: { hpMult: 1.2, speedMult: 0.7, massMult: 1.5 }
    };
}

export function generateBossGeometry(wave: number): { modules: BossModule[], stats: { hpMult: number, speedMult: number, massMult: number } } {
    const seed = wave * 739391 + Date.now(); // semi-random but seeded by wave mostly
    const rng = new SeededRNG(seed);
    
    const roll = rng.next();
    let blueprint: Blueprint;

    if (roll < 0.33) blueprint = constructBulwark(rng, wave);
    else if (roll < 0.66) blueprint = constructVector(rng, wave);
    else blueprint = constructHive(rng, wave);

    return {
        modules: blueprint.modules,
        stats: blueprint.stats
    };
}

// --- STANDARD GENERATORS ---

export function createExplosion(s: GameState, x: number, y: number, color: string, count: number, speed: number) {
    for(let i=0; i<count; i++) {
        const p = s.pools.particles.acquire();
        if(p) {
            p.x = x; p.y = y;
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * speed + 1;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.life = Utils.rand(20, 40); p.maxLife = p.life;
            p.color = color;
            p.size = Utils.rand(2, 5);
            p.active = true;
            s.particles.push(p);
        }
    }
}

// New: Directional Sparks for physical impacts
export function createSparks(s: GameState, x: number, y: number, dx: number, dy: number, count: number, color: string) {
    const baseAngle = Math.atan2(dy, dx);
    for(let i=0; i<count; i++) {
        const p = s.pools.particles.acquire();
        if(p) {
            p.x = x; p.y = y;
            const angle = baseAngle + (Math.random() - 0.5); // 1 radian spread
            const spd = Utils.rand(3, 8);
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.life = Utils.rand(10, 20); p.maxLife = p.life;
            p.color = color;
            p.size = Utils.rand(1, 3);
            p.type = 'spark';
            p.active = true;
            s.particles.push(p);
        }
    }
}

export function createShockwave(s: GameState, x: number, y: number, size: number, color: string, speed: number) {
    s.shockwaves.push({ x, y, size: 10, maxSize: size, color, speed, alpha: 1.0, width: 2 });
    if(s.visualGrid) s.visualGrid.applyForce(x, y, size, 80);
}

export function createFloatingText(s: GameState, x: number, y: number, text: string, color: string, size: number, isCrit: boolean = false) {
    // Physics-based ejection
    const angle = -Math.PI/2 + (Math.random() - 0.5); // Upward cone
    const speed = isCrit ? Utils.rand(6, 9) : Utils.rand(3, 6);
    
    s.texts.push({ 
        x, y, 
        vx: Math.cos(angle) * speed, 
        vy: Math.sin(angle) * speed, 
        text, 
        life: 60, 
        maxLife: 60,
        color, 
        size: isCrit ? size * 1.5 : size,
        isCrit,
        opacity: 1.0
    });
}

export function createAsteroid(s: GameState, x: number, y: number, size: number) {
    const d = s.pools.debris.acquire();
    if(d) {
        d.id = Utils.uid('ast');
        d.x = x; d.y = y;
        d.vx = (Math.random() - 0.5) * 0.5;
        d.vy = (Math.random() - 0.5) * 0.5;
        d.size = size;
        d.type = 'asteroid'; // Type assignment
        d.color = '#556677';
        d.rotation = Math.random() * Math.PI * 2;
        d.vRot = (Math.random() - 0.5) * 0.02;
        d.sides = Math.floor(Utils.rand(5, 9));
        d.health = size * 5;
        d.mass = size * 0.5; // Physics mass
        d.friction = 0.99;
        d.active = true;
        s.debris.push(d);
    }
}

export function createShipDebris(s: GameState, x: number, y: number, color: string, size: number, ivx: number, ivy: number) {
    const d = s.pools.debris.acquire();
    if(d) {
        d.id = Utils.uid('scr');
        d.x = x; d.y = y;
        // Inherit velocity + explosion force
        const angle = Math.random() * Math.PI * 2;
        const force = Utils.rand(1, 3);
        d.vx = ivx * 0.5 + Math.cos(angle) * force;
        d.vy = ivy * 0.5 + Math.sin(angle) * force;
        d.size = size;
        d.type = 'scrap'; // Type assignment
        d.color = color;
        d.rotation = Math.random() * Math.PI * 2;
        d.vRot = (Math.random() - 0.5) * 0.2;
        d.sides = Math.floor(Utils.rand(3, 5));
        d.health = size * 2;
        d.mass = size * 0.2;
        d.friction = 0.98;
        d.active = true;
        s.debris.push(d);
    }
}

export function setupEnemy(s: GameState, e: Enemy, type: string, x: number, y: number) {
    const conf = CONFIG.ENEMIES[type];
    if (!conf) return;

    e.id = Utils.uid('e'); e.x = x; e.y = y;
    e.type = type.toLowerCase(); 
    
    // Scaling
    e.hp = conf.hp + (s.wave * conf.hpScale); e.maxHp = e.hp;
    e.speed = conf.speed + (s.wave * conf.speedScale); 
    e.size = conf.size; e.color = conf.color; 
    e.xp = conf.xp; e.score = conf.score; e.sides = conf.sides; e.mass = conf.mass || 1.0;
    
    e.behavior = conf.behavior;
    e.active = true; e.trail = []; e.state = 'idle'; e.stateTimer = 0; 
    e.squadId = undefined; e.squadRole = undefined;
    e.modules = undefined;

    const isElite = Math.random() < Math.min(CONFIG.ELITE.MAX_CHANCE, CONFIG.ELITE.CHANCE_PER_WAVE * s.wave);
    if (isElite && !type.startsWith('BOSS')) {
        e.isElite = true; 
        e.hp *= CONFIG.ELITE.HP_MULT; e.maxHp = e.hp; 
        e.speed *= CONFIG.ELITE.SPEED_MULT; 
        e.size *= CONFIG.ELITE.SIZE_MULT; 
        e.xp *= CONFIG.ELITE.XP_MULT; 
        e.score *= CONFIG.ELITE.SCORE_MULT; 
        e.mass *= 2.0; e.color = CONFIG.ELITE.COLOR;
        e.status.push({ type: 'BURN', duration: 0, power: 0, timer: 0 }); // Visual marker
    } else {
        e.isElite = false;
    }

    // PROCEDURAL BOSS INJECTION
    if (type.startsWith('BOSS')) {
        const gen = generateBossGeometry(s.wave);
        e.modules = gen.modules;
        
        // Apply Archetype Stats
        e.hp *= gen.stats.hpMult;
        e.maxHp = e.hp;
        e.speed *= gen.stats.speedMult;
        e.mass = 5000 * gen.stats.massMult;
        e.size = 80; // Collision approximation
        e.color = e.modules[0].color; // Core color
    }

    s.enemies.push(e);

    if (type === 'SNAKE_HEAD') {
        let parentId = e.id;
        for(let k=1; k<=5; k++) {
             const body = s.pools.enemies.acquire();
             if(body) {
                 const bConf = CONFIG.ENEMIES.SNAKE_BODY;
                 body.id = Utils.uid('sb'); body.x = x; body.y = y; 
                 body.type = 'snake_body'; 
                 body.hp = bConf.hp + (s.wave * bConf.hpScale); body.maxHp = body.hp; 
                 body.size = bConf.size; body.color = bConf.color; 
                 body.xp = bConf.xp; body.score = bConf.score; 
                 body.parentId = parentId; body.segmentIndex = k; 
                 body.active = true; body.mass = bConf.mass;
                 s.enemies.push(body);
             }
        }
    }
}

export function spawnBoss(s: GameState, callbacks: GameCallbacks) {
    if (s.bossActive) return;
    s.bossActive = true;
    callbacks.onBossSpawn();
    callbacks.playSound('spawn');
    
    // Spawn in world coordinates relative to player but with margin
    const ang = Math.random() * Math.PI * 2;
    const dist = 700; 
    const bx = Utils.clamp(s.player.x + Math.cos(ang) * dist, 200, s.worldWidth - 200);
    const by = Utils.clamp(s.player.y + Math.sin(ang) * dist, 200, s.worldHeight - 200);
    
    // Initialize Arena
    s.arena.active = true;
    s.arena.x = bx;
    s.arena.y = by;
    s.arena.radius = 900;
    s.arena.alpha = 0; // Will fade in

    const e = s.pools.enemies.acquire();
    if(e) {
        let type = 'BOSS_WARLORD'; // Base template, overridden by generateBossGeometry
        setupEnemy(s, e, type, bx, by);
        
        // Clear weak enemies around boss spawn
        for(let i = s.enemies.length - 1; i >= 0; i--) {
            if(s.enemies[i] !== e && Utils.dist(bx, by, s.enemies[i].x, s.enemies[i].y) < 900) {
                s.enemies[i].dead = true;
                createExplosion(s, s.enemies[i].x, s.enemies[i].y, '#ff0000', 5, 1);
            }
        }
    }
}

export function createEvolutionEffect(s: GameState, x: number, y: number, color: string) {
    createShockwave(s, x, y, 500, color, 15);
    createExplosion(s, x, y, color, 50, 8);
    createFloatingText(s, x, y - 50, "EVOLUTION", color, 24);
}
