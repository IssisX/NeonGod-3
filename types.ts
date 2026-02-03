
export interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

export type HullType = 'INTERCEPTOR' | 'BASTION' | 'ARCHITECT';

export interface Skill {
  id: 'chrono' | 'fracture';
  name: string;
  cd: number;
  maxCd: number;
  active: boolean;
  duration: number;
  maxDuration: number;
}

export interface Player extends Entity {
  hull: HullType;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  xpToNext: number;
  angle: number;
  roll: number;
  cd: number;
  dashCd: number;
  maxDashCd: number;
  invuln: number;
  hitFlash: number;
  muzzleFlash: number;
  
  // NEW: Separate recoil vector for damping control
  recoilX: number;
  recoilY: number;
  
  weapon: 'DEFAULT' | 'SHOTGUN' | 'RAILGUN' | 'VOID';
  skills: {
    q: Skill;
    e: Skill;
  };
  stats: {
    multishot: number;
    fireRateMod: number;
    speedMod: number;
    damageMod: number;
    magnetRange: number;
    orbitals: number;
    homing: number;
    pierce: number;
    elemental: {
        fire: number; 
        ice: number; 
        volt: number; 
    }
  };
}

export interface Bullet extends Entity {
  id: string;
  life: number;
  color: string;
  dmg: number;
  pierce: number;
  homing: number;
  size: number;
  knockback: number;
  trail: { x: number; y: number }[];
  isBeam?: boolean;
  beamPoints?: { x: number; y: number }[];
  elemental?: { fire: number; ice: number; volt: number };
}

export interface StatusEffect {
    type: 'BURN' | 'FREEZE';
    duration: number;
    power: number;
    timer: number;
}

// PROCEDURAL BOSS PARTS
export interface BossModule {
    xOffset: number;
    yOffset: number;
    type: 'CORE' | 'WING' | 'TURRET' | 'ENGINE' | 'SHIELD' | 'SPIKE';
    size: number;
    color: string;
    rotation: number; // Relative rotation
    health: number;
    maxHealth: number;
    shape: number[]; // Polygon points
    mirror?: boolean;
}

export interface Enemy extends Entity {
  id: string;
  hp: number;
  maxHp: number;
  type: string;
  mass: number;
  speed: number;
  size: number;
  color: string;
  isElite: boolean;
  xp: number;
  score: number;
  shootTimer: number;
  attackTimer: number;
  phase: number;
  dead: boolean;
  life: number;
  hitFlash: number;
  rotation: number;
  sides: number; 
  invulnerable?: boolean;
  parentId?: string; 
  history?: {x: number, y: number}[]; 
  segmentIndex?: number;
  trail?: {x: number, y: number}[]; 
  status: StatusEffect[];
  state?: 'idle' | 'charge' | 'recover';
  stateTimer?: number;
  squadId?: string;
  squadRole?: 'protector' | 'flanker' | 'fodder';
  squadOffset?: { angle: number, dist: number };
  behavior?: string;
  
  // New Procedural Data
  modules?: BossModule[];
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  color: string;
  size: number;
  friction: number;
  type: 'spark' | 'ghost' | 'glitch' | 'shard' | 'lightning' | 'void_matter';
  rotation?: number;
  rv?: number; 
  sides?: number; 
  targetX?: number;
  targetY?: number;
}

export interface BlackHole extends Entity {
    life: number;
    maxLife: number;
    radius: number;
    pullRange: number;
    color: string;
    active: boolean;
}

export interface Gem extends Entity {
  val: number;
  life: number;
  active: boolean;
}

export interface Pickup extends Entity {
    type: 'heal' | 'power';
    life: number;
    active: boolean;
}

// PHYSICS-DRIVEN UI TEXT
export interface FloatingText {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  isCrit: boolean;
  opacity: number;
}

export interface Shockwave {
  x: number;
  y: number;
  size: number;
  maxSize: number;
  color: string;
  speed: number;
  alpha: number;
  width: number;
  life?: number;
}

export interface Orbital {
  angle: number;
  dist: number;
}

export interface TouchInput {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  type: 'move' | 'aim';
}

export interface Anomaly {
  active: boolean;
  type: 'SURGE' | 'DECAY' | 'GRAVITY_LOSS' | 'NONE';
  timer: number;
  duration: number;
  intensity: number;
}

export interface Camera {
    x: number;
    y: number;
    zoom: number;
    targetZoom: number;
    // Directional Impulse Vectors
    kickX: number;
    kickY: number;
}

export interface Debris extends Entity {
    id: string;
    size: number;
    color: string;
    rotation: number;
    vRot: number;
    sides: number;
    health: number;
    type: 'asteroid' | 'structure' | 'scrap';
    
