
import { GameState, Enemy, GameCallbacks } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';
import { createExplosion, createShockwave, createFloatingText, setupEnemy, spawnBoss } from './generators';

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
    if(s.visualGrid) s.visualGrid.applyForce(e.x, e.y, e.size * 3, 40);

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
    let aimAngle = p.angle;

    const searchRadius = 800; // Look further
    const nearby = s.spatialGrid.queryRadius(p.x, p.y, searchRadius);
    
    // 1. Analyze Environment
    let enemies: Enemy[] = [];
    let bullets: Enemy[] = [];
    
    for(const e of nearby) {
        if (!e.active) continue;
        if (e.type === 'projectile') bullets.push(e as Enemy);
        else if (e !== p) enemies.push(e as Enemy);
    }
    
    // Gems are not usually in spatial grid in this engine impl, check global list
    // Optimization: Filter global gems for distance
    const nearbyGems = s.gems.filter(g => g.active && Utils.dist(p.x, p.y, g.x, g.y) < 500);

    // 2. Calculate Influence Vectors
    
    // Danger Vector (Repulsion from enemies/bullets)
    let dangerX = 0, dangerY = 0;
    let dangerLevel = 0;
    
    for (const e of enemies) {
        const d = Utils.dist(p.x, p.y, e.x, e.y);
        if (d < 250) {
            const weight = (250 - d) / 250;
            dangerX -= (e.x - p.x) * weight;
            dangerY -= (e.y - p.y) * weight;
            dangerLevel += weight;
        }
    }
    
    for (const b of bullets) {
        const d = Utils.dist(p.x, p.y, b.x, b.y);
        if (d < 180) { 
            const weight = (180 - d) / 180;
            dangerX -= (b.x - p.x) * weight * 3.0; // Bullets are very dangerous
            dangerY -= (b.y - p.y) * weight * 3.0;
            dangerLevel += weight * 2.0;
        }
    }

    // Resource Vector (Attraction to gems)
    let gemX = 0, gemY = 0;
    let gemWeight = 0;
    if (dangerLevel < 2.5 && nearbyGems.length > 0) {
        let closestGem = null;
        let minDist = Infinity;
        for (const g of nearbyGems) {
            const d = Utils.dist(p.x, p.y, g.x, g.y);
            if (d < minDist) { minDist = d; closestGem = g; }
        }
        if (closestGem) {
            gemX = (closestGem.x - p.x);
            gemY = (closestGem.y - p.y);
            gemWeight = 1.5;
        }
    }

    // Target Vector (Attraction/Kiting)
    let target = null;
    let closestDist = Infinity;
    for (const e of enemies) {
        const d = Utils.dist(p.x, p.y, e.x, e.y);
        if (d < closestDist) { closestDist = d; target = e; }
    }

    // 3. Decision Logic
    if (dangerLevel > 1.0) {
        // EVASION MODE
        mx = dangerX;
        my = dangerY;
        if (dangerLevel > 4.0 || bullets.some(b => Utils.dist(p.x, p.y, b.x, b.y) < 80)) {
            dash = true;
        }
    } else {
        // AGGRESSION / GATHER MODE
        if (gemWeight > 0 && (!target || closestDist > 300)) {
            // Prioritize gems if safe-ish
            mx = gemX;
            my = gemY;
        } else if (target) {
            // Kite or Chase
            const optimalRange = 250;
            const dist = closestDist;
            
            if (dist > optimalRange) {
                // Chase
                mx = target.x - p.x;
                my = target.y - p.y;
            } else {
                // Strafe (Perpendicular) + Backpedal
                const dx = target.x - p.x;
                const dy = target.y - p.y;
                mx = -dy - dx * 0.5;
                my = dx - dy * 0.5;
            }
        } else {
            // Wander towards center or random
            mx = (s.worldWidth/2 - p.x) * 0.1 + Math.cos(s.frame * 0.05) * 50;
            my = (s.worldHeight/2 - p.y) * 0.1 + Math.sin(s.frame * 0.05) * 50;
        }
    }

    // Aiming
    if (target) {
        aimAngle = Math.atan2(target.y - p.y, target.x - p.x);
        shoot = true;
        
        // Skill usage
        if (dangerLevel > 3.0 || target.isElite) e_skill = true;
        if ((target.isElite || target.type.startsWith('boss')) && dangerLevel > 1.0) q = true;
        if (s.overdrive >= 100 && (dangerLevel > 5.0 || target.type.startsWith('boss'))) ult = true;
    } else {
        shoot = false;
        aimAngle = Math.atan2(my, mx); // Look where moving
    }

    // Normalize Input
    const len = Math.hypot(mx, my);
    if(len > 0) { mx/=len; my/=len; }

    return { mx, my, aimAngle, shoot, dash, ult, q, e: e_skill };
}

