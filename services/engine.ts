

import { GameState, Player, HullType, GameCallbacks, UpgradeOption } from '../types';
import { CONFIG, UPGRADES, EVOLUTIONS } from '../constants';
import { SpatialGrid, VisualGrid } from './grids';
import { Factories, ObjectPool } from './pools';
import { Systems } from './systems';
import { renderGame } from './renderer';
import { createEvolutionEffect } from './generators';

export { renderGame, createEvolutionEffect };

export function updateGame(s: GameState, callbacks: GameCallbacks) {
    // 1. Shake Decay (Always apply this, regardless of hitstop)
    if (s.shake > 0) {
        s.shake = Math.max(0, s.shake * 0.9 - 0.5);
        s.shake = Math.min(s.shake, 30); // Hard cap to prevent nausea
    }

    if (s.hitStop > 0) {
        s.hitStop--;
        return; 
    }

    s.spatialGrid.clear();
    if (s.player.active) s.spatialGrid.insert(s.player);
    for (const e of s.enemies) {
        if (e.active) s.spatialGrid.insert(e);
    }

    Systems.Wave.update(s, callbacks);
    Systems.Player.update(s, callbacks);
    Systems.Enemies.update(s, callbacks);
    Systems.Combat.update(s, callbacks);
    Systems.Cleanup.update(s);
    Systems.Camera.update(s);

    s.frame++;
    if (s.comboTimer > 0) {
        s.comboTimer -= s.worldTimeScale;
        if (s.comboTimer <= 0) s.combo = 0;
    }
    
    if (s.combo > 50) {
        s.chromaticAberration = Math.min(2.0, (s.combo - 50) * 0.05);
    }
    
    if (s.anomaly.active) {
        s.anomaly.timer -= s.worldTimeScale;
        if (s.anomaly.timer <= 0) {
            s.anomaly.active = false;
            s.chromaticAberration = 0;
        } else {
            if (s.anomaly.type === 'SURGE') s.chromaticAberration = Math.random() * 5;
            else if (s.anomaly.type === 'DECAY') s.chromaticAberration = Math.sin(s.frame * 0.1) * 2;
        }
    } else {
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

    // Dynamic Audio Logic
    const dangerLevel = (s.enemies.length / 80) + (1 - s.player.hp/s.player.maxHp) * 0.6 + (s.bossActive ? 0.8 : 0);
    callbacks.setAudioIntensity(Math.min(1.0, dangerLevel));
    
    let targetTempo = 1.0;
    if (s.bossActive) targetTempo = 1.25;
    else if (s.waveType === 'CHAOS') targetTempo = 1.2;
    else if (s.waveType === 'SWARM') targetTempo = 1.1;
    else if (s.enemies.length < 5) targetTempo = 0.9;
    
    callbacks.setAudioTempo(targetTempo);

    if (s.visualGrid) s.visualGrid.update(s.qualitySettings.gridStep);
    
    if (s.player.xp >= s.player.xpToNext) {
        s.player.level++;
        s.player.xp -= s.player.xpToNext;
        s.player.xpToNext = Math.floor(s.player.xpToNext * CONFIG.PROGRESSION.XP_SCALE);
        
        const options: UpgradeOption[] = [];
        const availableEvolutions = EVOLUTIONS.filter(evo => evo.req && evo.req(s.player));
        if (availableEvolutions.length > 0) {
            options.push({ ...availableEvolutions[0], currentStack: 0 });
        }

        const pool = [...UPGRADES]; 
        const valid = pool.filter(u => {
            const current = s.upgradeStacks.get(u.id) || 0;
            return current < u.maxStack;
        });
        
        while (options.length < 3) {
            if (valid.length === 0) break;
            const totalWeight = valid.reduce((acc, u) => acc + u.weight, 0);
            let r = Math.random() * totalWeight;
            let selected = null;
            for (const u of valid) {
                r -= u.weight;
                if (r <= 0) { selected = u; break; }
            }
            if (!selected) selected = valid[valid.length - 1];
            
            options.push({
                ...selected,
                currentStack: s.upgradeStacks.get(selected.id) || 0
            });
            
            const idx = valid.indexOf(selected);
            if (idx > -1) valid.splice(idx, 1);
        }
        
        callbacks.onLevelUp(options);
        callbacks.playSound('levelup');
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
        camera: { x: CONFIG.WORLD.WIDTH/2, y: CONFIG.WORLD.HEIGHT/2, zoom: 1, targetZoom: 1, kickX: 0, kickY: 0 },
        score: 0, wave: 1, waveKills: 0, waveQuota: CONFIG.SPAWNING.INITIAL_WAVE_QUOTA, waveType: 'SWARM', waveTimer: 0,
        combo: 0, comboTimer: 0, overdrive: 0,
        timeScale: 1, playerTimeScale: 1, worldTimeScale: 1,
        shake: 0, screenFlash: 0, flashColor: '#ffffff', chromaticAberration: 0,
        anomaly: { active: false, type: 'NONE', timer: 0, duration: 0, intensity: 0 },
        arena: { active: false, x: 0, y: 0, radius: 0, alpha: 0 },
        
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
        visualGrid: new VisualGrid(CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT, CONFIG.GRID.CELL_SIZE),
        damageDealtBuffer: 0
    };
    
    resetPlayer(s.player, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT, 'INTERCEPTOR');
    
    for(let i=0; i<300; i++) {
        s.stars.push({
            x: Math.random() * CONFIG.WORLD.WIDTH,
            y: Math.random() * CONFIG.WORLD.HEIGHT,
            z: Math.random() * 0.5 + 0.1, 
            size: Math.random() * 2 + 1,
            brightness: Math.random()
        });
    }

    return s;
}

export function resetPlayer(p: Player, w: number, h: number, hullType: HullType) {
    const hull = CONFIG.HULLS[hullType];
    const initialWeapon = hull.weapon;

    p.x = w/2; p.y = h/2; p.vx = 0; p.vy = 0; p.active = true;
    p.hull = hullType;
    p.hp = hull.hp; p.maxHp = hull.hp;
    p.xp = 0; p.level = 1; p.xpToNext = CONFIG.PROGRESSION.XP_BASE;
    p.angle = 0;
    p.roll = 0;
    p.cd = 0; p.dashCd = 0; p.maxDashCd = CONFIG.PLAYER.DASH.COOLDOWN;
    p.invuln = 0; p.hitFlash = 0; p.muzzleFlash = 0;
    
    // Reset Recoil Vectors
    p.recoilX = 0; p.recoilY = 0;
    
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