
import { GameState, Player, Enemy, Gem, Pickup, UpgradeOption, RunData, SoundType, Particle, HullType, StatusEffect, BlackHole, WaveType, Bullet, Debris, Star, ShieldRipple } from '../types';
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
    s.visualGrid.applyForce(x, y, size, 50);
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

    const isElite = Math.random() < Math.min(CONFIG.ELITE.MAX_CHANCE, CONFIG.ELITE.CHANCE_PER_WAVE * s.wave);
    if (isElite && !type.startsWith('BOSS')) {
        e.isElite = true; e.hp *= CONFIG.ELITE.HP_MULT; e.maxHp = e.hp; e.speed *= CONFIG.ELITE.SPEED_MULT; e.size *= CONFIG.ELITE.SIZE_MULT; e.xp *= CONFIG.ELITE.XP_MULT; e.score *= CONFIG.ELITE.SCORE_MULT; e.mass *= 2.0; e.color = CONFIG.ELITE.COLOR;
        e.status.push({ type: 'BURN', duration: 0, power: 0, timer: 0 }); 
    } else {
        e.isElite = false;
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
    
    const ang = Math.random() * Math.PI * 2;
    const dist = (Math.max(s.width, s.height) / 2) / s.camera.zoom + 200;
    const bx = s.camera.x + Math.cos(ang) * dist;
    const by = s.camera.y + Math.sin(ang) * dist;
    
    const e = s.pools.enemies.acquire();
    if(e) {
        let type = 'BOSS_WARLORD';
        if (s.wave >= 10) type = 'BOSS_HIVE';
        if (s.wave >= 20) type = 'BOSS_OMNI';
        
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
        // Center bias
        mx = (s.width/2 - p.x);
        my = (s.height/2 - p.y);
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

function applyFlocking(e: Enemy, s: GameState) {
    const separation = { x: 0, y: 0 };
    const alignment = { x: 0, y: 0 };
    const cohesion = { x: 0, y: 0 };
    let count = 0;

    const neighbors = s.spatialGrid.queryRadius(e.x, e.y, CONFIG.BOIDS.ALIGNMENT_RADIUS);
    for(const other of neighbors) {
        if(other === e || !other.active || other.type === 'projectile') continue;
        
        const d = Utils.dist(e.x, e.y, other.x, other.y);
        
        // Separation
        if (d < CONFIG.BOIDS.SEPARATION_RADIUS) {
            separation.x += (e.x - other.x) / d;
            separation.y += (e.y - other.y) / d;
        }

        // Alignment
        alignment.x += other.vx;
        alignment.y += other.vy;

        // Cohesion
        cohesion.x += other.x;
        cohesion.y += other.y;
        
        count++;
    }

    if(count > 0) {
        alignment.x /= count; alignment.y /= count;
        cohesion.x = (cohesion.x / count - e.x); cohesion.y = (cohesion.y / count - e.y);
        
        const alignLen = Math.hypot(alignment.x, alignment.y);
        if(alignLen > 0) { alignment.x /= alignLen; alignment.y /= alignLen; }
        
        const cohLen = Math.hypot(cohesion.x, cohesion.y);
        if(cohLen > 0) { cohesion.x /= cohLen; cohesion.y /= cohLen; }
    }

    // Squad logic override
    if (e.squadId) {
        const leader = s.enemies.find(l => l.id === e.squadId);
        if (leader && leader.active) {
             let targetX = leader.x;
             let targetY = leader.y;
             if (e.squadOffset) {
                 targetX += Math.cos(e.squadOffset.angle) * e.squadOffset.dist;
                 targetY += Math.sin(e.squadOffset.angle) * e.squadOffset.dist;
                 // Rotate squad
                 e.squadOffset.angle += 0.01;
             }
             
             cohesion.x += (targetX - e.x) * 2;
             cohesion.y += (targetY - e.y) * 2;
        } else {
            e.squadId = undefined; // Leader died
        }
    }

    return { separation, alignment, cohesion };
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
                        
                        const angle = Math.random() * Math.PI * 2;
                        const spawnDist = (Math.max(s.width, s.height) / 2) / s.camera.zoom + 150;
                        const px = s.camera.x + Math.cos(angle) * spawnDist;
                        const py = s.camera.y + Math.sin(angle) * spawnDist;

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
                    const dist = (Math.max(s.width, s.height) / 2) / s.camera.zoom + 200;
                    d.id = Utils.uid('d');
                    d.x = s.camera.x + Math.cos(angle) * dist;
                    d.y = s.camera.y + Math.sin(angle) * dist;
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

                if (stick && stick.shooting) handleShooting(s, callbacks);
                else if (s.mouse.down) handleShooting(s, callbacks);

                if (s.keys.space || s.keys.shift) handleDash(s, callbacks, mx, my);
                if (s.keys.f && s.overdrive >= 100) handleUltimate(s, callbacks);
                if (s.keys.q && p.skills.q.cd <= 0) handleSkillQ(s, callbacks);
                if (s.keys.e && p.skills.e.cd <= 0) handleSkillE(s, callbacks);

                if (stick && (Math.abs(stick.aimX) > 0.1 || Math.abs(stick.aimY) > 0.1)) { p.angle = Math.atan2(stick.aimY, stick.aimX); } 
                else {
                    const screenPx = (p.x - s.camera.x) * s.camera.zoom + s.width / 2;
                    const screenPy = (p.y - s.camera.y) * s.camera.zoom + s.height / 2;
                    p.angle = Math.atan2((s.mouse.y - screenPy), s.mouse.x - screenPx);
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
            
            p.roll = Utils.lerp(p.roll, (p.vx / 10) * 0.5, 0.1);

            p.x = Utils.clamp(p.x + p.vx, 0, s.width);
            p.y = Utils.clamp(p.y + p.vy, 0, s.height);

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

                const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);
                let moveX = Math.cos(toPlayerAng);
                let moveY = Math.sin(toPlayerAng);

                // --- BOSS BEHAVIORS ---
                if (e.type.startsWith('boss')) {
                    e.attackTimer += timeStep;
                    
                    if (e.type === 'boss_warlord') {
                        // WARLORD: Aggressive Ramming
                        if (!e.state || e.state === 'idle') {
                            // Chasing
                            const angle = Math.atan2(p.y - e.y, p.x - e.x);
                            e.vx += Math.cos(angle) * 0.1 * timeStep;
                            e.vy += Math.sin(angle) * 0.1 * timeStep;
                            if (e.attackTimer > 240) {
                                e.state = 'charge';
                                e.stateTimer = 60; // Windup
                                e.attackTimer = 0;
                                callbacks.playSound('charge');
                                e.color = '#ffffff'; // Warning Flash
                            }
                        } else if (e.state === 'charge') {
                            e.stateTimer -= timeStep;
                            e.vx *= 0.9; e.vy *= 0.9; // Stop
                            if (e.stateTimer <= 0) {
                                // DASH
                                e.state = 'recover';
                                e.stateTimer = 40;
                                const angle = Math.atan2(p.y - e.y, p.x - e.x);
                                e.vx = Math.cos(angle) * 20;
                                e.vy = Math.sin(angle) * 20;
                                createShockwave(s, e.x, e.y, 200, '#ff0000', 10);
                                callbacks.playSound('dash');
                                e.color = '#ff0000';
                            }
                        } else if (e.state === 'recover') {
                            e.stateTimer -= timeStep;
                            e.vx *= 0.95; e.vy *= 0.95;
                            if (e.stateTimer <= 0) e.state = 'idle';
                        }
                    } 
                    else if (e.type === 'boss_hive') {
                        // HIVE: Shield & Summons (Classic behavior)
                        if (e.hp < e.maxHp * 0.5 && e.phase < 2) {
                            let spawnedCount = 0;
                            for(let k=0; k<4; k++) {
                                const pylon = s.pools.enemies.acquire();
                                if(pylon) {
                                    const angle = (Math.PI/2) * k;
                                    pylon.id = Utils.uid('pylon');
                                    pylon.x = e.x + Math.cos(angle) * 250;
                                    pylon.y = e.y + Math.sin(angle) * 250;
                                    pylon.vx = 0; pylon.vy = 0;
                                    pylon.hp = CONFIG.ENEMIES.PYLON.hp; pylon.maxHp = pylon.hp;
                                    pylon.type = 'pylon'; pylon.speed = 0; pylon.size = CONFIG.ENEMIES.PYLON.size;
                                    pylon.color = CONFIG.ENEMIES.PYLON.color; pylon.active = true; pylon.dead = false;
                                    pylon.invulnerable = false;
                                    pylon.sides = 4; pylon.parentId = e.id;
                                    s.enemies.push(pylon);
                                    spawnedCount++;
                                }
                            }
                            if (spawnedCount > 0) { e.phase = 2; e.invulnerable = true; callbacks.playSound('charge'); createShockwave(s, e.x, e.y, 500, '#ff0000', 15); } 
                            else { e.phase = 3; e.invulnerable = false; }
                        } 
                        
                        if (e.phase === 2) {
                            const pylons = s.enemies.filter(sub => sub.type === 'pylon' && sub.parentId === e.id && sub.active && !sub.dead);
                            if (pylons.length === 0) { e.invulnerable = false; e.phase = 3; e.color = '#ff0000'; callbacks.playSound('glitch_start'); } 
                            else { e.invulnerable = true; e.color = '#555555'; }
                        }

                        if (e.y < 150) e.y += 1.5 * timeStep;
                        if (!e.invulnerable && Math.floor(e.attackTimer) % 8 === 0) {
                            const angle = e.attackTimer * 0.08;
                            for (let k = 0; k < 3; k++) {
                                const proj = s.pools.enemies.acquire();
                                if (proj) {
                                    const fa = angle + (Math.PI * 2 / 3) * k;
                                    proj.id = Utils.uid('bp'); proj.x = e.x; proj.y = e.y;
                                    proj.vx = Math.cos(fa) * 4; proj.vy = Math.sin(fa) * 4;
                                    proj.type = 'projectile'; proj.size = 6; proj.color = '#ff0000'; proj.life = 200; proj.hp = 1; proj.active = true;
                                    s.enemies.push(proj);
                                }
                            }
                        }
                        e.vx *= 0.94; e.vy *= 0.94; // Drift stop
                    }
                    else if (e.type === 'boss_omni') {
                        // OMNI: Bullet Hell
                        if (e.y < s.height/2) e.y += 0.5 * timeStep; // Float to center
                        e.rotation += 0.02;
                        
                        // Spiral shot
                        if (s.frame % 4 === 0) {
                            const proj = s.pools.enemies.acquire();
                            if(proj) {
                                const ang = s.frame * 0.1;
                                proj.id = Utils.uid('bp'); proj.x = e.x; proj.y = e.y;
                                proj.vx = Math.cos(ang) * 5; proj.vy = Math.sin(ang) * 5;
                                proj.type = 'projectile'; proj.size = 5; proj.color = '#ffffff'; proj.life = 200; proj.hp = 1; proj.active = true;
                                s.enemies.push(proj);
                            }
                            const proj2 = s.pools.enemies.acquire();
                            if(proj2) {
                                const ang = s.frame * 0.1 + Math.PI;
                                proj2.id = Utils.uid('bp'); proj2.x = e.x; proj2.y = e.y;
                                proj2.vx = Math.cos(ang) * 5; proj2.vy = Math.sin(ang) * 5;
                                proj2.type = 'projectile'; proj2.size = 5; proj2.color = '#ffffff'; proj2.life = 200; proj2.hp = 1; proj2.active = true;
                                s.enemies.push(proj2);
                            }
                        }
                        
                        // Burst
                        if (Math.floor(e.attackTimer) % 300 === 0) {
                            callbacks.playSound('charge');
                            for(let k=0; k<16; k++) {
                                const proj = s.pools.enemies.acquire();
                                if(proj) {
                                    const ang = (Math.PI*2/16)*k;
                                    proj.id = Utils.uid('bp'); proj.x = e.x; proj.y = e.y;
                                    proj.vx = Math.cos(ang) * 8; proj.vy = Math.sin(ang) * 8;
                                    proj.type = 'projectile'; proj.size = 8; proj.color = '#00ffff'; proj.life = 300; proj.hp = 1; proj.active = true;
                                    s.enemies.push(proj);
                                }
                            }
                        }
                    }

                    // Physics limits
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep;
                    e.x = Utils.clamp(e.x, e.size, s.width - e.size);
                    e.y = Utils.clamp(e.y, e.size, s.height - e.size);
                } 
                else if (e.type !== 'pylon' && e.type !== 'projectile' && e.type !== 'snake_body') {
                    if (s.quality !== 'LOW') {
                        const flocking = applyFlocking(e, s);
                        moveX = moveX * CONFIG.BOIDS.PLAYER_WEIGHT + flocking.separation.x * CONFIG.BOIDS.SEPARATION_WEIGHT + flocking.alignment.x * CONFIG.BOIDS.ALIGNMENT_WEIGHT + flocking.cohesion.x * CONFIG.BOIDS.COHESION_WEIGHT;
                        moveY = moveY * CONFIG.BOIDS.PLAYER_WEIGHT + flocking.separation.y * CONFIG.BOIDS.SEPARATION_WEIGHT + flocking.alignment.y * CONFIG.BOIDS.ALIGNMENT_WEIGHT + flocking.cohesion.y * CONFIG.BOIDS.COHESION_WEIGHT;
                        const len = Math.hypot(moveX, moveY);
                        if (len > 0) { moveX /= len; moveY /= len; }
                    }
                    const accel = (e.type === 'tank' ? 0.15 : 0.2) * timeStep;
                    e.vx += moveX * accel; e.vy += moveY * accel;
                    const spd = Math.hypot(e.vx, e.vy);
                    if (spd > e.speed * speedMult) { e.vx = (e.vx / spd) * e.speed * speedMult; e.vy = (e.vy / spd) * e.speed * speedMult; }
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep;
                }
                
                if (e.type === 'snake_head') { 
                    e.rotation = toPlayerAng; const wave = Math.sin(s.frame * 0.1) * 0.5; moveX += Math.cos(toPlayerAng + Math.PI/2) * wave; moveY += Math.sin(toPlayerAng + Math.PI/2) * wave; const len = Math.hypot(moveX, moveY); if(len > 0) { moveX/=len; moveY/=len; } e.vx += moveX * 0.2 * timeStep; e.vy += moveY * 0.2 * timeStep; 
                    if (s.frame % 3 === 0) { if (!e.history) e.history = []; e.history.unshift({x: e.x, y: e.y}); if (e.history.length > 50) e.history.pop(); } 
                } else if (e.type === 'snake_body') { 
                    const head = s.enemies.find(h => h.id === e.parentId); if (head && head.history) { const targetIndex = (e.segmentIndex || 1) * 6; if (head.history[targetIndex]) { const target = head.history[targetIndex]; e.x = Utils.lerp(e.x, target.x, 0.2); e.y = Utils.lerp(e.y, target.y, 0.2); } } else { e.dead = true; } 
                }

                if (e.type === 'projectile') {
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep; e.life -= timeStep; 
                    if (e.life <= 0 || !Utils.inBounds(e.x, e.y, s.width, s.height, 100)) e.dead = true;
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

                if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.width, s.height, 200)) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue; }

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
            for (let i = s.particles.length - 1; i >= 0; i--) { const pt = s.particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.vx *= pt.friction; pt.vy *= pt.friction; pt.life--; if (pt.life <= 0) { s.pools.particles.release(pt); s.particles.splice(i, 1); } }
            
            // Shield Ripples
            for (let i = s.shieldRipples.length - 1; i >= 0; i--) { const r = s.shieldRipples[i]; r.radius += 5; r.alpha -= 0.1; if (r.alpha <= 0) s.shieldRipples.splice(i, 1); }
        }
    }
};

