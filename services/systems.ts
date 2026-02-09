
import { GameState, Enemy, GameCallbacks, BossModule, Player, Bullet, Debris } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';
import { Physics, PhysicalEntity } from './physics';
import { createExplosion, createShockwave, createFloatingText, setupEnemy, spawnBoss, createAsteroid, createShipDebris, createSparks } from './generators';

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

// --- CORE LOGIC EXTRACTED ---

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
        s.arena.active = false;
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

function handleBulletDebrisCollision(s: GameState, b: Bullet, d: Debris) {
    const dist = Utils.dist(b.x, b.y, d.x, d.y);
    const minDist = d.size + b.size;

    if (dist < minDist) {
        d.health -= b.dmg;
        d.flash = 4;

        // PHYSICS: Impulse & Torque
        const dx = b.x - d.x;
        const dy = b.y - d.y;
        const len = Math.max(0.1, dist);
        const nx = dx / len;
        const ny = dy / len;

        const impulse = (b.knockback || 2) * 2; // Physics.applyImpulse divides by mass
        Physics.applyImpulse(d, nx * impulse, ny * impulse);

        // Torque
        const bSpeed = Math.hypot(b.vx, b.vy);
        const bvx = b.vx / (bSpeed || 1);
        const bvy = b.vy / (bSpeed || 1);
        const torque = (dx * bvy - dy * bvx) * 0.05;
        d.vRot += torque / d.mass;

        // Spark Shower
        const dot = bvx * nx + bvy * ny;
        const rx = bvx - 2 * dot * nx;
        const ry = bvy - 2 * dot * ny;
        createSparks(s, b.x, b.y, rx, ry, 5, '#ffffff');
        createFloatingText(s, b.x, b.y, Math.floor(b.dmg).toString(), '#aaaaaa', 10);

        if (d.health <= 0) {
            d.active = false;
            createExplosion(s, d.x, d.y, '#777777', 8, 1);
            s.score += 10;
            if (d.size > 25 && d.type === 'asteroid') {
                for(let k=0; k<2; k++) {
                    createAsteroid(s, d.x + Utils.rand(-10, 10), d.y + Utils.rand(-10, 10), d.size * 0.6);
                }
            }
            s.pools.debris.release(d);
            // We don't splice here directly, handled by caller or cleanup
        }
        return true; // Hit
    }
    return false;
}

function handleBulletEnemyCollision(s: GameState, b: Bullet, e: Enemy, callbacks: GameCallbacks): boolean {
    if (!e.active || e.dead || e.type === 'projectile') return false;
    
    let collision = false;
    
    if (e.modules && e.modules.length > 0) {
        // Boss collision
        const bossRot = s.frame * 0.005;
        if (Utils.dist(b.x, b.y, e.x, e.y) < 300) {
            for (const mod of e.modules) {
                const poly = getTransformedPolygon(e, mod, bossRot);
                if (pointInPolygon(b.x, b.y, poly)) {
                    collision = true;
                    createExplosion(s, b.x, b.y, mod.color, 3, 0.5);
                    break;
                }
            }
            if (!collision && Utils.dist(b.x, b.y, e.x, e.y) < CONFIG.COMBAT.BOSS_CORE_RADIUS) collision = true;
        }
    } else {
        if (Utils.dist(b.x, b.y, e.x, e.y) < e.size + b.size + (b.isBeam ? 20 : 0)) {
            collision = true;
        }
    }

    if (collision) {
        if (e.invulnerable) {
            createExplosion(s, b.x, b.y, '#ffffff', 2, 0.5);
            return true;
        }

        e.hp -= b.dmg;
        e.hitFlash = 3;
        s.damageDealtBuffer += b.dmg;

        const kbScale = e.mass > 100 ? 0.05 : 1.0;
        const angle = Math.atan2(b.vy, b.vx);
        const kb = (b.knockback || 1) * 2; // Physics.applyImpulse divides by mass

        Physics.applyImpulse(e, Math.cos(angle) * kb * kbScale, Math.sin(angle) * kb * kbScale);

        if (!e.modules) createExplosion(s, b.x, b.y, e.color, 3, 0.5);

        const isCrit = b.dmg > 20;
        createFloatingText(s, e.x, e.y - 20, Math.floor(b.dmg).toString(), isCrit ? '#ff3333' : e.color, 14, isCrit);

        if(b.elemental) {
            if(b.elemental.fire > 0) e.status.push({ type: 'BURN', duration: 180, power: 5, timer: 0 });
            if(b.elemental.ice > 0) e.status.push({ type: 'FREEZE', duration: 120, power: 0.3, timer: 0 });
        }

        if (e.hp <= 0 && !e.dead) handleEnemyDeath(s, e, callbacks, {x: b.vx, y: b.vy});
        return true;
    }
    return false;
}

