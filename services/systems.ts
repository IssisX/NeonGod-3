
import { GameState, Enemy, GameCallbacks, BossModule, Player } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';
import { createExplosion, createShockwave, createFloatingText, setupEnemy, spawnBoss, createAsteroid, createShipDebris, createSparks } from './generators';
import { PhysicsSystem } from './physics';
import { AIFactory, Brain } from './ai';
import { IKChain } from './ik';

// --- MATH HELPERS ---

function pointInPolygon(px: number, py: number, polygon: number[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        const xi = polygon[i], yi = polygon[i + 1];
        const xj = polygon[j], yj = polygon[j + 1];
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getTransformedPolygon(e: Enemy, mod: BossModule, rot: number): number[] {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const modX = e.x + (mod.xOffset * cos - mod.yOffset * sin);
    const modY = e.y + (mod.xOffset * sin + mod.yOffset * cos);
    const totalRot = rot + mod.rotation;
    const mCos = Math.cos(totalRot);
    const mSin = Math.sin(totalRot);
    const poly: number[] = [];
    for (let i = 0; i < mod.shape.length; i += 2) {
        const lx = mod.shape[i];
        const ly = mod.shape[i + 1];
        poly.push(modX + (lx * mCos - ly * mSin));
        poly.push(modY + (lx * mSin + ly * mCos));
    }
    return poly;
}

// --- CORE SYSTEMS ---

function handleEnemyDeath(s: GameState, e: Enemy, callbacks: GameCallbacks, impactVel: {x: number, y: number}) {
    if (e.dead) return;
    e.dead = true;
    e.active = false;
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
    const isLarge = e.mass > 10;
    createExplosion(s, e.x, e.y, e.color, Math.min(20, e.size), isLarge ? 4 : 2);
    
    // Debris Spawning (Physics Scrap)
    if (!e.type.startsWith('boss')) {
        const scrapCount = Math.min(4, Math.ceil(e.size / 8));
        for(let i=0; i<scrapCount; i++) {
            createShipDebris(s, e.x, e.y, e.color, e.size * 0.4, e.vx, e.vy);
        }
    }

    if (isLarge || e.isElite) {
        s.hitStop = 4; 
        s.shake += 15;
        createShockwave(s, e.x, e.y, e.size * 4, e.color, 15);
    }
    callbacks.playSound('explosion', e.x, e.y);
    if(s.visualGrid) s.visualGrid.applyForce(e.x, e.y, e.size * 3, 40);

    s.combo++;
    s.comboTimer = CONFIG.PROGRESSION.COMBO_DURATION;
    s.overdrive = Math.min(100, s.overdrive + (e.isElite ? 5 : 1));
    s.shake += e.mass > 10 ? 5 : 1;
    
    if (e.type.startsWith('boss')) {
        s.bossActive = false;
        s.arena.active = false; // Deactivate arena
        s.screenFlash = 1.0;
        s.hitStop = 30; 
        s.flashColor = '#ffffff';
        s.wave++;
        s.waveQuota = Math.floor(s.waveQuota * CONFIG.SPAWNING.QUOTA_MULTIPLIER);
        for(const other of s.enemies) {
            if (other.active && !other.type.startsWith('boss')) {
                other.hp = 0; other.dead = true;
                createExplosion(s, other.x, other.y, other.color, 5, 1);
            }
        }
    }
}

// 2. PREDICTIVE AI AUTOPILOT
function calculateAutoPilot(s: GameState) {
    const p = s.player;
    let bestX = 0, bestY = 0, maxScore = -Infinity;
    
    const candidates = [];
    for(let i=0; i<16; i++) {
        const angle = (Math.PI * 2 / 16) * i;
        candidates.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }

    for (const dir of candidates) {
        let score = 0;
        const testX = p.x + dir.x * 50;
        const testY = p.y + dir.y * 50;
        
        // 1. Avoid Enemies
        const nearby = s.spatialGrid.queryRadius(testX, testY, 200);
        for(const e of nearby) {
            if(e === p) continue;
            const d = Utils.dist(testX, testY, e.x, e.y);
            if(d < 100) score -= (100 - d) * 10; 
        }
        
        // 2. Avoid Bullets (Projectiles)
        for(const b of s.enemies) {
            if (b.type === 'projectile') {
                const d = Utils.dist(testX, testY, b.x, b.y);
                const dot = b.vx * dir.x + b.vy * dir.y;
                if(d < 150 && dot < 0) score -= 500; 
            }
        }

        // 3. Attraction to Gems
        let gemBonus = 0;
        for(const g of s.gems) {
            if(!g.active) continue;
            const d = Utils.dist(testX, testY, g.x, g.y);
            if(d < 200) gemBonus += (200 - d) * 0.5;
        }
        score += Math.min(gemBonus, 500); 

        // 4. Center bias (soft bounds) or Arena Bias
        if (s.arena.active) {
             const distToArena = Utils.dist(testX, testY, s.arena.x, s.arena.y);
             if (distToArena > s.arena.radius - 100) score -= 1000; // Stay in arena
        } else {
             const distToCenter = Utils.dist(testX, testY, s.worldWidth/2, s.worldHeight/2);
             score -= distToCenter * 0.1;
        }

        if(score > maxScore) {
            maxScore = score;
            bestX = dir.x;
            bestY = dir.y;
        }
    }

    // Aiming Logic
    let closest = null, minDist = Infinity;
    for (const e of s.enemies) {
        if (!e.active || e.dead) continue;
        const d = Utils.dist(p.x, p.y, e.x, e.y);
        if (d < minDist) { minDist = d; closest = e; }
    }
    
    let aimAngle = p.angle;
    let shoot = false;
    let dash = false;
    
    if (closest) {
        aimAngle = Math.atan2(closest.y - p.y, closest.x - p.x);
        shoot = true;
        if (minDist < 100 && p.dashCd <= 0) dash = true;
    }

    return { mx: bestX, my: bestY, aimAngle, shoot, dash, ult: s.overdrive >= 100, q: p.skills.q.cd <= 0, e: p.skills.e.cd <= 0 && minDist < 200 };
}

// 3. SQUAD TACTICS IMPLEMENTATION
function updateSquadTactics(s: GameState) {
    // ... Deprecated by Utility AI
}

// ... Deprecated by Utility AI
// function applyVariationalBoids

function handleShooting(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.cd > 0) return;

    const weapon = CONFIG.WEAPONS[p.weapon];
    p.cd = weapon.fireDelay / p.stats.fireRateMod;
    p.muzzleFlash = 3;
    
    const recoilForce = (weapon.recoil || 2.0); 
    p.recoilX -= Math.cos(p.angle) * recoilForce;
    p.recoilY -= Math.sin(p.angle) * recoilForce;
    s.shake += weapon.recoil > 5 ? 2 : 0;
    
    // Slight camera kick on heavy weapons
    if (recoilForce > 2.0) {
        s.camera.kickX -= Math.cos(p.angle) * (recoilForce * 2);
        s.camera.kickY -= Math.sin(p.angle) * (recoilForce * 2);
    }

    // Dynamic Weapon Sound
    let soundType: any = 'shoot_default';
    if (p.weapon === 'SHOTGUN') soundType = 'shoot_shotgun';
    else if (p.weapon === 'RAILGUN') soundType = 'shoot_railgun';
    else if (p.weapon === 'VOID') soundType = 'shoot_void';

    callbacks.playSound(soundType);

    const totalShots = (weapon.count || 1) + p.stats.multishot;
    const spread = weapon.spread;
    
    for(let i=0; i<totalShots; i++) {
        const b = s.pools.bullets.acquire();
        if (b) {
            b.active = true;
            let angleOffset = 0;
            if (totalShots > 1) angleOffset = (i - (totalShots - 1) / 2) * (spread || 0.1);
            else angleOffset = (Math.random() - 0.5) * (spread || 0);
            
            const fireAngle = p.angle + angleOffset;
            b.x = p.x + Math.cos(p.angle) * 10;
            b.y = p.y + Math.sin(p.angle) * 10;
            
            const spd = weapon.speed;
            b.vx = Math.cos(fireAngle) * spd + p.vx * 0.2;
            b.vy = Math.sin(fireAngle) * spd + p.vy * 0.2;
            
            b.color = weapon.color;
            b.dmg = 10 * weapon.dmgMult * p.stats.damageMod;
            b.life = weapon.lifetime;
            b.size = weapon.size;
            b.pierce = weapon.pierce + p.stats.pierce;
            b.homing = weapon.homing + p.stats.homing;
            b.trail = [];
            b.isBeam = weapon.type === 'beam';
            if (b.isBeam) b.beamPoints = [{x: b.x, y: b.y}];
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
    
    let dx = mx, dy = my;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); } 
    else { dx /= len; dy /= len; }
    
    p.vx = dx * CONFIG.PLAYER.DASH.SPEED;
    p.vy = dy * CONFIG.PLAYER.DASH.SPEED;
    
    createShockwave(s, p.x, p.y, 100, '#ffffff', 5);
    callbacks.playSound('dash');
    
    for(let i=0; i<10; i++) {
        if (s.particleSystem) {
            s.particleSystem.spawn(p.x, p.y, -dx * Math.random() * 5, -dy * Math.random() * 5, 20, 2, CONFIG.COLORS.PLAYER_DASH, 'spark');
        }
    }
}

function handleUltimate(s: GameState, callbacks: GameCallbacks) {
    if (s.overdrive < 100) return;
    s.overdrive = 0;
    s.screenFlash = 1.0;
    s.flashColor = CONFIG.COLORS.ULTIMATE;
    s.shake += 20;
    callbacks.playSound('explosion'); 
    
    const range = 1000;
    for (const e of s.enemies) {
        if (e.active && !e.dead && Utils.dist(s.player.x, s.player.y, e.x, e.y) < range) {
            e.hp -= 500;
            createExplosion(s, e.x, e.y, CONFIG.COLORS.ULTIMATE, 10, 2);
            if (e.hp <= 0) handleEnemyDeath(s, e, callbacks, {x: 0, y: 0});
        }
    }
    createShockwave(s, s.player.x, s.player.y, range, CONFIG.COLORS.ULTIMATE, 30);
}

function handleSkillQ(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.skills.q.cd > 0 || p.skills.q.active) return;
    p.skills.q.active = true;
    p.skills.q.duration = p.skills.q.maxDuration;
    p.skills.q.cd = p.skills.q.maxCd;
    callbacks.playSound('chrono');
    callbacks.setAudioTempo(0.5); 
    createShockwave(s, p.x, p.y, 800, '#00ffff', 5);
}

