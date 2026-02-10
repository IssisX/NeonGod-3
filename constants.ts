

import { UpgradeOption, Player } from "./types";

export const CONFIG = Object.freeze({
  ENGINE: { TARGET_FPS: 60, FRAME_BUDGET_MS: 16.667, PERF_SAMPLE_INTERVAL: 60 },
  WORLD: {
      WIDTH: 4000,
      HEIGHT: 4000,
      SAFE_ZONE: 200, 
  },
  QUALITY: {
    TIERS: {
      HIGH: { particles: 600, gridStep: 2, shadowBlur: 20 },
      MEDIUM: { particles: 300, gridStep: 3, shadowBlur: 10 },
      LOW: { particles: 100, gridStep: 4, shadowBlur: 0 },
    },
    LOAD_THRESHOLDS: { HIGH_MAX: 300, MEDIUM_MAX: 500 },
  },
  PHYSICS: {
      FRICTION_AIR: 0.95,
      FRICTION_HEAVY: 0.98,
      FRICTION_DEBRIS: 0.99,
      FRICTION_GROUND: 0.88,
      COLLISION_ELASTICITY: 0.5,
      BOUNDS_BUFFER: 200,
      MASS_SCALE_PLAYER: 1.0,
      MASS_SCALE_ENEMY: 1.0,
  },
  COMBAT: {
      HOMING_RANGE: 400,
      HOMING_TURN_SPEED: 0.2,
      BLACK_HOLE: {
          PULL_FORCE: 2000,
          GROWTH_RATE: 0.5,
          MAX_RADIUS: 60,
          DAMAGE_RATE: 2,
          PULL_RANGE: 300,
      },
      DAMAGE_TEXT_LIFETIME: 60,
      CRIT_MULTIPLIER: 1.5,
      BOSS_CORE_RADIUS: 20,
  },
  CAMERA: {
      LOOKAHEAD: 20,
      LERP: 0.1,
      KICK_DECAY: 0.85,
      ZOOM_SPEED: 0.05,
  },
  SPATIAL: { CELL_SIZE: 150 },
  POOLS: {
    BULLETS: { initial: 200, max: 600 },
    PARTICLES: { initial: 500, max: 1200 }, 
    ENEMIES: { initial: 50, max: 400 },
    GEMS: { initial: 100, max: 300 },
    PICKUPS: { initial: 10, max: 30 },
    DEBRIS: { initial: 30, max: 150 },
  },
  GRID: { 
      CELL_SIZE: 80, 
      WAVE_SPEED: 0.15, 
      DAMPING: 0.96,    
      SOURCE_STRENGTH: 5.0,
      COLOR_SCALE: 2.0
  },
  BOIDS: {
    SEPARATION_RADIUS: 60,
    ALIGNMENT_RADIUS: 120,
    COHESION_RADIUS: 120,
    SEPARATION_WEIGHT: 4.0,
    ALIGNMENT_WEIGHT: 1.5,
    COHESION_WEIGHT: 0.8,
    PLAYER_WEIGHT: 2.5, 
  },
  HULLS: {
      INTERCEPTOR: { name: "Interceptor", weapon: "DEFAULT", hp: 300, speed: 1.2, desc: "Agile striker. Balanced speed and firepower." },
      BASTION: { name: "Bastion", weapon: "SHOTGUN", hp: 800, speed: 0.9, desc: "Armored titan. High durability, heavy weaponry." },
      ARCHITECT: { name: "Architect", weapon: "RAILGUN", hp: 450, speed: 1.0, desc: "Tech specialist. Starts with defensive orbitals." }
  } as Record<string, any>,
  PLAYER: {
    BASE_HP: 500, 
    BASE_SPEED: 0.8, // Increased base speed
    THRUST: 0.8,     // Significantly increased thrust for responsiveness
    FRICTION: 0.88,  // High friction for snappy stopping (was 0.94)
    ACCELERATION: 0.2,
    DASH: { COOLDOWN: 120, SPEED: 35, INVULN_DURATION: 30 },
    SKILLS: {
        Q: { NAME: "Chrono Stasis", COOLDOWN: 900, DURATION: 180 }, 
        E: { NAME: "Reality Fracture", COOLDOWN: 600, DURATION: 15 } 
    },
    COLLISION_RADIUS: 12,
    INVULN_ON_HIT: 60, 
  },
  WEAPONS: {
    // Recoil values lowered significantly to prevent loss of control
    DEFAULT: { name: "Pulse Rifle", color: "#ffe600", speed: 16, spread: 0.05, dmgMult: 1.0, fireDelay: 6, size: 4, pierce: 0, homing: 0, count: 1, lifetime: 80, recoil: 0.5, knockback: 3 },
    SHOTGUN: { name: "Scattergun", color: "#ff5500", speed: 12, spread: 0.35, dmgMult: 0.7, fireDelay: 45, size: 3, pierce: 1, homing: 0, count: 6, lifetime: 45, recoil: 4.0, knockback: 6 },
    RAILGUN: { name: "Arc Caster", color: "#00ffff", speed: 50, spread: 0, dmgMult: 2.5, fireDelay: 90, size: 12, pierce: 99, homing: 0, count: 1, lifetime: 25, type: 'beam', recoil: 5.0, knockback: 1 },
    VOID: { name: "Void Ray", color: "#aa00ff", speed: 12, spread: 0.15, dmgMult: 1.4, fireDelay: 8, size: 8, pierce: 0, homing: 0.2, count: 1, lifetime: 100, recoil: 0.2, knockback: 8 },
  } as Record<string, any>,
  ENEMIES: {
    CHASER: { hp: 15, speed: 1.8, size: 14, color: "#ff0055", xp: 10, score: 100, hpScale: 3.0, speedScale: 0.02, sides: 3, behavior: 'flock', mass: 1.2 },
    SHOOTER: { hp: 12, speed: 1.2, size: 20, color: "#be00ff", xp: 15, score: 150, hpScale: 2.5, speedScale: 0.02, shootInterval: 120, sides: 4, behavior: 'keep_distance', mass: 1.5 },
    TANK: { hp: 80, speed: 0.6, size: 32, color: "#00ff9d", xp: 40, score: 200, hpScale: 10, speedScale: 0.01, sides: 6, behavior: 'tank', mass: 25.0 },
    KAMIKAZE: { hp: 8, speed: 3.0, size: 10, color: "#ff5500", xp: 12, score: 120, hpScale: 2.0, speedScale: 0.04, detectRange: 300, sides: 3, behavior: 'rush', mass: 0.8 },
    DASHER: { hp: 25, speed: 4.5, size: 16, color: "#ffff00", xp: 25, score: 250, hpScale: 4.0, speedScale: 0.05, sides: 4, behavior: 'dash_attack', mass: 1.5 },
    SPLITTER: { hp: 40, speed: 1.0, size: 24, color: "#0088ff", xp: 30, score: 300, hpScale: 5.0, speedScale: 0.02, sides: 5, behavior: 'split_on_death', mass: 3.0 },
    ORBITER: { hp: 20, speed: 2.5, size: 12, color: "#ff00ff", xp: 20, score: 200, hpScale: 3.0, speedScale: 0.03, sides: 0, behavior: 'orbit', mass: 1.0 },
    GUARDIAN: { hp: 150, speed: 0.5, size: 28, color: "#0077ff", xp: 100, score: 500, hpScale: 12, speedScale: 0.01, sides: 4, behavior: 'shield', mass: 30.0 },
    
    // BOSS VARIANTS
    BOSS_WARLORD: { hp: 2000, speed: 3.5, size: 60, color: "#ff2200", xp: 2000, score: 5000, hpScale: 200, sides: 3, behavior: 'warlord', mass: 4000.0 },
    BOSS_HIVE: { hp: 3500, speed: 0.8, size: 75, color: "#9900ff", xp: 4000, score: 10000, hpScale: 400, sides: 6, behavior: 'hive', mass: 6000.0 },
    BOSS_OMNI: { hp: 6000, speed: 1.5, size: 90, color: "#ffffff", xp: 8000, score: 20000, hpScale: 600, sides: 0, behavior: 'omni', mass: 8000.0 },
    
    PYLON: { hp: 500, speed: 0, size: 25, color: "#00ff00", xp: 0, score: 0, sides: 4, mass: 1000.0 },
    SNAKE_HEAD: { hp: 100, speed: 2.2, size: 20, color: "#ffff00", xp: 60, score: 400, hpScale: 20, sides: 4, mass: 5.0 },
    SNAKE_BODY: { hp: 50, speed: 0, size: 16, color: "#aaaa00", xp: 15, score: 50, hpScale: 8, sides: 0, mass: 5.0 } 
  } as Record<string, any>,
  WAVES: {
      SWARM: { interval: 10, types: ['chaser'] },
      MIXED: { interval: 60, types: ['chaser', 'shooter'] },
      HEAVY: { interval: 120, types: ['tank', 'shooter', 'dasher', 'guardian'] },
      ELITE_SQUAD: { interval: 30, types: ['dasher', 'orbiter', 'guardian'] },
      CHAOS: { interval: 20, types: ['kamikaze', 'splitter', 'orbiter'] }
  },
  ELITE: { HP_MULT: 3.0, SPEED_MULT: 1.3, SIZE_MULT: 1.4, XP_MULT: 5, SCORE_MULT: 5, COLOR: "#ffffff", CHANCE_PER_WAVE: 0.03, MAX_CHANCE: 0.4 },
  SPAWNING: { 
    INITIAL_RATE: 60, 
    MIN_RATE: 10, 
    RATE_DECAY: 0.96,
    MAX_ENEMIES: 250, 
    BOSS_INTERVAL: 5,
    INITIAL_WAVE_QUOTA: 20,
    QUOTA_MULTIPLIER: 1.3,
    DEBRIS_MAX: 60,
  },
  ANOMALIES: {
      INTERVAL: 1800, 
      DURATION: 600, 
      CHANCE: 0.3
  },
  PROGRESSION: { XP_BASE: 50, XP_SCALE: 1.4, COMBO_DURATION: 180, COMBO_BONUS: 0.1 },
  GEMS: { MAGNET_RANGE: 160, PULL_STRENGTH: 0.25, FRICTION: 0.85, COLLECT_RADIUS: 35, LIFETIME: 900 },
  PICKUPS: { HEAL_AMOUNT: 150, LIFETIME: 1000, SIZE: 12, COLOR: "#00ff00" },
  COLORS: { BACKGROUND: "#050510", PLAYER: "#00f3ff", PLAYER_DASH: "#ffffff", XP_GEM: "#00ffaa", ULTIMATE: "#ff00ff" },
});