// --- BOIDS & AI ---

function applyVariationalBoids(e: Enemy, s: GameState): {x: number, y: number} {
    const p = s.player;
    let fx = 0, fy = 0;
    
    let targetX = p.x;
    let targetY = p.y;
    
    if (e.squadId) {
        const leader = s.enemies.find(l => l.id === e.squadId && l.active);
        if (leader) {
            const angle = (e.squadOffset?.angle || 0) + (s.frame * 0.01); 
            const dist = e.squadOffset?.dist || 50;
            targetX = leader.x + Math.cos(angle) * dist;
            targetY = leader.y + Math.sin(angle) * dist;
            fx += leader.vx * 0.5;
            fy += leader.vy * 0.5;
        } else {
            e.squadId = undefined;
        }
    }

    // 1. Separation
    let sepX = 0, sepY = 0, count = 0;
    const neighbors = s.spatialGrid.queryRadius(e.x, e.y, CONFIG.BOIDS.SEPARATION_RADIUS);
    for (const other of neighbors) {
        if (other === e || other === p) continue;
        const o = other as Enemy;
        if (!o.active || o.dead) continue;
        
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const dSq = dx*dx + dy*dy;
        if (dSq > 0.1 && dSq < CONFIG.BOIDS.SEPARATION_RADIUS * CONFIG.BOIDS.SEPARATION_RADIUS) {
            const d = Math.sqrt(dSq);
            const force = (CONFIG.BOIDS.SEPARATION_RADIUS - d) / d; 
            sepX += dx * force;
            sepY += dy * force;
            count++;
        }
    }
    if (count > 0) {
        fx += sepX * CONFIG.BOIDS.SEPARATION_WEIGHT * 2.0;
        fy += sepY * CONFIG.BOIDS.SEPARATION_WEIGHT * 2.0;
    }
    
    // 2. Attraction
    const tdx = targetX - e.x;
    const tdy = targetY - e.y;
    const dist = Math.hypot(tdx, tdy);
    if (dist > 0) {
        let weight = CONFIG.BOIDS.PLAYER_WEIGHT;
        if (e.behavior === 'keep_distance' && !e.squadId) {
            const idealDist = 300;
            if (dist < idealDist) weight = -weight * 1.5; 
            else if (dist < idealDist + 50) weight = 0; 
        }
        fx += (tdx / dist) * weight;
        fy += (tdy / dist) * weight;
    }
    
    // Arena Constraint for enemies
    if (s.arena.active) {
        const distToCenter = Utils.dist(e.x, e.y, s.arena.x, s.arena.y);
        if (distToCenter > s.arena.radius) {
            const angle = Math.atan2(s.arena.y - e.y, s.arena.x - e.x);
            fx += Math.cos(angle) * 10; // Push back in
            fy += Math.sin(angle) * 10;
        }
    }
    
    return { x: fx, y: fy };
}

// --- SYSTEMS ---

const CameraSystem = {
    update: (s: GameState) => {
        if (!s.player.active) return;
        const targetX = s.player.x;
        const targetY = s.player.y;
        const lookAheadX = (s.player.vx + s.player.recoilX) * CONFIG.CAMERA.LOOKAHEAD;
        const lookAheadY = (s.player.vy + s.player.recoilY) * CONFIG.CAMERA.LOOKAHEAD;

        s.camera.x += (targetX + lookAheadX - s.camera.x) * CONFIG.CAMERA.LERP;
        s.camera.y += (targetY + lookAheadY - s.camera.y) * CONFIG.CAMERA.LERP;

        s.camera.x += s.camera.kickX;
        s.camera.y += s.camera.kickY;
        s.camera.kickX *= CONFIG.CAMERA.KICK_DECAY;
        s.camera.kickY *= CONFIG.CAMERA.KICK_DECAY;

        const desiredZoom = s.arena.active ? 0.8 : 1.0;
        s.camera.zoom += (desiredZoom - s.camera.zoom) * CONFIG.CAMERA.ZOOM_SPEED;
    }
};

