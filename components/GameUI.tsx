
import React from 'react';
import { UIState } from '../types';
import { CONFIG } from '../constants';

interface GameUIProps {
  ui: UIState;
  onStart: () => void;
  onUpgradeSelect: (id: string) => void;
  onToggleAutoMode: () => void;
  onHullSelect: (hull: string) => void;
  onSkill: (skill: string) => void;
}

export const GameUI: React.FC<GameUIProps> = ({ ui, onStart, onUpgradeSelect, onToggleAutoMode, onHullSelect, onSkill }) => {
  // Helper to handle touch interaction without ghost clicks or delays
  const bindAction = (action: () => void) => ({
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); action(); },
      onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); e.stopPropagation(); action(); }
  });

  if (ui.screen === 'boot') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 text-cyan-400 font-mono z-[60] overflow-hidden">
        {/* Animated Background Grid */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, transparent 24%, #00ffff 25%, #00ffff 26%, transparent 27%, transparent 74%, #00ffff 75%, #00ffff 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, #00ffff 25%, #00ffff 26%, transparent 27%, transparent 74%, #00ffff 75%, #00ffff 76%, transparent 77%, transparent)', backgroundSize: '50px 50px' }}></div>
        
        <div className="relative z-10 text-center">
            <div className="text-8xl font-black mb-4 tracking-tighter drop-shadow-[0_0_15px_rgba(0,255,255,0.8)] animate-pulse">
            NEON<span className="text-fuchsia-500 drop-shadow-[0_0_15px_rgba(255,0,255,0.8)]">GOD</span>
            </div>
            <div className="text-2xl text-violet-400 tracking-[0.8em] mb-12 uppercase border-b border-violet-500/30 pb-4">Ascension Protocol</div>
            
            <div className="w-64 h-2 bg-gray-900 rounded overflow-hidden mx-auto border border-cyan-900/50">
            <div className="h-full bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-cyan-500 animate-[width_1.5s_ease-out] w-full origin-left"></div>
            </div>
            <div className="mt-4 text-xs text-cyan-700 animate-pulse font-bold tracking-widest">INITIALIZING SYSTEMS...</div>
        </div>
      </div>
    );
  }

  if (ui.screen === 'start') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md z-[60]">
        <h1 className="text-8xl font-black italic tracking-tighter mb-2 text-white drop-shadow-2xl">
          NEON<span className="text-cyan-400 animate-pulse">GOD</span>
        </h1>
        <div className="text-3xl text-fuchsia-500 font-bold tracking-[0.5em] mb-16 uppercase drop-shadow-[0_0_10px_rgba(255,0,255,0.5)]">Ascension</div>
        
        <button 
            {...bindAction(onStart)}
            className="group relative px-16 py-6 bg-transparent overflow-hidden rounded-sm transition-all hover:scale-105 pointer-events-auto cursor-pointer"
        >
            <div className="absolute inset-0 w-full h-full bg-cyan-500/10 group-hover:bg-cyan-500/20 skew-x-12 transition-all"></div>
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 group-hover:opacity-100 transition-all"></div>
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 group-hover:opacity-100 transition-all"></div>
            <span className="relative text-3xl font-black text-white group-hover:text-cyan-300 tracking-wider">ENTER SIMULATION</span>
        </button>
        
        <div className="mt-12 text-gray-400 text-sm font-bold tracking-widest border border-gray-800 px-6 py-2 rounded bg-black/50">
            CONTROLS: WASD / STICK • AIM: MOUSE / STICK • SKILLS: Q & E (AUTO)
        </div>

        {ui.topRuns.length > 0 && (
          <div className="mt-12 w-full max-w-md">
            <div className="text-cyan-500 text-center font-bold mb-4 tracking-widest border-b border-cyan-900/50 pb-2">TOP ASCENSIONS</div>
            {ui.topRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex justify-between p-3 bg-white/5 mb-2 rounded border-l-2 border-transparent hover:border-cyan-400 hover:bg-white/10 transition-all">
                <span className="text-gray-500 font-mono">#{i + 1}</span>
                <span className="flex items-center gap-3">
                    <span className="text-xs text-fuchsia-400 font-bold px-2 py-0.5 bg-fuchsia-900/20 rounded">{run.hull || 'UNKNOWN'}</span>
                    <span className="text-white font-bold font-mono tracking-tight">{run.score.toLocaleString()}</span>
                </span>
                <span className="text-gray-400 text-sm">Wave {run.wave}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (ui.screen === 'hull_select') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-lg z-[60]">
            <h2 className="text-5xl font-black text-white mb-12 tracking-widest drop-shadow-lg">SELECT <span className="text-cyan-400">HULL</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-[90%] max-w-6xl">
                {Object.entries(CONFIG.HULLS).map(([key, hull]) => (
                    <button
                        key={key}
                        {...bindAction(() => onHullSelect(key))}
                        className="group relative bg-gray-900 border border-gray-700 p-8 rounded-2xl transition-all hover:scale-105 hover:-translate-y-2 hover:border-cyan-500 hover:shadow-[0_0_30px_rgba(0,255,255,0.15)] flex flex-col items-center text-center overflow-hidden pointer-events-auto cursor-pointer"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cyan-900/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="text-3xl font-black text-white mb-2 group-hover:text-cyan-300 transition-colors uppercase italic">{hull.name}</div>
                        <div className="text-[10px] font-bold text-gray-500 mb-6 tracking-[0.3em] uppercase">{key} CLASS</div>
                        
                        <div className="text-sm text-gray-300 mb-8 h-12 leading-relaxed px-4">{hull.desc}</div>
                        
                        <div className="w-full grid grid-cols-2 gap-3 text-xs font-bold text-gray-400 mt-auto">
                            <div className="bg-black/40 p-3 rounded flex flex-col gap-1 border border-gray-800 group-hover:border-cyan-500/30">
                                <span className="text-gray-600">DURABILITY</span>
                                <span className={key === 'BASTION' ? 'text-green-400' : 'text-white'}>{hull.hp} HP</span>
                            </div>
                            <div className="bg-black/40 p-3 rounded flex flex-col gap-1 border border-gray-800 group-hover:border-cyan-500/30">
                                <span className="text-gray-600">AGILITY</span>
                                <span className={key === 'INTERCEPTOR' ? 'text-green-400' : 'text-white'}>{Math.round(hull.speed * 100)}%</span>
                            </div>
                            <div className="col-span-2 bg-black/40 p-3 rounded flex flex-col gap-1 border border-gray-800 group-hover:border-cyan-500/30">
                                <span className="text-gray-600">PRIMARY WEAPON</span>
                                <span className="text-fuchsia-400">{CONFIG.WEAPONS[hull.weapon].name}</span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
      );
  }

  if (ui.screen === 'gameover') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-md z-[60]">
        <div className="text-7xl font-black text-red-600 mb-2 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)] animate-pulse">SYSTEM FAILURE</div>
        <div className="text-xl text-red-300/50 tracking-[1em] mb-12">SIGNAL LOST</div>
        
        <div className="text-6xl font-black text-white mb-8 font-mono">{ui.score.toLocaleString()}</div>
        
        <div className="flex gap-12 text-gray-400 text-sm mb-12 font-bold tracking-wider uppercase">
            <div className="flex flex-col items-center">
                <span className="text-gray-600 text-xs mb-1">Wave Reached</span>
                <span className="text-2xl text-white">{ui.wave}</span>
            </div>
            <div className="flex flex-col items-center">
                <span className="text-gray-600 text-xs mb-1">Pilot Level</span>
                <span className="text-2xl text-white">{ui.level}</span>
            </div>
        </div>

        <button 
            {...bindAction(onStart)}
            className="px-12 py-4 bg-white text-black font-black text-xl rounded hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all pointer-events-auto cursor-pointer"
        >
            REBOOT SYSTEM
        </button>
      </div>
    );
  }

  if (ui.screen === 'levelup') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg z-[60]">
        <h2 className="text-6xl font-black text-emerald-400 mb-2 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] italic">LEVEL UP</h2>
        <div className="text-emerald-800 tracking-[0.5em] font-bold mb-10 text-sm">SYSTEM UPGRADE AVAILABLE</div>
        
        {ui.autoMode && <div className="text-cyan-400 animate-pulse mb-6 font-mono text-sm border border-cyan-500/30 px-4 py-1 rounded bg-cyan-900/20">AUTO-PILOT ENGAGED: SELECTING...</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-[95%] max-w-5xl">
            {ui.upgradeOptions.map((opt, i) => (
                <button
                    key={i}
                    {...bindAction(() => onUpgradeSelect(opt.id))}
                    className="group relative bg-gray-900 border-2 border-gray-700 hover:border-emerald-400 p-8 rounded-xl text-left transition-all hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] overflow-hidden pointer-events-auto cursor-pointer"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <div className="text-6xl font-black text-emerald-500">{i + 1}</div>
                    </div>
                    
                    <div className="text-2xl font-black text-white mb-2 group-hover:text-emerald-300 transition-colors">{opt.name}</div>
                    <div className="text-gray-400 text-sm mb-6 leading-relaxed h-12">{opt.desc}</div>
                    
                    <div className="flex items-center justify-between mt-4">
                         <div className="text-emerald-600 text-[10px] font-bold tracking-widest uppercase">Stack Count</div>
                         <div className="flex gap-1">
                             {[...Array(opt.maxStack)].map((_, idx) => (
                                 <div 
                                    key={idx} 
                                    className={`w-2 h-4 rounded-sm ${idx <= opt.currentStack ? 'bg-emerald-400' : 'bg-gray-800'}`}
                                 />
                             ))}
                         </div>
                    </div>
                </button>
            ))}
        </div>
      </div>
    );
  }

  // --- TACTICAL DPS GRAPH ---
  const renderDPSGraph = () => {
      const history = ui.dpsHistory || [];
      if (history.length < 2) return null;
      
      const maxDPS = Math.max(...history, 100);
      const h = 40; 
      const w = 120;
      
      const points = history.map((val, i) => {
          const x = (i / (history.length - 1)) * w;
          const y = h - ((val / maxDPS) * h);
          return `${x},${y}`;
      }).join(' ');

      return (
          <div className="absolute top-36 right-6 pointer-events-none opacity-80 hidden md:block z-40">
              <div className="bg-black/60 border border-cyan-900/50 rounded-lg p-2 backdrop-blur-sm">
                  <div className="flex justify-between items-end mb-1">
                      <span className="text-[10px] text-cyan-600 font-bold tracking-wider">TACTICAL FEED</span>
                      <span className="text-cyan-400 text-xs font-mono font-bold">{Math.floor(ui.dps || 0)} DPS</span>
                  </div>
                  <svg width={w} height={h} className="overflow-visible">
                       <line x1="0" y1={h} x2={w} y2={h} stroke="#1e293b" strokeWidth="1" />
                       <line x1="0" y1={0} x2={w} y2={0} stroke="#1e293b" strokeWidth="1" />
                       <path 
                          d={`M 0 ${h} L ${points.split(' ').join(' L ')} L ${w} ${h} Z`} 
                          fill="rgba(6,182,212,0.1)" 
                       />
                       <polyline 
                          points={points} 
                          fill="none" 
                          stroke="#06b6d4" 
                          strokeWidth="1.5" 
                          vectorEffect="non-scaling-stroke"
                       />
                  </svg>
              </div>
          </div>
      );
  };

  return (
    <div className="absolute inset-0 pointer-events-none p-6 select-none overflow-hidden z-[60]">
        {/* TOP LEFT: SCORE & WAVE */}
        <div className="absolute top-6 left-6 flex flex-col items-start gap-1">
            <div className="text-5xl font-black italic bg-gradient-to-r from-yellow-300 via-orange-500 to-red-500 bg-clip-text text-transparent drop-shadow-sm font-mono tracking-tighter">
                {ui.score.toLocaleString()}
            </div>
            
            <div className="flex items-center gap-4 mt-2">
                <div className="bg-black/60 border border-cyan-500/30 px-3 py-1 rounded backdrop-blur-sm">
                    <span className="text-cyan-500 text-xs font-bold tracking-widest mr-2">WAVE</span>
                    <span className="text-white font-black text-xl">{ui.wave}</span>
                </div>
            </div>

            {ui.combo > 1 && (
                <div className="mt-4 animate-bounce">
                    <div className="text-amber-400 text-2xl font-black italic drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                        x{ui.combo} COMBO
                    </div>
                    <div className="h-1 w-full bg-amber-900/50 rounded overflow-hidden mt-1">
                         <div className="h-full bg-amber-400" style={{ width: '100%' }}></div>
                    </div>
                </div>
            )}
        </div>

        {/* TOP CENTER: AUTO PILOT TOGGLE */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
             <button 
                {...bindAction(onToggleAutoMode)}
                className={`flex items-center gap-3 px-6 py-2 rounded-full border-2 transition-all cursor-pointer z-50 ${ui.autoMode ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.5)] scale-105' : 'bg-black/80 border-gray-500 text-gray-400 hover:border-white'}`}
             >
                <div className={`w-3 h-3 rounded-full ${ui.autoMode ? 'bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]' : 'bg-gray-600'}`}></div>
                <span className="text-xs font-black tracking-widest">{ui.autoMode ? 'AUTO-PILOT ACTIVE' : 'ENABLE AUTO-PILOT'}</span>
             </button>
        </div>

        {/* TOP RIGHT: STATS */}
        <div className="absolute top-6 right-6 w-72 flex flex-col gap-3">
            {/* HP BAR */}
            <div className="bg-black/40 p-2 rounded-lg border border-gray-800 backdrop-blur-sm">
                <div className="flex justify-between text-xs font-bold mb-1 px-1">
                    <span className="text-red-400 tracking-wider">INTEGRITY</span>
                    <span className="text-white">{Math.ceil(ui.hp)} / {ui.maxHp}</span>
                </div>
                <div className="h-4 bg-gray-900 rounded overflow-hidden relative">
                    <div 
                        className={`h-full transition-all duration-300 ${ui.hp < ui.maxHp * 0.25 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-red-600 to-red-400'}`}
                        style={{ width: `${(ui.hp / ui.maxHp) * 100}%` }}
                    />
                    <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-20"></div>
                </div>
            </div>

            {/* XP BAR */}
            <div className="bg-black/40 p-2 rounded-lg border border-gray-800 backdrop-blur-sm">
                <div className="flex justify-between text-xs font-bold mb-1 px-1">
                    <span className="text-emerald-400 tracking-wider">LEVEL {ui.level}</span>
                    <span className="text-emerald-200">{Math.floor((ui.xp / ui.xpToNext) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-900 rounded overflow-hidden">
                    <div 
                        className="h-full bg-emerald-500 transition-all duration-200 box-shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        style={{ width: `${(ui.xp / ui.xpToNext) * 100}%` }}
                    />
                </div>
            </div>
            
            <div className="text-right mt-2">
                 <div className="text-fuchsia-400 text-xs font-bold mt-1 tracking-widest uppercase">{ui.weaponName}</div>
            </div>
        </div>

        {renderDPSGraph()}
        
        {/* BOTTOM RIGHT: DASH Button Only */}
        <div className="absolute bottom-[20%] right-2 flex flex-col items-end gap-4 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity">
            <button 
                {...bindAction(() => onSkill('dash'))}
                className={`w-20 h-16 rounded-xl border-2 transition-all relative overflow-hidden active:scale-95 group cursor-pointer flex items-center justify-center ${ui.dashReady ? 'border-white bg-white/20 hover:bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'border-gray-700 bg-black/60 opacity-50'}`}
            >
                <div className={`text-sm font-black tracking-widest italic ${ui.dashReady ? 'text-white' : 'text-gray-500'}`}>DASH</div>
                {ui.dashReady && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 translate-x-[-150%] animate-[shimmer_2s_infinite]"></div>}
            </button>
        </div>

        {/* ALERTS */}
        {ui.anomaly.active && (
            <div className="absolute top-32 left-1/2 -translate-x-1/2 bg-red-500/10 border-2 border-red-500 text-red-500 px-6 py-3 rounded-lg animate-pulse backdrop-blur-sm shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                <div className="text-center font-black tracking-[0.2em] text-lg uppercase">⚠ ANOMALY DETECTED ⚠</div>
                <div className="text-center font-bold text-sm mt-1">{ui.anomaly.type}</div>
                <div className="w-full bg-red-950 h-1.5 mt-2 rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-red-500" 
                        style={{ width: `${(1 - ui.anomaly.timer / ui.anomaly.duration) * 100}%`}}
                     ></div>
                </div>
            </div>
        )}

        {ui.bossWarning && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-50 pointer-events-none">
                <div className="text-8xl font-black text-red-600 animate-pulse tracking-tighter drop-shadow-[0_0_50px_rgba(220,38,38,0.8)] whitespace-nowrap">
                    WARNING
                </div>
                <div className="text-4xl text-white font-bold tracking-[1em] uppercase bg-black/50 px-4 py-2 mt-4 backdrop-blur-sm border-y-2 border-red-500">
                    BOSS DETECTED
                </div>
            </div>
        )}

        {/* ULTIMATE BAR */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
            {ui.overdrive >= 100 ? (
                <button 
                    {...bindAction(() => onSkill('f'))}
                    className="text-fuchsia-400 font-black mb-3 text-sm tracking-[0.3em] animate-bounce drop-shadow-[0_0_10px_rgba(255,0,255,0.8)] border border-fuchsia-500/50 px-4 py-1 rounded-full bg-fuchsia-900/20 cursor-pointer active:scale-95"
                >
                    [F] NEON NOVA READY
                </button>
            ) : (
                <div className="text-gray-600 font-bold mb-2 text-[10px] tracking-widest">OVERDRIVE CHARGE</div>
            )}
            
            <div className={`w-96 h-3 bg-gray-950 rounded-full overflow-hidden border ${ui.overdrive >= 100 ? 'border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.4)]' : 'border-gray-800'}`}>
                <div 
                    className={`h-full transition-all duration-200 relative overflow-hidden ${ui.overdrive >= 100 ? 'bg-fuchsia-500' : 'bg-gradient-to-r from-purple-900 to-purple-600'}`}
                    style={{ width: `${ui.overdrive}%` }}
                >
                    {/* Bar animation */}
                    {ui.overdrive >= 100 && <div className="absolute inset-0 bg-white/30 animate-[width_1s_infinite]"></div>}
                </div>
            </div>
        </div>
    </div>
  );
};
