
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
  const bindAction = (action: () => void) => ({
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); action(); },
      onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); e.stopPropagation(); action(); }
  });

  // --- SCREENS (BOOT / START / GAME OVER / LEVEL UP) ---

  if (ui.screen === 'boot') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050510] text-cyan-400 font-mono z-[60] overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, transparent 24%, #22d3ee 25%, #22d3ee 26%, transparent 27%, transparent 74%, #22d3ee 75%, #22d3ee 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, #22d3ee 25%, #22d3ee 26%, transparent 27%, transparent 74%, #22d3ee 75%, #22d3ee 76%, transparent 77%, transparent)', backgroundSize: '50px 50px' }}></div>
        <div className="relative z-10 text-center animate-pulse">
            <h1 className="text-8xl font-black mb-4 tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">NEON<span className="text-fuchsia-500 drop-shadow-[0_0_15px_rgba(217,70,239,0.8)]">GOD</span></h1>
            <div className="text-2xl text-violet-400 tracking-[0.8em] uppercase border-t border-b border-violet-500/30 py-2">System Initialized</div>
        </div>
      </div>
    );
  }

  if (ui.screen === 'start') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl z-[60]">
        <h1 className="text-9xl font-black italic tracking-tighter text-white drop-shadow-2xl mb-2">NEON<span className="text-cyan-400 animate-pulse">GOD</span></h1>
        <div className="text-xs text-gray-500 font-mono tracking-[1em] mb-12">PROJECT ASCENSION V3.0</div>
        
        <button 
            {...bindAction(onStart)}
            className="group relative px-24 py-8 bg-transparent border-y-2 border-cyan-500/50 hover:border-cyan-400 transition-all cursor-pointer overflow-hidden pointer-events-auto"
        >
            <div className="absolute inset-0 bg-cyan-500/10 group-hover:bg-cyan-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            <span className="relative text-4xl font-black text-white group-hover:text-cyan-300 tracking-widest drop-shadow-lg">ENGAGE</span>
        </button>
        
        <div className="mt-16 flex gap-8 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
            <div className="flex flex-col items-center"><span>Total Runs</span><span className="text-white text-lg">{ui.globalStats.totalRuns}</span></div>
            <div className="w-px h-8 bg-gray-800"></div>
            <div className="flex flex-col items-center"><span>High Score</span><span className="text-cyan-400 text-lg">{ui.globalStats.bestScore.toLocaleString()}</span></div>
        </div>
      </div>
    );
  }

  if (ui.screen === 'hull_select') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050510] z-[60] p-4">
            <div className="text-sm font-bold text-gray-500 tracking-[0.5em] mb-2">DEPLOYMENT PHASE</div>
            <h2 className="text-6xl font-black text-white mb-12 tracking-wider uppercase italic">Select <span className="text-cyan-400">Chassis</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-7xl">
                {Object.entries(CONFIG.HULLS).map(([key, hull]) => (
                    <button
                        key={key}
                        {...bindAction(() => onHullSelect(key))}
                        className="group relative bg-gray-900 border border-gray-800 hover:border-cyan-500/50 p-8 rounded-sm transition-all hover:-translate-y-2 hover:shadow-[0_0_50px_rgba(34,211,238,0.15)] flex flex-col text-left overflow-hidden pointer-events-auto"
                    >
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(34,211,238,0.05)_50%,transparent_75%)] bg-[length:250%_250%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-[gradient_3s_linear_infinite]"></div>
                        <div className="relative z-10">
                            <div className="text-4xl font-black text-white mb-2 group-hover:text-cyan-300 uppercase italic">{hull.name}</div>
                            <div className="h-0.5 w-12 bg-cyan-500 mb-6 group-hover:w-full transition-all duration-500"></div>
                            <div className="text-xs text-gray-400 mb-8 h-12 leading-relaxed font-mono">{hull.desc}</div>
                            <div className="grid grid-cols-2 gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                <div className="border-l-2 border-gray-700 pl-3">
                                    <div>Integrity</div>
                                    <div className="text-white text-lg">{hull.hp}</div>
                                </div>
                                <div className="border-l-2 border-gray-700 pl-3">
                                    <div>Velocity</div>
                                    <div className="text-white text-lg">{Math.round(hull.speed * 100)}%</div>
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
      );
  }

  if (ui.screen === 'levelup') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl z-[60] p-6">
        <h2 className="text-7xl font-black text-emerald-400 mb-4 drop-shadow-[0_0_25px_rgba(52,211,153,0.4)] italic">SYSTEM UPGRADE</h2>
        <div className="text-emerald-800 tracking-[0.5em] font-bold mb-12 text-xs">SELECT AUGMENTATION</div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-6xl">
            {ui.upgradeOptions.map((opt, i) => (
                <button
                    key={i}
                    {...bindAction(() => onUpgradeSelect(opt.id))}
                    className="group relative bg-gray-900/90 border border-gray-700 hover:border-emerald-400 p-8 rounded-lg text-left transition-all hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(16,185,129,0.2)] pointer-events-auto overflow-hidden"
                >
                    <div className="absolute -right-4 -top-4 text-9xl font-black text-gray-800 opacity-20 group-hover:text-emerald-900 transition-colors">{i + 1}</div>
                    <div className="relative z-10">
                        <div className="text-2xl font-black text-white mb-2 group-hover:text-emerald-300">{opt.name}</div>
                        <div className="text-gray-400 text-sm leading-relaxed mb-4">{opt.desc}</div>
                        <div className="flex items-center gap-2 mt-4">
                             {[...Array(opt.maxStack)].map((_, idx) => (
                                 <div key={idx} className={`h-1.5 flex-1 rounded-full ${idx <= opt.currentStack ? 'bg-emerald-500' : 'bg-gray-800'}`}></div>
                             ))}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-xl z-[60]">
          <div className="text-[10rem] font-black text-red-600 leading-none tracking-tighter mix-blend-screen animate-pulse">CRITICAL</div>
          <div className="text-4xl text-white font-bold tracking-[1em] mb-12 uppercase">Failure</div>
          <div className="grid grid-cols-2 gap-16 text-center mb-16">
              <div>
                  <div className="text-red-400 text-xs font-bold tracking-widest uppercase mb-2">Final Score</div>
                  <div className="text-6xl font-mono text-white">{ui.score.toLocaleString()}</div>
              </div>
              <div>
                  <div className="text-red-400 text-xs font-bold tracking-widest uppercase mb-2">Wave Reached</div>
                  <div className="text-6xl font-mono text-white">{ui.wave}</div>
              </div>
          </div>
          <button 
            {...bindAction(onStart)} 
            className="px-16 py-4 bg-white text-black font-black text-xl rounded hover:scale-105 hover:shadow-[0_0_30px_white] transition-all pointer-events-auto"
          >
            SYSTEM REBOOT
          </button>
        </div>
      );
  }

  // --- PLAYING HUD ---

  const SkillKey = ({ k, label, cd, max, active, color, onClick, size = 'normal' }: any) => {
      const ready = cd <= 0;
      const progress = ready ? 100 : ((max - cd) / max) * 100;
      
      const colors = {
          cyan: { border: 'border-cyan-400', text: 'text-cyan-400', shadow: 'shadow-[0_0_20px_rgba(34,211,238,0.4)]', bg: 'bg-cyan-950/80' },
          fuchsia: { border: 'border-fuchsia-500', text: 'text-fuchsia-400', shadow: 'shadow-[0_0_20px_rgba(217,70,239,0.4)]', bg: 'bg-fuchsia-950/80' },
          white: { border: 'border-white', text: 'text-white', shadow: 'shadow-[0_0_20px_rgba(255,255,255,0.4)]', bg: 'bg-gray-800/80' },
          emerald: { border: 'border-emerald-400', text: 'text-emerald-400', shadow: 'shadow-[0_0_20px_rgba(52,211,153,0.4)]', bg: 'bg-emerald-950/80' }
      };
      const c = colors[color as keyof typeof colors];
      
      // Sizes
      const dims = size === 'large' ? 'w-24 h-24 rounded-3xl' : 'w-16 h-16 rounded-xl';
      const txtSize = size === 'large' ? 'text-3xl' : 'text-xl';

      return (
          <button
              {...bindAction(onClick)}
              className={`relative ${dims} border-2 backdrop-blur-md flex flex-col items-center justify-center transition-all active:scale-90 pointer-events-auto overflow-hidden ${ready ? `${c.border} ${c.bg} ${c.shadow}` : 'border-gray-800 bg-black/60 opacity-60'}`}
          >
              <div className={`${txtSize} font-black z-10 ${ready ? 'text-white' : 'text-gray-500'}`}>{k}</div>
              {size === 'large' && <div className={`text-[10px] font-bold uppercase tracking-widest z-10 ${ready ? c.text : 'text-gray-600'}`}>{label}</div>}
              
              {!ready && (
                  <div className="absolute bottom-0 left-0 h-1 bg-white/50 w-full">
                      <div className="h-full bg-white" style={{ width: `${progress}%` }}></div>
                  </div>
              )}
              {active && <div className="absolute inset-0 bg-white/30 animate-ping"></div>}
          </button>
      );
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-[60] text-white">
        
        {/* TOP LEFT: TACTICAL FEED */}
        <div className="absolute top-6 left-6 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
                <span className="text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-sm">
                    {ui.score.toLocaleString()}
                </span>
            </div>
            <div className="flex gap-2">
                <div className="bg-black/40 backdrop-blur-md border border-gray-700 px-3 py-1 rounded text-xs font-bold font-mono text-cyan-400">
                    WAVE {ui.wave}
                </div>
                {ui.combo > 1 && (
                    <div className="bg-amber-500/20 backdrop-blur-md border border-amber-500 px-3 py-1 rounded text-xs font-bold font-mono text-amber-400 animate-pulse">
                        COMBO x{ui.combo}
                    </div>
                )}
            </div>
        </div>

        {/* TOP RIGHT: VITALS */}
        <div className="absolute top-6 right-6 flex flex-col items-end gap-1 w-64">
            <div className="flex justify-between w-full text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
                <span>Hull</span>
                <span>{Math.ceil(ui.hp)}/{ui.maxHp}</span>
            </div>
            <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden mb-2">
                <div className={`h-full transition-all duration-300 ${ui.hp < ui.maxHp * 0.3 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-red-500 to-red-600'}`} style={{width: `${(ui.hp/ui.maxHp)*100}%`}}></div>
            </div>
            <div className="flex justify-between w-full text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
                <span>Exp</span>
                <span>Lvl {ui.level}</span>
            </div>
            <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{width: `${(ui.xp/ui.xpToNext)*100}%`}}></div>
            </div>
            <div className="mt-2 text-right">
                <span className="text-xs font-black text-fuchsia-400 uppercase tracking-wider">{ui.weaponName}</span>
            </div>
        </div>

        {/* BOTTOM RIGHT: ERGONOMIC COMBAT ARC */}
        <div className="absolute bottom-6 right-6 pointer-events-auto">
            <div className="relative w-64 h-64">
                {/* DASH - Bottom Right (Primary Thumb Position) */}
                <div className="absolute bottom-0 right-0">
                    <SkillKey k="SHIFT" label="DASH" cd={ui.dashReady ? 0 : 100} max={100} active={false} color="white" size="large" onClick={() => onSkill('dash')} />
                </div>

                {/* SKILL Q - Left of Dash */}
                <div className="absolute bottom-2 right-28">
                    <SkillKey k="Q" label="TIME" cd={ui.skills.q.cd} max={ui.skills.q.maxCd} active={ui.skills.q.active} color="cyan" onClick={() => onSkill('q')} />
                </div>

                {/* SKILL E - Above Dash */}
                <div className="absolute bottom-28 right-2">
                    <SkillKey k="E" label="VOID" cd={ui.skills.e.cd} max={ui.skills.e.maxCd} active={ui.skills.e.active} color="fuchsia" onClick={() => onSkill('e')} />
                </div>

                {/* ULTIMATE - Diagonal (The "Y" Button) */}
                <div className="absolute bottom-24 right-24">
                    <button
                        {...bindAction(() => onSkill('f'))}
                        className={`w-16 h-16 rounded-full border-2 backdrop-blur-xl flex flex-col items-center justify-center transition-all active:scale-95 ${ui.overdrive >= 100 ? 'border-amber-400 bg-amber-900/80 shadow-[0_0_30px_rgba(251,191,36,0.6)] animate-pulse' : 'border-gray-800 bg-black/60 opacity-50'}`}
                    >
                        <span className="text-xl font-black italic text-white">ULT</span>
                    </button>
                </div>
            </div>
        </div>

        {/* CENTER ALERTS */}
        {ui.bossWarning && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-pulse pointer-events-none">
                <div className="text-red-500 font-black text-6xl tracking-tighter drop-shadow-[0_0_30px_red]">WARNING</div>
                <div className="bg-red-600 text-black font-bold px-4 py-1 tracking-[1em] uppercase text-sm mt-2">BOSS DETECTED</div>
            </div>
        )}
        
        {/* AUTO PILOT TOGGLE */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button 
                {...bindAction(onToggleAutoMode)}
                className={`px-6 py-2 rounded-full border border-gray-700 bg-black/60 backdrop-blur-md text-[10px] font-bold tracking-[0.2em] uppercase transition-all ${ui.autoMode ? 'border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'text-gray-500 hover:text-white'}`}
            >
                {ui.autoMode ? 'AI PILOT ACTIVE' : 'MANUAL'}
            </button>
        </div>
    </div>
  );
};
