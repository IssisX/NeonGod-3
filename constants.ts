
export const CONFIG = Object.freeze({
  ENGINE: { TARGET_FPS: 60, FRAME_BUDGET_MS: 16.667, PERF_SAMPLE_INTERVAL: 60 },
  QUALITY: {
    TIERS: {
      HIGH: { particles: 400, gridStep: 2, shadowBlur: 20 },
      MEDIUM: { particles: 200, gridStep: 3, shadowBlur: 10 },
      LOW: { particles: 80, gridStep: 4, shadowBlur: 0 },
    },
    LOAD_THRESHOLDS: { HIGH_MAX: 300, MEDIUM_MAX: 500 },
  },
  SPATIAL: { CELL_SIZE: 150 },
  POOLS: {
    BULLETS: { initial: 100, max: 400 },
    PARTICLES: { initial: 300, max: 800 }, 
    ENEMIES: { initial: 30, max: 300 },
    GEMS: { initial: 50, max: 200 },
    PICKUPS: { initial: 5, max: 20 },
    DEBRIS: { initial: 20, max: 100 },
  },
  GRID: { CELL_SIZE: 60, WARP_STRENGTH: 0.0001, SPRING_CONSTANT: 0.02, FORCE_DECAY: 0.92 },
  BOIDS: {
    SEPARATION_RADIUS: 40,
    ALIGNMENT_RADIUS: 80,
    COHESION_RADIUS: 80,
    SEPARATION_WEIGHT: 2.5,
    ALIGNMENT_WEIGHT: 1.0,
    COHESION_WEIGHT: 0.8,
    PLAYER_WEIGHT: 2.0, 
  },
  HULLS: {
      INTERCEPTOR: { name: "Interceptor", weapon: "DEFAULT", hp: 300, speed: 1.1, desc: "Agile striker. Balanced speed and firepower." },
      BASTION: { name: "Bastion", weapon: "SHOTGUN", hp: 800, speed: 0.8, desc: "Armored titan. High durability, heavy weaponry." },
      ARCHITECT: { name: "Architect", weapon: "RAILGUN", hp: 450, speed: 0.95, desc: "Tech specialist. Starts with defensive orbitals." }
  } as Record<string, any>,
  PLAYER: {
    BASE_HP: 500, 
    BASE_SPEED: 0.6, 
    THRUST: 0.8, // Newtonian Thrust
    FRICTION: 0.96, // Space drift
    ACCELERATION: 0.12,
    DASH: { COOLDOWN: 120, SPEED: 25, INVULN_DURATION: 30 },
    SKILLS: {
        Q: { NAME: "Chrono Stasis", COOLDOWN: 900, DURATION: 180 }, 
        E: { NAME: "Reality Fracture", COOLDOWN: 600, DURATION: 15 } 
    },
    COLLISION_RADIUS: 12,
    INVULN_ON_HIT: 60, 
  },
  WEAPONS: {
    DEFAULT: { name: "Pulse Rifle", color: "#ffe600", speed: 14, spread: 0.05, dmgMult: 1.0, fireDelay: 1, size: 4, pierce: 0, homing: 0, count: 1, lifetime: 80, recoil: 0.3, knockback: 3 },
    SHOTGUN: { name: "Scattergun", color: "#ff5500", speed: 11, spread: 0.35, dmgMult: 0.7, fireDelay: 1.2, size: 3, pierce: 1, homing: 0, count: 5, lifetime: 45, recoil: 2.0, knockback: 6 },
    RAILGUN: { name: "Arc Caster", color: "#00ffff", speed: 45, spread: 0, dmgMult: 0.8, fireDelay: 3.5, size: 12, pierce: 99, homing: 0, count: 1, lifetime: 25, type: 'beam', recoil: 1.0, knockback: 1 },
    VOID: { name: "Void Ray", color: "#aa00ff", speed: 10, spread: 0.15, dmgMult: 1.4, fireDelay: 1.1, size: 8, pierce: 0, homing: 0.2, count: 1, lifetime: 100, recoil: 0.5, knockback: 8 },
  } as Record<string, any>,
  ENEMIES: {
    CHASER: { hp: 15, speed: 1.8, size: 14, color: "#ff0055", xp: 10, score: 100, hpScale: 3.0, speedScale: 0.02, sides: 3, behavior: 'flock', mass: 1.2 },
    SHOOTER: { hp: 12, speed: 1.2, size: 20, color: "#be00ff", xp: 15, score: 150, hpScale: 2.5, speedScale: 0.02, shootInterval: 120, sides: 4, behavior: 'keep_distance', mass: 1.5 },
    TANK: { hp: 80, speed: 0.6, size: 32, color: "#00ff9d", xp: 40, score: 200, hpScale: 10, speedScale: 0.01, sides: 6, behavior: 'tank', mass: 25.0 },
    KAMIKAZE: { hp: 8, speed: 3.0, size: 10, color: "#ff5500", xp: 12, score: 120, hpScale: 2.0, speedScale: 0.04, detectRange: 300, sides: 3, behavior: 'rush', mass: 0.8 },
    DASHER: { hp: 25, speed: 4.5, size: 16, color: "#ffff00", xp: 25, score: 250, hpScale: 4.0, speedScale: 0.05, sides: 4, behavior: 'dash_attack', mass: 1.5 },
    SPLITTER: { hp: 40, speed: 1.0, size: 24, color: "#0088ff", xp: 30, score: 300, hpScale: 5.0, speedScale: 0.02, sides: 5, behavior: 'split_on_death', mass: 3.0 },
    ORBITER: { hp: 20, speed: 2.5, size: 12, color: "#ff00ff", xp: 20, score: 200, hpScale: 3.0, speedScale: 0.03, sides: 0, behavior: 'orbit', mass: 1.0 },
    
    // BOSS VARIANTS
    BOSS_WARLORD: { hp: 2000, speed: 3.5, size: 60, color: "#ff2200", xp: 2000, score: 5000, hpScale: 200, sides: 3, behavior: 'warlord', mass: 4000.0 },
    BOSS_HIVE: { hp: 3500, speed: 1.0, size: 75, color: "#9900ff", xp: 4000, score: 10000, hpScale: 400, sides: 6, behavior: 'hive', mass: 6000.0 },
    BOSS_OMNI: { hp: 6000, speed: 1.5, size: 90, color: "#ffffff", xp: 8000, score: 20000, hpScale: 600, sides: 0, behavior: 'omni', mass: 8000.0 },
    
    PYLON: { hp: 500, speed: 0, size: 25, color: "#00ff00", xp: 0, score: 0, sides: 4, mass: 1000.0 },
    SNAKE_HEAD: { hp: 100, speed: 2.2, size: 20, color: "#ffff00", xp: 60, score: 400, hpScale: 20, sides: 4, mass: 5.0 },
    SNAKE_BODY: { hp: 50, speed: 0, size: 16, color: "#aaaa00", xp: 15, score: 50, hpScale: 8, sides: 0, mass: 5.0 } 
  } as Record<string, any>,
  WAVES: {
      SWARM: { interval: 10, types: ['chaser'] },
      MIXED: { interval: 60, types: ['chaser', 'shooter'] },
      HEAVY: { interval: 120, types: ['tank', 'shooter', 'dasher'] },
      ELITE_SQUAD: { interval: 30, types: ['dasher', 'orbiter'] },
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

export const UPGRADES = [
  { id: "multishot", name: "Split Stream", desc: "Adds +1 projectile to your primary fire.", weight: 1.0, maxStack: 6 },
  { id: "fireRate", name: "Hyper Loader", desc: "Increases fire rate by 20%.", weight: 1.2, maxStack: 5 },
  { id: "speed", name: "Ion Thrusters", desc: "Increases movement speed by 15%.", weight: 1.0, maxStack: 4 },
  { id: "dashCd", name: "Phase Engine", desc: "Reduces dash cooldown by 20%.", weight: 0.8, maxStack: 3 },
  { id: "magnet", name: "Grav-Field", desc: "Increases item pickup range by 50%.", weight: 1.0, maxStack: 4 },
  { id: "maxHp", name: "Nano-Weave Hull", desc: "Increases Max HP by 50 and fully heals.", weight: 0.8, maxStack: 8 },
  { id: "damage", name: "Amp Core", desc: "Increases all damage by 20%.", weight: 1.0, maxStack: 10 },
  { id: "pierce", name: "Tungsten Rounds", desc: "Projectiles pierce +1 additional enemy.", weight: 0.6, maxStack: 5 },
  { id: "homing", name: "Tracker AI", desc: "Projectiles home in on targets more aggressively.", weight: 0.7, maxStack: 5 },
  { id: "orbital", name: "Guardian Orb", desc: "Adds a protective orbital that damages enemies.", weight: 0.5, maxStack: 4 },
  { id: "elem_fire", name: "Plasma Core", desc: "Attacks apply a stacking BURN effect.", weight: 0.6, maxStack: 5 },
  { id: "elem_ice", name: "Cryo Emitter", desc: "Attacks FREEZE enemies, slowing them.", weight: 0.6, maxStack: 3 },
  { id: "elem_volt", name: "Voltaic Coil", desc: "Attacks chain LIGHTNING to nearby foes.", weight: 0.5, maxStack: 3 },
];