function handleSkillE(s: GameState, callbacks: GameCallbacks) {
    const p = s.player;
    if (p.skills.e.cd > 0 || p.skills.e.active) return;
    p.skills.e.active = true;
    p.skills.e.duration = p.skills.e.maxDuration;
    p.skills.e.cd = p.skills.e.maxCd;
    callbacks.playSound('fracture');
    const bh: any = {
        x: p.x + Math.cos(p.angle) * 150,
        y: p.y + Math.sin(p.angle) * 150,
        life: 4.0, maxLife: 4.0, radius: 10, pullRange: 300, color: '#aa00ff', active: true
    };
    s.blackHoles.push(bh);
}

function handlePlayerHit(s: GameState, e: Enemy, callbacks: GameCallbacks) {
    if (s.player.invuln > 0) return;
    let dmg = 20;
    if (e.type === 'tank') dmg = 40;
    if (e.type.startsWith('boss')) dmg = 50;
    if (e.isElite) dmg *= 1.5;
    
    s.player.hp -= dmg;
    s.player.invuln = CONFIG.PLAYER.INVULN_ON_HIT;
    s.player.hitFlash = 10;
    s.shake += 10;
    s.screenFlash = 0.5;
    s.flashColor = '#ff0000';
    s.combo = 0; 
    callbacks.playSound('hit');
    
    // Directional Trauma
    const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
    s.camera.kickX += Math.cos(angle) * 20;
    s.camera.kickY += Math.sin(angle) * 20;
    
    if (s.player.hp <= 0) {
        s.player.hp = 0; s.gameOver = true; s.active = false;
        createExplosion(s, s.player.x, s.player.y, CONFIG.COLORS.PLAYER, 50, 5);
        callbacks.onGameOver({
            score: Math.floor(s.score), wave: s.wave, level: s.player.level,
            duration: (Date.now() - s.startTime) / 1000,
            weapon: s.player.weapon, hull: s.player.hull,
            upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count }))
        });
        callbacks.playSound('gameover');
    }
}

