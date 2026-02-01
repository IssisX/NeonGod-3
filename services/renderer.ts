
import { GameState, Enemy } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// Helper to draw detailed tech greebles
function drawTechDetail(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
}

function drawChaser(ctx: CanvasRenderingContext2D, size: number, color: string) {
    // Arrowhead Fighter
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0); // Nose
    ctx.lineTo(-size * 0.8, size * 0.8); // Rear Left
    ctx.lineTo(-size * 0.4, 0); // Engine Notch
    ctx.lineTo(-size * 0.8, -size * 0.8); // Rear Right
    ctx.closePath();
    ctx.fill();
    
    // Cockpit
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(0, size * 0.3);
    ctx.lineTo(0, -size * 0.3);
    ctx.fill();
    
    // Engine Glow
    ctx.fillStyle = '#ff5500';
    ctx.beginPath();
    ctx.arc(-size * 0.6, 0, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawTank(ctx: CanvasRenderingContext2D, size: number, color: string) {
    // Heavy Hex Plating
    ctx.fillStyle = color;
    const s = size * 0.9;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        ctx.lineTo(Math.cos(angle) * s, Math.sin(angle) * s);
    }
    ctx.closePath();
    ctx.fill();
    
    // Inner Armor
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.rect(-s * 0.5, -s * 0.5, s, s);
    ctx.fill();
    
    // Turret
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Barrel
    ctx.fillStyle = '#333';
    ctx.fillRect(0, -size * 0.1, size * 1.1, size * 0.2);
}

function drawShooter(ctx: CanvasRenderingContext2D, size: number, color: string) {
    // U-Wing Interceptor
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0); // Center front
    ctx.lineTo(-size * 0.5, size); // Wing tip L
    ctx.lineTo(-size * 0.2, 0); // Body junction
    ctx.lineTo(-size * 0.5, -size); // Wing tip R
    ctx.closePath();
    ctx.fill();
    
    // Central Cannon
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, -2, size, 4);
    
    // Energy Nodes on wings
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(-size * 0.5, size * 0.8, 3, 0, Math.PI*2);
    ctx.arc(-size * 0.5, -size * 0.8, 3, 0, Math.PI*2);
    ctx.fill();
}

function drawDasher(ctx: CanvasRenderingContext2D, size: number, color: string) {
    // Serrated Blade
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 1.5, 0);
    ctx.lineTo(-size, size * 0.6);
    ctx.lineTo(-size * 0.5, 0);
    ctx.lineTo(-size, -size * 0.6);
    ctx.closePath();
    ctx.fill();
    
    // Spikes
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5); ctx.lineTo(size * 0.5, size * 0.8);
    ctx.moveTo(0, -size * 0.5); ctx.lineTo(size * 0.5, -size * 0.8);
    ctx.stroke();
}

function drawOrbiter(ctx: CanvasRenderingContext2D, size: number, color: string) {
    // Core
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.stroke();
    
    // Satellites
    const time = Date.now() * 0.005;
    ctx.fillStyle = '#fff';
    for(let i=0; i<3; i++) {
        const a = time + (Math.PI * 2 / 3) * i;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * size, Math.sin(a) * size, 3, 0, Math.PI*2);
        ctx.fill();
    }
}