// --- HANDLERS ---

function handleShooting(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.cd > 0) return;

    callbacks.playSound('shoot'); 
    const arch = CONFIG.WEAPONS[p.weapon];
    const baseDmg = 10 * p.stats.damageMod * arch.dmgMult;

    const fireBullet = (angleOffset: number) => {
        const bullet = s.pools.bullets.acquire();
        if (!bullet) return;
        const finalAngle = p.angle + angleOffset;
        bullet.id = Utils.uid('b'); bullet.x = p.x + Math.cos(finalAngle) * 25; bullet.y = p.y + Math.sin(finalAngle) * 25; bullet.vx = Math.cos(finalAngle) * arch.speed; bullet.vy = Math.sin(finalAngle) * arch.speed; bullet.life = arch.lifetime; bullet.color = arch.color; bullet.dmg = baseDmg; bullet.pierce = (arch.pierce || 0) + p.stats.pierce; bullet.homing = Math.max(arch.homing || 0, p.stats.homing); bullet.size = arch.size || 3; bullet.knockback = arch.knockback || 1; bullet.active = true; bullet.trail = []; bullet.elemental = { ...p.stats.elemental };
        if (arch.name === 'Arc Caster') { bullet.isBeam = true; bullet.beamPoints = [{x: bullet.x, y: bullet.y}]; } else { bullet.isBeam = false; }
        s.bullets.push(bullet);
    };

    fireBullet(Utils.rand(-arch.spread, arch.spread));
    const count = (arch.count || 1) + p.stats.multishot;
    for (let i = 1; i < count; i++) { const spread = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (arch.spread || 0.1); fireBullet(spread); }

    p.cd = Math.max(2, 20 / p.stats.fireRateMod * arch.fireDelay);
    s.shake = arch.name === 'Rail Driver' ? 5 : 2;
    p.muzzleFlash = 4;
    
    // Recoil
    const recoil = arch.recoil || 0.5;
    p.vx -= Math.cos(p.angle) * recoil;
    p.vy -= Math.sin(p.angle) * recoil;
}