export const UPGRADES: UpgradeOption[] = [
  { id: "multishot", type: "stat", name: "Split Stream", desc: "Adds +1 projectile to your primary fire.", weight: 1.0, maxStack: 6, currentStack: 0 },
  { id: "fireRate", type: "stat", name: "Hyper Loader", desc: "Increases fire rate by 20%.", weight: 1.2, maxStack: 5, currentStack: 0 },
  { id: "speed", type: "stat", name: "Ion Thrusters", desc: "Increases movement speed by 15%.", weight: 1.0, maxStack: 4, currentStack: 0 },
  { id: "dashCd", type: "stat", name: "Phase Engine", desc: "Reduces dash cooldown by 20%.", weight: 0.8, maxStack: 3, currentStack: 0 },
  { id: "magnet", type: "stat", name: "Grav-Field", desc: "Increases item pickup range by 50%.", weight: 1.0, maxStack: 4, currentStack: 0 },
  { id: "maxHp", type: "stat", name: "Nano-Weave Hull", desc: "Increases Max HP by 50 and fully heals.", weight: 0.8, maxStack: 8, currentStack: 0 },
  { id: "damage", type: "stat", name: "Amp Core", desc: "Increases all damage by 20%.", weight: 1.0, maxStack: 10, currentStack: 0 },
  { id: "pierce", type: "stat", name: "Tungsten Rounds", desc: "Projectiles pierce +1 additional enemy.", weight: 0.6, maxStack: 5, currentStack: 0 },
  { id: "homing", type: "stat", name: "Tracker AI", desc: "Projectiles home in on targets more aggressively.", weight: 0.7, maxStack: 5, currentStack: 0 },
  { id: "orbital", type: "stat", name: "Guardian Orb", desc: "Adds a protective orbital that damages enemies.", weight: 0.5, maxStack: 4, currentStack: 0 },
  { id: "elem_fire", type: "stat", name: "Plasma Core", desc: "Attacks apply a stacking BURN effect.", weight: 0.6, maxStack: 5, currentStack: 0 },
  { id: "elem_ice", type: "stat", name: "Cryo Emitter", desc: "Attacks FREEZE enemies, slowing them.", weight: 0.6, maxStack: 3, currentStack: 0 },
  { id: "elem_volt", type: "stat", name: "Voltaic Coil", desc: "Attacks chain LIGHTNING to nearby foes.", weight: 0.5, maxStack: 3, currentStack: 0 },
];