const CombatSystem = {
    update: (s: GameState, callbacks: GameCallbacks) => {
        // Black Holes
        for (let i = s.blackHoles.length - 1; i >= 0; i--) {
            const bh = s.blackHoles[i];
            if (!bh.active) { s.blackHoles.splice(i, 1); continue; }
            bh.life -= s.worldTimeScale;
            bh.radius = Math.min(CONFIG.COMBAT.BLACK_HOLE.MAX_RADIUS, bh.radius + CONFIG.COMBAT.BLACK_HOLE.GROWTH_RATE * s.worldTimeScale);
            
            const nearby = s.spatialGrid.queryRadius(bh.x, bh.y, bh.pullRange);
            for(const e of nearby) {
                if (e === s.player) continue;
                const ent = e as Enemy;
                if (!ent.active || ent.dead || ent.type.startsWith('boss')) continue;
                const dx = bh.x - ent.x;
                const dy = bh.y - ent.y;
                const distSq = dx*dx + dy*dy;
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const pullForce = CONFIG.COMBAT.BLACK_HOLE.PULL_FORCE / (distSq + 100);
                    Physics.applyForce(ent, (dx / dist) * pullForce, (dy / dist) * pullForce, s.worldTimeScale);

                    if (dist < bh.radius) {
                        ent.hp -= CONFIG.COMBAT.BLACK_HOLE.DAMAGE_RATE * s.worldTimeScale;
                        ent.rotation += 0.5;
                        if (ent.hp <= 0 && !ent.dead) handleEnemyDeath(s, ent, callbacks, {x: 0, y: 0});
                    }
                }
            }
            if (bh.life <= 0) {
                bh.active = false; createExplosion(s, bh.x, bh.y, '#ff00ff', 20, 5);
                createShockwave(s, bh.x, bh.y, 300, '#ff00ff', 10); callbacks.playSound('void_implode');
            }
        }

        // Bullets
        for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
            const b = s.bullets[bi];
            if (!b.active) continue;

            if (b.isBeam && b.beamPoints && b.beamPoints.length > 0) {
                const last = b.beamPoints[b.beamPoints.length - 1]; b.x = last.x; b.y = last.y;
                const angle = Math.atan2(b.vy, b.vx);
                b.beamPoints.push({x: last.x + Math.cos(angle) * 30 + Utils.rand(-15, 15), y: last.y + Math.sin(angle) * 30 + Utils.rand(-15, 15)});
                if (b.beamPoints.length > 10) b.beamPoints.shift();
            }

            // Homing
            if (b.homing > 0 && s.quality !== 'LOW') {
                let target = null, minDSq = CONFIG.COMBAT.HOMING_RANGE * CONFIG.COMBAT.HOMING_RANGE;
                const nearby = s.spatialGrid.queryRadius(b.x, b.y, CONFIG.COMBAT.HOMING_RANGE);
                for (const e of nearby) {
                    if (!e.active || e.dead || e === s.player || (e as any).hull) continue; // Skip non-enemies
                    if (!(e as Enemy).type || (e as Enemy).type === 'projectile') continue;
                    const dx = e.x - b.x; const dy = e.y - b.y; const dSq = dx*dx + dy*dy;
                    if (dSq < minDSq) { minDSq = dSq; target = e; }
                }
                if (target) {
                    const wantAng = Math.atan2(target.y - b.y, target.x - b.x); const currAng = Math.atan2(b.vy, b.vx);
                    const diff = Utils.angleDiff(currAng, wantAng);
                    const turn = Math.max(-b.homing * CONFIG.COMBAT.HOMING_TURN_SPEED, Math.min(b.homing * CONFIG.COMBAT.HOMING_TURN_SPEED, diff));
                    const newAng = currAng + turn; const spd = Math.hypot(b.vx, b.vy);
                    b.vx = Math.cos(newAng) * spd; b.vy = Math.sin(newAng) * spd;
                }
            }

            Physics.integrate(b, s.worldTimeScale);
            b.life -= s.worldTimeScale;
            if (s.frame % 2 === 0) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 5) b.trail.shift(); }

            if (b.life <= 0 || !Utils.inBounds(b.x, b.y, s.worldWidth, s.worldHeight, CONFIG.PHYSICS.BOUNDS_BUFFER)) {
                s.pools.bullets.release(b); s.bullets.splice(bi, 1); continue;
            }

            // Hit Detection
            let hit = false;

            // 1. Debris
            for (let i = s.debris.length - 1; i >= 0; i--) {
                const d = s.debris[i];
                if (!d.active) continue;
                if (handleBulletDebrisCollision(s, b, d)) {
                    if (d.health <= 0) s.debris.splice(i, 1); // Clean up dead debris
                    hit = true;
                    if (b.pierce <= 0) break; else b.pierce--;
                }
            }

            if (!hit || b.pierce > 0) {
                const candidates = s.spatialGrid.queryRadius(b.x, b.y, 100);
                for (const e of candidates) {
                    if (handleBulletEnemyCollision(s, b, e as Enemy, callbacks)) {
                        hit = true;
                        if (b.pierce <= 0) break; else b.pierce--;
                    }
                }
            }

            if (hit && b.pierce <= 0) { s.pools.bullets.release(b); s.bullets.splice(bi, 1); }
        }
    }
};