function handleDash(s: GameState, callbacks: GameCallbacks, mx: number, my: number) {
    const p = s.player;
    if (p.dashCd > 0) return;
    callbacks.playSound('dash');
    p.dashCd = p.maxDashCd;
    p.invuln = CONFIG.PLAYER.DASH.INVULN_DURATION;
    let dmx = 0, dmy = 0;
    if (Math.abs(mx) > 0.1 || Math.abs(my) > 0.1) { dmx = mx; dmy = my; } else { dmx = Math.cos(p.angle); dmy = Math.sin(p.angle); }
    const dm = Math.hypot(dmx, dmy); if(dm > 0) { dmx/=dm; dmy/=dm; }
    p.vx += dmx * CONFIG.PLAYER.DASH.SPEED; p.vy += dmy * CONFIG.PLAYER.DASH.SPEED;
    createShockwave(s, p.x, p.y, 200, CONFIG.COLORS.PLAYER_DASH, 10);
}

function handleUltimate(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    s.overdrive = 0;
    callbacks.playSound('ultimate');
    createShockwave(s, p.x, p.y, 1500, CONFIG.COLORS.ULTIMATE, 25);
    s.shake = 30;
    s.bullets.forEach(b => s.pools.bullets.release(b));
    s.bullets = [];
    for (const e of s.enemies) { if(e.active) { e.hp -= 200; e.hitFlash = 10; if(e.hp <= 0 && !e.dead) handleEnemyDeath(s, e, callbacks, {x: 0, y: 0}); } }
}

