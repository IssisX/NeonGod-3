
import { GameState, Player, Enemy, Gem, Pickup, UpgradeOption, RunData, SoundType, Particle, HullType, StatusEffect, BlackHole, WaveType, Bullet, Debris, Star, ShieldRipple, BossModule } from '../types';
import { CONFIG, UPGRADES } from '../constants';
import { Utils } from '../utils';
import { SpatialGrid, VisualGrid } from './grids';
import { Factories, ObjectPool } from './pools';

export interface GameCallbacks {
    onLevelUp: (options: UpgradeOption[]) => void;
    onGameOver: (runData: RunData) => void;
    onBossSpawn: () => void;
    onWeaponEvolve: (name: string) => void;
    playSound: (type: SoundType) => void;
    setAudioIntensity: (val: number) => void;
    setAudioTempo: (val: number) => void;
}

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

function generateBossGeometry(wave: number): BossModule[] {
    const modules: BossModule[] = [];
    const seed = wave * 9377;
    const rnd = (i: number) => {
        const x = Math.sin(seed + i) * 10000;
        return x - Math.floor(x);
    };

    // Determine Archetype
    const archetypeRoll = rnd(0);
    const isWarlord = archetypeRoll < 0.33;
    const isHive = archetypeRoll >= 0.33 && archetypeRoll < 0.66;
    
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


// --- HELPER FUNCTIONS ---

function createExplosion(s: GameState, x: number, y: number, color: string, count: number, speed: number) {
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

function createShockwave(s: GameState, x: number, y: number, size: number, color: string, speed: number) {
    s.shockwaves.push({ x, y, size: 10, maxSize: size, color, speed, alpha: 1.0, width: 2 });
    // Coupling: Impact -> Grid
    s.visualGrid.applyForce(x, y, size, 80);
}

function createFloatingText(s: GameState, x: number, y: number, text: string, color: string, size: number) {
    s.texts.push({ x, y, vx: (Math.random()-0.5)*2, vy: -2, text, life: 60, color, size });
}

function setupEnemy(s: GameState, e: Enemy, type: string, x: number, y: number) {
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

function spawnBoss(s: GameState, callbacks: GameCallbacks) {
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

function handleEnemyDeath(s: GameState, e: Enemy, callbacks: GameCallbacks, impactVel: {x: number, y: number}) {
    if (e.dead) return;
    e.dead = true;
    e.active = false;
    
    // Score & XP
    s.score += e.score;
    s.waveKills++;
    
    // Gems
    const gemCount = Math.max(1, Math.floor(e.xp / 10));
    for(let i=0; i<gemCount; i++) {
        const g = s.pools.gems.acquire();
        if(g) {
            g.x = e.x; g.y = e.y;
            g.vx = (Math.random()-0.5) * 4 + impactVel.x * 0.2;
            g.vy = (Math.random()-0.5) * 4 + impactVel.y * 0.2;
            g.val = Math.ceil(e.xp / gemCount);
            g.life = CONFIG.GEMS.LIFETIME;
            g.active = true;
            s.gems.push(g);
        }
    }

    // Explosion
    createExplosion(s, e.x, e.y, e.color, Math.min(20, e.size), 2);
    callbacks.playSound('explosion');
    
    // Distort Grid on Death
    s.visualGrid.applyForce(e.x, e.y, e.size * 3, 40);

    // Combo
    s.combo++;
    s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION;
    s.overdrive = Math.min(100, s.overdrive + (e.isElite ? 5 : 1));

    // Screen Shake
    s.shake += e.mass > 10 ? 5 : 1;
    
    // Boss Death
    if (e.type.startsWith('boss')) {
        s.bossActive = false;
        s.screenFlash = 1.0;
        s.flashColor = '#ffffff';
        s.wave++;
        s.waveQuota = Math.floor(s.waveQuota * CONFIG.SPAWNING.QUOTA_MULTIPLIER);
        // Clear all enemies
        for(const other of s.enemies) {
            if (other.active && !other.type.startsWith('boss')) {
                other.hp = 0;
                other.dead = true;
                createExplosion(s, other.x, other.y, other.color, 5, 1);
            }
        }
    }
}

function calculateAutoPilot(s: GameState) {
    const p = s.player;
    let mx = 0, my = 0, shoot = false, dash = false, ult = false, q = false, e_skill = false;
    
    // Find nearest enemy
    let nearest = null;
    let minDist = 10000;
    for(const e of s.enemies) {
        if(!e.active) continue;
        const d = Utils.dist(p.x, p.y, e.x, e.y);
        if(d < minDist) { minDist = d; nearest = e; }
    }
    
    // Avoidance (Boids separation from enemies)
    let sepX = 0, sepY = 0;
    let count = 0;
    for(const e of s.enemies) {
        if(!e.active) continue;
        const d = Utils.dist(p.x, p.y, e.x, e.y);
        if(d < 150) {
            sepX += (p.x - e.x) / d;
            sepY += (p.y - e.y) / d;
            count++;
        }
    }
    
    // Gem collection attraction
    let gemX = 0, gemY = 0;
    let gemCount = 0;
    for(const g of s.gems) {
        if(!g.active) continue;
        const d = Utils.dist(p.x, p.y, g.x, g.y);
        if (d < 300) {
            gemX += (g.x - p.x);
            gemY += (g.y - p.y);
            gemCount++;
        }
    }

    if (count > 0) {
        mx = sepX; my = sepY;
        if (minDist < 80) dash = true;
        shoot = true;
    } else if (gemCount > 0) {
        mx = gemX; my = gemY;
    } else {
        // Center bias (World Center)
        mx = (s.worldWidth/2 - p.x);
        my = (s.worldHeight/2 - p.y);
    }
    
    // Normalize move
    const len = Math.hypot(mx, my);
    if(len > 0) { mx/=len; my/=len; }
    
    // Aim at nearest
    let aimAngle = 0;
    if (nearest) {
        aimAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        shoot = true;
    } else {
        aimAngle = Math.atan2(my, mx);
    }

    // Logic for skills
    if (count > 5) e_skill = true;
    if (minDist < 100 && count > 3) q = true;
    if (s.enemies.length > 20) ult = true;

    return { mx, my, aimAngle, shoot, dash, ult, q, e: e_skill };
}

function updateSquadTactics(s: GameState) {
    // Group enemies into squads if they don't have one
    const leaders = s.enemies.filter(e => e.isElite && e.active);
    for(const l of leaders) {
        const nearby = s.spatialGrid.queryRadius(l.x, l.y, 300);
        for(const e of nearby) {
            if(e.active && !e.isElite && !e.squadId && e.type !== 'projectile') {
                e.squadId = l.id;
                const roleRoll = Math.random();
                e.squadRole = roleRoll > 0.6 ? 'flanker' : 'protector';
                e.squadOffset = { angle: Math.random() * Math.PI * 2, dist: Utils.rand(50, 150) };
            }
        }
    }
}

// VARIATIONAL BOIDS (Energy Minimization)
function applyVariationalBoids(e: Enemy, s: GameState) {
    const p = s.player;
    let fx = 0, fy = 0;

    const neighbors = s.spatialGrid.queryRadius(e.x, e.y, CONFIG.BOIDS.ALIGNMENT_RADIUS);
    let avgVx = 0, avgVy = 0, avgX = 0, avgY = 0, count = 0;

    for(const other of neighbors) {
        if(other === e || !other.active || other.type === 'projectile') continue;
        const dx = e.x - other.x;
        const dy = e.y - other.y;
        const distSq = dx*dx + dy*dy;
        const dist = Math.sqrt(distSq);
        
        if (dist < 0.1) continue;

        if (dist < CONFIG.BOIDS.SEPARATION_RADIUS) {
            const str = CONFIG.BOIDS.SEPARATION_WEIGHT / (distSq + 0.1);
            fx += dx * str * 100;
            fy += dy * str * 100;
        }

        if (dist < CONFIG.BOIDS.ALIGNMENT_RADIUS) {
            avgVx += other.vx;
            avgVy += other.vy;
            avgX += other.x;
            avgY += other.y;
            count++;
        }
    }

    if (count > 0) {
        avgVx /= count; avgVy /= count;
        avgX /= count; avgY /= count;

        fx += (avgVx - e.vx) * CONFIG.BOIDS.ALIGNMENT_WEIGHT;
        fy += (avgVy - e.vy) * CONFIG.BOIDS.ALIGNMENT_WEIGHT;

        const dx = avgX - e.x;
        const dy = avgY - e.y;
        fx += dx * CONFIG.BOIDS.COHESION_WEIGHT * 0.05;
        fy += dy * CONFIG.BOIDS.COHESION_WEIGHT * 0.05;
    }

    const pdx = p.x - e.x;
    const pdy = p.y - e.y;
    const pDist = Math.hypot(pdx, pdy);
    if(pDist > 0) {
        fx += (pdx / pDist) * CONFIG.BOIDS.PLAYER_WEIGHT * 0.5;
        fy += (pdy / pDist) * CONFIG.BOIDS.PLAYER_WEIGHT * 0.5;
    }

    return { x: fx, y: fy };
}

function handleShooting(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.cd > 0) return;

    const conf = CONFIG.WEAPONS[p.weapon];
    p.cd = conf.fireDelay / (p.stats.fireRateMod + (p.skills.q.active ? 1.0 : 0)); 
    
    // Recoil
    p.vx -= Math.cos(p.angle) * conf.recoil;
    p.vy -= Math.sin(p.angle) * conf.recoil;
    p.muzzleFlash = 3;

    callbacks.playSound('shoot');

    const count = conf.count + p.stats.multishot;
    const arc = conf.spread + (count * 0.05);
    const startAngle = p.angle - arc / 2;
    const step = count > 1 ? arc / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
        const b = s.pools.bullets.acquire();
        if (b) {
            const angle = startAngle + step * i + (Math.random() - 0.5) * 0.05; 
            b.id = Utils.uid('b');
            b.x = p.x + Math.cos(p.angle) * 20; 
            b.y = p.y + Math.sin(p.angle) * 20;
            const speed = conf.speed;
            b.vx = Math.cos(angle) * speed + p.vx * 0.2; 
            b.vy = Math.sin(angle) * speed + p.vy * 0.2;
            b.life = conf.lifetime;
            b.color = conf.color;
            b.dmg = (p.hull === 'BASTION' ? 1.2 : 1.0) * p.stats.damageMod * conf.dmgMult; 
            b.pierce = conf.pierce + p.stats.pierce;
            b.homing = conf.homing + p.stats.homing;
            b.size = conf.size;
            b.knockback = conf.knockback;
            b.isBeam = conf.type === 'beam';
            b.active = true;
            b.trail = [];
            b.beamPoints = b.isBeam ? [{x: b.x, y: b.y}] : undefined;
            b.elemental = { ...p.stats.elemental };
            s.bullets.push(b);
        }
    }
}

function handleDash(s: GameState, callbacks: GameCallbacks, mx: number, my: number) {
    const p = s.player;
    if (p.dashCd > 0) return;

    p.dashCd = p.maxDashCd;
    p.invuln = CONFIG.PLAYER.DASH.INVULN_DURATION;
    
    let angle = p.angle;
    if (Math.abs(mx) > 0.1 || Math.abs(my) > 0.1) {
        angle = Math.atan2(my, mx);
    }
    
    const speed = CONFIG.PLAYER.DASH.SPEED;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    callbacks.playSound('dash');
    createShockwave(s, p.x, p.y, 100, CONFIG.COLORS.PLAYER_DASH, 5);
    
    for(let i=0; i<10; i++) {
        const pt = s.pools.particles.acquire();
        if(pt) {
            pt.x = p.x; pt.y = p.y;
            pt.vx = (Math.random()-0.5)*10;
            pt.vy = (Math.random()-0.5)*10;
            pt.life = 20; pt.maxLife = 20;
            pt.color = '#ffffff';
            pt.size = 2;
            pt.active = true;
            s.particles.push(pt);
        }
    }
}

function handleUltimate(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    s.overdrive = 0;
    callbacks.playSound('ultimate');
    s.screenFlash = 0.8;
    s.flashColor = CONFIG.COLORS.ULTIMATE;

    createShockwave(s, p.x, p.y, 800, CONFIG.COLORS.ULTIMATE, 25);
    
    for (const e of s.enemies) {
        if (e.active && Utils.inBounds(e.x, e.y, s.worldWidth, s.worldHeight)) { 
             const d = Utils.dist(p.x, p.y, e.x, e.y);
             if (d < 800) {
                 e.hp -= 500 * p.stats.damageMod;
                 e.hitFlash = 10;
                 if (e.hp <= 0 && !e.dead) handleEnemyDeath(s, e, callbacks, {x: (e.x-p.x)*0.1, y: (e.y-p.y)*0.1});
             }
        }
    }
}

function handleSkillQ(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    p.skills.q.active = true;
    p.skills.q.cd = p.skills.q.maxCd;
    p.skills.q.duration = p.skills.q.maxDuration;
    callbacks.playSound('chrono');
    callbacks.setAudioTempo(0.5);
    createShockwave(s, p.x, p.y, 300, '#00ffff', 2);
}

function handleSkillE(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    p.skills.e.cd = p.skills.e.maxCd;
    callbacks.playSound('fracture');
    
    s.blackHoles.push({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        life: 300,
        maxLife: 300,
        radius: 10,
        pullRange: 250,
        color: '#ff00ff',
        active: true
    });
}

function handlePlayerHit(s: GameState, e: Enemy, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.invuln > 0) return;

    p.hp -= 20; 
    p.invuln = CONFIG.PLAYER.INVULN_ON_HIT;
    p.hitFlash = 10;
    s.shake = 10;
    s.screenFlash = 0.5;
    s.flashColor = '#ff0000';
    s.combo = 0;
    
    callbacks.playSound('hit');
    if (navigator.vibrate) navigator.vibrate(200);

    if (p.hp <= 0) {
        s.gameOver = true;
        callbacks.onGameOver({
            score: s.score,
            wave: s.wave,
            level: p.level,
            duration: (Date.now() - s.startTime) / 1000,
            weapon: p.weapon,
            hull: p.hull,
            upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count }))
        });
        callbacks.playSound('gameover');
    }
}

