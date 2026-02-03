
import React, { useRef, useEffect, useState } from 'react';

interface TouchData {
  id: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  type: 'move' | 'aim';
}

interface TouchControlsProps {
    onInput: (inputs: { mx: number, my: number, aimX: number, aimY: number, shooting: boolean }) => void;
    onSkill: (skill: string) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({ onInput, onSkill }) => {
    const touchesRef = useRef<Map<number, TouchData>>(new Map());
    const [visualTouches, setVisualTouches] = useState<TouchData[]>([]);

    const updateInput = () => {
        let mx = 0, my = 0, aimX = 0, aimY = 0, shooting = false;

        touchesRef.current.forEach(t => {
            const dx = t.curX - t.startX;
            const dy = t.curY - t.startY;
            const maxDist = 50; 
            
            const dist = Math.min(Math.hypot(dx, dy), maxDist);
            const angle = Math.atan2(dy, dx);
            
            const nx = (Math.cos(angle) * dist) / maxDist;
            const ny = (Math.sin(angle) * dist) / maxDist;

            if (t.type === 'move') {
                mx = nx;
                my = ny; 
            } else if (t.type === 'aim') {
                aimX = nx;
                aimY = ny; 
                shooting = dist > 10;
            }
        });

        onInput({ mx, my, aimX, aimY, shooting }); 
    };

    const updateVisuals = () => {
        setVisualTouches(Array.from(touchesRef.current.values()));
    };

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            const target = e.target as HTMLElement;
            // CRITICAL: Ignore touches that land on interactive UI elements (buttons)
            // This allows us to place buttons in the aim zone without firing the gun
            if (target.closest('button') || target.closest('[role="button"]') || target.closest('.pointer-events-auto')) return;

            e.preventDefault();
            const halfWidth = window.innerWidth / 2;

            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const type = t.clientX < halfWidth ? 'move' : 'aim';
                
                let alreadyHasType = false;
                touchesRef.current.forEach(existing => {
                    if (existing.type === type) alreadyHasType = true;
                });

                if (!alreadyHasType) {
                    touchesRef.current.set(t.identifier, {
                        id: t.identifier,
                        startX: t.clientX,
                        startY: t.clientY,
                        curX: t.clientX,
                        curY: t.clientY,
                        type
                    });
                }
            }
            updateInput();
            updateVisuals();
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const data = touchesRef.current.get(t.identifier);
                if (data) {
                    data.curX = t.clientX;
                    data.curY = t.clientY;
                }
            }
            updateInput();
            updateVisuals();
        };

        const handleTouchEnd = (e: TouchEvent) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                touchesRef.current.delete(e.changedTouches[i].identifier);
            }
            updateInput();
            updateVisuals();
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });
        document.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
            document.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [onInput]);

    return (
        <div className="absolute inset-0 pointer-events-none z-[50] overflow-hidden">
            {visualTouches.map(t => {
                const dx = t.curX - t.startX;
                const dy = t.curY - t.startY;
                const maxDist = 50;
                const dist = Math.min(Math.hypot(dx, dy), maxDist);
                const angle = Math.atan2(dy, dx);
                const puckX = Math.cos(angle) * dist;
                const puckY = Math.sin(angle) * dist;

                return (
                    <div 
                        key={t.id}
                        className="absolute w-32 h-32 -ml-16 -mt-16 pointer-events-none"
                        style={{ left: t.startX, top: t.startY }}
                    >
                        <div className={`absolute inset-0 border-2 rounded-full opacity-30 ${t.type === 'move' ? 'border-cyan-400 bg-cyan-900/20' : 'border-fuchsia-400 bg-fuchsia-900/20'} animate-[ping_0.5s_ease-out_1]`}></div>
                        <div className={`absolute inset-0 border-2 rounded-full opacity-50 ${t.type === 'move' ? 'border-cyan-400' : 'border-fuchsia-400'}`}></div>
                        <div 
                            className={`absolute w-12 h-12 left-1/2 top-1/2 -ml-6 -mt-6 rounded-full shadow-[0_0_15px_currentColor] ${t.type === 'move' ? 'bg-cyan-400 text-cyan-400' : 'bg-fuchsia-400 text-fuchsia-400'}`}
                            style={{ transform: `translate(${puckX}px, ${puckY}px)` }}
                        ></div>
                    </div>
                );
            })}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-32 bg-white/5 rounded-full"></div>
        </div>
    );
};