function updateSquadTactics(s: GameState) {
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

export const Systems = {
    Camera: {
        update: (s: GameState) => {
            if (!s.player.active) return;
            const targetX = s.player.x;
            const targetY = s.player.y;
            
            // Smooth Camera Follow
            const lerpSpeed = 0.1;
            s.camera.x += (targetX - s.camera.x) * lerpSpeed;
            s.camera.y += (targetY - s.camera.y) * lerpSpeed;
            
            // Optional: Clamp to world bounds (keep view inside world mostly)
            // s.camera.x = Utils.clamp(s.camera.x, s.width/2, s.worldWidth - s.width/2);
            // s.camera.y = Utils.clamp(s.camera.y, s.height/2, s.worldHeight - s.height/2);
        }
    },

    Wave: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            if (!s.bossActive && s.waveKills >= s.waveQuota) {
                spawnBoss(s, callbacks);
                return;
            }

            if (s.bossActive) return;

            if (s.wave % 10 === 0) s.waveType = 'CHAOS';
            else if (s.wave % 5 === 0) s.waveType = 'HEAVY';
            else if (s.wave % 3 === 0) s.waveType = 'ELITE_SQUAD';
            else if (s.wave % 2 === 0) s.waveType = 'MIXED';
            else s.waveType = 'SWARM';

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
                        const spawnDist = 500 / s.camera.zoom;
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
            
            if (p.skills.q.active) { p.skills.q.duration--; if (p.skills.q.duration <= 0) { p.skills.q.active = false; callbacks.setAudioTempo(1.0); } } else { if (p.skills.q.cd > 0) p.skills.q.cd--; }
            if (p.skills.e.cd > 0) p.skills.e.cd--;
            if (p.dashCd > 0) p.dashCd -= s.playerTimeScale;
            if (p.invuln > 0) p.invuln -= s.playerTimeScale;
            if (p.cd > 0) p.cd -= s.playerTimeScale;
            if (p.hitFlash > 0) p.hitFlash--;
            if (p.muzzleFlash > 0) p.muzzleFlash--;

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

                if (isShooting) {
                    p.angle = Math.atan2(aimY, aimX);
                } else {
                    const speed = Math.hypot(p.vx, p.vy);
                    if (speed > 0.1) {
                        const targetAngle = Math.atan2(p.vy, p.vx);
                        const diff = Utils.angleDiff(p.angle, targetAngle);
                        p.angle += diff * 0.15;
                    }
                }
            }

            const thrust = CONFIG.PLAYER.THRUST * p.stats.speedMod * s.playerTimeScale;
            const len = Math.hypot(mx, my);
            if (len > 1) { mx /= len; my /= len; }

            p.vx += mx * thrust;
            p.vy += my * thrust;
            
            p.vx *= CONFIG.PLAYER.FRICTION;
            p.vy *= CONFIG.PLAYER.FRICTION;
            
            const currentSpeed = Math.hypot(p.vx, p.vy);
            if (currentSpeed > 0.5) {
                const rightX = Math.cos(p.angle + Math.PI/2);
                const rightY = Math.sin(p.angle + Math.PI/2);
                const sideVel = p.vx * rightX + p.vy * rightY;
                p.roll = Utils.lerp(p.roll, sideVel * 0.1, 0.1);
            } else {
                p.roll = Utils.lerp(p.roll, 0, 0.1);
            }

            p.x = Utils.clamp(p.x + p.vx, 0, s.worldWidth);
            p.y = Utils.clamp(p.y + p.vy, 0, s.worldHeight);
            
            if (len > 0.1 && s.visualGrid) {
                s.visualGrid.applyForce(p.x, p.y, 40, len * 5);
            }

            if (len > 0.1) {
                if (s.frame % 2 === 0) {
                    const t = s.pools.particles.acquire();
                    if(t) {
                        const angle = Math.atan2(my, mx) + Math.PI;
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

                let moveX = 0;
                let moveY = 0;

                if (e.type.startsWith('boss') || e.type === 'pylon' || e.type === 'projectile' || e.type.startsWith('snake')) {
                     const toPlayerAng = Math.atan2(p.y - e.y, p.x - e.x);
                     moveX = Math.cos(toPlayerAng);
                     moveY = Math.sin(toPlayerAng);
                     
                     if (e.type === 'boss_warlord') {
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
                    const forces = applyVariationalBoids(e, s);
                    const accel = (e.type === 'tank' ? 0.15 : 0.2) * timeStep;
                    e.vx += forces.x * accel * 0.01;
                    e.vy += forces.y * accel * 0.01;
                }
                
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
                    const spd = Math.hypot(e.vx, e.vy);
                    if (spd > e.speed * speedMult) { e.vx = (e.vx / spd) * e.speed * speedMult; e.vy = (e.vy / spd) * e.speed * speedMult; }
                    
                    e.x += e.vx * timeStep; e.y += e.vy * timeStep;
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
            
            for (let i = s.particles.length - 1; i >= 0; i--) { 
                const pt = s.particles[i]; 
                if(!pt.active) continue;
                pt.x += pt.vx; pt.y += pt.vy; 
                pt.vx *= pt.friction; pt.vy *= pt.friction; 
                pt.life--; 
                if (pt.life <= 0) { s.pools.particles.release(pt); s.particles.splice(i, 1); } 
            }
            
            for (let i = s.shieldRipples.length - 1; i >= 0; i--) { const r = s.shieldRipples[i]; r.radius += 5; r.alpha -= 0.1; if (r.alpha <= 0) s.shieldRipples.splice(i, 1); }
        }
    }
};