// --- SYSTEM ARCHITECTURE ---
const Systems = {
    Wave: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            // Boss Spawn
            if (!s.bossActive && s.waveKills >= s.waveQuota) {
                spawnBoss(s, callbacks);
                return;
            }

            if (s.bossActive) return;

            // Wave Evolution
            if (s.wave % 10 === 0) s.waveType = 'CHAOS';
            else if (s.wave % 5 === 0) s.waveType = 'HEAVY';
            else if (s.wave % 3 === 0) s.waveType = 'ELITE_SQUAD';
            else if (s.wave % 2 === 0) s.waveType = 'MIXED';
            else s.waveType = 'SWARM';

            // Enemy Spawning
            const maxEnemies = CONFIG.SPAWNING.MAX_ENEMIES;
            if (s.enemies.length < maxEnemies) {
                s.spawnTimer += s.worldTimeScale;
                const rateMult = Math.pow(CONFIG.SPAWNING.RATE_DECAY, s.wave);
                const currentRate = Math.max(CONFIG.SPAWNING.MIN_RATE, CONFIG.SPAWNING.INITIAL_RATE * rateMult);
                
                if (s.spawnTimer > currentRate) {
                    s.spawnTimer = 0;
                    let spawnCount = 1 + Math.floor(s.wave / 5);
                    if (s.waveType === 'SWARM') spawnCount += 2;

                    const waveConfig = CONFIG.WAVES[s.waveType];
                    for (let i = 0; i < spawnCount; i++) {
                        if (s.enemies.length >= maxEnemies) break;
                        
                        // Spawn relative to player but within WORLD bounds
                        const angle = Math.random() * Math.PI * 2;
                        const spawnDist = 500 / s.camera.zoom; // Always offscreen-ish
                        const px = Utils.clamp(s.player.x + Math.cos(angle) * spawnDist, 50, s.worldWidth - 50);
                        const py = Utils.clamp(s.player.y + Math.sin(angle) * spawnDist, 50, s.worldHeight - 50);

                        const e = s.pools.enemies.acquire();
                        if (e) {
                            const typeKey = waveConfig.types[Math.floor(Math.random() * waveConfig.types.length)];
                            setupEnemy(s, e, typeKey.toUpperCase(), px, py);
                        }
                    }
                }
            }

            // Debris Generation
            if (s.debris.length < CONFIG.SPAWNING.DEBRIS_MAX && Math.random() < 0.05) {
                const d = s.pools.debris.acquire();
                if (d) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 600;
                    d.id = Utils.uid('d');
                    d.x = Utils.clamp(s.player.x + Math.cos(angle) * dist, 0, s.worldWidth);
                    d.y = Utils.clamp(s.player.y + Math.sin(angle) * dist, 0, s.worldHeight);
                    d.vx = (Math.random() - 0.5) * 2;
                    d.vy = (Math.random() - 0.5) * 2;
                    d.size = Utils.rand(10, 40);
                    d.color = Math.random() > 0.5 ? '#444455' : '#333344';
                    d.rotation = Math.random() * Math.PI * 2;
                    d.vRot = (Math.random() - 0.5) * 0.05;
                    d.sides = Math.floor(Utils.rand(3, 7));
                    d.health = d.size * 2;
                    d.active = true;
                    s.debris.push(d);
                }
            }
        }
    },

    Player: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            const p = s.player;
            
            // Skill Cooldowns
            if (p.skills.q.active) { p.skills.q.duration--; if (p.skills.q.duration <= 0) { p.skills.q.active = false; callbacks.setAudioTempo(1.0); } } else { if (p.skills.q.cd > 0) p.skills.q.cd--; }
            if (p.skills.e.cd > 0) p.skills.e.cd--;
            if (p.dashCd > 0) p.dashCd -= s.playerTimeScale;
            if (p.invuln > 0) p.invuln -= s.playerTimeScale;
            if (p.cd > 0) p.cd -= s.playerTimeScale;
            if (p.hitFlash > 0) p.hitFlash--;
            if (p.muzzleFlash > 0) p.muzzleFlash--;

            // Input
            let mx = 0, my = 0;
            const stick = (s as any).stickInput;
            let isShooting = false;
            let aimX = 0, aimY = 0;
            
            if (s.autoMode) {
                const ai = calculateAutoPilot(s);
                mx = ai.mx; my = ai.my; p.angle = ai.aimAngle;
                if(ai.shoot) handleShooting(s, callbacks);
                if(ai.dash) handleDash(s, callbacks, mx, my);
                if(ai.ult && s.overdrive >= 100) handleUltimate(s, callbacks);
                if(ai.q && p.skills.q.cd <= 0) handleSkillQ(s, callbacks);
                if(ai.e && p.skills.e.cd <= 0) handleSkillE(s, callbacks);
            } else {
                if (stick && (Math.abs(stick.mx) > 0.1 || Math.abs(stick.my) > 0.1)) { mx = stick.mx; my = stick.my; } 
                else {
                    if (s.keys.w || s.keys.ArrowUp) my -= 1;
                    if (s.keys.s || s.keys.ArrowDown) my += 1;
                    if (s.keys.a || s.keys.ArrowLeft) mx -= 1;
                    if (s.keys.d || s.keys.ArrowRight) mx += 1;
                }

                if (stick && stick.shooting) { 
                    isShooting = true; 
                    aimX = stick.aimX; 
                    aimY = stick.aimY;
                    handleShooting(s, callbacks); 
                }
                else if (s.mouse.down) { 
                    isShooting = true; 
                    const screenPx = (p.x - s.camera.x) * s.camera.zoom + s.width / 2;
                    const screenPy = (p.y - s.camera.y) * s.camera.zoom + s.height / 2;
                    aimX = s.mouse.x - screenPx;
                    aimY = s.mouse.y - screenPy;
                    handleShooting(s, callbacks); 
                }

                if (s.keys.space || s.keys.shift) handleDash(s, callbacks, mx, my);
                if (s.keys.f && s.overdrive >= 100) handleUltimate(s, callbacks);
                if (s.keys.q && p.skills.q.cd <= 0) handleSkillQ(s, callbacks);
                if (s.keys.e && p.skills.e.cd <= 0) handleSkillE(s, callbacks);

                // FIXED ROTATION LOGIC
                // 1. If actively aiming/shooting, face aim direction
                // 2. If moving and NOT shooting, face movement velocity
                // 3. If idle, keep last angle
                if (isShooting) {
                    p.angle = Math.atan2(aimY, aimX);
                } else {
                    const speed = Math.hypot(p.vx, p.vy);
                    if (speed > 0.1) {
                        const targetAngle = Math.atan2(p.vy, p.vx);
                        // Smoothly rotate towards velocity
                        const diff = Utils.angleDiff(p.angle, targetAngle);
                        p.angle += diff * 0.15;
                    }
                }
            }

            // NEWTONIAN PHYSICS
            const thrust = CONFIG.PLAYER.THRUST * p.stats.speedMod * s.playerTimeScale;
            // Normalize input if diagonal
            const len = Math.hypot(mx, my);
            if (len > 1) { mx /= len; my /= len; }

            p.vx += mx * thrust;
            p.vy += my * thrust;
            
            // Friction (Inertia decay)
            p.vx *= CONFIG.PLAYER.FRICTION;
            p.vy *= CONFIG.PLAYER.FRICTION;
            
            // Banking roll effect
            // If turning left, roll negative. If turning right, roll positive.
            // Simplified: Roll based on angular change or horizontal velocity relative to forward
            const currentSpeed = Math.hypot(p.vx, p.vy);
            if (currentSpeed > 0.5) {
                // Calculate sideways velocity component relative to facing
                const rightX = Math.cos(p.angle + Math.PI/2);
                const rightY = Math.sin(p.angle + Math.PI/2);
                const sideVel = p.vx * rightX + p.vy * rightY;
                p.roll = Utils.lerp(p.roll, sideVel * 0.1, 0.1);
            } else {
                p.roll = Utils.lerp(p.roll, 0, 0.1);
            }

            // CLAMP TO WORLD BOUNDS
            p.x = Utils.clamp(p.x + p.vx, 0, s.worldWidth);
            p.y = Utils.clamp(p.y + p.vy, 0, s.worldHeight);
            
            // Coupling: Player wakes the grid
            if (len > 0.1) {
                s.visualGrid.applyForce(p.x, p.y, 40, len * 5);
            }

            // Engine Trail & Thrust Particles
            if (len > 0.1) {
                if (s.frame % 2 === 0) {
                    const t = s.pools.particles.acquire();
                    if(t) {
                        const angle = Math.atan2(my, mx) + Math.PI; // Opposite to movement input
                        t.x = p.x + Utils.rand(-5, 5);
                        t.y = p.y + Utils.rand(-5, 5);
                        t.vx = Math.cos(angle) * 4 + (Math.random()-0.5);
                        t.vy = Math.sin(angle) * 4 + (Math.random()-0.5);
                        t.life = 15; t.maxLife = 15;
                        t.color = CONFIG.COLORS.PLAYER;
                        t.size = Utils.rand(2, 4);
                        t.type = 'spark';
                        t.active = true;
                        s.particles.push(t);
                    }
                }
            }
        }
    },

    Enemies: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            const p = s.player;
            const timeStep = s.worldTimeScale;

            updateSquadTactics(s);

            for (let i = s.enemies.length - 1; i >= 0; i--) {
                const e = s.enemies[i];
                if (!e.active || e.dead) continue;
                if (e.hitFlash > 0) e.hitFlash--;

                let speedMult = 1.0;
                for (let si = e.status.length - 1; si >= 0; si--) {
                    const status = e.status[si];
                    status.timer -= timeStep;
                    if (status.type === 'FREEZE') { speedMult *= (1 - status.power); e.color = '#00ffff'; }
                    if (status.type === 'BURN') {
                        if (s.frame % 30 === 0) {
                            e.hp -= status.power;
                            e.hitFlash = 2;
                            createFloatingText(s, e.x, e.y - 10, Math.floor(status.power).toString(), '#ffaa00', 10);
                            s.damageDealtBuffer += status.power;
                            if (e.hp <= 0 && !e.dead) handleEnemyDeath(s, e, callbacks, {x: 0, y: 0});
                        }
                        e.color = '#ffaa00';
                    }
                    if (status.timer <= 0) e.status.splice(si, 1);
                }

                // AI BEHAVIOR
                let moveX = 0;
                let moveY = 0;

                if (e.type.startsWith('boss') || e.type === 'pylon' || e.type === 'projectile' || e.type.startsWith('snake')) {
                     // Keep specialized boss/snake logic, maybe add simple separation if needed
                     const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);
                     moveX = Math.cos(toPlayerAng);
                     moveY = Math.sin(toPlayerAng);
                     
                     // Boss specialized updates
                     if (e.type === 'boss_warlord') {
                        // Rotation logic for boss?
                        e.rotation += 0.01;
                        if (!e.state || e.state === 'idle') {
                            e.vx += moveX * 0.1 * timeStep; e.vy += moveY * 0.1 * timeStep;
                            if (e.attackTimer > 240) { e.state = 'charge'; e.stateTimer = 60; e.attackTimer = 0; callbacks.playSound('charge'); e.color = '#ffffff'; }
                        } else if (e.state === 'charge') {
                            e.stateTimer -= timeStep; e.vx *= 0.9; e.vy *= 0.9;
                            if (e.stateTimer <= 0) { e.state = 'recover'; e.stateTimer = 40; const angle = Math.atan2(p.y - e.y, p.x - e.x); e.vx = Math.cos(angle) * 20; e.vy = Math.sin(angle) * 20; createShockwave(s, e.x, e.y, 200, '#ff0000', 10); callbacks.playSound('dash'); e.color = '#ff0000'; }
                        } else if (e.state === 'recover') { e.stateTimer -= timeStep; e.vx *= 0.95; e.vy *= 0.95; if (e.stateTimer <= 0) e.state = 'idle'; }
                     }
                } 
                else {
                    // Use Variational Boids for standard enemies
                    const forces = applyVariationalBoids(e, s);
                    // Normalize force direction roughly to combine with acceleration
                    const accel = (e.type === 'tank' ? 0.15 : 0.2) * timeStep;
                    e.vx += forces.x * accel * 0.01; // Scale factor for force
                    e.vy += forces.y * accel * 0.01;
                }
                
                // Snake Logic
                if (e.type === 'snake_head') { 
                    const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);
                    e.rotation = toPlayerAng; const wave = Math.sin(s.frame * 0.1) * 0.5; 
                    let mx = Math.cos(toPlayerAng + Math.PI/2) * wave + Math.cos(toPlayerAng); 
                    let my = Math.sin(toPlayerAng + Math.PI/2) * wave + Math.sin(toPlayerAng); 
                    const len = Math.hypot(mx, my); if(len > 0) { mx/=len; my/=len; } 
                    e.vx += mx * 0.2 * timeStep; e.vy += my * 0.2 * timeStep; 
                    if (s.frame % 3 === 0) { if (!e.history) e.history = []; e.history.unshift({x: e.x, y: e.y}); if (e.history.length > 50) e.history.pop(); } 
                } else if (e.type === 'snake_body') { 
                    const head = s.enemies.find(h => h.id === e.parentId); if (head && head.history) { const targetIndex = (e.segmentIndex || 1) * 6; if (head.history[targetIndex]) { const target = head.history[targetIndex]; e.x = Utils.lerp(e.x, target.x, 0.2); e.y = Utils.lerp(e.y, target.y, 0.2); } } else { e.dead = true; } 
                }

                if (e.type === 'projectile') {
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep; e.life -= timeStep; 
                    if (e.life <= 0 || !Utils.inBounds(e.x, e.y, s.worldWidth, s.worldHeight, 100)) e.dead = true;
                } else {
                    // Standard Physics Update
                    const spd = Math.hypot(e.vx, e.vy);
                    if (spd > e.speed * speedMult) { e.vx = (e.vx / spd) * e.speed * speedMult; e.vy = (e.vy / spd) * e.speed * speedMult; }
                    
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep;
                    
                    // Clamp Enemies to World
                    e.x = Utils.clamp(e.x, e.size, s.worldWidth - e.size);
                    e.y = Utils.clamp(e.y, e.size, s.worldHeight - e.size);
                }

                if (p.invuln <= 0 && Utils.dist(e.x, e.y, p.x, p.y) < e.size + CONFIG.PLAYER.COLLISION_RADIUS) {
                    handlePlayerHit(s, e, callbacks);
                }
            }
        }
    },

    Combat: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            // Bullets
            for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
                const b = s.bullets[bi];
                if (!b.active) continue;

                if (b.isBeam && b.beamPoints && b.beamPoints.length > 0) {
                    const last = b.beamPoints[b.beamPoints.length - 1];
                    b.x = last.x; b.y = last.y;
                    const angle = Math.atan2(b.vy, b.vx);
                    b.beamPoints.push({x: last.x + Math.cos(angle) * 30 + Utils.rand(-15, 15), y: last.y + Math.sin(angle) * 30 + Utils.rand(-15, 15)});
                    if (b.beamPoints.length > 10) b.beamPoints.shift();
                }

                if (b.homing > 0 && s.quality !== 'LOW') {
                    let target = null, minD = 400;
                    const nearby = s.spatialGrid.queryRadius(b.x, b.y, 400);
                    for (const e of nearby) { if (e.type === 'projectile' || !e.active) continue; const d = Utils.dist(b.x, b.y, e.x, e.y); if (d < minD) { minD = d; target = e; } }
                    if (target) {
                        const wantAng = Math.atan2(target.y - b.y, target.x - b.x); const currAng = Math.atan2(b.vy, b.vx); const diff = Utils.angleDiff(currAng, wantAng); const newAng = currAng + diff * b.homing; const spd = Math.hypot(b.vx, b.vy); b.vx = Math.cos(newAng) * spd; b.vy = Math.sin(newAng) * spd;
                    }
                }

                b.x += b.vx * s.worldTimeScale; b.y += b.vy * s.worldTimeScale; b.life -= s.worldTimeScale;
                if (s.frame % 2 === 0) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 5) b.trail.shift(); }

                if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.worldWidth, s.worldHeight, 200)) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue; }

                const candidates = s.spatialGrid.queryRadius(b.x, b.y, 60);
                let hitEnemy = false;
                
                // Debris Collision
                for (const d of s.debris) {
                    if (!d.active) continue;
                    if (Utils.dist(b.x, b.y, d.x, d.y) < d.size + b.size) {
                        d.health -= b.dmg;
                        createExplosion(s, b.x, b.y, '#aaaaaa', 2, 0.5);
                        if (d.health <= 0) {
                            d.active = false;
                            createExplosion(s, d.x, d.y, '#777777', 8, 1);
                            s.score += 10;
                        }
                        if (b.pierce <= 0) hitEnemy = true;
                        else b.pierce--;
                        if (hitEnemy) break;
                    }
                }

                if (!hitEnemy) {
                    for (const e of candidates) {
                        if (!e.active || e.dead || e.type === 'projectile') continue;
                        if (Utils.dist(b.x, b.y, e.x, e.y) < e.size + b.size + (b.isBeam ? 20 : 0)) {
                            if (e.invulnerable) { createExplosion(s, b.x, b.y, '#ffffff', 2, 0.5); hitEnemy = true; } 
                            else {
                                e.hp -= b.dmg; e.hitFlash = 3; s.damageDealtBuffer += b.dmg;
                                const angle = Math.atan2(b.vy, b.vx); const kb = (b.knockback || 1) * 2 / (e.mass || 1); e.vx += Math.cos(angle) * kb; e.vy += Math.sin(angle) * kb;
                                createExplosion(s, b.x, b.y, b.color, 3, 0.5);
                                createFloatingText(s, e.x, e.y - 20, Math.floor(b.dmg).toString(), b.color, 14);
                                if(b.elemental) { if(b.elemental.fire > 0) e.status.push({ type: 'BURN', duration: 180, power: 5, timer: 0 }); if(b.elemental.ice > 0) e.status.push({ type: 'FREEZE', duration: 120, power: 0.3, timer: 0 }); }
                                if (e.hp <= 0 && !e.dead) handleEnemyDeath(s, e, callbacks, {x: b.vx, y: b.vy});
                            }
                            if (b.pierce <= 0) hitEnemy = true; else b.pierce--;
                            if (hitEnemy) break;
                        }
                    }
                }

                if (hitEnemy) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); }
            }
        }
    },

    Cleanup: {
        update: (s: GameState) => {
            // Decay screen flash to prevent stuck green screen
            if (s.screenFlash > 0) s.screenFlash = Math.max(0, s.screenFlash - 0.05);

            for (let i = s.enemies.length - 1; i >= 0; i--) { const e = s.enemies[i]; if (e.dead || !e.active) { s.pools.enemies.release(e); s.enemies.splice(i, 1); } }
            for (let i = s.debris.length - 1; i >= 0; i--) { const d = s.debris[i]; if (!d.active) { s.pools.debris.release(d); s.debris.splice(i, 1); } }
            
            const p = s.player;
            for(let i=s.pickups.length-1; i>=0; i--) {
                const pick = s.pickups[i]; const d = Utils.dist(pick.x, pick.y, p.x, p.y);
                if (d < 150 + p.stats.magnetRange * 0.5) { pick.x += (p.x - pick.x) * 0.1; pick.y += (p.y - pick.y) * 0.1; }
                if (d < 30) { if(pick.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + CONFIG.PICKUPS.HEAL_AMOUNT); s.pools.pickups.release(pick); s.pickups.splice(i, 1); } 
                else { pick.life--; if(pick.life <= 0) { s.pools.pickups.release(pick); s.pickups.splice(i, 1); } }
            }

            for(let i=s.gems.length-1; i>=0; i--) {
                const g = s.gems[i]; if(!g.active) continue; const d = Utils.dist(g.x, g.y, p.x, p.y);
                if (d < p.stats.magnetRange) { g.x += (p.x - g.x) * CONFIG.GEMS.PULL_STRENGTH; g.y += (p.y - g.y) * CONFIG.GEMS.PULL_STRENGTH; } else { g.vx *= CONFIG.GEMS.FRICTION; g.vy *= CONFIG.GEMS.FRICTION; g.x += g.vx; g.y += g.vy; }
                if (d < CONFIG.GEMS.COLLECT_RADIUS) { p.xp += g.val; s.score += g.val; s.pools.gems.release(g); s.gems.splice(i, 1); }
            }

            for (let i = s.texts.length - 1; i >= 0; i--) { const t = s.texts[i]; t.x += t.vx; t.y += t.vy; t.life--; if (t.life <= 0) s.texts.splice(i, 1); }
            for (let i = s.shockwaves.length - 1; i >= 0; i--) { const sw = s.shockwaves[i]; sw.size += sw.speed * 2; sw.alpha -= 0.05; if (sw.alpha <= 0 || sw.size > sw.maxSize) s.shockwaves.splice(i, 1); }
            
            // SYMPLECTIC (Verlet) Integration for Particles
            for (let i = s.particles.length - 1; i >= 0; i--) { 
                const pt = s.particles[i]; 
                if(!pt.active) continue;
                pt.x += pt.vx; pt.y += pt.vy; 
                pt.vx *= pt.friction; pt.vy *= pt.friction; 
                pt.life--; 
                if (pt.life <= 0) { s.pools.particles.release(pt); s.particles.splice(i, 1); } 
            }
            
            // Shield Ripples
            for (let i = s.shieldRipples.length - 1; i >= 0; i--) { const r = s.shieldRipples[i]; r.radius += 5; r.alpha -= 0.1; if (r.alpha <= 0) s.shieldRipples.splice(i, 1); }
        }
    }
};