const EnemiesSystem = {
    update: (s: GameState, callbacks: GameCallbacks) => {
        const p = s.player;
        const dt = s.worldTimeScale;

        for (let i = s.enemies.length - 1; i >= 0; i--) {
            const e = s.enemies[i];
            if (!e.active || e.dead) continue;

            // UTILITY AI INTEGRATION
            let fx = 0, fy = 0;

            // Flow Field Integration
            // If enemy is standard (chaser/swarm), use flow field instead of expensive seek
            if (s.flowField && (e.type === 'chaser' || e.type === 'swarm' || e.type === 'kamikaze') && !e.behavior?.includes('charge')) {
                const flow = s.flowField.sample(e.x, e.y);
                if (flow.x !== 0 || flow.y !== 0) {
                    fx = flow.x * e.speed;
                    fy = flow.y * e.speed;
                } else {
                    // Fallback if off-grid
                    const ang = Math.atan2(p.y - e.y, p.x - e.x);
                    fx = Math.cos(ang) * e.speed;
                    fy = Math.sin(ang) * e.speed;
                }
            } else if (!e.type.startsWith('boss')) {
                if (!e.brain) {
                    e.brain = AIFactory.createBrain(e.type);
                }

                const result = e.brain.think(s, e);
                fx = result.fx;
                fy = result.fy;
                e.behavior = result.action; // Debug/Vis

                // Arena Constraint for enemies
                if (s.arena.active) {
                    const distToCenter = Utils.dist(e.x, e.y, s.arena.x, s.arena.y);
                    if (distToCenter > s.arena.radius) {
                        const angle = Math.atan2(s.arena.y - e.y, s.arena.x - e.x);
                        fx += Math.cos(angle) * 10; // Push back in
                        fy += Math.sin(angle) * 10;
                    }
                }
            } else {
                 // Boss Logic (Keep simple tracking for now or migrate to AI too)
                 const ang = Math.atan2(p.y - e.y, p.x - e.x);
                 fx = Math.cos(ang) * 0.5 * e.speed;
                 fy = Math.sin(ang) * 0.5 * e.speed;
            }

            // PHYSICS INTEGRATION (RK4)

            // Snake Body Logic Override
            if (e.type === 'snake_body' && e.parentId) {
                 const parent = s.enemies.find(par => par.id === e.parentId);
                 if (parent && parent.active) {
                     // NEW: IK Chain Handling
                     // We don't have a single chain for the whole snake in this entity model (entities are separate).
                     // But we can simulate "Forward Reaching" constraint here.

                     const dist = Utils.dist(e.x, e.y, parent.x, parent.y);
                     const targetLen = e.size * 1.2;

                     // If too far, snap or pull hard
                     if (dist > targetLen) {
                         const angle = Math.atan2(parent.y - e.y, parent.x - e.x);
                         // Instead of force, we set position (IK style) but smoothed
                         const tx = parent.x - Math.cos(angle) * targetLen;
                         const ty = parent.y - Math.sin(angle) * targetLen;
                         e.x = Utils.lerp(e.x, tx, 0.5);
                         e.y = Utils.lerp(e.y, ty, 0.5);
                         fx = 0; fy = 0;
                     }
                 } else {
                     e.hp = 0; e.dead = true;
                     handleEnemyDeath(s, e, callbacks, {x:0, y:0});
                     continue;
                 }
            }

            // Apply speed mod from Freeze status
            const drag = (e.statusFlags & 2) ? 0.8 : 0.95; // Higher drag if frozen (0.2 vs 0.05)
            PhysicsSystem.integrate(e, fx * 0.2, fy * 0.2, dt, drag, e.mass);

            // Rotation
            const speed = Math.hypot(e.vx, e.vy);
            if (e.type !== 'snake_body' && !e.type.startsWith('boss') && e.sides > 0) {
                 e.rotation += speed * 0.05 * s.worldTimeScale;
            } else if (speed > 0.1) {
                 e.rotation = Math.atan2(e.vy, e.vx);
            }

            // Status Effects Update (Bitwise)
            if (e.statusFlags > 0) {
                // BURN (Bit 0)
                if (e.statusFlags & 1) {
                    e.statusTimers[0]++; // Timer
                    if (e.statusTimers[0] % 30 === 0) {
                        const dmg = e.statusTimers[3]; // Burn Power
                        e.hp -= dmg;
                        createFloatingText(s, e.x, e.y - 15, Math.floor(dmg).toString(), '#ffaa00', 10);
                        if (e.hp <= 0) handleEnemyDeath(s, e, callbacks, {x: 0, y: 0});
                    }
                    if (e.statusTimers[0] >= 180) { // Duration
                        e.statusFlags &= ~1; // Clear bit
                    }
                }
                // FREEZE (Bit 1)
                if (e.statusFlags & 2) {
                    e.statusTimers[1]++;
                    if (e.statusTimers[1] >= 120) {
                        e.statusFlags &= ~2;
                    }
                }
            }

            // Player Collision Check
            if (p.active && !p.invuln && !e.dead) {
                 const dist = Utils.dist(e.x, e.y, p.x, p.y);
                 const minDist = e.size + CONFIG.PLAYER.COLLISION_RADIUS;
                 if (dist < minDist) {
                     handlePlayerHit(s, e, callbacks);
                 }
            }
            
            // Trail Update
            if (s.frame % 4 === 0) {
                if(!e.trail) e.trail = [];
                e.trail.push({x: e.x, y: e.y});
                if(e.trail.length > 6) e.trail.shift();
            }

            // Cleanup Out of Bounds
            if (!Utils.inBounds(e.x, e.y, s.worldWidth, s.worldHeight, 200)) {
                if (!e.type.startsWith('boss')) {
                     const ang = Math.atan2(s.worldHeight/2 - e.y, s.worldWidth/2 - e.x);
                     e.vx += Math.cos(ang); e.vy += Math.sin(ang);
                }
            }

            // IK Chain Update (Visual)
            if (e.ikChain) {
                // Pin head to enemy center
                e.ikChain.baseX = e.x;
                e.ikChain.baseY = e.y;
                // Reach towards player
                e.ikChain.resolve(p.x, p.y);
            }
        }
    }
};