export const EVOLUTIONS: UpgradeOption[] = [
    { 
        id: "evo_shotgun", 
        type: "weapon", 
        name: "EVOLVE: SCATTERGUN", 
        desc: "Transform weapon into a high-spread, multi-projectile flak cannon.", 
        weight: 100, 
        maxStack: 1, 
        currentStack: 0,
        weaponId: 'SHOTGUN',
        req: (p: Player) => p.stats.multishot >= 3 && p.weapon !== 'SHOTGUN' && p.weapon !== 'RAILGUN' && p.weapon !== 'VOID'
    },
    { 
        id: "evo_railgun", 
        type: "weapon", 
        name: "EVOLVE: RAIL DRIVER", 
        desc: "Transform weapon into a high-velocity piercing beam emitter.", 
        weight: 100, 
        maxStack: 1, 
        currentStack: 0,
        weaponId: 'RAILGUN',
        req: (p: Player) => p.stats.pierce >= 2 && p.weapon !== 'SHOTGUN' && p.weapon !== 'RAILGUN' && p.weapon !== 'VOID'
    },
    { 
        id: "evo_void", 
        type: "weapon", 
        name: "EVOLVE: VOID RAY", 
        desc: "Transform weapon into a corrupting energy stream.", 
        weight: 100, 
        maxStack: 1, 
        currentStack: 0,
        weaponId: 'VOID',
        req: (p: Player) => p.stats.homing >= 0.4 && p.weapon !== 'SHOTGUN' && p.weapon !== 'RAILGUN' && p.weapon !== 'VOID'
    }
];