export function updateGame(s: GameState, callbacks: GameCallbacks) {
    // Clear Spatial Grid for new frame
    s.spatialGrid.clear();
    if (s.player.active) s.spatialGrid.insert(s.player);
    for (const e of s.enemies) {
        if (e.active) s.spatialGrid.insert(e);
    }
    // Note: Bullets are not inserted into spatial grid usually in this engine style unless needed for enemy dodging.
    // But enemies use spatial grid for separation (boids).

    // Execute Systems
    Systems.Wave.update(s, callbacks);
    Systems.Player.update(s, callbacks);
    Systems.Enemies.update(s, callbacks);
    Systems.Combat.update(s, callbacks);
    Systems.Cleanup.update(s);

    // Update global counters
    s.frame++;
    if (s.comboTimer > 0) {
        s.comboTimer -= s.worldTimeScale;
        if (s.comboTimer <= 0) s.combo = 0;
    }
    
    // Anomaly Logic
    if (s.anomaly.active) {
        s.anomaly.timer -= s.worldTimeScale;
        if (s.anomaly.timer <= 0) {
            s.anomaly.active = false;
            s.chromaticAberration = 0;
        } else {
            // Effects based on anomaly type
            if (s.anomaly.type === 'SURGE') s.chromaticAberration = Math.random() * 5;
            else if (s.anomaly.type === 'DECAY') s.chromaticAberration = Math.sin(s.frame * 0.1) * 2;
        }
    } else {
        // Chance to spawn anomaly
        if (s.frame % CONFIG.ANOMALIES.INTERVAL === 0 && Math.random() < CONFIG.ANOMALIES.CHANCE) {
             const types: any[] = ['SURGE', 'DECAY', 'GRAVITY_LOSS'];
             const type = types[Math.floor(Math.random() * types.length)];
             s.anomaly = {
                 active: true,
                 type: type,
                 timer: CONFIG.ANOMALIES.DURATION,
                 duration: CONFIG.ANOMALIES.DURATION,
                 intensity: 1.0
             };
             callbacks.playSound('glitch_start');
        }
    }

    // Audio Dynamic Intensity
    const dangerLevel = (s.enemies.length / 100) + (1 - s.player.hp/s.player.maxHp) * 0.5 + (s.bossActive ? 0.4 : 0);
    callbacks.setAudioIntensity(Math.min(1.0, dangerLevel));

    // Update Visual Grid (Water simulation)
    if (s.visualGrid) s.visualGrid.update(s.qualitySettings.gridStep);
    
    // XP / Level Up Check
    if (s.player.xp >= s.player.xpToNext) {
        s.player.level++;
        s.player.xp -= s.player.xpToNext;
        s.player.xpToNext = Math.floor(s.player.xpToNext * CONFIG.PROGRESSION.XP_SCALE);
        
        // Generate upgrade options
        const options: UpgradeOption[] = [];
        const pool = [...UPGRADES]; // Clone
        
        // Filter out maxed upgrades
        const valid = pool.filter(u => {
            const current = s.upgradeStacks.get(u.id) || 0;
            return current < u.maxStack;
        });
        
        // Pick 3 weighted random
        for(let i=0; i<3; i++) {
            if (valid.length === 0) break;
            const totalWeight = valid.reduce((acc, u) => acc + u.weight, 0);
            let r = Math.random() * totalWeight;
            let selected = null;
            for (const u of valid) {
                r -= u.weight;
                if (r <= 0) { selected = u; break; }
            }
            if (!selected) selected = valid[valid.length - 1];
            
            // Add current stack info
            options.push({
                ...selected,
                currentStack: s.upgradeStacks.get(selected.id) || 0
            });
            
            // Remove from pool so we don't pick same one twice
            const idx = valid.indexOf(selected);
            if (idx > -1) valid.splice(idx, 1);
        }
        
        callbacks.onLevelUp(options);
        callbacks.playSound('levelup');
    }
}