const CleanupSystem = {
    update: (s: GameState) => {
        // Particles now handled by s.particleSystem.update() called in engine.ts

        // Pickups
        for(let i = s.pickups.length - 1; i >= 0; i--) {
            const p = s.pickups[i];
            p.life--;
            if (p.life <= 0) { s.pools.pickups.release(p); s.pickups.splice(i, 1); }
        }
        // Gems
        for(let i = s.gems.length - 1; i >= 0; i--) {
            const g = s.gems[i];
            // Physics Update for Gems? Maybe too expensive. Keep Euler.
            g.x += g.vx; g.y += g.vy;
            g.vx *= CONFIG.GEMS.FRICTION; g.vy *= CONFIG.GEMS.FRICTION;
            g.life -= s.worldTimeScale;
            const dist = Utils.dist(g.x, g.y, s.player.x, s.player.y);
            if (dist < s.player.stats.magnetRange) {
                g.vx += (s.player.x - g.x) * CONFIG.GEMS.PULL_STRENGTH;
                g.vy += (s.player.y - g.y) * CONFIG.GEMS.PULL_STRENGTH;
            }
            if (dist < CONFIG.GEMS.COLLECT_RADIUS) {
                s.player.xp += g.val; s.pools.gems.release(g); s.gems.splice(i, 1);
            } else if (g.life <= 0) { s.pools.gems.release(g); s.gems.splice(i, 1); }
        }
        // Debris Physics Interaction
        const p = s.player;
        for(let i = s.debris.length - 1; i >= 0; i--) {
            const d = s.debris[i];
            
            // Angular Physics
            d.rotation += d.vRot * s.worldTimeScale;
            d.vRot *= d.friction; // Angular damping

            // Linear Physics (RK4 candidate but overkill for debris)
            d.x += d.vx * s.worldTimeScale;
            d.y += d.vy * s.worldTimeScale;
            d.vx *= d.friction; 
            d.vy *= d.friction; 
            
            if (d.flash > 0) d.flash--;

            // Collision with Player (Bounce)
            const dist = Utils.dist(d.x, d.y, p.x, p.y);
            if (dist < d.size + 20) {
                const angle = Math.atan2(d.y - p.y, d.x - p.x);
                const force = 2.0;
                d.vx += Math.cos(angle) * force;
                d.vy += Math.sin(angle) * force;
                d.vRot += (Math.random() - 0.5) * 0.2;
            }
            
            // Force field constraint for debris? Optional, let them float out.
            if (!Utils.inBounds(d.x, d.y, s.worldWidth, s.worldHeight)) {
                s.pools.debris.release(d); s.debris.splice(i, 1);
            }
        }

        // Floating Texts (Physical)
        for(let i = s.texts.length - 1; i >= 0; i--) {
            const t = s.texts[i]; 
            t.x += t.vx * s.worldTimeScale; 
            t.y += t.vy * s.worldTimeScale; 
            t.vy += 0.2 * s.worldTimeScale; // Gravity
            t.vx *= 0.95; // Friction
            t.life--; 
            if(t.life < 20) t.opacity = t.life / 20;
            if(t.life <= 0) s.texts.splice(i, 1);
        }
        
        for(let i = s.shockwaves.length - 1; i >= 0; i--) {
            const sw = s.shockwaves[i]; sw.size += sw.speed; sw.alpha -= 0.05; if(sw.alpha <= 0) s.shockwaves.splice(i, 1);
        }
        for(let i = s.enemies.length - 1; i >= 0; i--) {
            if(s.enemies[i].dead) { s.pools.enemies.release(s.enemies[i]); s.enemies.splice(i, 1); }
        }
    }
};