function handleSkillQ(s: GameState, callbacks: GameCallbacks) {
    const p = s.player; p.skills.q.active = true; p.skills.q.duration = p.skills.q.maxDuration; p.skills.q.cd = p.skills.q.maxCd; callbacks.playSound('chrono'); callbacks.setAudioTempo(0.5); createShockwave(s, p.x, p.y, 800, '#00ffff', 40);
}

function handleSkillE(s: GameState, callbacks: GameCallbacks) {
    const p = s.player; p.skills.e.cd = p.skills.e.maxCd; callbacks.playSound('fracture'); s.blackHoles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 300, maxLife: 300, radius: 10, pullRange: 400, color: '#000000', active: true });
}

function handlePlayerHit(s: GameState, e: Enemy, callbacks: GameCallbacks) {
    const p = s.player;
    
    // Shield Ripple Effect
    s.shieldRipples.push({ x: p.x, y: p.y, radius: 20, alpha: 1.0 });
    
    const damage = e.type.startsWith('boss') ? 40 : 15;
    p.hp -= damage; s.shake = 15; s.hitStop = 4; p.invuln = CONFIG.PLAYER.INVULN_ON_HIT; p.hitFlash = 10; s.combo = 0; s.comboTimer = 0;
    callbacks.playSound('hit');
    createShockwave(s, p.x, p.y, 100, '#ff0000', 10);
    
    if (p.hull === 'BASTION' && !e.invulnerable) { e.hp -= 50; e.hitFlash = 10; const ang = Math.atan2(e.y - p.y, e.x - p.x); e.vx += Math.cos(ang) * 30; e.vy += Math.sin(ang) * 30; createExplosion(s, e.x, e.y, '#ff9900', 10, 2); }
    
    if (p.hp <= 0) {
        s.gameOver = true; s.hitStop = 0; s.timeScale = 0.1; callbacks.playSound('gameover');
        const runData = { score: Math.floor(s.score), wave: s.wave, level: s.player.level, duration: s.runDuration, upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count })), weapon: s.player.weapon, hull: s.player.hull };
        callbacks.onGameOver(runData);
    }
}