    // Physics Props
    mass: number;
    friction: number;
    flash: number; // For hit feedback
}

export interface Star {
    x: number;
    y: number;
    z: number; // Depth (0.1 to 1.0)
    size: number;
    brightness: number;
}

export interface ShieldRipple {
    x: number;
    y: number;
    radius: number;
    alpha: number;
}

export interface Arena {
    active: boolean;
    x: number;
    y: number;
    radius: number;
    alpha: number;
}

export type WaveType = 'SWARM' | 'MIXED' | 'HEAVY' | 'ELITE_SQUAD' | 'CHAOS';

export interface GameState {
  active: boolean;
  paused: boolean;
  gameOver: boolean;
  autoMode: boolean;
  frame: number;
  hitStop: number;
  
  // Dimensions
  width: number; // Viewport width
  height: number; // Viewport height
  worldWidth: number; // Map width
  worldHeight: number; // Map height
  
  pixelRatio: number;
  camera: Camera;
  score: number;
  wave: number;
  waveKills: number; 
  waveQuota: number; 
  waveType: WaveType;
  waveTimer: number;

  combo: number;
  comboTimer: number;
  overdrive: number;
  
  timeScale: number; 
  playerTimeScale: number; 
  worldTimeScale: number; 
  
  shake: number;
  screenFlash: number;
  flashColor: string;
  
  chromaticAberration: number;
  anomaly: Anomaly;
  arena: Arena;

  startTime: number;
  runDuration: number;
  quality: string;
  qualitySettings: any;
  player: Player;
  bullets: Bullet[];
  enemies: Enemy[];
  particles: Particle[];
  blackHoles: BlackHole[]; 
  gems: Gem[];
  pickups: Pickup[];
  texts: FloatingText[];
  shockwaves: Shockwave[];
  orbitals: Orbital[];
  
  // New Arrays
  debris: Debris[];
  stars: Star[];
  shieldRipples: ShieldRipple[];

  keys: { [key: string]: boolean; ArrowUp: boolean; ArrowDown: boolean; ArrowLeft: boolean; ArrowRight: boolean; space: boolean; shift: boolean; f: boolean; q: boolean; e: boolean };
  mouse: { x: number; y: number; down: boolean };
  touches: { [key: number]: TouchInput };
  spawnTimer: number;
  spawnRate: number;
  bossActive: boolean;
  upgradeStacks: Map<string, number>;
  pools: {
    bullets: any;
    enemies: any;
    particles: any;
    gems: any;
    pickups: any;
    debris: any; // Added debris pool
  };
  spatialGrid: any;
  visualGrid: any;
  
  damageDealtBuffer: number;
}

export interface UpgradeOption {
  id: string;
  name: string;
  desc: string;
  weight: number;
  maxStack: number;
  currentStack: number;
  type: 'stat' | 'weapon';
  weaponId?: string;
  req?: (p: Player) => boolean;
}

export interface RunData {
  id?: string;
  score: number;
  wave: number;
  level: number;
  duration: number;
  weapon: string;
  hull: string; 
  upgrades: { id: string; count: number }[];
  timestamp?: number;
}

export interface UIState {
  screen: 'boot' | 'start' | 'hull_select' | 'playing' | 'levelup' | 'gameover';
  score: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  wave: number;
  combo: number;
  overdrive: number;
  dashReady: boolean;
  skills: { q: Skill; e: Skill };
  bossWarning: boolean;
  anomaly: Anomaly;
  upgradeOptions: UpgradeOption[];
  weaponName: string;
  topRuns: RunData[];
  globalStats: { totalRuns: number; bestScore: number };
  error?: string | null;
  autoMode: boolean;
  dps: number;
  dpsHistory: number[];
}

export interface InputState {
    keys: { [key: string]: boolean };
    mouse: { x: number; y: number; down: boolean };
}

export type SoundType = 'shoot' | 'explosion' | 'hit' | 'dash' | 'levelup' | 'gameover' | 'spawn' | 'charge' | 'ultimate' | 'pickup' | 'evolve' | 'chrono' | 'fracture' | 'glitch_start' | 'spark' | 'void_implode';

export interface GameCallbacks {
    onLevelUp: (options: UpgradeOption[]) => void;
    onGameOver: (runData: RunData) => void;
    onBossSpawn: () => void;
    onWeaponEvolve: (name: string) => void;
    playSound: (type: SoundType, x?: number, y?: number) => void; // Updated for spatial
    setAudioIntensity: (val: number) => void;
    setAudioTempo: (val: number) => void;
    updateAudioListener: (x: number, y: number) => void; // New callback
}
