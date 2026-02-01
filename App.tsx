
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameUI } from './components/GameUI';
import { TouchControls } from './components/TouchControls';
import { GameState, UIState, UpgradeOption, HullType } from './types';
import { CONFIG } from './constants';
import { createGameState, updateGame, renderGame, createEvolutionEffect, resetPlayer } from './services/engine';
import { audio } from './services/audio';
import { StorageService } from './services/storage';
import { SpatialGrid, VisualGrid } from './services/grids';
import { WebGLRenderer } from './services/webgl';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglRef = useRef<WebGLRenderer | null>(null);
  
  const gameCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const distortionCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const requestRef = useRef<number>(0);
  const stateRef = useRef<GameState | null>(null);

  const [ui, setUI] = useState<UIState>({
    screen: 'boot',
    score: 0,
    hp: CONFIG.PLAYER.BASE_HP,
    maxHp: CONFIG.PLAYER.BASE_HP,
    xp: 0,
    xpToNext: CONFIG.PROGRESSION.XP_BASE,
    level: 1,
    wave: 1,
    combo: 0,
    overdrive: 0,
    dashReady: true,
    skills: { 
        q: { id: 'chrono', name: '', cd: 0, maxCd: 1, active: false, duration: 0, maxDuration: 1 }, 
        e: { id: 'fracture', name: '', cd: 0, maxCd: 1, active: false, duration: 0, maxDuration: 1 } 
    },
    bossWarning: false,
    anomaly: { active: false, type: 'NONE', timer: 0, duration: 0, intensity: 0 },
    upgradeOptions: [],
    weaponName: 'Pulse Rifle',
    topRuns: [],
    globalStats: { totalRuns: 0, bestScore: 0 },
    autoMode: false,
    dps: 0,
    dpsHistory: [],
  });

  const touchInputRef = useRef({ mx: 0, my: 0, aimX: 0, aimY: 0, shooting: false });
  // Buffer to store DPS history in mutable ref to avoid React state churn
  const dpsBufferRef = useRef<number[]>(new Array(30).fill(0));
  const damageAccumulatorRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = createGameState(window.innerWidth, window.innerHeight);
    webglRef.current = new WebGLRenderer();

    setTimeout(() => {
      StorageService.getTopRuns().then(runs => {
        StorageService.getStats().then(stats => {
          setUI(prev => ({ ...prev, screen: 'start', topRuns: runs, globalStats: stats }));
        });
      });
    }, 1500);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleUpgradeSelect = useCallback((id: string) => {
    const s = stateRef.current;
    if (!s) return;
    
    const p = s.player;
    const current = s.upgradeStacks.get(id) || 0;
    s.upgradeStacks.set(id, current + 1);
    
    switch (id) {
        case 'multishot': p.stats.multishot++; break;
        case 'fireRate': p.stats.fireRateMod += 0.2; break;
        case 'speed': p.stats.speedMod += 0.15; break;
        case 'dashCd': p.maxDashCd = Math.max(20, p.maxDashCd - 15); break;
        case 'magnet': p.stats.magnetRange += 60; break;
        case 'maxHp': p.maxHp += 50; p.hp = p.maxHp; break;
        case 'damage': p.stats.damageMod += 0.2; break;
        case 'pierce': p.stats.pierce++; break;
        case 'homing': p.stats.homing += 0.15; break;
        case 'orbital': 
            p.stats.orbitals++; 
            s.orbitals.push({ angle: 0, dist: 60 });
            s.orbitals.forEach((o, i) => o.angle = (Math.PI * 2 / s.orbitals.length) * i);
            break;
        case 'elem_fire': p.stats.elemental.fire++; break;
        case 'elem_ice': p.stats.elemental.ice++; break;
        case 'elem_volt': p.stats.elemental.volt++; break;
    }
    
    let evolved = false;
    let newName = '';
    let newColor = '#ffffff';

    if (p.stats.multishot >= 4 && p.weapon !== 'SHOTGUN') { 
        p.weapon = 'SHOTGUN'; evolved = true; newName = 'Scattergun'; newColor = CONFIG.WEAPONS.SHOTGUN.color;
    }
    else if (p.stats.pierce >= 2 && p.weapon !== 'RAILGUN') { 
        p.weapon = 'RAILGUN'; evolved = true; newName = 'Rail Driver'; newColor = CONFIG.WEAPONS.RAILGUN.color;
    }
    else if (p.stats.homing >= 0.5 && p.weapon !== 'VOID') { 
        p.weapon = 'VOID'; evolved = true; newName = 'Void Ray'; newColor = CONFIG.WEAPONS.VOID.color;
    }
    
    if (evolved) {
        setUI(prev => ({ ...prev, weaponName: newName }));
        audio.play('evolve');
        createEvolutionEffect(s, p.x, p.y, newColor);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    }
    
    s.paused = false;
    setUI(prev => ({ ...prev, screen: 'playing' }));
  }, []);

  const handleToggleAutoMode = useCallback(() => {
      setUI(prev => {
          const newVal = !prev.autoMode;
          // IMPORTANT: Sync with engine state immediately
          if (stateRef.current) {
              stateRef.current.autoMode = newVal;
          }
          return { ...prev, autoMode: newVal };
      });
  }, []);

  const autoLevelUpTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
      if (ui.screen === 'levelup' && ui.autoMode) {
          if (!autoLevelUpTimeoutRef.current) {
              autoLevelUpTimeoutRef.current = window.setTimeout(() => {
                  if (ui.upgradeOptions.length > 0) {
                      const randomIdx = Math.floor(Math.random() * ui.upgradeOptions.length);
                      handleUpgradeSelect(ui.upgradeOptions[randomIdx].id);
                  }
                  autoLevelUpTimeoutRef.current = null;
              }, 1000); 
          }
      } else {
          if(autoLevelUpTimeoutRef.current) {
              clearTimeout(autoLevelUpTimeoutRef.current);
              autoLevelUpTimeoutRef.current = null;
          }
      }
  }, [ui.screen, ui.autoMode, ui.upgradeOptions, handleUpgradeSelect]);


  const gameLoop = useCallback((time: number) => {
    const s = stateRef.current;
    
    if (!canvasRef.current || !s) {
        requestRef.current = requestAnimationFrame(gameLoop);
        return;
    }

    const gameCtx = gameCanvasRef.current.getContext('2d', { alpha: false });
    const distCtx = distortionCanvasRef.current.getContext('2d', { alpha: false });

    if (!gameCtx || !distCtx) return;

    // Apply DPI scaling to 2D contexts every frame to ensure correct coordinate space
    const dpr = s.pixelRatio;
    gameCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    distCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (s.active && !s.paused && !s.gameOver) {
      (s as any).stickInput = touchInputRef.current;

      updateGame(s, {
        onLevelUp: (options) => {
          s.paused = true; // CRITICAL FIX: Pause engine immediately
          setUI(prev => ({ ...prev, screen: 'levelup', upgradeOptions: options }));
        },
        onGameOver: (runData) => {
          StorageService.saveRun(runData).then(() => {
            Promise.all([StorageService.getTopRuns(), StorageService.getStats()])
              .then(([topRuns, globalStats]) => {
                setUI(prev => ({ ...prev, screen: 'gameover', topRuns, globalStats }));
              });
          });
        },
        onBossSpawn: () => {
          setUI(prev => ({ ...prev, bossWarning: true }));
          setTimeout(() => setUI(prev => ({ ...prev, bossWarning: false })), 3000);
        },
        onWeaponEvolve: (name) => {
          setUI(prev => ({ ...prev, weaponName: name }));
        },
        playSound: (type) => audio.play(type),
        setAudioIntensity: (val) => audio.setIntensity(val),
        setAudioTempo: (val) => audio.setTempoMultiplier(val)
      });
      
      // Calculate DPS
      damageAccumulatorRef.current += s.damageDealtBuffer;
      
      // Update UI at 30fps-ish or less to save React cycles, but capture data every frame
      if (s.frame % 15 === 0) {
        // Simple DPS avg over last ~0.25s roughly
        const currentDPS = (damageAccumulatorRef.current / 15) * 60;
        dpsBufferRef.current.push(currentDPS);
        if (dpsBufferRef.current.length > 30) dpsBufferRef.current.shift();
        damageAccumulatorRef.current = 0;

        setUI(prev => ({
          ...prev,
          score: Math.floor(s.score),
          hp: Math.max(0, s.player.hp),
          maxHp: s.player.maxHp,
          xp: s.player.xp,
          xpToNext: s.player.xpToNext,
          level: s.player.level,
          dashReady: s.player.dashCd <= 0,
          skills: s.player.skills,
          anomaly: s.anomaly,
          combo: s.combo,
          overdrive: s.overdrive,
          wave: s.wave,
          dps: currentDPS,
          dpsHistory: [...dpsBufferRef.current]
        }));
      }
    } else if (!s.active) {
         if(s.visualGrid) s.visualGrid.update(s.qualitySettings.gridStep);
         s.frame++;
    }

    // Render using the scaled contexts
    renderGame(gameCtx, distCtx, s);

    if (webglRef.current && canvasRef.current) {
        const t = time * 0.001;
        const glitch = s.anomaly.active ? (s.anomaly.intensity || 1.0) : 0;
        const aber = s.chromaticAberration;
        // Calculate damage intensity (0 to 1)
        const damage = s.player && s.player.maxHp > 0 ? Math.max(0, 1.0 - (s.player.hp / s.player.maxHp)) : 0;
        
        webglRef.current.render(gameCanvasRef.current, distortionCanvasRef.current, t, glitch, aber, damage);
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    const handleResize = () => {
        const canvas = canvasRef.current;
        const s = stateRef.current;
        if (!canvas || !s) return;
        
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        
        const offW = window.innerWidth * dpr;
        const offH = window.innerHeight * dpr;
        
        gameCanvasRef.current.width = offW;
        gameCanvasRef.current.height = offH;
        
        distortionCanvasRef.current.width = offW;
        distortionCanvasRef.current.height = offH;

        if (webglRef.current) webglRef.current.init(canvas);
        
        s.width = window.innerWidth;
        s.height = window.innerHeight;
        s.pixelRatio = dpr;
        s.spatialGrid = new SpatialGrid(CONFIG.SPATIAL.CELL_SIZE);
        s.visualGrid.rebuild(s.width, s.height);
        // Reset Camera
        s.camera = { x: s.width/2, y: s.height/2, zoom: 1, targetZoom: 1 };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const key = e.key.toLowerCase();
      const k = s.keys as any;
      if (k.hasOwnProperty(key)) { k[key] = true; }
      if (e.code === 'ArrowUp') s.keys.ArrowUp = true;
      if (e.code === 'ArrowDown') s.keys.ArrowDown = true;
      if (e.code === 'ArrowLeft') s.keys.ArrowLeft = true;
      if (e.code === 'ArrowRight') s.keys.ArrowRight = true;
      if (e.code === 'Space') { s.keys.space = true; e.preventDefault(); }
      if (e.key === 'Shift') { s.keys.shift = true; e.preventDefault(); }
      if (key === 'f') s.keys.f = true;
      if (key === 'q') s.keys.q = true;
      if (key === 'e') s.keys.e = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const key = e.key.toLowerCase();
      const k = s.keys as any;
      if (k.hasOwnProperty(key)) { k[key] = false; }
      if (e.code === 'ArrowUp') s.keys.ArrowUp = false;
      if (e.code === 'ArrowDown') s.keys.ArrowDown = false;
      if (e.code === 'ArrowLeft') s.keys.ArrowLeft = false;
      if (e.code === 'ArrowRight') s.keys.ArrowRight = false;
      if (e.code === 'Space') { s.keys.space = false; e.preventDefault(); }
      if (e.key === 'Shift') { s.keys.shift = false; e.preventDefault(); }
      if (key === 'f') s.keys.f = false;
      if (key === 'q') s.keys.q = false;
      if (key === 'e') s.keys.e = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s) { s.mouse.x = e.clientX; s.mouse.y = e.clientY; }
    };

    const onMouseDown = () => { const s = stateRef.current; if (s) s.mouse.down = true; };
    const onMouseUp = () => { const s = stateRef.current; if (s) s.mouse.down = false; };
    const onTouch = (e: TouchEvent) => { if (e.type !== 'touchend') e.preventDefault(); };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    
    const canvas = canvasRef.current;
    if(canvas) {
        canvas.addEventListener('touchstart', onTouch, { passive: false });
        canvas.addEventListener('touchmove', onTouch, { passive: false });
    }

    handleResize();
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      if(canvas) {
        canvas.removeEventListener('touchstart', onTouch);
        canvas.removeEventListener('touchmove', onTouch);
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  const goToHullSelect = () => {
      audio.init();
      setUI(prev => ({ ...prev, screen: 'hull_select' }));
  };

  const startGame = (hull: HullType) => {
    const s = stateRef.current;
    if (!s) return;
    
    s.active = true;
    s.paused = false;
    s.gameOver = false;
    s.score = 0;
    s.wave = 1;
    s.spawnRate = CONFIG.SPAWNING.INITIAL_RATE;
    s.spawnTimer = 0;
    s.combo = 0;
    s.overdrive = 0;
    s.bossActive = false;
    s.timeScale = 1;
    s.worldTimeScale = 1; 
    s.playerTimeScale = 1;
    s.shake = 0;
    s.frame = 0;
    s.startTime = Date.now();
    s.anomaly = { active: false, type: 'NONE', timer: 0, duration: 0, intensity: 0 };
    s.upgradeStacks.clear();
    
    resetPlayer(s.player, s.width, s.height, hull);
    s.camera = { x: s.player.x, y: s.player.y, zoom: 1, targetZoom: 1 }; // Reset camera to player
    
    s.bullets.forEach(b => s.pools.bullets.release(b));
    s.enemies.forEach(e => s.pools.enemies.release(e));
    s.particles.forEach(p => s.pools.particles.release(p));
    s.gems.forEach(g => s.pools.gems.release(g));
    s.pickups.forEach(p => s.pools.pickups.release(p));
    
    s.bullets = []; s.enemies = []; s.particles = []; s.gems = []; s.pickups = []; s.texts = []; s.shockwaves = []; s.orbitals = [];
    s.visualGrid.rebuild(s.width, s.height);
    
    // Architect specific setup
    if (hull === 'ARCHITECT') {
        s.orbitals.push({ angle: 0, dist: 60 });
        s.orbitals.push({ angle: Math.PI, dist: 60 });
    }

    setUI(prev => ({ 
        ...prev, 
        screen: 'playing', 
        score: 0, 
        hp: s.player.hp,
        maxHp: s.player.maxHp,
        wave: 1, 
        level: 1,
        xp: 0,
        xpToNext: CONFIG.PROGRESSION.XP_BASE,
        weaponName: CONFIG.WEAPONS[s.player.weapon].name,
        skills: s.player.skills
    }));
  };

  const handleTouchInput = (input: { mx: number, my: number, aimX: number, aimY: number, shooting: boolean }) => {
      touchInputRef.current = input;
  };

  // Wire up specific skill actions from touch UI
  const handleSkill = (skill: string) => {
      const s = stateRef.current;
      if (!s) return;
      if (skill === 'dash') {
          s.keys.space = true;
          setTimeout(() => { if(stateRef.current) stateRef.current.keys.space = false; }, 50);
      } else if (skill === 'q') {
          s.keys.q = true;
          setTimeout(() => { if(stateRef.current) stateRef.current.keys.q = false; }, 50);
      } else if (skill === 'e') {
          s.keys.e = true;
          setTimeout(() => { if(stateRef.current) stateRef.current.keys.e = false; }, 50);
      } else if (skill === 'f') {
          s.keys.f = true;
          setTimeout(() => { if(stateRef.current) stateRef.current.keys.f = false; }, 50);
      }
  };

  return (
    <div className="relative w-full h-screen bg-[#050510] font-mono overflow-hidden touch-none select-none">
        <canvas ref={canvasRef} className="block w-full h-full" />
        <GameUI 
            ui={ui} 
            onStart={goToHullSelect} 
            onHullSelect={startGame}
            onUpgradeSelect={handleUpgradeSelect} 
            onToggleAutoMode={handleToggleAutoMode}
            onSkill={handleSkill}
        />
        {ui.screen === 'playing' && (
            <TouchControls onInput={handleTouchInput} onSkill={handleSkill} />
        )}
    </div>
  );
}