// RENDER GAME

export function renderGame(ctx: CanvasRenderingContext2D, distCtx: CanvasRenderingContext2D, s: GameState) {
    const w = ctx.canvas.width / s.pixelRatio;
    const h = ctx.canvas.height / s.pixelRatio;

    // Clear
    ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    
    distCtx.fillStyle = '#000000'; // R channel is distortion strength (0 = none)
    distCtx.fillRect(0, 0, w, h);

    // Apply Camera
    ctx.save();
    distCtx.save();
    
    // Screen Shake
    const shakeX = (Math.random() - 0.5) * s.shake;
    const shakeY = (Math.random() - 0.5) * s.shake;
    if (s.shake > 0) s.shake *= 0.9;
    
    const camX = s.camera.x + shakeX;
    const camY = s.camera.y + shakeY;
    
    // Center camera
    ctx.translate(w/2, h/2);
    ctx.scale(s.camera.zoom, s.camera.zoom);
    ctx.translate(-camX, -camY);

    distCtx.translate(w/2, h/2);
    distCtx.scale(s.camera.zoom, s.camera.zoom);
    distCtx.translate(-camX, -camY);

    // --- DRAW WORLD ---

    // 1. Grid
    if (s.visualGrid) s.visualGrid.render(ctx, s.quality === 'LOW' ? 2 : 1);

    // 2. Stars
    for(const star of s.stars) {
        // Parallax
        const px = star.x - (camX * (1 - star.z));
        const py = star.y - (camY * (1 - star.z));
        
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * star.z, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Debris
    for(const d of s.debris) {
        if (!d.active) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        const step = (Math.PI * 2) / d.sides;
        for(let i=0; i<d.sides; i++) {
            const r = d.size * (0.8 + Math.random() * 0.2); // Jagged
            ctx.lineTo(Math.cos(step*i)*d.size, Math.sin(step*i)*d.size);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    
    // 4. Black Holes (Skills)
    for(const bh of s.blackHoles) {
        if(bh.active) {
            bh.radius += 0.5;
            bh.life--;
            if(bh.life <= 0) s.blackHoles.splice(s.blackHoles.indexOf(bh), 1);
            else {
                ctx.fillStyle = bh.color;
                ctx.beginPath();
                ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Distortion
                distCtx.fillStyle = '#ff0000'; // Max distortion
                distCtx.beginPath();
                distCtx.arc(bh.x, bh.y, bh.radius * 2, 0, Math.PI * 2);
                distCtx.fill();
            }
        }
    }

    // 5. Pickups & Gems
    for(const g of s.gems) {
        if(!g.active) continue;
        ctx.fillStyle = CONFIG.COLORS.XP_GEM;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - 4);
        ctx.lineTo(g.x + 4, g.y);
        ctx.lineTo(g.x, g.y + 4);
        ctx.lineTo(g.x - 4, g.y);
        ctx.fill();
    }
    for(const p of s.pickups) {
        if(!p.active) continue;
        ctx.fillStyle = CONFIG.PICKUPS.COLOR;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y);
        ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3);
        ctx.stroke();
    }

    // 6. Enemies
    for(const e of s.enemies) {
        if (!e.active || e.dead) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        
        let rot = Math.atan2(e.vy, e.vx);
        if (e.type === 'snake_head') rot = e.rotation;
        
        // Procedural Boss Rendering
        if (e.modules) {
             // Boss Rotation (slower)
             rot = s.frame * 0.005; // Slower rotation for grandeur
             ctx.rotate(rot);

             // Draw Modules
             for(const mod of e.modules) {
                 ctx.save();
                 // Rotate module relative to core
                 ctx.translate(mod.xOffset, mod.yOffset);
                 ctx.rotate(mod.rotation);
                 
                 // Draw Shape
                 ctx.fillStyle = mod.color;
                 if (e.hitFlash > 0) ctx.fillStyle = '#ffffff';

                 ctx.beginPath();
                 const len = mod.shape.length;
                 if (len >= 2) {
                     ctx.moveTo(mod.shape[0], mod.shape[1]);
                     for(let k=2; k<len; k+=2) {
                         ctx.lineTo(mod.shape[k], mod.shape[k+1]);
                     }
                 }
                 ctx.closePath();
                 ctx.fill();
                 
                 // Glow/Highlight
                 ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                 ctx.lineWidth = 2;
                 ctx.stroke();

                 // Inner Detail (Tech Lines)
                 ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 if (len > 0) ctx.lineTo(mod.shape[0], mod.shape[1]);
                 ctx.stroke();

                 ctx.restore();
             }
             
             // Core Energy Glow
             ctx.shadowColor = e.color;
             ctx.shadowBlur = 30;
             ctx.fillStyle = '#ffffff';
             ctx.beginPath();
             ctx.arc(0,0, 15, 0, Math.PI*2);
             ctx.fill();
             ctx.shadowBlur = 0;

        } else {
            // Standard Enemy Rendering with increased fidelity
            ctx.rotate(rot);
            if (e.hitFlash > 0) ctx.fillStyle = '#ffffff';
            else ctx.fillStyle = e.color;
            
            ctx.beginPath();
            if (e.sides === 0) {
                // Orbiter or round
                ctx.arc(0, 0, e.size, 0, Math.PI * 2);
            } else {
                const step = (Math.PI * 2) / e.sides;
                const off = e.type === 'tank' ? Math.PI/e.sides : 0;
                ctx.moveTo(e.size, 0);
                for(let i=1; i<=e.sides; i++) {
                    ctx.lineTo(Math.cos(step*i + off) * e.size, Math.sin(step*i + off) * e.size);
                }
            }
            ctx.closePath();
            ctx.fill();

            // Internal Tech Detail
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0,0);
            ctx.lineTo(e.size, 0);
            ctx.moveTo(0,0);
            ctx.lineTo(Math.cos(Math.PI/2)*e.size, Math.sin(Math.PI/2)*e.size);
            ctx.stroke();
            
            // Core Glow
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(0,0, e.size * 0.25, 0, Math.PI*2);
            ctx.fill();
        }
        
        // HP Bar for elites/bosses
        if (e.isElite || e.type.startsWith('boss')) {
            ctx.rotate(-rot); // Reset rotation for bar
            ctx.fillStyle = '#000';
            const barWidth = e.size * 2 + (e.modules ? 60 : 0);
            const barY = -e.size - (e.modules ? 50 : 15);
            ctx.fillRect(-barWidth/2, barY, barWidth, 6);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-barWidth/2, barY, barWidth * (e.hp / e.maxHp), 6);
        }
        
        ctx.restore();
    }

    // 7. Player
    const p = s.player;
    if (p.active) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        // Bank Effect (Scale width based on Roll)
        const bankScale = Math.max(0.6, 1.0 - Math.abs(p.roll * 0.1));
        ctx.scale(1.0, bankScale);

        if (p.invuln > 0 && Math.floor(s.frame / 4) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        ctx.fillStyle = CONFIG.COLORS.PLAYER;
        
        // High Fidelity Ship Geometry
        ctx.beginPath();
        // Nose
        ctx.moveTo(25, 0);
        ctx.lineTo(10, 4);
        ctx.lineTo(10, -4);
        ctx.fill();
        
        // Body / Cockpit
        ctx.fillStyle = '#005577';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, 7);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-10, -7);
        ctx.fill();
        
        // Cockpit Glass
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-5, 3);
        ctx.lineTo(-5, -3);
        ctx.fill();

        // Wings
        ctx.fillStyle = '#00c3ff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-15, 20); // Right Wing Tip
        ctx.lineTo(-5, 5);
        ctx.lineTo(5, 5);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-15, -20); // Left Wing Tip
        ctx.lineTo(-5, -5);
        ctx.lineTo(5, -5);
        ctx.fill();
        
        // Engine Glow
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.arc(-15, 0, 4 + Math.random() * 2, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Muzzle Flash
        if (p.muzzleFlash > 0) {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(30, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Orbitals
        if (s.orbitals.length > 0) {
            // Undo bank scale for orbitals
            ctx.scale(1.0, 1.0/bankScale);
            for(const o of s.orbitals) {
                 o.angle += 0.05;
                 const ox = Math.cos(o.angle) * o.dist;
                 const oy = Math.sin(o.angle) * o.dist;
                 ctx.fillStyle = '#00ffff';
                 ctx.beginPath();
                 ctx.arc(ox, oy, 6, 0, Math.PI * 2);
                 ctx.fill();
                 ctx.strokeStyle = 'rgba(0,255,255,0.3)';
                 ctx.beginPath();
                 ctx.arc(0,0, o.dist, 0, Math.PI*2);
                 ctx.stroke();
            }
        }

        ctx.restore();
    }

    // 8. Bullets
    for(const b of s.bullets) {
        if (!b.active) continue;
        if (b.isBeam) {
             ctx.strokeStyle = b.color;
             ctx.lineWidth = b.size;
             ctx.shadowBlur = 10;
             ctx.shadowColor = b.color;
             ctx.beginPath();
             if(b.beamPoints) {
                 for(let i=0; i<b.beamPoints.length; i++) {
                     const pt = b.beamPoints[i];
                     if(i===0) ctx.moveTo(pt.x, pt.y);
                     else ctx.lineTo(pt.x, pt.y);
                 }
             }
             ctx.stroke();
             ctx.lineWidth = 1;
             ctx.strokeStyle = '#fff';
             ctx.stroke();
             ctx.shadowBlur = 0;
        } else {
             ctx.fillStyle = b.color;
             ctx.beginPath();
             ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
             ctx.fill();
        }
    }

    // 9. Particles
    for(const pt of s.particles) {
        if(!pt.active) continue;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = pt.life / pt.maxLife;
        ctx.beginPath();
        if (pt.type === 'spark') {
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        } else {
            ctx.rect(pt.x - pt.size/2, pt.y - pt.size/2, pt.size, pt.size);
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // 10. Shockwaves
    for(const sw of s.shockwaves) {
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.width;
        ctx.globalAlpha = sw.alpha;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2);
        ctx.stroke();
        
        // Add to distortion
        distCtx.strokeStyle = `rgb(${Math.floor(sw.alpha * 255)}, 0, 0)`;
        distCtx.lineWidth = sw.width * 2;
        distCtx.beginPath();
        distCtx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2);
        distCtx.stroke();
        
        ctx.globalAlpha = 1.0;
    }

    // 11. Floating Text
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    for(const t of s.texts) {
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
    }
    
    // Bounds (World Edge)
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, s.worldWidth, s.worldHeight);

    ctx.restore();
    distCtx.restore();
    
    // Screen Flash (Post-Camera)
    if (s.screenFlash > 0) {
        ctx.fillStyle = s.flashColor;
        ctx.globalAlpha = s.screenFlash * 0.3;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;
    }
}