// --- MAIN EXPORT ---

export function updateGame(s: GameState, callbacks: GameCallbacks) {
    if (s.hitStop > 0) { s.hitStop--; s.shake = 5; return; }

    if (s.player.xp >= s.player.xpToNext) {
        s.player.xp -= s.player.xpToNext; s.player.level++; s.player.xpToNext = Math.floor(s.player.xpToNext * CONFIG.PROGRESSION.XP_SCALE);
        callbacks.playSound('levelup'); createEvolutionEffect(s, s.player.x, s.player.y, '#00ff00');
        const opts: UpgradeOption[] = [];
        const pool = UPGRADES.filter(u => (s.upgradeStacks.get(u.id) || 0) < u.maxStack);
        for(let k=0; k<3; k++) { if (pool.length === 0) break; const idx = Math.floor(Math.random() * pool.length); const upgrade = pool[idx]; opts.push({ ...upgrade, currentStack: s.upgradeStacks.get(upgrade.id) || 0 }); pool.splice(idx, 1); }
        callbacks.onLevelUp(opts);
    }

    const step = s.quality === 'LOW' ? 3 : s.quality === 'MEDIUM' ? 2 : 1;
    if (s.frame % step === 0) { s.spatialGrid.clear(); for (const e of s.enemies) if (e.active) s.spatialGrid.insert(e); }
    s.visualGrid.update(s.qualitySettings.gridStep);

    // Update Debris
    for(const d of s.debris) { d.x += d.vx; d.y += d.vy; d.rotation += d.vRot; }

    // Execute Systems
    Systems.Wave.update(s, callbacks);
    Systems.Player.update(s, callbacks);
    Systems.Enemies.update(s, callbacks);
    Systems.Combat.update(s, callbacks);
    Systems.Cleanup.update(s);

    // Camera Physics (Lazy Follow)
    s.camera.x = Utils.lerp(s.camera.x, s.player.x + s.player.vx * 30, 0.05); // More lead, slower lerp
    s.camera.y = Utils.lerp(s.camera.y, s.player.y + s.player.vy * 30, 0.05);
    const speedMag = Math.hypot(s.player.vx, s.player.vy);
    const targetZ = Math.max(0.6, 1.0 - (speedMag * 0.02));
    s.camera.zoom = Utils.lerp(s.camera.zoom, targetZ, 0.05);
    s.camera.x = Utils.clamp(s.camera.x, 0, s.width);
    s.camera.y = Utils.clamp(s.camera.y, 0, s.height);

    s.frame++;
}

