
import { GameState, BossModule, Enemy, GameCallbacks } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// --- PROCEDURAL BOSS GENERATION ---

const SHAPES = {
    CORE: [
        [-20, -20, 20, -20, 20, 20, -20, 20], // Square
        [-20, -30, 20, -30, 30, 0, 20, 30, -20, 30, -30, 0], // Hex
        [0, -30, 25, 20, 0, 40, -25, 20] // Diamond-ish
    ],
    WING: [
        [0, -10, 40, -30, 50, 0, 40, 20, 0, 10], // Swept Wing
        [0, -20, 30, -20, 40, -10, 40, 10, 30, 20, 0, 20], // Block Wing
        [0, 0, 30, -40, 60, -20, 20, 10] // Spiked Wing
    ],
    TURRET: [
        [-5, -10, 5, -10, 8, 0, 5, 10, -5, 10, -8, 0], // Hex Turret
        [-8, -8, 8, -8, 8, 8, -8, 8], // Box
        [0, -15, 10, 10, -10, 10] // Triangle
    ],
    SPIKE: [
        [0, -5, 40, 0, 0, 5], // Long Spike
        [0, -10, 20, -5, 30, 0, 20, 5, 0, 10] // Blade
    ]
};

function getShape(type: keyof typeof SHAPES, variant: number): number[] {
    const list = SHAPES[type];
    return list[variant % list.length];
}

export function generateBossGeometry(wave: number): BossModule[] {
    const modules: BossModule[] = [];
    const seed = wave * 9377;
    const rnd = (i: number) => {
        const x = Math.sin(seed + i) * 10000;
        return x - Math.floor(x);
    };

    // Determine Archetype
    // Unused for now, but seed sets the stage
    
    // 1. CORE
    const coreVariant = Math.floor(rnd(1) * 3);
    const coreSize = 50 + (wave * 2);
    modules.push({
        xOffset: 0,
        yOffset: 0,
        type: 'CORE',
        size: coreSize,
        color: '#ffffff',
        rotation: 0,
        health: 200 * wave,
        maxHealth: 200 * wave,
        shape: getShape('CORE', coreVariant)
    });

    // 2. PRIMARY WINGS
    const wingCount = 1 + Math.floor(rnd(2) * 2);
    for(let i=0; i<wingCount; i++) {
        const variant = Math.floor(rnd(3+i) * 3);
        const yOff = (i === 0) ? 0 : (i % 2 === 0 ? 30 : -30);
        const xOff = 30 + rnd(4+i) * 20;
        const color = wave % 2 === 0 ? '#ff0055' : '#9900ff';
        
        // Left
        modules.push({
            xOffset: -xOff,
            yOffset: yOff,
            type: 'WING',
            size: 1,
            color: color,
            rotation: Math.PI, // Flip for left side
            health: 100 * wave,
            maxHealth: 100 * wave,
            shape: getShape('WING', variant)
        });
        
        // Right
        modules.push({
            xOffset: xOff,
            yOffset: yOff,
            type: 'WING',
            size: 1,
            color: color,
            rotation: 0,
            health: 100 * wave,
            maxHealth: 100 * wave,
            shape: getShape('WING', variant)
        });
    }

    // 3. WEAPON HARDPOINTS
    const weaponCount = 2 + Math.floor(wave / 2);
    for(let i=0; i<weaponCount; i++) {
        const isSpike = rnd(10+i) > 0.6;
        const type = isSpike ? 'SPIKE' : 'TURRET';
        const variant = Math.floor(rnd(11+i) * 2);
        
        // Distribute around core
        const angle = (Math.PI * 2 * i) / weaponCount;
        const dist = coreSize * 0.8 + rnd(12+i) * 30;
        
        modules.push({
            xOffset: Math.cos(angle) * dist,
            yOffset: Math.sin(angle) * dist,
            type: type,
            size: 1,
            color: isSpike ? '#ffaa00' : '#00ffff',
            rotation: angle,
            health: 50 * wave,
            maxHealth: 50 * wave,
            shape: getShape(type, variant)
        });
    }

    return modules;
}

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

