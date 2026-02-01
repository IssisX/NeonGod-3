
import { GameState } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

export function renderGame(ctx: CanvasRenderingContext2D, distCtx: CanvasRenderingContext2D, s: GameState) {
    const w = ctx.canvas.width / s.pixelRatio;
    const h = ctx.canvas.height / s.pixelRatio;

    // Clear
    ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    
    distCtx.fillStyle = '#000000'; // R channel is distortion strength (0 = none)
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

    for(const star of s.stars) {
        const px = star.x - (camX * (1 - star.z));
        const py = star.y - (camY * (1 - star.z));
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
                ctx.fillStyle = bh.color;
                ctx.beginPath();
                ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
                ctx.fill();
                
                distCtx.fillStyle = '#ff0000';
                distCtx.beginPath();
                distCtx.arc(bh.x, bh.y, bh.radius * 2, 0, Math.PI * 2);
                distCtx.fill();
            }
        }
    }

    for(const g of s.gems) {
        if(!g.active) continue;
        ctx.fillStyle = CONFIG.COLORS.XP_GEM;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - 4);
        ctx.lineTo(g.x + 4, g.y);
        ctx.lineTo(g.x, g.y + 4);
        ctx.lineTo(g.x - 4, g.y);
        ctx.fill();
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
        
        if (e.modules) {
             rot = s.frame * 0.005;
             ctx.rotate(rot);

             for(const mod of e.modules) {
                 ctx.save();
                 ctx.translate(mod.xOffset, mod.yOffset);
                 ctx.rotate(mod.rotation);
                 
                 ctx.fillStyle = mod.color;
                 if (e.hitFlash > 0) ctx.fillStyle = '#ffffff';

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

                 ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 if (len > 0) ctx.lineTo(mod.shape[0], mod.shape[1]);
                 ctx.stroke();

                 ctx.restore();
             }
             
             ctx.shadowColor = e.color;
             ctx.shadowBlur = 30;
             ctx.fillStyle = '#ffffff';
             ctx.beginPath();
             ctx.arc(0,0, 15, 0, Math.PI*2);
             ctx.fill();
             ctx.shadowBlur = 0;

        } else {
            ctx.rotate(rot);
            if (e.hitFlash > 0) ctx.fillStyle = '#ffffff';
            else ctx.fillStyle = e.color;
            
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

            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0,0);
            ctx.lineTo(e.size, 0);
            ctx.moveTo(0,0);
            ctx.lineTo(Math.cos(Math.PI/2)*e.size, Math.sin(Math.PI/2)*e.size);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(0,0, e.size * 0.25, 0, Math.PI*2);
            ctx.fill();
        }
        
        if (e.isElite || e.type.startsWith('boss')) {
            ctx.rotate(-rot);
            ctx.fillStyle = '#000';
            const barWidth = e.size * 2 + (e.modules ? 60 : 0);
            const barY = -e.size - (e.modules ? 50 : 15);
            ctx.fillRect(-barWidth/2, barY, barWidth, 6);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-barWidth/2, barY, barWidth * (e.hp / e.maxHp), 6);
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

        ctx.fillStyle = CONFIG.COLORS.PLAYER;
        
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(10, 4);
        ctx.lineTo(10, -4);
        ctx.fill();
        
        ctx.fillStyle = '#005577';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, 7);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-10, -7);
        ctx.fill();
        
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-5, 3);
        ctx.lineTo(-5, -3);
        ctx.fill();

        ctx.fillStyle = '#00c3ff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-15, 20);
        ctx.lineTo(-5, 5);
        ctx.lineTo(5, 5);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-15, -20); 
        ctx.lineTo(-5, -5);
        ctx.lineTo(5, -5);
        ctx.fill();
        
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.arc(-15, 0, 4 + Math.random() * 2, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;

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
                 ctx.fillStyle = '#00ffff';
                 ctx.beginPath();
                 ctx.arc(ox, oy, 6, 0, Math.PI * 2);
                 ctx.fill();
                 ctx.strokeStyle = 'rgba(0,255,255,0.3)';
                 ctx.beginPath();
                 ctx.arc(0,0, o.dist, 0, Math.PI*2);
                 ctx.stroke();
            }
        }

        ctx.restore();
    }

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
             ctx.fillStyle = b.color;
             ctx.beginPath();
             ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
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