export function createGameState(width: number, height: number): GameState {
    const s: GameState = {
        active: false, paused: false, gameOver: false, autoMode: false,
        frame: 0, hitStop: 0, 
        
        width, height, // Viewport
        worldWidth: CONFIG.WORLD.WIDTH,
        worldHeight: CONFIG.WORLD.HEIGHT,
        
        pixelRatio: window.devicePixelRatio || 1,
        camera: { x: CONFIG.WORLD.WIDTH/2, y: CONFIG.WORLD.HEIGHT/2, zoom: 1, targetZoom: 1 },
        score: 0, wave: 1, waveKills: 0, waveQuota: CONFIG.SPAWNING.INITIAL_WAVE_QUOTA, waveType: 'SWARM', waveTimer: 0,
        combo: 0, comboTimer: 0, overdrive: 0,
        timeScale: 1, playerTimeScale: 1, worldTimeScale: 1,
        shake: 0, screenFlash: 0, flashColor: '#ffffff', chromaticAberration: 0,
        anomaly: { active: false, type: 'NONE', timer: 0, duration: 0, intensity: 0 },
        startTime: 0, runDuration: 0,
        quality: 'HIGH', qualitySettings: CONFIG.QUALITY.TIERS.HIGH,
        player: {} as Player, // Initialized in resetPlayer
        bullets: [], enemies: [], particles: [], blackHoles: [], gems: [], pickups: [], texts: [], shockwaves: [], orbitals: [],
        debris: [], stars: [], shieldRipples: [],
        keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, space: false, shift: false, f: false, q: false, e: false },
        mouse: { x: 0, y: 0, down: false }, touches: {},
        spawnTimer: 0, spawnRate: CONFIG.SPAWNING.INITIAL_RATE, bossActive: false,
        upgradeStacks: new Map(),
        pools: {
            bullets: new ObjectPool(Factories.bullet, Factories.resetBullet, CONFIG.POOLS.BULLETS.initial, CONFIG.POOLS.BULLETS.max),
            enemies: new ObjectPool(Factories.enemy, Factories.resetEnemy, CONFIG.POOLS.ENEMIES.initial, CONFIG.POOLS.ENEMIES.max),
            particles: new ObjectPool(Factories.particle, Factories.resetParticle, CONFIG.POOLS.PARTICLES.initial, CONFIG.POOLS.PARTICLES.max),
            gems: new ObjectPool(Factories.gem, Factories.resetGem, CONFIG.POOLS.GEMS.initial, CONFIG.POOLS.GEMS.max),
            pickups: new ObjectPool(Factories.pickup, Factories.resetPickup, CONFIG.POOLS.PICKUPS.initial, CONFIG.POOLS.PICKUPS.max),
            debris: new ObjectPool(Factories.debris, Factories.resetDebris, CONFIG.POOLS.DEBRIS.initial, CONFIG.POOLS.DEBRIS.max),
        },
        spatialGrid: new SpatialGrid(CONFIG.SPATIAL.CELL_SIZE),
        // Use full world dimensions for the grid
        visualGrid: new VisualGrid(CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT, CONFIG.GRID.CELL_SIZE),
        damageDealtBuffer: 0
    };
    
    resetPlayer(s.player, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT, 'INTERCEPTOR');
    
    // Init Stars scattered across the world
    for(let i=0; i<300; i++) {
        s.stars.push({
            x: Math.random() * CONFIG.WORLD.WIDTH,
            y: Math.random() * CONFIG.WORLD.HEIGHT,
            z: Math.random() * 0.5 + 0.1, // Depth
            size: Math.random() * 2 + 1,
            brightness: Math.random()
        });
    }

    return s;
}