const EnemiesSystem = {
    update: (s: GameState, callbacks: GameCallbacks) => {
        const p = s.player;
        for (let i = s.enemies.length - 1; i >= 0; i--) {
            const e = s.enemies[i];
            if (!e.active || e.dead) continue;

            Physics.integrate(e, s.worldTimeScale);
            Physics.applyFriction(e, e.mass > 10 ? CONFIG.PHYSICS.FRICTION_HEAVY : CONFIG.PHYSICS.FRICTION_AIR);

            // Behavior Logic
            const speedMod = e.status.some(st => st.type === 'FREEZE') ? 0.5 : 1.0;
            const m = e.mass || 1.0;

            if (e.type === 'snake_body' && e.parentId) {
                 const parent = s.enemies.find(par => par.id === e.parentId);
                 if (parent && parent.active) {
                     const dist = Utils.dist(e.x, e.y, parent.x, parent.y);
                     if (dist > e.size) {
                         const ang = Math.atan2(parent.y - e.y, parent.x - e.x);
                         e.x = Utils.lerp(e.x, parent.x - Math.cos(ang) * e.size, 0.2);
                         e.y = Utils.lerp(e.y, parent.y - Math.sin(ang) * e.size, 0.2);
                     }
                 } else {
                     e.hp = 0; e.dead = true;
                     handleEnemyDeath(s, e, callbacks, {x:0, y:0});
                 }
            } else if (e.behavior && !e.type.startsWith('boss')) {
                // Use Flocking Logic for most enemies
                if (e.behavior === 'flock' || e.behavior === 'rush' || e.behavior === 'keep_distance' || e.behavior === 'dash_attack' || e.behavior === 'orbit' || e.behavior === 'shield') {
                    const force = applyVariationalBoids(e, s);
                    Physics.applyForce(e, force.x * m, force.y * m, 0.1 * s.worldTimeScale * speedMod);
                } else if (e.behavior === 'tank') {
                    const ang = Math.atan2(p.y - e.y, p.x - e.x);
                    Physics.applyForce(e, Math.cos(ang) * 0.2 * m, Math.sin(ang) * 0.2 * m, 0.1 * s.worldTimeScale * speedMod);
                }
            } else if (e.type.startsWith('boss')) {
                 const ang = Math.atan2(p.y - e.y, p.x - e.x);
                 Physics.applyForce(e, Math.cos(ang) * 0.5 * m, Math.sin(ang) * 0.5 * m, 0.1 * s.worldTimeScale * speedMod);
            }

            // Max Speed Cap
            const speed = Math.hypot(e.vx, e.vy);
            const maxSpeed = e.speed * speedMod;
            if (speed > maxSpeed) {
                e.vx = (e.vx / speed) * maxSpeed;
                e.vy = (e.vy / speed) * maxSpeed;
            }

            // Rotation
            if (e.type !== 'snake_body' && !e.type.startsWith('boss') && e.sides > 0) {
                 e.rotation += speed * 0.05 * s.worldTimeScale;
            } else if (speed > 0.1) {
                 e.rotation = Math.atan2(e.vy, e.vx);
            }

            // Status Effects
            for (let k = e.status.length - 1; k >= 0; k--) {
                const st = e.status[k];
                st.timer++;
                if (st.type === 'BURN' && st.timer % 30 === 0) {
                    e.hp -= st.power;
                    createFloatingText(s, e.x, e.y - 15, Math.floor(st.power).toString(), '#ffaa00', 10);
                    if (e.hp <= 0) handleEnemyDeath(s, e, callbacks, {x: 0, y: 0});
                }
                if (st.timer >= st.duration) e.status.splice(k, 1);
            }

            // Player Collision
            if (p.active && !p.invuln && !e.dead) {
                 const dist = Utils.dist(e.x, e.y, p.x, p.y);
                 const minDist = e.size + CONFIG.PLAYER.COLLISION_RADIUS;
                 if (dist < minDist) {
                     if (s.player.invuln <= 0) {
                        let dmg = 20;
                        if (e.type === 'tank') dmg = 40;
                        if (e.type.startsWith('boss')) dmg = 50;
                        s.player.hp -= dmg;
                        s.player.invuln = CONFIG.PLAYER.INVULN_ON_HIT;
                        s.shake += 10;
                        callbacks.playSound('hit');

                        // Directional Trauma
                        const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                        s.camera.kickX += Math.cos(angle) * 20;
                        s.camera.kickY += Math.sin(angle) * 20;

                        if (s.player.hp <= 0) {
                            s.player.hp = 0; s.gameOver = true; s.active = false;
                            callbacks.onGameOver({
                                score: Math.floor(s.score), wave: s.wave, level: s.player.level,
                                duration: (Date.now() - s.startTime) / 1000,
                                weapon: s.player.weapon, hull: s.player.hull,
                                upgrades: Array.from(s.upgradeStacks.entries()).map(([id, count]) => ({ id, count }))
                            });
                        }
                     }
                 }
            }
            
            // Trail
            if (s.frame % 4 === 0) {
                if(!e.trail) e.trail = [];
                e.trail.push({x: e.x, y: e.y});
                if(e.trail.length > 6) e.trail.shift();
            }

            // Bounds
            if (!Utils.inBounds(e.x, e.y, s.worldWidth, s.worldHeight, CONFIG.PHYSICS.BOUNDS_BUFFER)) {
                if (!e.type.startsWith('boss')) {
                    const ang = Math.atan2(s.worldHeight/2 - e.y, s.worldWidth/2 - e.x);
                    Physics.applyForce(e, Math.cos(ang) * 2, Math.sin(ang) * 2);
                }
            }
        }
    }
};