export function renderGame(ctx: CanvasRenderingContext2D, distCtx: CanvasRenderingContext2D, s: GameState) {
    const w = ctx.canvas.width / s.pixelRatio;
    const h = ctx.canvas.height / s.pixelRatio;

    // Clear
    ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    
    distCtx.fillStyle = '#000000'; 
    distCtx.fillRect(0, 0, w, h);

    // Apply Camera
    ctx.save();
    distCtx.save();
    
    const shakeX = (Math.random() - 0.5) * s.shake;
    const shakeY = (Math.random() - 0.5) * s.shake;
    if (s.shake > 0) s.shake *= 0.9;
    
    const camX = s.camera.x + shakeX;
    const camY = s.camera.y + shakeY;
    
    ctx.translate(w/2, h/2);
    ctx.scale(s.camera.zoom, s.camera.zoom);
    ctx.translate(-camX, -camY);

    distCtx.translate(w/2, h/2);
    distCtx.scale(s.camera.zoom, s.camera.zoom);
    distCtx.translate(-camX, -camY);

    // --- DRAW WORLD ---

    if (s.visualGrid) s.visualGrid.render(ctx, s.quality === 'LOW' ? 2 : 1);

    // Stars with parallax
    for(const star of s.stars) {
        // Simple parallax
        const px = star.x - (camX * (1 - star.z));
        const py = star.y - (camY * (1 - star.z));
        // Wrap around logic for infinite feel? Not strictly needed with world bounds, 
        // but helps if we want stars to feel fixed relative to infinite space.
        // For bounded world, standard drawing is fine.
        
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * star.z, 0, Math.PI * 2);
        ctx.fill();
    }

    for(const d of s.debris) {
        if (!d.active) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        const step = (Math.PI * 2) / d.sides;
        for(let i=0; i<d.sides; i++) {
            ctx.lineTo(Math.cos(step*i)*d.size, Math.sin(step*i)*d.size);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    
    for(const bh of s.blackHoles) {
        if(bh.active) {
            bh.radius += 0.5;
            bh.life--;
            if(bh.life <= 0) s.blackHoles.splice(s.blackHoles.indexOf(bh), 1);
            else {
                // Event Horizon
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Accretion Disk
                ctx.strokeStyle = bh.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(bh.x, bh.y, bh.radius * 1.2, 0, Math.PI * 2);
                ctx.stroke();

                // Distortion Map
                distCtx.fillStyle = '#ff0000';
                distCtx.beginPath();
                distCtx.arc(bh.x, bh.y, bh.radius * 2.5, 0, Math.PI * 2);
                distCtx.fill();
            }
        }
    }

    for(const g of s.gems) {
        if(!g.active) continue;
        ctx.fillStyle = CONFIG.COLORS.XP_GEM;
        ctx.shadowColor = CONFIG.COLORS.XP_GEM;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - 4);
        ctx.lineTo(g.x + 4, g.y);
        ctx.lineTo(g.x, g.y + 4);
        ctx.lineTo(g.x - 4, g.y);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    for(const p of s.pickups) {
        if(!p.active) continue;
        ctx.fillStyle = CONFIG.PICKUPS.COLOR;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y);
        ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3);
        ctx.stroke();
    }

    for(const e of s.enemies) {
        if (!e.active || e.dead) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        
        let rot = Math.atan2(e.vy, e.vx);
        if (e.type === 'snake_head') rot = e.rotation;
        if (e.type === 'orbiter') rot = s.frame * 0.05; // Spin orbiters
        
        if (e.modules) {
             // Boss Rendering
             rot = s.frame * 0.005;
             ctx.rotate(rot);

             for(const mod of e.modules) {
                 ctx.save();
                 ctx.translate(mod.xOffset, mod.yOffset);
                 ctx.rotate(mod.rotation);
                 
                 ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : mod.color;
                 
                 ctx.beginPath();
                 const len = mod.shape.length;
                 if (len >= 2) {
                     ctx.moveTo(mod.shape[0], mod.shape[1]);
                     for(let k=2; k<len; k+=2) {
                         ctx.lineTo(mod.shape[k], mod.shape[k+1]);
                     }
                 }
                 ctx.closePath();
                 ctx.fill();
                 
                 ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                 ctx.lineWidth = 2;
                 ctx.stroke();

                 // Tech detail inside module
                 ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 if (len > 0) ctx.lineTo(mod.shape[0], mod.shape[1]);
                 ctx.stroke();

                 ctx.restore();
             }
             
             // Boss Core
             ctx.shadowColor = e.color;
             ctx.shadowBlur = 30;
             ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#fff';
             ctx.beginPath();
             ctx.arc(0,0, 15, 0, Math.PI*2);
             ctx.fill();
             ctx.shadowBlur = 0;

        } else {
            // Standard Enemy Complex Rendering
            ctx.rotate(rot);
            const color = e.hitFlash > 0 ? '#ffffff' : e.color;
            
            // Dispatch to specific shape drawers
            if (e.type === 'chaser') drawChaser(ctx, e.size, color);
            else if (e.type === 'shooter') drawShooter(ctx, e.size, color);
            else if (e.type === 'tank') drawTank(ctx, e.size, color);
            else if (e.type === 'dasher' || e.type === 'kamikaze') drawDasher(ctx, e.size, color);
            else if (e.type === 'orbiter') drawOrbiter(ctx, e.size, color);
            else {
                // Fallback / Generic
                ctx.fillStyle = color;
                ctx.beginPath();
                if (e.sides === 0) {
                    ctx.arc(0, 0, e.size, 0, Math.PI * 2);
                } else {
                    const step = (Math.PI * 2) / e.sides;
                    const off = e.type === 'tank' ? Math.PI/e.sides : 0;
                    ctx.moveTo(e.size, 0);
                    for(let i=1; i<=e.sides; i++) {
                        ctx.lineTo(Math.cos(step*i + off) * e.size, Math.sin(step*i + off) * e.size);
                    }
                }
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // Health bar for elites/bosses
        if (e.isElite || e.type.startsWith('boss')) {
            ctx.rotate(-rot); // reset rot for bar
            ctx.fillStyle = '#000';
            const barWidth = e.size * 2 + (e.modules ? 60 : 0);
            const barY = -e.size - (e.modules ? 50 : 20);
            ctx.fillRect(-barWidth/2, barY, barWidth, 6);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-barWidth/2, barY, barWidth * (e.hp / e.maxHp), 6);
            
            // Elite Crown/Indicator
            if (e.isElite && !e.type.startsWith('boss')) {
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.moveTo(0, barY - 10);
                ctx.lineTo(-5, barY - 2);
                ctx.lineTo(5, barY - 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }

    const p = s.player;
    if (p.active) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        const bankScale = Math.max(0.6, 1.0 - Math.abs(p.roll * 0.1));
        ctx.scale(1.0, bankScale);

        if (p.invuln > 0 && Math.floor(s.frame / 4) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // --- HIGH FIDELITY PLAYER SHIP ---
        
        // Rear Thruster Vents
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(-15, -5); ctx.lineTo(-20, -8); ctx.lineTo(-20, 8); ctx.lineTo(-15, 5);
        ctx.fill();

        // Main Hull (Darker underside)
        ctx.fillStyle = '#003344';
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(-15, 12);
        ctx.lineTo(-20, 0);
        ctx.lineTo(-15, -12);
        ctx.fill();

        // Top Plating (Neon Cyan)
        ctx.fillStyle = CONFIG.COLORS.PLAYER;
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-10, 8);
        ctx.lineTo(-10, -8);
        ctx.fill();
        
        // Cockpit Glass
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-5, 4);
        ctx.lineTo(-5, -4);
        ctx.fill();
        
        // Wing Details
        ctx.fillStyle = '#00c3ff';
        ctx.beginPath();
        ctx.moveTo(-5, 8); ctx.lineTo(-15, 20); ctx.lineTo(-5, 20); // Right Wing
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-5, -8); ctx.lineTo(-15, -20); ctx.lineTo(-5, -20); // Left Wing
        ctx.fill();
        
        // Engine Glow
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.arc(-20, 0, 4 + Math.random() * 2, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Weapon Hardpoints
        if (p.stats.multishot > 0) {
            ctx.fillStyle = '#555';
            ctx.fillRect(0, 10, 8, 4);
            ctx.fillRect(0, -14, 8, 4);
        }

        if (p.muzzleFlash > 0) {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(30, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fill();
        }

        if (s.orbitals.length > 0) {
            ctx.scale(1.0, 1.0/bankScale);
            for(const o of s.orbitals) {
                 o.angle += 0.05;
                 const ox = Math.cos(o.angle) * o.dist;
                 const oy = Math.sin(o.angle) * o.dist;
                 
                 // Orbital Render
                 ctx.fillStyle = '#00ffff';
                 ctx.beginPath();
                 ctx.arc(ox, oy, 6, 0, Math.PI * 2);
                 ctx.fill();
                 
                 // Trail for orbital
                 ctx.strokeStyle = 'rgba(0,255,255,0.2)';
                 ctx.beginPath();
                 ctx.arc(0,0, o.dist, o.angle - 0.5, o.angle);
                 ctx.stroke();
            }
        }

        ctx.restore();
    }

    // Bullets
    for(const b of s.bullets) {
        if (!b.active) continue;
        if (b.isBeam) {
             ctx.strokeStyle = b.color;
             ctx.lineWidth = b.size;
             ctx.shadowBlur = 10;
             ctx.shadowColor = b.color;
             ctx.beginPath();
             if(b.beamPoints) {
                 for(let i=0; i<b.beamPoints.length; i++) {
                     const pt = b.beamPoints[i];
                     if(i===0) ctx.moveTo(pt.x, pt.y);
                     else ctx.lineTo(pt.x, pt.y);
                 }
             }
             ctx.stroke();
             ctx.lineWidth = 1;
             ctx.strokeStyle = '#fff';
             ctx.stroke();
             ctx.shadowBlur = 0;
        } else {
             // Glowing Bullets
             ctx.fillStyle = b.color;
             ctx.shadowColor = b.color;
             ctx.shadowBlur = 5;
             ctx.beginPath();
             ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
             ctx.fill();
             ctx.shadowBlur = 0;
             
             // Center hot spot
             ctx.fillStyle = '#fff';
             ctx.beginPath();
             ctx.arc(b.x, b.y, b.size * 0.5, 0, Math.PI * 2);
             ctx.fill();
        }
    }

    for(const pt of s.particles) {
        if(!pt.active) continue;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = pt.life / pt.maxLife;
        ctx.beginPath();
        if (pt.type === 'spark') {
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        } else {
            ctx.rect(pt.x - pt.size/2, pt.y - pt.size/2, pt.size, pt.size);
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    for(const sw of s.shockwaves) {
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.width;
        ctx.globalAlpha = sw.alpha;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2);
        ctx.stroke();
        
        distCtx.strokeStyle = `rgb(${Math.floor(sw.alpha * 255)}, 0, 0)`;
        distCtx.lineWidth = sw.width * 2;
        distCtx.beginPath();
        distCtx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2);
        distCtx.stroke();
        
        ctx.globalAlpha = 1.0;
    }

    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    for(const t of s.texts) {
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
    }
    
    // Border
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, s.worldWidth, s.worldHeight);

    ctx.restore();
    distCtx.restore();
    
    if (s.screenFlash > 0) {
        ctx.fillStyle = s.flashColor;
        ctx.globalAlpha = s.screenFlash * 0.3;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;
    }
}