export function createShockwave(s: GameState, x: number, y: number, size: number, color: string, speed: number) {
    s.shockwaves.push({ x, y, size: 10, maxSize: size, color, speed, alpha: 1.0, width: 2 });
    if(s.visualGrid) s.visualGrid.applyForce(x, y, size, 80);
}

export function createFloatingText(s: GameState, x: number, y: number, text: string, color: string, size: number) {
    s.texts.push({ x, y, vx: (Math.random()-0.5)*2, vy: -2, text, life: 60, color, size });
}

export function setupEnemy(s: GameState, e: Enemy, type: string, x: number, y: number) {
    const conf = CONFIG.ENEMIES[type];
    if (!conf) return;

    e.id = Utils.uid('e'); e.x = x; e.y = y;
    e.type = type.toLowerCase(); 
    e.hp = conf.hp + (s.wave * conf.hpScale); e.maxHp = e.hp;
    e.speed = conf.speed + (s.wave * conf.speedScale); 
    e.size = conf.size; e.color = conf.color; 
    e.xp = conf.xp; e.score = conf.score; e.sides = conf.sides; e.mass = conf.mass || 1.0;
    e.active = true; e.trail = []; e.state = 'idle'; e.stateTimer = 0; e.squadId = undefined; e.squadRole = undefined;
    e.modules = undefined;

    const isElite = Math.random() < Math.min(CONFIG.ELITE.MAX_CHANCE, CONFIG.ELITE.CHANCE_PER_WAVE * s.wave);
    if (isElite && !type.startsWith('BOSS')) {
        e.isElite = true; e.hp *= CONFIG.ELITE.HP_MULT; e.maxHp = e.hp; e.speed *= CONFIG.ELITE.SPEED_MULT; e.size *= CONFIG.ELITE.SIZE_MULT; e.xp *= CONFIG.ELITE.XP_MULT; e.score *= CONFIG.ELITE.SCORE_MULT; e.mass *= 2.0; e.color = CONFIG.ELITE.COLOR;
        e.status.push({ type: 'BURN', duration: 0, power: 0, timer: 0 }); 
    } else {
        e.isElite = false;
    }

    // Procedural Boss Injection
    if (type.startsWith('BOSS')) {
        e.modules = generateBossGeometry(s.wave);
        e.mass = 5000;
        e.size = 80; // Hitbox approximation
    }

    s.enemies.push(e);

    if (type === 'SNAKE_HEAD') {
        let parentId = e.id;
        for(let k=1; k<=5; k++) {
             const body = s.pools.enemies.acquire();
             if(body) {
                 const bConf = CONFIG.ENEMIES.SNAKE_BODY;
                 body.id = Utils.uid('sb'); body.x = x; body.y = y; body.type = 'snake_body'; body.hp = bConf.hp + (s.wave * bConf.hpScale); body.maxHp = body.hp; body.size = bConf.size; body.color = bConf.color; body.xp = bConf.xp; body.score = bConf.score; body.parentId = parentId; body.segmentIndex = k; body.active = true; body.mass = bConf.mass;
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
    const dist = 600; // Fixed distance from player
    const bx = Utils.clamp(s.player.x + Math.cos(ang) * dist, 100, s.worldWidth - 100);
    const by = Utils.clamp(s.player.y + Math.sin(ang) * dist, 100, s.worldHeight - 100);
    
    const e = s.pools.enemies.acquire();
    if(e) {
        let type = 'BOSS_WARLORD'; // We now use procedural gen, so type is just a base stats template
        setupEnemy(s, e, type, bx, by);
        
        // Clear weak enemies
        for(let i = s.enemies.length - 1; i >= 0; i--) {
            if(s.enemies[i].type === 'chaser' || s.enemies[i].type === 'shooter') {
                if(Math.random() < 0.5) {
                    s.enemies[i].dead = true;
                    createExplosion(s, s.enemies[i].x, s.enemies[i].y, '#ff0000', 5, 1);
                }
            }
        }
    }
}

export function createEvolutionEffect(s: GameState, x: number, y: number, color: string) {
    createShockwave(s, x, y, 500, color, 15);
    createExplosion(s, x, y, color, 50, 8);
    // Add some text
    createFloatingText(s, x, y - 50, "EVOLUTION", color, 24);
}