// --- RENDERING ---

export function renderGame(ctx: CanvasRenderingContext2D, distCtx: CanvasRenderingContext2D, s: GameState) {
    const { width, height } = s;
    
    // 1. Safe Clear (Fix Green Screen)
    ctx.globalCompositeOperation = 'source-over';
    
    // HARD RESET BACKGROUND to prevent artifact flooding
    ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    
    distCtx.fillStyle = '#000000'; 
    distCtx.fillRect(0, 0, width, height);

    ctx.save();
    distCtx.save();

    // Camera Transform
    const cx = width / 2; const cy = height / 2;
    ctx.translate(cx, cy); distCtx.translate(cx, cy);
    ctx.scale(s.camera.zoom, s.camera.zoom); distCtx.scale(s.camera.zoom, s.camera.zoom);
    let shakeX = (Math.random() - 0.5) * s.shake; let shakeY = (Math.random() - 0.5) * s.shake;
    ctx.translate(-s.camera.x + shakeX, -s.camera.y + shakeY); distCtx.translate(-s.camera.x + shakeX, -s.camera.y + shakeY);

    // 2. Parallax Stars (Fix Static Frame)
    ctx.fillStyle = '#ffffff';
    // Ensure stars exist (safeguard)
    if (s.stars && s.stars.length > 0) {
        for(const star of s.stars) {
            // Calculate parallax position (wrap around world)
            const parallaxX = (star.x - s.camera.x * (1 - star.z));
            const parallaxY = (star.y - s.camera.y * (1 - star.z));
            
            // Wrap logic relative to viewport center
            const wx = (parallaxX % (width * 1.5) + (width * 1.5)) % (width * 1.5) + s.camera.x - width*0.75;
            const wy = (parallaxY % (height * 1.5) + (height * 1.5)) % (height * 1.5) + s.camera.y - height*0.75;

            ctx.globalAlpha = star.brightness;
            ctx.fillRect(wx, wy, star.size, star.size);
        }
    }
    ctx.globalAlpha = 1.0;

    // 3. Grid
    s.visualGrid.render(ctx, s.quality === 'LOW' ? 2 : 1);

    // 4. Debris
    for(const d of s.debris) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        for(let i=0; i<d.sides; i++) {
            const a = (Math.PI * 2 / d.sides) * i;
            const r = d.size * (0.8 + Math.random() * 0.4); // Jagged
            const dx = Math.cos(a) * r;
            const dy = Math.sin(a) * r;
            if(i===0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // 5. Black Holes
    for(const bh of s.blackHoles) {
        ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2); ctx.fillStyle = '#000000'; ctx.fill();
        ctx.strokeStyle = bh.color; ctx.lineWidth = 2; ctx.stroke();
        distCtx.beginPath(); distCtx.arc(bh.x, bh.y, bh.pullRange, 0, Math.PI * 2);
        const grad = distCtx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.pullRange);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#000000');
        distCtx.fillStyle = grad; distCtx.fill();
    }

    // 6. Entities
    for(const g of s.gems) { if(!g.active) continue; ctx.fillStyle = CONFIG.COLORS.XP_GEM; ctx.beginPath(); ctx.arc(g.x, g.y, 3, 0, Math.PI * 2); ctx.fill(); }
    for(const p of s.pickups) { if(!p.active) continue; ctx.fillStyle = '#00ff00'; ctx.fillRect(p.x - 4, p.y - 4, 8, 8); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('+', p.x, p.y + 4); }

    for(const e of s.enemies) {
        if(!e.active) continue;
        if (e.squadId && e.active && !e.dead) {
            const leader = s.enemies.find(l => l.id === e.squadId);
            if (leader && leader.active) {
                ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(leader.x, leader.y);
                const alpha = 0.1 + Math.sin(s.frame * 0.2) * 0.05;
                ctx.strokeStyle = e.squadRole === 'protector' ? `rgba(0, 255, 170, ${alpha})` : `rgba(255, 255, 0, ${alpha})`;
                ctx.lineWidth = 1; ctx.stroke();
            }
        }
        ctx.save(); ctx.translate(e.x, e.y);
        if(e.hitFlash > 0) ctx.fillStyle = '#ffffff'; else ctx.fillStyle = e.color;
        
        if (e.type === 'snake_body' || e.type === 'snake_head') { ctx.fillRect(-e.size/2, -e.size/2, e.size, e.size); } 
        else if (e.type.startsWith('boss')) {
            if (e.invulnerable) {
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, e.size + 10, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.beginPath(); const sides = e.sides || 6;
            for(let i=0; i<sides; i++) { const angle = (Math.PI * 2 / sides) * i + (s.frame * 0.02); const x = Math.cos(angle) * e.size; const y = Math.sin(angle) * e.size; if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.closePath(); ctx.fill(); if (e.invulnerable) ctx.stroke();
        } else {
            ctx.rotate(e.rotation || 0);
            if(e.sides > 0) { ctx.beginPath(); for(let i=0; i<e.sides; i++) { const angle = (Math.PI * 2 / e.sides) * i; const x = Math.cos(angle) * e.size; const y = Math.sin(angle) * e.size; if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill(); }
        }
        e.status.forEach((st, i) => { ctx.fillStyle = st.type === 'BURN' ? '#ff4400' : '#00ffff'; ctx.beginPath(); ctx.arc(10 + (i * 6), -10, 3, 0, Math.PI * 2); ctx.fill(); });
        if(e.isElite) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.size + 5, 0, Math.PI * 2); ctx.stroke(); }
        if (e.hp < e.maxHp && e.maxHp > 30) { ctx.fillStyle = '#ff0000'; ctx.fillRect(-15, e.size + 5, 30, 4); ctx.fillStyle = '#00ff00'; ctx.fillRect(-15, e.size + 5, 30 * (e.hp / e.maxHp), 4); }
        ctx.restore();
        if (e.trail && e.trail.length > 0) { ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.trail[0].x, e.trail[0].y); for(let i=1; i<e.trail.length; i++) ctx.lineTo(e.trail[i].x, e.trail[i].y); ctx.stroke(); }
    }

    // 7. Player
    const p = s.player;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + p.roll);
    ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : CONFIG.COLORS.PLAYER;
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, 10); ctx.lineTo(-5, 0); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill();
    if (p.invuln > 0 || p.dashCd > p.maxDashCd - 20) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke(); }
    if (p.muzzleFlash > 0) { ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.arc(20, 0, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    
    // 8. Shield Ripples
    for(const r of s.shieldRipples) {
        distCtx.beginPath();
        distCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        distCtx.strokeStyle = `rgba(255, 255, 255, ${r.alpha})`;
        distCtx.lineWidth = 10 * r.alpha;
        distCtx.stroke();
    }

    if (s.orbitals.length > 0) { s.orbitals.forEach((orb) => { const ox = p.x + Math.cos(orb.angle) * orb.dist; const oy = p.y + Math.sin(orb.angle) * orb.dist; ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)'; ctx.beginPath(); ctx.arc(p.x, p.y, orb.dist, orb.angle - 0.5, orb.angle); ctx.stroke(); }); }

    for(const b of s.bullets) { if(!b.active) continue; ctx.fillStyle = b.color; if (b.isBeam && b.beamPoints) { if (b.beamPoints.length > 1) { ctx.strokeStyle = b.color; ctx.lineWidth = b.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.beamPoints[0].x, b.beamPoints[0].y); for(let k=1; k<b.beamPoints.length; k++) ctx.lineTo(b.beamPoints[k].x, b.beamPoints[k].y); ctx.stroke(); } } else { ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill(); } if (!b.isBeam && b.trail.length > 0) { ctx.strokeStyle = b.color; ctx.lineWidth = b.size / 2; ctx.beginPath(); ctx.moveTo(b.trail[0].x, b.trail[0].y); for(let t=1; t<b.trail.length; t++) ctx.lineTo(b.trail[t].x, b.trail[t].y); ctx.stroke(); } }
    for(const pt of s.particles) { if(!pt.active) continue; ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; if(pt.type === 'shard') { ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rotation || 0); ctx.fillRect(-pt.size/2, -pt.size/2, pt.size, pt.size); ctx.restore(); } else if (pt.type === 'lightning' && pt.targetX !== undefined) { ctx.strokeStyle = pt.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo((pt.x + pt.targetX) / 2 + (Math.random() - 0.5) * 20, (pt.y + pt.targetY) / 2 + (Math.random() - 0.5) * 20); ctx.lineTo(pt.targetX, pt.targetY); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1.0; }
    for(let i=s.shockwaves.length-1; i>=0; i--) { const sw = s.shockwaves[i]; ctx.strokeStyle = sw.color; ctx.lineWidth = sw.width * sw.alpha; ctx.globalAlpha = sw.alpha; ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1.0; if (sw.alpha > 0.2) { distCtx.beginPath(); distCtx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2); distCtx.strokeStyle = `rgb(${Math.floor(255 * sw.alpha)}, 0, 0)`; distCtx.lineWidth = sw.width; distCtx.stroke(); } }
    ctx.textAlign = 'center'; for(const t of s.texts) { ctx.fillStyle = t.color; ctx.font = `bold ${t.size}px monospace`; ctx.globalAlpha = Math.min(1, t.life / 20); ctx.fillText(t.text, t.x, t.y); ctx.globalAlpha = 1.0; }
    
    ctx.restore(); distCtx.restore();
    if(s.screenFlash > 0) { ctx.fillStyle = s.flashColor; ctx.globalAlpha = s.screenFlash; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1.0; }
}

export function createGameState(width: number, height: number): GameState {
    const s: GameState = {
        active: false, paused: false, gameOver: false, autoMode: false,
        frame: 0, hitStop: 0, width, height, pixelRatio: window.devicePixelRatio || 1,
        camera: { x: width/2, y: height/2, zoom: 1, targetZoom: 1 },
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
        visualGrid: new VisualGrid(width, height, CONFIG.GRID.CELL_SIZE),
        damageDealtBuffer: 0
    };
    
    resetPlayer(s.player, width, height, 'INTERCEPTOR');
    
    // Init Stars
    for(let i=0; i<100; i++) {
        s.stars.push({
            x: Math.random() * width * 2, y: Math.random() * height * 2,
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

    // Reset basics
    p.x = w/2; p.y = h/2; p.vx = 0; p.vy = 0; p.active = true;
    p.hull = hullType;
    p.hp = hull.hp; p.maxHp = hull.hp;
    p.xp = 0; p.level = 1; p.xpToNext = CONFIG.PROGRESSION.XP_BASE;
    p.angle = -Math.PI/2; p.roll = 0;
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