const CleanupSystem = {
    update: (s: GameState) => {
        // Particles
        for(let i = s.particles.length - 1; i >= 0; i--) {
            const p = s.particles[i];
            p.life--;
            Physics.integrate(p, s.worldTimeScale);
            Physics.applyFriction(p, p.friction);
            if (p.life <= 0) { s.pools.particles.release(p); s.particles.splice(i, 1); }
        }
        // Pickups
        for(let i = s.pickups.length - 1; i >= 0; i--) {
            const p = s.pickups[i];
            p.life--;
            if (p.life <= 0) { s.pools.pickups.release(p); s.pickups.splice(i, 1); }
        }
        // Gems
        for(let i = s.gems.length - 1; i >= 0; i--) {
            const g = s.gems[i];
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
        // Debris
        for(let i = s.debris.length - 1; i >= 0; i--) {
            const d = s.debris[i];
            d.rotation += d.vRot * s.worldTimeScale;
            d.vRot *= d.friction;
            Physics.integrate(d, s.worldTimeScale);
            Physics.applyFriction(d, d.friction);
            if (d.flash > 0) d.flash--;

            // Player Bounce
             const dist = Utils.dist(d.x, d.y, s.player.x, s.player.y);
            if (dist < d.size + 20) {
                const angle = Math.atan2(d.y - s.player.y, d.x - s.player.x);
                Physics.applyImpulse(d, Math.cos(angle) * 2.0 * d.mass, Math.sin(angle) * 2.0 * d.mass);
                d.vRot += (Math.random() - 0.5) * 0.2;
            }

            if (!Utils.inBounds(d.x, d.y, s.worldWidth, s.worldHeight)) {
                s.pools.debris.release(d); s.debris.splice(i, 1);
            }
        }
        // Floating Texts
        for(let i = s.texts.length - 1; i >= 0; i--) {
            const t = s.texts[i]; 
            t.x += t.vx * s.worldTimeScale; 
            t.y += t.vy * s.worldTimeScale; 
            t.vy += 0.2 * s.worldTimeScale; // Gravity
            t.vx *= 0.95;
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

const WaveSystem = {
        update: (s: GameState, callbacks: GameCallbacks) => {
            if (!s.bossActive && s.waveKills >= s.waveQuota) {
                spawnBoss(s, callbacks);
                return;
            }
            
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
            
            if (s.debris.length < CONFIG.SPAWNING.DEBRIS_MAX && Math.random() < 0.01) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 700;
                const ax = Utils.clamp(s.player.x + Math.cos(angle) * dist, 0, s.worldWidth);
                const ay = Utils.clamp(s.player.y + Math.sin(angle) * dist, 0, s.worldHeight);
                const size = Utils.rand(30, 60);
                createAsteroid(s, ax, ay, size);
            }
        }
};

// PLAYER AND SHOOTING SYSTEMS
// Refactored to separate concerns

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

    if (recoilForce > 2.0) {
        s.camera.kickX -= Math.cos(p.angle) * (recoilForce * 2);
        s.camera.kickY -= Math.sin(p.angle) * (recoilForce * 2);
    }

    callbacks.playSound('shoot');

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
        const pt = s.pools.particles.acquire();
        if(pt) {
            pt.x = p.x; pt.y = p.y;
            pt.vx = -dx * Math.random() * 5; pt.vy = -dy * Math.random() * 5;
            pt.life = 20; pt.maxLife = 20; pt.color = CONFIG.COLORS.PLAYER_DASH; pt.size = 2; pt.active = true;
            s.particles.push(pt);
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

// 2. PREDICTIVE AI AUTOPILOT (Moved local)
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

        // 3. Attraction to Gems
        let gemBonus = 0;
        for(const g of s.gems) {
            if(!g.active) continue;
            const d = Utils.dist(testX, testY, g.x, g.y);
            if(d < 200) gemBonus += (200 - d) * 0.5;
        }
        score += Math.min(gemBonus, 500);

        // 4. Center bias
        if (s.arena.active) {
             const distToArena = Utils.dist(testX, testY, s.arena.x, s.arena.y);
             if (distToArena > s.arena.radius - 100) score -= 1000;
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


const PlayerSystem = {
    update: (s: GameState, callbacks: GameCallbacks) => {
        const p = s.player;
        callbacks.updateAudioListener(p.x, p.y);

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
        const stick = s.stickInput;
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

        const thrust = CONFIG.PLAYER.THRUST * p.stats.speedMod; // dt applied in applyForce
        const len = Math.hypot(mx, my);
        if (len > 1) { mx /= len; my /= len; }

        Physics.applyForce(p, mx * thrust, my * thrust, s.playerTimeScale);
        Physics.applyFriction(p, CONFIG.PLAYER.FRICTION);

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
        if (len > 0.1 && s.frame % 2 === 0) {
            const t = s.pools.particles.acquire();
            if(t) {
                const angle = Math.atan2(my, mx) + Math.PI;
                t.x = p.x + Utils.rand(-5, 5); t.y = p.y + Utils.rand(-5, 5);
                t.vx = Math.cos(angle) * 4 + (Math.random()-0.5); t.vy = Math.sin(angle) * 4 + (Math.random()-0.5);
                t.life = 15; t.maxLife = 15; t.color = CONFIG.COLORS.PLAYER; t.size = Utils.rand(2, 4); t.type = 'spark'; t.active = true;
                s.particles.push(t);
            }
        }
    }
};


export const Systems = {
    Camera: CameraSystem,
    Wave: WaveSystem,
    Player: PlayerSystem,
    Enemies: EnemiesSystem,
    Combat: CombatSystem,
    Cleanup: CleanupSystem
};