export function resetPlayer(p: Player, w: number, h: number, hullType: HullType) {
    const hull = CONFIG.HULLS[hullType];
    const initialWeapon = hull.weapon;

    // Reset basics - Center of World
    p.x = w/2; p.y = h/2; p.vx = 0; p.vy = 0; p.active = true;
    p.hull = hullType;
    p.hp = hull.hp; p.maxHp = hull.hp;
    p.xp = 0; p.level = 1; p.xpToNext = CONFIG.PROGRESSION.XP_BASE;
    p.angle = 0; // Default to facing RIGHT (0 rads) instead of UP (-PI/2) to fix initial rotation bug
    p.roll = 0;
    p.cd = 0; p.dashCd = 0; p.maxDashCd = CONFIG.PLAYER.DASH.COOLDOWN;
    p.invuln = 0; p.hitFlash = 0; p.muzzleFlash = 0;
    p.weapon = initialWeapon;
    
    p.skills = {
        q: { id: 'chrono', name: CONFIG.PLAYER.SKILLS.Q.NAME, cd: 0, maxCd: CONFIG.PLAYER.SKILLS.Q.COOLDOWN, active: false, duration: 0, maxDuration: CONFIG.PLAYER.SKILLS.Q.DURATION },
        e: { id: 'fracture', name: CONFIG.PLAYER.SKILLS.E.NAME, cd: 0, maxCd: CONFIG.PLAYER.SKILLS.E.COOLDOWN, active: false, duration: 0, maxDuration: CONFIG.PLAYER.SKILLS.E.DURATION }
    };
    
    p.stats = {
        multishot: 0, fireRateMod: 1.0, speedMod: hull.speed, damageMod: 1.0, magnetRange: CONFIG.GEMS.MAGNET_RANGE,
        orbitals: 0, homing: 0, pierce: 0,
        elemental: { fire: 0, ice: 0, volt: 0 }
    };
}

export function createEvolutionEffect(s: GameState, x: number, y: number, color: string) {
    createShockwave(s, x, y, 500, color, 15);
    createExplosion(s, x, y, color, 50, 8);
    // Add some text
    createFloatingText(s, x, y - 50, "EVOLUTION", color, 24);
}