export const Systems = {
    Camera: {
        update: (s: GameState) => {
            if (!s.player.active) return;
            const targetX = s.player.x;
            const targetY = s.player.y;
            const lookAheadX = (s.player.vx + s.player.recoilX) * 20;
            const lookAheadY = (s.player.vy + s.player.recoilY) * 20;
            const lerpSpeed = 0.1;
            s.camera.x += (targetX + lookAheadX - s.camera.x) * lerpSpeed;
            s.camera.y += (targetY + lookAheadY - s.camera.y) * lerpSpeed;
            
            // Apply Kick (Trauma)
            s.camera.x += s.camera.kickX;
            s.camera.y += s.camera.kickY;
            s.camera.kickX *= 0.85; // Decay
            s.camera.kickY *= 0.85;
            
            // Zoom logic for Arena
            const desiredZoom = s.arena.active ? 0.8 : 1.0;
            s.camera.zoom += (desiredZoom - s.camera.zoom) * 0.05;
        }
    },

    Wave: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            if (!s.bossActive && s.waveKills >= s.waveQuota) {
                spawnBoss(s, callbacks);
                return;
            }
            
            // If arena active, fade it in
            if (s.arena.active && s.arena.alpha < 1.0) s.arena.alpha = Math.min(1.0, s.arena.alpha + 0.02);
            if (!s.arena.active && s.arena.alpha > 0) s.arena.alpha = Math.max(0, s.arena.alpha - 0.05);

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
            
            // Asteroid / Debris Spawn
            if (s.debris.length < CONFIG.SPAWNING.DEBRIS_MAX && Math.random() < 0.01) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 700;
                const ax = Utils.clamp(s.player.x + Math.cos(angle) * dist, 0, s.worldWidth);
                const ay = Utils.clamp(s.player.y + Math.sin(angle) * dist, 0, s.worldHeight);
                const size = Utils.rand(30, 60);
                createAsteroid(s, ax, ay, size);
            }
        }
    },

    Player: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            const p = s.player;
            callbacks.updateAudioListener(p.x, p.y); // SPATIAL AUDIO UPDATE

            if (p.skills.q.active) { 
                p.skills.q.duration--; 
                s.worldTimeScale = 0.1; 
                if (p.skills.q.duration <= 0) { 
                    p.skills.q.active = false; 
                    callbacks.setAudioTempo(1.0); 
                    s.worldTimeScale = 1.0; 
                } 
            } else { 
                if (p.skills.q.cd > 0) p.skills.q.cd--; 
                s.worldTimeScale = 1.0; 
            }
            if (p.skills.e.active && s.frame % 30 === 0) p.skills.e.active = false;
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
                    isShooting = true; aimX = stick.aimX; aimY = stick.aimY;
                    handleShooting(s, callbacks); 
                } else if (s.mouse.down) { 
                    isShooting = true; 
                    const screenPx = (p.x - s.camera.x) * s.camera.zoom + s.width / 2;
                    const screenPy = (p.y - s.camera.y) * s.camera.zoom + s.height / 2;
                    aimX = s.mouse.x - screenPx; aimY = s.mouse.y - screenPy;
                    handleShooting(s, callbacks); 
                }
                if (s.keys.space || s.keys.shift) handleDash(s, callbacks, mx, my);
                if (s.keys.f && s.overdrive >= 100) handleUltimate(s, callbacks);
                if (s.keys.q && p.skills.q.cd <= 0) handleSkillQ(s, callbacks);
                if (s.keys.e && p.skills.e.cd <= 0) handleSkillE(s, callbacks);

                if (isShooting) {
                    const targetAngle = Math.atan2(aimY, aimX);
                    const diff = Utils.angleDiff(p.angle, targetAngle);
                    p.angle += diff * 0.3;
                } else {
                    const speed = Math.hypot(p.vx, p.vy);
                    if (speed > 0.1) {
                        const targetAngle = Math.atan2(p.vy, p.vx);
                        const diff = Utils.angleDiff(p.angle, targetAngle);
                        p.angle += diff * 0.1;
                    }
                }
            }

            const thrust = CONFIG.PLAYER.THRUST * p.stats.speedMod * s.playerTimeScale;
            const len = Math.hypot(mx, my);
            if (len > 1) { mx /= len; my /= len; }

            // NEW: Physics System Integration for Player
            // mx, my are direction inputs. Thrust is force.
            // But PhysicsSystem.integrate takes force.
            // We need to match existing feel.
            // Existing: p.vx += mx * thrust; p.vx *= friction.
            // New: integrate(p, mx * thrust * factor, my * thrust * factor, dt, friction_factor)

            // To match exact feel is hard, but let's approximate.
            // Euler: v += a; v *= f;
            // RK4: v += a... with drag.

            // Let's pass force = mx * thrust * 10 (arbitrary scale to match acceleration)
            // Friction in RK4 is linear drag (1-f).
            // CONFIG.PLAYER.FRICTION is 0.88 per frame.
            // RK4 friction is drag coefficient.
            // If v *= 0.88, then v_new = v * 0.88 = v - v*0.12.
            // So drag = 0.12. But RK4 takes 'friction' param as 0.95 -> drag 0.05.
            // So we pass CONFIG.PLAYER.FRICTION directly if integrate uses it as "velocity multiplier per frame".

            // In PhysicsSystem.integrate:
            // const drag = (1.0 - friction);
            // return (fx - vx * drag) / mass;

            // So if I pass 0.88, drag is 0.12. This matches "velocity loses 12% per second" roughly?
            // No, my implementation in PhysicsSystem uses it as per-step.

            PhysicsSystem.integrate(p, mx * thrust * 5.0, my * thrust * 5.0, s.playerTimeScale, CONFIG.PLAYER.FRICTION);

            p.recoilX *= 0.70; p.recoilY *= 0.70;
            p.x += p.recoilX; p.y += p.recoilY;

            // Arena Constraint
            if (s.arena.active) {
                const distToCenter = Utils.dist(p.x, p.y, s.arena.x, s.arena.y);
                if (distToCenter > s.arena.radius - 20) {
                    const angle = Math.atan2(p.y - s.arena.y, p.x - s.arena.x);
                    p.x = s.arena.x + Math.cos(angle) * (s.arena.radius - 20);
                    p.y = s.arena.y + Math.sin(angle) * (s.arena.radius - 20);
                    p.vx *= -0.5; // Bounce off
                    p.vy *= -0.5;
                }
            }

            const speed = Math.hypot(p.vx, p.vy);
            if (speed > 0.5) {
                const rightX = Math.cos(p.angle + Math.PI/2);
                const rightY = Math.sin(p.angle + Math.PI/2);
                const sideVel = p.vx * rightX + p.vy * rightY;
                p.roll = Utils.lerp(p.roll, sideVel * 0.15, 0.1);
            } else {
                p.roll = Utils.lerp(p.roll, 0, 0.1);
            }
            p.x = Utils.clamp(p.x + p.vx, 0, s.worldWidth);
            p.y = Utils.clamp(p.y + p.vy, 0, s.worldHeight);
            
            if (len > 0.1 && s.visualGrid) s.visualGrid.applyForce(p.x, p.y, 40, len * 5);
            if (len > 0.1 && s.frame % 2 === 0 && s.particleSystem) {
                const angle = Math.atan2(my, mx) + Math.PI;
                const px = p.x + Utils.rand(-5, 5); const py = p.y + Utils.rand(-5, 5);
                const pvx = Math.cos(angle) * 4 + (Math.random()-0.5); const pvy = Math.sin(angle) * 4 + (Math.random()-0.5);
                s.particleSystem.spawn(px, py, pvx, pvy, 15, Utils.rand(2, 4), CONFIG.COLORS.PLAYER, 'spark');
            }
        }
    },

    Enemies: EnemiesSystem,

    Combat: {
        update: (s: GameState, callbacks: GameCallbacks) => {
            // Black Hole Logic
            for (let i = s.blackHoles.length - 1; i >= 0; i--) {
                const bh = s.blackHoles[i];
                if (!bh.active) { s.blackHoles.splice(i, 1); continue; }
                bh.life -= s.worldTimeScale;
                bh.radius = Math.min(60, bh.radius + 0.5 * s.worldTimeScale);
                const nearby = s.spatialGrid.queryRadius(bh.x, bh.y, bh.pullRange);
                for(const e of nearby) {
                    if (e === s.player) continue;
                    const ent = e as Enemy;
                    if (!ent.active || ent.dead || ent.type.startsWith('boss')) continue;
                    const dx = bh.x - ent.x; const dy = bh.y - ent.y;
                    const distSq = dx*dx + dy*dy; const dist = Math.sqrt(distSq);
                    if (dist > 0) {
                        const pullForce = 2000 / (distSq + 100);
                        ent.vx += (dx / dist) * pullForce * s.worldTimeScale;
                        ent.vy += (dy / dist) * pullForce * s.worldTimeScale;
                        if (dist < bh.radius) {
                            ent.hp -= 2 * s.worldTimeScale; ent.rotation += 0.5;
                            if (ent.hp <= 0 && !ent.dead) handleEnemyDeath(s, ent, callbacks, {x: 0, y: 0});
                        }
                    }
                }
                if (bh.life <= 0) {
                    bh.active = false; createExplosion(s, bh.x, bh.y, '#ff00ff', 20, 5);
                    createShockwave(s, bh.x, bh.y, 300, '#ff00ff', 10); callbacks.playSound('void_implode');
                }
            }

            for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
                const b = s.bullets[bi];
                if (!b.active) continue;

                if (b.isBeam && b.beamPoints && b.beamPoints.length > 0) {
                    const last = b.beamPoints[b.beamPoints.length - 1]; b.x = last.x; b.y = last.y;
                    const angle = Math.atan2(b.vy, b.vx);
                    b.beamPoints.push({x: last.x + Math.cos(angle) * 30 + Utils.rand(-15, 15), y: last.y + Math.sin(angle) * 30 + Utils.rand(-15, 15)});
                    if (b.beamPoints.length > 10) b.beamPoints.shift();
                }

                if (b.homing > 0 && s.quality !== 'LOW') {
                    let target = null, minDSq = 400 * 400;
                    const nearby = s.spatialGrid.queryRadius(b.x, b.y, 400);
                    for (const e of nearby) {
                        if (!e.active || e.dead || e === s.player || (e as any).hull) continue;
                        if (!(e as Enemy).type || (e as Enemy).type === 'projectile') continue;
                        const dx = e.x - b.x; const dy = e.y - b.y; const dSq = dx*dx + dy*dy;
                        if (dSq < minDSq) { minDSq = dSq; target = e; } 
                    }
                    if (target) {
                        const wantAng = Math.atan2(target.y - b.y, target.x - b.x); const currAng = Math.atan2(b.vy, b.vx);
                        const diff = Utils.angleDiff(currAng, wantAng);
                        const turn = Math.max(-b.homing * 0.2, Math.min(b.homing * 0.2, diff));
                        const newAng = currAng + turn; const spd = Math.hypot(b.vx, b.vy);
                        b.vx = Math.cos(newAng) * spd; b.vy = Math.sin(newAng) * spd;
                    }
                }

                b.x += b.vx * s.worldTimeScale; b.y += b.vy * s.worldTimeScale; b.life -= s.worldTimeScale;
                if (s.frame % 2 === 0) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 5) b.trail.shift(); }
                if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.worldWidth, s.worldHeight, 200)) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue; }

                // Hit Detection
                const candidates = s.spatialGrid.queryRadius(b.x, b.y, 100); 
                let hitEnemy = false;
                
                // DEBRIS / ASTEROID COLLISION (Rigid Body Physics)
                for (let i = s.debris.length - 1; i >= 0; i--) {
                    const d = s.debris[i];
                    if (!d.active) continue;
                    
                    const dist = Utils.dist(b.x, b.y, d.x, d.y);
                    const minDist = d.size + b.size;

                    if (dist < minDist) {
                        d.health -= b.dmg; 
                        d.flash = 4; // Visual hit flash

                        // PHYSICS: Calculate Torque & Impulse
                        const dx = b.x - d.x; // Vector from Center to Impact
                        const dy = b.y - d.y;
                        
                        // Normalized Impact Vector
                        const len = Math.max(0.1, dist);
                        const nx = dx / len;
                        const ny = dy / len;

                        // Linear Impulse (Knockback)
                        const impulse = (b.knockback || 2) * 2 / d.mass;
                        d.vx += nx * impulse;
                        d.vy += ny * impulse;

                        // Angular Impulse (Torque) = Cross Product (r x F)
                        // Force vector roughly matches projectile velocity
                        // Normalize bullet velocity
                        const bSpeed = Math.hypot(b.vx, b.vy);
                        const bvx = b.vx / (bSpeed || 1);
                        const bvy = b.vy / (bSpeed || 1);

                        // Torque = rx * Fy - ry * Fx
                        // We use the bullet direction as force direction
                        const torque = (dx * bvy - dy * bvx) * 0.05;
                        d.vRot += torque / d.mass;

                        // Spark Shower (Directional Reflection)
                        // Reflect bullet vector off normal
                        // r = v - 2(v.n)n
                        const dot = bvx * nx + bvy * ny;
                        const rx = bvx - 2 * dot * nx;
                        const ry = bvy - 2 * dot * ny;
                        
                        createSparks(s, b.x, b.y, rx, ry, 5, '#ffffff');
                        createFloatingText(s, b.x, b.y, Math.floor(b.dmg).toString(), '#aaaaaa', 10);

                        if (d.health <= 0) { 
                            d.active = false; 
                            createExplosion(s, d.x, d.y, '#777777', 8, 1);
                            s.score += 10;
                            // Splitting Logic
                            if (d.size > 25 && d.type === 'asteroid') {
                                for(let k=0; k<2; k++) {
                                    createAsteroid(s, d.x + Utils.rand(-10, 10), d.y + Utils.rand(-10, 10), d.size * 0.6);
                                }
                            }
                            s.pools.debris.release(d); 
                            s.debris.splice(i, 1);
                        }
                        
                        if (b.pierce <= 0) hitEnemy = true; else b.pierce--;
                        if (hitEnemy) break;
                    }
                }

                if (!hitEnemy) {
                    for (const e of candidates) {
                        if (!e.active || e.dead || e.type === 'projectile') continue;
                        
                        let collision = false;
                        
                        if (e.modules && e.modules.length > 0) {
                            // Boss collision: Use Point in Polygon
                            const bossRot = s.frame * 0.005; // Sync with renderer
                            
                            // 1. Broad Phase
                            if (Utils.dist(b.x, b.y, e.x, e.y) < 300) {
                                // 2. Narrow Phase (Poly check)
                                for (const mod of e.modules) {
                                    const poly = getTransformedPolygon(e, mod, bossRot);
                                    if (pointInPolygon(b.x, b.y, poly)) {
                                        collision = true;
                                        createExplosion(s, b.x, b.y, mod.color, 3, 0.5); // Visual feedback on hit part
                                        break; 
                                    }
                                }
                                // Core Check (Simple Circle)
                                if (!collision && Utils.dist(b.x, b.y, e.x, e.y) < 20) collision = true;
                            }
                        } else {
                            // Standard circle collision
                            if (Utils.dist(b.x, b.y, e.x, e.y) < e.size + b.size + (b.isBeam ? 20 : 0)) {
                                collision = true;
                            }
                        }

                        if (collision) {
                            if (e.invulnerable) { 
                                createExplosion(s, b.x, b.y, '#ffffff', 2, 0.5); 
                                hitEnemy = true; 
                            } else {
                                e.hp -= b.dmg; e.hitFlash = 3; s.damageDealtBuffer += b.dmg;
                                const kbScale = e.mass > 100 ? 0.05 : 1.0;
                                const angle = Math.atan2(b.vy, b.vx); 
                                const kb = (b.knockback || 1) * 2 / (e.mass || 1); 
                                e.vx += Math.cos(angle) * kb * kbScale; 
                                e.vy += Math.sin(angle) * kb * kbScale;
                                
                                if (!e.modules) createExplosion(s, b.x, b.y, e.color, 3, 0.5);
                                
                                // NEW: Physics-based damage text
                                const isCrit = b.dmg > 20;
                                createFloatingText(s, e.x, e.y - 20, Math.floor(b.dmg).toString(), isCrit ? '#ff3333' : e.color, 14, isCrit);
                                
                                if(b.elemental) {
                                    if(b.elemental.fire > 0) {
                                        e.statusFlags |= 1; // Burn
                                        e.statusTimers[3] = 5; // Burn Damage
                                    }
                                    if(b.elemental.ice > 0) {
                                        e.statusFlags |= 2; // Freeze
                                    }
                                }
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
    Cleanup: CleanupSystem
};
